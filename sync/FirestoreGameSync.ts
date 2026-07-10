import {
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generatePlayId } from "@/lib/cryptoUtils";
import { buildDeck, shuffle } from "@/engine/deck";
import {
  checkInstantWin,
  lastCardDoubles,
  legalCards,
  trickWinner,
} from "@/engine/rules";
import {
  applyPowerCard,
  canActivatePowerCard,
  type PowerEffectResult,
} from "@/engine/powerEffects";
import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import type {
  Card,
  DepositedCard,
  GameConfig,
  GameDoc,
  GameState,
  GameSyncActions,
  Phase,
  Player,
  PowerCardActivation,
  PowerCardId,
  Profile,
  Result,
  RoomPlayer,
  TrickPlay,
  WinInfo,
} from "@/types/game";

interface FirestoreSyncOptions {
  roomId: string;
  roomPlayers: RoomPlayer[];
  hostId: string;
  myUid: string;
  profile: Profile;
  cfg: GameConfig;
  mise: number;
  onResult: (result: Result) => void;
  onUpdateBalance: (balance: number) => void;
  onRoundRestart?: () => void;
  onRematchExpired?: () => void;
}

type PendingPlay = NonNullable<GameDoc["pendingPlay"]>;
type LastPlay = NonNullable<GameDoc["lastPlay"]>;

/** Fenêtre de revanche : délai pour que tous cliquent « Manche suivante »
 *  avant expiration (retour menu). Doit être un temps FUTUR, pas « now ». */
const REMATCH_WINDOW_MS = 60_000;

function hiddenCard(playerIdx: number, cardIdx: number): Card {
  return {
    rank: "?",
    value: 0,
    suit: "?",
    color: "#888",
    id: `hidden-${playerIdx}-${cardIdx}`,
  };
}

function cloneHands(hands: Record<string, Card[]>): Record<string, Card[]> {
  const next: Record<string, Card[]> = {};
  Object.entries(hands).forEach(([uid, hand]) => {
    next[uid] = hand.map((card) => ({ ...card }));
  });
  return next;
}

function cloneDeposits(deposits: Record<string, DepositedCard[]>): Record<string, DepositedCard[]> {
  const next: Record<string, DepositedCard[]> = {};
  Object.entries(deposits).forEach(([uid, cards]) => {
    next[uid] = cards.map((card) => ({ ...card }));
  });
  return next;
}

export class FirestoreGameSync implements GameSyncActions {
  private opts: FirestoreSyncOptions;
  private isHost: boolean;
  private myIdx: number;

  private players: Player[] = [];
  private phase: Phase = "idle";
  private trickNo = 1;
  private leaderIdx = 0;
  private turnIdx = 0;
  private trickPlays: TrickPlay[] = [];
  private pot = 0;
  private dominantIdx: number | null = null;
  private seconds = 0;

  private allHands: Record<string, Card[]> = {};
  private depositsByUid: Record<string, DepositedCard[]> = {};
  private balancesByUid: Record<string, number> = {};

  private stateListeners = new Set<(state: GameState) => void>();
  private playCardListeners = new Set<(play: { playerIdx: number; cardIdx: number; card: Card; playId?: string }) => void>();
  private trickEndListeners = new Set<(winnerIdx: number) => void>();
  private roundEndListeners = new Set<(result: Result) => void>();
  private timerListeners = new Set<(seconds: number) => void>();
  private powerActivatedListeners = new Set<(activation: PowerCardActivation) => void>();

  /** Power cards équipées par joueur (uid → ids). */
  private equippedPowersByUid: Record<string, PowerCardId[]> = {};
  /** Activations de pouvoir confirmées (indexées par playId). */
  private powerActivations: PowerCardActivation[] = [];
  /** Power activations déjà émises à l'UI (anti-doublon). */
  private emittedPowerPlayIds = new Set<string>();
  /** Effets de pouvoir actifs sur le pli courant (score multiplier / pot bonus). */
  private activePowerEffects: { cardId: PowerCardId; activatedByUid: string; scoreMultiplier?: number; potBonus?: number }[] = [];
  /** Joueurs forcés de jouer leur carte la plus faible (Coupe-Circuit). */
  private forcedLowestUids = new Set<string>();

  private unsubGame: Unsubscribe | null = null;
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private dealHandle: ReturnType<typeof setTimeout> | null = null;
  private rematchHandle: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private sawFirstSnapshot = false;
  /** Phase du DERNIER doc reçu (≠ this.phase, qui peut être avancé localement
   *  par l'hôte avant l'écho du snapshot). Sert à détecter result→dealing. */
  private lastDocPhase: Phase | null = null;
  private lastEmittedPlayId: string | null = null;
  private lastEmittedResultKey: string | null = null;
  private lastTrickEndKey: string | null = null;
  private emittedPlayIds = new Set<string>();
  private optimisticAppliedPlayIds = new Set<string>();
  private optimisticDrops = new Map<string, Pick<DepositedCard, "dropRot" | "dx" | "dy">>();
  private processingPlayIds = new Set<string>();
  private rematchStarting = false;
  /** UID de l'hôte actuel (peut différer de opts.hostId après rotation) */
  private currentGameHost: string;
  /** Dernier timestamp serveur connu (pour détection inactivité hôte) */
  private serverTimeBase: number | null = null;
  /** Heure client au moment où serverTimeBase a été calibré (compensation offset) */
  private clientTimeBase: number | null = null;
  private takeoverRequested = false;

  constructor(opts: FirestoreSyncOptions) {
    this.opts = opts;
    this.isHost = opts.myUid === opts.hostId;
    this.myIdx = opts.roomPlayers.findIndex((p) => p.uid === opts.myUid);
    if (this.myIdx < 0) this.myIdx = 0;
    this.currentGameHost = opts.hostId;
  }

  start() {
    this.listenGame();
    if (this.isHost) void this.ensureRoundExists();
  }

  nextRound() {
    if (this.phase !== "result") return;

    const gameRef = doc(db, "rooms", this.opts.roomId, "game", "current");
    void updateDoc(gameRef, {
      "rematch.readyUids": arrayUnion(this.opts.myUid),
      updatedAt: serverTimestamp(),
    });
  }

  playCard = async (cardIdx: number) => {
    // Guard 1: phase
    if (this.phase !== "turns") return;
    // Guard 2: turn ownership
    if (this.turnIdx !== this.myIdx) return;

    const uid = this.opts.roomPlayers[this.myIdx]?.uid;
    const hand = uid ? this.allHands[uid] : undefined;
    if (!uid || !hand) return;

    // Guard 3: card legality (ré-exécution des règles)
    const led = this.trickPlays[0]?.card.suit ?? null;
    const legal = legalCards(hand, led);
    if (!legal.includes(cardIdx)) return;

    // Guard 4: card ownership (la carte existe-t-elle dans ma main ?)
    const card = hand[cardIdx];
    if (!card) return;

    // Guard 5: pas déjà jouée dans ce tour
    if (this.trickPlays.some((p) => p.playerIdx === this.myIdx && p.card.id === card.id)) return;

    // Guard 6: UUID cryptographique anti-replay
    const playId = generatePlayId(uid);
    const pendingPlay: PendingPlay = {
      playerIdx: this.myIdx,
      cardIdx,
      uid,
      playId,
      createdAt: Date.now(),
    };

    this.emitPlayEventOnce({ playerIdx: this.myIdx, cardIdx, card, playId });
    if (this.applyOptimisticPlay(pendingPlay)) {
      this.emitState();
    }

    const gameRef = doc(db, "rooms", this.opts.roomId, "game", "current");
    await updateDoc(gameRef, {
      pendingPlay,
      updatedAt: serverTimestamp(),
    });
  };

  /* ── Interface GameSyncActions.usePowerCard ── */
  usePowerCard = async (cardId: PowerCardId, targetIdx?: number) => {
    if (this.phase !== "turns") return;

    const uid = this.opts.roomPlayers[this.myIdx]?.uid;
    if (!uid) return;

    // Vérifier que la carte est équipée
    const equipped = this.equippedPowersByUid[uid] ?? this.opts.profile.equippedPowers ?? [];
    if (!equipped.includes(cardId)) return;

    // Vérifier qu'elle n'est pas déjà utilisée
    const alreadyUsed = this.powerActivations.some(
      (a) => a.cardId === cardId && a.activatedByUid === uid && a.used,
    );
    if (alreadyUsed) return;

    // Convertir targetIdx (UI index) en uid
    const targetUid = targetIdx !== undefined
      ? this.opts.roomPlayers[targetIdx]?.uid
      : undefined;

    const playId = generatePlayId(uid);
    const gameRef = doc(db, "rooms", this.opts.roomId, "game", "current");
    await updateDoc(gameRef, {
      pendingPowerActivation: {
        cardId,
        activatedByUid: uid,
        targetUid,
        trickNo: this.trickNo,
        playId,
        createdAt: Date.now(),
      },
      updatedAt: serverTimestamp(),
    });
  };

  onPowerActivated = (cb: (activation: PowerCardActivation) => void): (() => void) => {
    this.powerActivatedListeners.add(cb);
    return () => this.powerActivatedListeners.delete(cb);
  };

  private listenGame() {
    this.unsubGame?.();
    const gameRef = doc(db, "rooms", this.opts.roomId, "game", "current");
    this.unsubGame = onSnapshot(gameRef, (snap) => {
      if (this.destroyed || !snap.exists()) return;
      this.onGameDocUpdate(snap.data() as GameDoc);
    });
  }

  private async ensureRoundExists() {
    if (!this.opts.roomId || this.opts.roomPlayers.length === 0) return;

    const gameRef = doc(db, "rooms", this.opts.roomId, "game", "current");
    const snap = await getDoc(gameRef);
    if (this.destroyed) return;
    if (!snap.exists()) {
      await this.hostStartRound();
    }
  }

  private onGameDocUpdate(game: GameDoc) {
    // IMPORTANT : on compare la phase du DOC précédent (lastDocPhase), pas
    // this.phase — car l'hôte avance this.phase à "dealing" dans
    // hostStartRound() AVANT l'écriture. Utiliser this.phase ferait rater la
    // transition result→dealing côté hôte → overlay résultat jamais fermé.
    const previousPhase = this.lastDocPhase;
    this.lastDocPhase = game.phase;
    this.applyDoc(game);

    // Calibrer l'horloge serveur depuis le premier snapshot
    if (!this.serverTimeBase && game.updatedAt) {
      const tsMs = this.getServerTimestampMs(game.updatedAt);
      if (tsMs) {
        this.serverTimeBase = tsMs;
        this.clientTimeBase = Date.now();
      }
    }

    // Vérifier si currentGameHost a changé (rotation)
    if (game.currentGameHost && game.currentGameHost !== this.currentGameHost) {
      this.currentGameHost = game.currentGameHost;
      this.isHost = this.opts.myUid === this.currentGameHost;
      // Si on est devenu hôte, lancer le round si nécessaire
      if (this.isHost) void this.ensureRoundExists();
    }

    const firstSnapshot = !this.sawFirstSnapshot;
    this.sawFirstSnapshot = true;

    if (game.phase === "dealing" && !game.pendingPlay && !game.lastPlay) {
      this.emittedPlayIds.clear();
      this.optimisticAppliedPlayIds.clear();
      this.optimisticDrops.clear();
      this.lastEmittedPlayId = null;
      this.lastTrickEndKey = null;
    }

    if (previousPhase === "result" && game.phase !== "result") {
      this.lastEmittedResultKey = null;
      this.opts.onRoundRestart?.();
    }

    if (firstSnapshot) {
      if (game.lastPlay?.playId) {
        this.emittedPlayIds.add(game.lastPlay.playId);
        this.lastEmittedPlayId = game.lastPlay.playId;
      }
    } else if (game.lastPlay) {
      this.emitPlayEventOnce(game.lastPlay);
    }

    const pendingIsUnconfirmed =
      !!game.pendingPlay && game.lastPlay?.playId !== game.pendingPlay.playId;

    let localStateAdvanced = false;
    if (pendingIsUnconfirmed && game.pendingPlay) {
      const pendingCard = this.getPendingCard(game.pendingPlay);
      if (pendingCard) {
        this.emitPlayEventOnce({
          playerIdx: game.pendingPlay.playerIdx,
          cardIdx: game.pendingPlay.cardIdx,
          card: pendingCard,
          playId: game.pendingPlay.playId,
        });
      }
    }

    // Détection d'inactivité de l'hôte → tentative de takeover
    if (!this.isHost && game.phase === "turns" && game.updatedAt) {
      this.maybeRequestTakeover(game);
    }

    if (this.isHost && game.pendingPlay) {
      const before = this.stateSignature();
      void this.hostProcessPendingPlay(game.pendingPlay, game);
      localStateAdvanced = this.stateSignature() !== before;
    } else if (pendingIsUnconfirmed && game.pendingPlay) {
      localStateAdvanced = this.applyOptimisticPlay(game.pendingPlay);
    }

    // ── Power cards : traitement de l'activation en attente ──
    if (this.isHost && game.pendingPowerActivation) {
      void this.hostProcessPowerActivation(game.pendingPowerActivation);
    }
    // Émettre les nouvelles activations confirmées à l'UI
    this.emitNewPowerActivations(game);

    this.emitTrickEndIfNeeded();
    this.emitState();
    if (!localStateAdvanced) {
      this.syncTimer(game);
    }

    if (game.result) {
      this.emitResultOnce(game.result);
    }

    this.syncRematch(game);

    if (this.isHost && game.phase === "result" && game.rematch) {
      this.hostMaybeStartRematch(game);
    }
  }

  private applyDoc(game: GameDoc) {
    const { cfg, roomPlayers } = this.opts;

    this.allHands = {};
    game.players.forEach((uid) => {
      this.allHands[uid] = (game.hands[uid] ?? []).map((card) => ({ ...card }));
    });

    this.depositsByUid = {};
    game.players.forEach((uid) => {
      this.depositsByUid[uid] = (game.deposits[uid] ?? []).map((card) => ({ ...card }));
    });
    this.balancesByUid = game.balances ?? {};

    this.players = game.players.map((uid, i) => {
      const roomPlayer = roomPlayers.find((p) => p.uid === uid);
      const meta = game.playerMeta?.[uid];
      const roomName = roomPlayer?.name?.trim();
      const roomEmoji = roomPlayer?.emoji?.trim();
      return {
        name: roomName && roomName !== "Joueur" ? roomName : meta?.name ?? `Joueur ${i + 1}`,
        emoji: roomEmoji || meta?.emoji || "?",
        isYou: uid === this.opts.myUid,
        balance: this.balancesByUid[uid] ?? roomPlayer?.balance ?? cfg.startingBalance,
        hand: this.allHands[uid] ?? [],
        deposit: this.depositsByUid[uid] ?? [],
      };
    });

    this.phase = game.phase;
    this.trickNo = game.trickNo;
    this.leaderIdx = game.leaderIdx;
    this.turnIdx = game.turnIdx;
    this.pot = game.pot;
    this.trickPlays = (game.trickPlays ?? []).map((play) => ({
      playerIdx: play.playerIdx,
      card: { ...play.card },
    }));
    this.dominantIdx = game.dominantIdx ?? null;
  }

  private getPendingCard(pending: PendingPlay): Card | null {
    const validPlayer = this.opts.roomPlayers[pending.playerIdx];
    if (!validPlayer || validPlayer.uid !== pending.uid) return null;
    const card = this.allHands[pending.uid]?.[pending.cardIdx];
    return card ? { ...card } : null;
  }

  private applyOptimisticPlay(pending: PendingPlay): boolean {
    const validPlayer = this.opts.roomPlayers[pending.playerIdx];
    if (
      this.phase !== "turns"
      || pending.playerIdx !== this.turnIdx
      || !validPlayer
      || validPlayer.uid !== pending.uid
    ) {
      return false;
    }

    const hand = [...(this.allHands[pending.uid] ?? [])];
    const card = hand[pending.cardIdx];
    const led = this.trickPlays[0]?.card.suit ?? null;
    if (!card || !legalCards(hand, led).includes(pending.cardIdx)) return false;

    if (this.trickPlays.some((play) => play.playerIdx === pending.playerIdx && play.card.id === card.id)) {
      return true;
    }

    const removed = hand.splice(pending.cardIdx, 1)[0] ?? card;
    const drop = this.dropForPlay(pending.playId);
    const existingDeposit = this.depositsByUid[pending.uid] ?? [];
    this.allHands[pending.uid] = hand;
    this.depositsByUid[pending.uid] = existingDeposit.some((deposited) => deposited.id === removed.id)
      ? existingDeposit
      : [...existingDeposit, { ...removed, ...drop }];
    this.trickPlays = [...this.trickPlays, { playerIdx: pending.playerIdx, card: { ...removed } }];
    this.optimisticAppliedPlayIds.add(pending.playId);
    this.refreshPlayersFromCollections();

    if (this.trickPlays.length === this.opts.roomPlayers.length) {
      const win = trickWinner(this.trickPlays, this.trickPlays[0].card.suit);
      this.phase = "trickEnd";
      this.dominantIdx = win;
      this.stopTimer();
    } else {
      this.turnIdx = (pending.playerIdx + 1) % this.opts.roomPlayers.length;
      this.seconds = this.opts.cfg.turnSeconds;
      this.startTimer();
    }

    return true;
  }

  private dropForPlay(playId: string): Pick<DepositedCard, "dropRot" | "dx" | "dy"> {
    const existing = this.optimisticDrops.get(playId);
    if (existing) return existing;
    const drop = {
      dropRot: Math.random() * 18 - 9,
      dx: Math.random() * 12 - 6,
      dy: Math.random() * 8 - 4,
    };
    this.optimisticDrops.set(playId, drop);
    return drop;
  }

  private refreshPlayersFromCollections() {
    this.players = this.players.map((player, idx) => {
      const uid = this.opts.roomPlayers[idx]?.uid;
      if (!uid) return player;
      return {
        ...player,
        hand: this.allHands[uid] ?? [],
        deposit: this.depositsByUid[uid] ?? [],
      };
    });
  }

  private stateSignature(): string {
    return [
      this.phase,
      this.turnIdx,
      this.trickNo,
      this.dominantIdx ?? "none",
      this.trickPlays.map((play) => `${play.playerIdx}:${play.card.id}`).join("|"),
    ].join(":");
  }

  private syncTimer(game: GameDoc) {
    if (game.phase !== "turns" || !game.updatedAt) {
      this.stopTimer();
      return;
    }

    // Utiliser le timestamp serveur au lieu de Date.now() client
    // game.updatedAt est maintenant un serverTimestamp (objet {seconds, nanoseconds})
    const serverUpdatedAt = this.getServerTimestampMs(game.updatedAt);
    if (!serverUpdatedAt) {
      this.stopTimer();
      return;
    }

    const now = this.getServerTime();
    const elapsed = Math.floor((now - serverUpdatedAt) / 1000);
    this.seconds = Math.max(0, this.opts.cfg.turnSeconds - elapsed);
    this.startTimer();
  }

  /**
   * Extrait un timestamp ms depuis un serverTimestamp Firestore
   * ou un number brut (compatibilité backward).
   */
  private getServerTimestampMs(value: unknown): number | null {
    if (typeof value === "number") return value;
    if (value && typeof value === "object" && "seconds" in value) {
      const secs = (value as { seconds: number }).seconds;
      const nanos = (value as { nanoseconds?: number }).nanoseconds ?? 0;
      return secs * 1000 + Math.floor(nanos / 1000000);
    }
    return null;
  }

  /**
   * Horloge serveur calibrée via le premier snapshot reçu.
   * Compense le décalage client/serveur.
   */
  private getServerTime(): number {
    if (this.serverTimeBase != null && this.clientTimeBase != null) {
      // offset = (heure serveur au calibrage) - (heure client au calibrage)
      return Date.now() + (this.serverTimeBase - this.clientTimeBase);
    }
    return Date.now();
  }

  private syncRematch(game: GameDoc) {
    if (game.phase !== "result" || !game.rematch) {
      this.stopRematchTimer();
      return;
    }

    this.stopRematchTimer();
    const tick = () => {
      if (this.destroyed) return;
      const allReady = this.opts.roomPlayers.every((player) =>
        game.rematch?.readyUids.includes(player.uid),
      );
      if (allReady) return;

      const deadline = game.rematch!.deadlineAt;
      // deadlineAt est un serverTimestamp ou un number
      const deadlineMs = typeof deadline === "number" ? deadline : this.getServerTimestampMs(deadline) ?? 0;
      const now = this.getServerTime();
      if (now >= deadlineMs) {
        this.stopRematchTimer();
        this.opts.onRematchExpired?.();
      }
    };

    tick();
    this.rematchHandle = setInterval(tick, 1000);
  }

  private stopRematchTimer() {
    if (this.rematchHandle) {
      clearInterval(this.rematchHandle);
      this.rematchHandle = null;
    }
  }

  private hostMaybeStartRematch(game: GameDoc) {
    if (!game.rematch || game.phase !== "result") return;

    const allReady = this.opts.roomPlayers.every((player) =>
      game.rematch?.readyUids.includes(player.uid),
    );
    if (!allReady) return;

    if (this.rematchStarting) return;
    this.rematchStarting = true;
    void this.hostStartRound().finally(() => {
      this.rematchStarting = false;
    });
  }

  private async hostStartRound() {
    const { roomId, roomPlayers, cfg, mise } = this.opts;
    if (!roomId || roomPlayers.length === 0) return;

    this.stopTimer();
    if (this.dealHandle) clearTimeout(this.dealHandle);

    // Réinitialiser les états de power cards
    this.powerActivations = [];
    this.emittedPowerPlayIds.clear();
    this.activePowerEffects = [];
    this.forcedLowestUids.clear();
    this.equippedPowersByUid = {};
    roomPlayers.forEach((p) => {
      this.equippedPowersByUid[p.uid] = [];
    });

    const gameRef = doc(db, "rooms", roomId, "game", "current");
    const deck = shuffle(buildDeck(cfg));
    const balances: Record<string, number> = {};
    const playerMeta: NonNullable<GameDoc["playerMeta"]> = {};

    this.allHands = {};
    this.depositsByUid = {};
    roomPlayers.forEach((p) => {
      this.allHands[p.uid] = [];
      this.depositsByUid[p.uid] = [];
      balances[p.uid] = (this.balancesByUid[p.uid] ?? p.balance) - mise;
      playerMeta[p.uid] = { name: p.name, emoji: p.emoji };
    });

    for (let cardNo = 0; cardNo < cfg.cardsPerPlayer; cardNo++) {
      for (const player of roomPlayers) {
        const card = deck.shift();
        if (card) this.allHands[player.uid].push(card);
      }
    }

    this.balancesByUid = balances;
    this.players = roomPlayers.map((player) => ({
      name: player.name,
      emoji: player.emoji,
      isYou: player.uid === this.opts.myUid,
      balance: balances[player.uid],
      hand: this.allHands[player.uid],
      deposit: [],
    }));
    this.phase = "dealing";
    this.trickNo = 1;
    this.leaderIdx = cfg.firstLeaderIndex;
    this.turnIdx = cfg.firstLeaderIndex;
    this.trickPlays = [];
    this.dominantIdx = null;
    this.pot = mise * roomPlayers.length;
    this.lastEmittedResultKey = null;
    this.emitState();

    await setDoc(gameRef, {
      roomId,
      roundId: "current",
      phase: "dealing" as Phase,
      leaderIdx: cfg.firstLeaderIndex,
      turnIdx: cfg.firstLeaderIndex,
      trickNo: 1,
      pot: this.pot,
      balances,
      playerMeta,
      trickPlays: [],
      players: roomPlayers.map((p) => p.uid),
      hands: cloneHands(this.allHands),
      deposits: cloneDeposits(this.depositsByUid),
      result: null,
      dominantIdx: null,
      pendingPlay: null,
      lastPlay: null,
      rematch: null,
      instantWinChecked: false,
      currentGameHost: this.currentGameHost,
      equippedPowers: this.equippedPowersByUid,
      powerActivations: [],
      pendingPowerActivation: null,
      lastPowerActivation: null,
      updatedAt: serverTimestamp(),
      startedAt: serverTimestamp(),
    } satisfies GameDoc);

    const dealTime = roomPlayers.length * cfg.cardsPerPlayer * cfg.anim.dealPerCard + cfg.anim.dealFlight + 350;
    this.dealHandle = setTimeout(() => {
      void this.hostAfterDeal();
    }, dealTime);
  }

  private async hostAfterDeal() {
    if (this.destroyed) return;

    const { roomId, roomPlayers, cfg, mise } = this.opts;
    const gameRef = doc(db, "rooms", roomId, "game", "current");
    const playersForCheck = roomPlayers.map((player) => ({
      name: player.name,
      emoji: player.emoji,
      isYou: player.uid === this.opts.myUid,
      balance: this.balancesByUid[player.uid] ?? player.balance - mise,
      hand: this.allHands[player.uid] ?? [],
      deposit: [] as DepositedCard[],
    }));

    const instantWin = checkInstantWin(playersForCheck, cfg);
    if (instantWin) {
      await this.hostResolveWin(playersForCheck, instantWin.winnerIdx, {
        type: "instant",
        winnerIdx: instantWin.winnerIdx,
        reason: instantWin.reason,
        total: instantWin.total,
        doubles: instantWin.doubles,
      });
      return;
    }

    this.phase = "turns";
    this.turnIdx = cfg.firstLeaderIndex;
    this.seconds = cfg.turnSeconds;
    this.emitState();
    this.startTimer();

    await updateDoc(gameRef, {
      phase: "turns" as Phase,
      turnIdx: cfg.firstLeaderIndex,
      instantWinChecked: true,
      updatedAt: serverTimestamp(),
    });
  }

  /* ═══════════════ Power cards (online) ═══════════════ */

  /** L'hôte valide et applique une activation de carte pouvoir. */
  private async hostProcessPowerActivation(pending: NonNullable<GameDoc["pendingPowerActivation"]>) {
    // Anti-replay
    if (this.emittedPowerPlayIds.has(pending.playId)) return;
    if (this.powerActivations.some((a) => a.playId === pending.playId)) return;

    // Vérifier que c'est le tour du joueur qui active
    const activatorIdx = this.opts.roomPlayers.findIndex((p) => p.uid === pending.activatedByUid);
    if (activatorIdx < 0) return;
    if (this.phase !== "turns") return;

    // Vérifier que la carte est équipée
    const equipped = this.equippedPowersByUid[pending.activatedByUid] ?? [];
    if (!equipped.includes(pending.cardId)) return;

    // Vérifier qu'elle n'est pas déjà utilisée
    const alreadyUsed = this.powerActivations.some(
      (a) => a.cardId === pending.cardId && a.activatedByUid === pending.activatedByUid && a.used,
    );
    if (alreadyUsed) return;

    // Convertir les uids en indices UI locaux pour le moteur d'effet
    const activatedByLocalIdx = pending.activatedByUid === this.opts.myUid
      ? 0 // le joueur local est toujours index 0 dans l'UI
      : this.opts.roomPlayers.findIndex((p) => p.uid === pending.activatedByUid);
    const targetLocalIdx = pending.targetUid
      ? (pending.targetUid === this.opts.myUid ? 0 : this.opts.roomPlayers.findIndex((p) => p.uid === pending.targetUid))
      : undefined;

    // Construire l'état pour le moteur
    const gameStateForEffect: GameState = {
      phase: this.phase,
      trickNo: this.trickNo,
      trickPlays: [...this.trickPlays],
      leaderIdx: this.leaderIdx,
      turnIdx: this.turnIdx,
      pot: this.pot,
      dominantIdx: this.dominantIdx,
      banner: "",
      players: this.players.map((p) => ({ ...p, hand: [...p.hand], deposit: [...p.deposit] })),
    };

    const error = canActivatePowerCard(pending.cardId, {
      state: gameStateForEffect,
      activatedBy: activatedByLocalIdx,
      target: targetLocalIdx,
      deck: [],
    });

    if (error) return;

    // Appliquer l'effet
    const result = applyPowerCard(pending.cardId, {
      state: gameStateForEffect,
      activatedBy: activatedByLocalIdx,
      target: targetLocalIdx,
      deck: [],
    });

    // Préparer l'activation confirmée
    const activation: PowerCardActivation = {
      cardId: pending.cardId,
      activatedByUid: pending.activatedByUid,
      targetUid: pending.targetUid,
      trickNo: pending.trickNo,
      used: true,
      playId: pending.playId,
    };
    this.powerActivations.push(activation);
    this.emittedPowerPlayIds.add(pending.playId);

    // Préparer les updates Firestore
    const updates: Record<string, unknown> = {
      pendingPowerActivation: null,
      lastPowerActivation: {
        cardId: pending.cardId,
        activatedByUid: pending.activatedByUid,
        playId: pending.playId,
      },
      powerActivations: [...this.powerActivations],
      updatedAt: serverTimestamp(),
    };

    // Appliquer les effets concrets
    if (result.potBonus) {
      this.pot += result.potBonus;
      this.activePowerEffects.push({
        cardId: pending.cardId,
        activatedByUid: pending.activatedByUid,
        potBonus: result.potBonus,
      });
      updates.pot = this.pot;
    }
    if (result.trickScoreMultiplier) {
      this.activePowerEffects.push({
        cardId: pending.cardId,
        activatedByUid: pending.activatedByUid,
        scoreMultiplier: result.trickScoreMultiplier,
      });
    }
    if (result.forceLowestCard && pending.targetUid) {
      this.forcedLowestUids.add(pending.targetUid);
    }

    const gameRef = doc(db, "rooms", this.opts.roomId, "game", "current");
    await updateDoc(gameRef, updates);

    // Émettre à l'UI locale
    this.powerActivatedListeners.forEach((cb) => cb(activation));
  }

  /** Émet les nouvelles activations confirmées aux clients non-hôtes. */
  private emitNewPowerActivations(game: GameDoc) {
    const acts = game.powerActivations ?? [];
    for (const act of acts) {
      if (!this.emittedPowerPlayIds.has(act.playId)) {
        this.emittedPowerPlayIds.add(act.playId);
        this.powerActivations.push(act);
        this.powerActivatedListeners.forEach((cb) => cb(act));
      }
    }
  }

  private async hostProcessPendingPlay(pending: PendingPlay, game: GameDoc) {
    if (this.processingPlayIds.has(pending.playId)) return;
    this.processingPlayIds.add(pending.playId);

    try {
      const validPlayer = this.opts.roomPlayers[pending.playerIdx];
      const gameRef = doc(db, "rooms", this.opts.roomId, "game", "current");

      if (
        game.phase !== "turns"
        || pending.playerIdx !== game.turnIdx
        || !validPlayer
        || validPlayer.uid !== pending.uid
      ) {
        await updateDoc(gameRef, { pendingPlay: null, updatedAt: serverTimestamp() });
        return;
      }

      const hand = this.allHands[pending.uid] ?? [];
      const card = hand[pending.cardIdx];
      const led = this.trickPlays[0]?.card.suit ?? null;

      if (!card || !legalCards(hand, led).includes(pending.cardIdx)) {
        await updateDoc(gameRef, { pendingPlay: null, updatedAt: serverTimestamp() });
        return;
      }

      await this.hostCommitPlay(pending.playerIdx, pending.cardIdx, card, pending.playId);
    } finally {
      this.processingPlayIds.delete(pending.playId);
    }
  }

  private async hostCommitPlay(playerIdx: number, cardIdx: number, expectedCard: Card, playId: string) {
    if (this.phase !== "turns" || this.turnIdx !== playerIdx) return;

    const { roomId, roomPlayers, cfg } = this.opts;
    const player = roomPlayers[playerIdx];
    if (!player) return;

    const hand = this.allHands[player.uid] ?? [];
    const led = this.trickPlays[0]?.card.suit ?? null;
    if (!legalCards(hand, led).includes(cardIdx)) return;

    const removed = hand.splice(cardIdx, 1)[0] ?? expectedCard;
    if (!removed) return;

    const drop = this.dropForPlay(playId);
    const depCard: DepositedCard = { ...removed, ...drop };
    this.depositsByUid[player.uid] = [...(this.depositsByUid[player.uid] ?? []), depCard];
    this.trickPlays = [...this.trickPlays, { playerIdx, card: { ...removed } }];
    this.refreshPlayersFromCollections();

    const gameRef = doc(db, "rooms", roomId, "game", "current");
    const lastPlay: LastPlay = {
      playerIdx,
      cardIdx,
      card: { ...removed },
      playId,
    };

    if (this.trickPlays.length === roomPlayers.length) {
      const win = trickWinner(this.trickPlays, this.trickPlays[0].card.suit);
      this.phase = "trickEnd";
      this.dominantIdx = win;
      this.stopTimer();

      await updateDoc(gameRef, {
        hands: cloneHands(this.allHands),
        deposits: cloneDeposits(this.depositsByUid),
        trickPlays: this.trickPlays,
        phase: "trickEnd" as Phase,
        dominantIdx: win,
        pendingPlay: null,
        lastPlay,
        updatedAt: serverTimestamp(),
      });

      setTimeout(() => {
        void this.hostAfterTrick(win);
      }, cfg.anim.trickPause);
      return;
    }

    this.turnIdx = (playerIdx + 1) % roomPlayers.length;
    this.seconds = cfg.turnSeconds;
    this.stopTimer();
    this.startTimer();

    await updateDoc(gameRef, {
      hands: cloneHands(this.allHands),
      deposits: cloneDeposits(this.depositsByUid),
      trickPlays: this.trickPlays,
      turnIdx: this.turnIdx,
      phase: "turns" as Phase,
      pendingPlay: null,
      lastPlay,
      updatedAt: serverTimestamp(),
    });
  }

  private async hostAfterTrick(winnerIdx: number) {
    if (this.destroyed || this.phase !== "trickEnd") return;

    const { roomId, cfg } = this.opts;
    const gameRef = doc(db, "rooms", roomId, "game", "current");
    this.dominantIdx = null;

    if (this.trickNo >= cfg.cardsPerPlayer) {
      const lastCard = this.trickPlays.find((play) => play.playerIdx === winnerIdx)?.card;
      if (!lastCard) return;

      await this.hostResolveWin(this.players, winnerIdx, {
        type: "lastTrick",
        winnerIdx,
        doubles: lastCardDoubles(lastCard, cfg),
        lastCard,
      });
      return;
    }

    this.trickNo++;
    this.trickPlays = [];
    this.leaderIdx = winnerIdx;
    this.turnIdx = winnerIdx;
    this.phase = "turns";
    this.seconds = cfg.turnSeconds;

    await updateDoc(gameRef, {
      trickPlays: [],
      trickNo: this.trickNo,
      leaderIdx: winnerIdx,
      turnIdx: winnerIdx,
      phase: "turns" as Phase,
      dominantIdx: null,
      pendingPlay: null,
      updatedAt: serverTimestamp(),
    });
  }

  private async hostResolveWin(playersState: Player[], winnerIdx: number, info: WinInfo) {
    const { roomId, mise, roomPlayers } = this.opts;
    const gameRef = doc(db, "rooms", roomId, "game", "current");
    const final = playersState.map((player) => ({
      ...player,
      hand: [...player.hand],
      deposit: [...player.deposit],
    }));

    const potNow = this.pot || mise * final.length;

    // Appliquer le multiplicateur de score (Bénédiction du Chef)
    let finalPot = potNow;
    const winnerUid = roomPlayers[winnerIdx]?.uid;
    if (winnerUid) {
      const scoreMultiplier = this.activePowerEffects.find(
        (e) => e.activatedByUid === winnerUid && e.scoreMultiplier,
      )?.scoreMultiplier;
      if (scoreMultiplier && scoreMultiplier > 1) {
        finalPot = finalPot * scoreMultiplier;
      }
    }

    final[winnerIdx].balance += finalPot;

    if (info.doubles) {
      final.forEach((player, i) => {
        if (i !== winnerIdx) {
          player.balance -= mise;
          final[winnerIdx].balance += mise;
        }
      });
    }

    // Nettoyer les effets power après résolution
    this.activePowerEffects = [];

    const balances: Record<string, number> = {};
    roomPlayers.forEach((player, i) => {
      balances[player.uid] = final[i]?.balance ?? player.balance;
    });

    this.balancesByUid = balances;
    this.players = final;
    this.phase = "result";
    this.pot = 0;
    const result: Result = {
      ...info,
      winner: final[winnerIdx],
      gain: finalPot,
      playersCount: final.length,
    };

    this.emitState();
    this.emitResultOnce(result);

    await updateDoc(gameRef, {
      phase: "result" as Phase,
      pot: 0,
      balances,
      result,
      rematch: {
        readyUids: [],
        // Temps FUTUR (domaine horloge serveur calibrée) — sinon la revanche
        // « expire » instantanément et éjecte les joueurs vers le menu.
        deadlineAt: this.getServerTime() + REMATCH_WINDOW_MS,
        requestedAt: serverTimestamp(),
      },
      pendingPlay: null,
      updatedAt: serverTimestamp(),
    });
  }

  private startTimer() {
    this.stopTimer();
    this.timerListeners.forEach((cb) => cb(this.seconds));

    this.timerHandle = setInterval(() => {
      if (this.destroyed) return;
      this.seconds = Math.max(0, this.seconds - 1);
      this.timerListeners.forEach((cb) => cb(this.seconds));

      if (this.seconds <= 0) {
        this.stopTimer();
        if (this.isHost) void this.hostPlayTimeoutCard();
      }
    }, 1000);
  }

  private async hostPlayTimeoutCard() {
    if (this.phase !== "turns") return;

    const player = this.opts.roomPlayers[this.turnIdx];
    if (!player) return;

    const hand = this.allHands[player.uid] ?? [];
    const led = this.trickPlays[0]?.card.suit ?? null;
    const legal = legalCards(hand, led);
    const lowest = [...legal].sort((a, b) => hand[a].value - hand[b].value)[0];
    if (lowest === undefined) return;

    const card = hand[lowest];
    const playId = generatePlayId(player.uid) + "-timeout";
    await this.hostCommitPlay(this.turnIdx, lowest, card, playId);
  }

  private stopTimer() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private emitPlayEvent(lastPlay: LastPlay) {
    this.emitPlayEventOnce(lastPlay);
  }

  private emitPlayEventOnce(lastPlay: LastPlay) {
    if (this.emittedPlayIds.has(lastPlay.playId)) return;
    this.emittedPlayIds.add(lastPlay.playId);
    this.lastEmittedPlayId = lastPlay.playId;
    this.playCardListeners.forEach((cb) => cb({
      playerIdx: this.toUiIdx(lastPlay.playerIdx),
      cardIdx: lastPlay.cardIdx,
      card: lastPlay.card,
      playId: lastPlay.playId,
    }));
  }

  private emitTrickEndIfNeeded() {
    const trickEndKey = `${this.trickNo}:${this.dominantIdx ?? "none"}:${this.trickPlays.length}`;
    if (this.phase !== "trickEnd" || this.dominantIdx == null || trickEndKey === this.lastTrickEndKey) {
      return;
    }

    this.lastTrickEndKey = trickEndKey;
    this.trickEndListeners.forEach((cb) => cb(this.toUiIdx(this.dominantIdx!)));
  }

  private emitResultOnce(result: Result) {
    const key = `${result.type}:${result.winnerIdx}:${result.gain}:${result.playersCount}`;
    if (this.lastEmittedResultKey === key) return;
    this.lastEmittedResultKey = key;

    const uiResult = this.toUiResult(result);
    this.roundEndListeners.forEach((cb) => cb(uiResult));
    this.opts.onResult(uiResult);

    const you = this.buildUiPlayers()[0];
    if (you) this.opts.onUpdateBalance(you.balance);
  }

  private emitState() {
    const state: GameState = {
      phase: this.phase,
      trickNo: this.trickNo,
      trickPlays: this.trickPlays.map((play) => ({
        playerIdx: this.toUiIdx(play.playerIdx),
        card: { ...play.card },
      })),
      leaderIdx: this.toUiIdx(this.leaderIdx),
      turnIdx: this.toUiIdx(this.turnIdx),
      pot: this.pot,
      dominantIdx: this.dominantIdx == null ? null : this.toUiIdx(this.dominantIdx),
      banner: "",
      players: this.buildUiPlayers(),
    };
    this.stateListeners.forEach((cb) => cb(state));
  }

  private buildUiPlayers(): Player[] {
    return this.players.map((_, uiIdx) => {
      const serverIdx = this.toServerIdx(uiIdx);
      const player = this.players[serverIdx];
      const isYou = serverIdx === this.myIdx;
      return {
        ...player,
        isYou,
        hand: isYou
          ? player.hand.map((card) => ({ ...card }))
          : player.hand.map((_, cardIdx) => hiddenCard(serverIdx, cardIdx)),
        deposit: player.deposit.map((card) => ({ ...card })),
      };
    });
  }

  private toUiResult(result: Result): Result {
    const winnerIdx = this.toUiIdx(result.winnerIdx);
    const uiPlayers = this.buildUiPlayers();
    return {
      ...result,
      winnerIdx,
      winner: uiPlayers[winnerIdx] ?? result.winner,
    };
  }

  private toUiIdx(serverIdx: number): number {
    const count = this.players.length;
    if (count === 0) return serverIdx;
    return (serverIdx - this.myIdx + count) % count;
  }

  private toServerIdx(uiIdx: number): number {
    const count = this.players.length;
    if (count === 0) return uiIdx;
    return (uiIdx + this.myIdx) % count;
  }

  /**
   * Détecte si l'hôte est inactif (> 30s sans mise à jour)
   * et tente une prise de contrôle si ce n'est pas déjà fait.
   */
  private async maybeRequestTakeover(game: GameDoc) {
    if (this.takeoverRequested || this.destroyed) return;
    if (!game.updatedAt) return;

    const lastActivity = this.getServerTimestampMs(game.updatedAt);
    if (!lastActivity) return;

    const now = this.getServerTime();
    const inactiveMs = now - lastActivity;

    // Seuils de tolérance : 30s pour un joueur normal, 60s pour l'hôte
    const threshold = this.currentGameHost === this.opts.myUid ? 60000 : 30000;
    if (inactiveMs < threshold) return;

    // Vérifier qu'on est bien un joueur de la room
    const roomDoc = await getDoc(doc(db, "rooms", this.opts.roomId));
    if (!roomDoc.exists()) return;
    const roomData = roomDoc.data();
    const isPlayer = roomData.players?.some((p: { uid: string }) => p.uid === this.opts.myUid);
    if (!isPlayer) return;

    // Demander le takeover
    this.takeoverRequested = true;
    const takeoverRef = doc(db, "takeoverRequests", this.opts.roomId, this.opts.myUid);
    await setDoc(takeoverRef, {
      uid: this.opts.myUid,
      roomId: this.opts.roomId,
      timestamp: serverTimestamp(),
      agreedBy: [],
    }, { merge: true });

    // Attendre 5s que les autres joueurs "votent" implicitement
    setTimeout(async () => {
      const agreeRef = doc(db, "takeoverRequests", this.opts.roomId, this.opts.myUid);
      const agreeSnap = await getDoc(agreeRef);
      if (!agreeSnap.exists()) return;
      const agreeData = agreeSnap.data();
      const agreeCount = (agreeData.agreedBy ?? []).length;
      const totalPlayers = roomData.players?.length ?? 2;

      // Si >= 50% des joueurs ont accepté (ou c'est le seul joueur restant)
      if (agreeCount >= Math.ceil(totalPlayers / 2) || agreeCount === 0) {
        await this.executeTakeover(roomData as { hostId: string; players?: { uid: string }[]; playersCount?: number });
      }
    }, 5000);
  }

  /**
   * Exécute le transfert de rôle d'hôte.
   */
  private async executeTakeover(roomData: { hostId: string; players?: { uid: string }[]; playersCount?: number }) {
    const gameRef = doc(db, "rooms", this.opts.roomId, "game", "current");
    const roomRef = doc(db, "rooms", this.opts.roomId);

    // Nettoyer l'état en cours
    await updateDoc(gameRef, {
      currentGameHost: this.opts.myUid,
      pendingPlay: null,
      updatedAt: serverTimestamp(),
    });

    // Mettre à jour l'hôte de la room
    await updateDoc(roomRef, {
      hostId: this.opts.myUid,
      updatedAt: serverTimestamp(),
    });

    this.currentGameHost = this.opts.myUid;
    this.isHost = true;
    this.takeoverRequested = false;

    // Relancer le round
    await this.hostStartRound();
  }

  onStateUpdate = (cb: (state: GameState) => void): Unsubscribe => {
    this.stateListeners.add(cb);
    this.emitState();
    return () => this.stateListeners.delete(cb);
  };

  onPlayCard = (cb: (play: { playerIdx: number; cardIdx: number; card: Card; playId?: string }) => void): Unsubscribe => {
    this.playCardListeners.add(cb);
    return () => this.playCardListeners.delete(cb);
  };

  onTrickEnd = (cb: (winnerIdx: number) => void): Unsubscribe => {
    this.trickEndListeners.add(cb);
    return () => this.trickEndListeners.delete(cb);
  };

  onRoundEnd = (cb: (result: Result) => void): Unsubscribe => {
    this.roundEndListeners.add(cb);
    return () => this.roundEndListeners.delete(cb);
  };

  onTimerTick = (cb: (seconds: number) => void): Unsubscribe => {
    this.timerListeners.add(cb);
    return () => this.timerListeners.delete(cb);
  };

  destroy() {
    this.destroyed = true;
    this.stopTimer();
    this.stopRematchTimer();
    if (this.dealHandle) clearTimeout(this.dealHandle);
    this.unsubGame?.();
    this.stateListeners.clear();
    this.playCardListeners.clear();
    this.trickEndListeners.clear();
    this.roundEndListeners.clear();
    this.timerListeners.clear();
    this.powerActivatedListeners.clear();
    this.processingPlayIds.clear();
    this.takeoverRequested = false;
  }
}
