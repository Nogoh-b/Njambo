"use client";

import { doc, onSnapshot, type Unsubscribe } from "@/lib/firestoreClient";
import { db } from "@/lib/firebase";
import { backendCallable } from "@/lib/backendCallable";
import { GAME_CONFIG } from "@/config/gameConfig";
import type { PowerChoices } from "@/engine/power";
import type {
  Card, GameState, GameSyncActions, Player, PowerCardActivation, PowerCardId, Profile,
  Result, RoomPlayer, SyncStatus,
} from "@/types/game";

interface ServerParticipant { uid: string; name: string; emoji: string; bot: boolean; crowns: number }
interface ServerAction { uid: string; card: Card; playId: string; automatic: boolean }
interface ServerMatch {
  id: string;
  mode: "bot" | "online" | "friends" | "event";
  status: "playing" | "settled" | "forfeit" | "cancelled";
  participants: ServerParticipant[];
  participantUids: string[];
  turnIndex: number;
  leaderIndex: number;
  trickNumber: number;
  trickPlays: Array<{ uid: string; card: Card }>;
  deposits: Record<string, Card[]>;
  handCounts: Record<string, number>;
  turnId: string;
  actionDeadlineAt: number;
  potNkap: number;
  result: null | { winnerUid: string; winnerName: string; winnerIsBot: boolean; type: "lastTrick"; crownGain?: number };
  recentActions?: ServerAction[];
  /** Activations de pouvoir diffusées à tous les participants (version
   *  expurgée des identités de cartes cachées — la version complète arrive
   *  à l'activateur par la réponse de la commande usePowerCard). */
  recentPowerActivations?: PowerCardActivation[];
}

interface ServerState { matchId: string; match: ServerMatch; hand: Card[] }
interface MatchmakingState { waiting: true; status: "matchmaking"; runId: string; playersFound: number; playersRequired: number }
interface Options {
  mode: "bot" | "online" | "friends" | "event";
  uid: string;
  hostId?: string;
  roomId?: string;
  roomPlayers?: RoomPlayer[];
  eventRunId?: string;
  profile: Profile;
  stake: number;
  botCount: number;
  onResult: (result: Result) => void;
}

type PlayListener = (play: { playerIdx: number; cardIdx: number; card: Card; playId?: string }) => void;

/** Étape du séquenceur de replay : le serveur joue tous les bots d'une
 *  traite, le client rejoue le batch avec la cadence du mode local. */
type ReplayStep =
  | { kind: "play"; action: ServerAction; delayBefore: number }
  | { kind: "trickEnd"; winnerServerIdx: number }
  /** Applique le dernier doc serveur reçu (source de vérité) en fin de file. */
  | { kind: "flush" };

export class AuthoritativeGameSync implements GameSyncActions {
  private matchId: string | null = null;
  private match: ServerMatch | null = null;
  private hand: Card[] = [];
  private matchUnsub: Unsubscribe | null = null;
  private handUnsub: Unsubscribe | null = null;
  private roomUnsub: Unsubscribe | null = null;
  private eventRunUnsub: Unsubscribe | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startPending = false;
  private destroyed = false;
  private emittedActions = new Set<string>();
  private emittedPowerIds = new Set<string>();
  private emittedResult = false;
  /** Fenêtre de distribution synthétique : le serveur donne les mains d'un
   *  coup, on rejoue la chorégraphie carte-par-carte avant la phase "turns". */
  private dealing = false;
  private dealTimer: ReturnType<typeof setTimeout> | null = null;
  private powerPending = false;
  /* ── Séquenceur de replay ── */
  private replayQueue: ReplayStep[] = [];
  private replayTimer: ReturnType<typeof setTimeout> | null = null;
  private replaying = false;
  /** État synthétique affiché pendant le replay (clone muté coup par coup). */
  private displayMatch: ServerMatch | null = null;
  /** Dernier doc serveur reçu — cible du step "flush". */
  private targetMatch: ServerMatch | null = null;
  /** Pli simulé à l'ENFILAGE pour détecter les fins de pli d'un batch. */
  private simTrickPlays: Array<{ uid: string; card: Card }> = [];
  /** Coup local en attente : ma main est déjà finale quand l'événement play
   *  est émis — on garde l'index cliqué pour que le vol parte du bon slot. */
  private pendingPlay: { cardId: string; cardIdx: number } | null = null;
  /* ── Timer d'affichage : décompte local armé par turnId, figé pendant
        dealing/replay (parité LocalGameSync — le temps démarre après les
        animations ; l'autorité du timeout est le worker serveur). ── */
  private turnCountdownEndsAt = 0;
  private lastCountdownTurnId = "";

  private stateListeners = new Set<(state: GameState) => void>();
  private playListeners = new Set<PlayListener>();
  private trickListeners = new Set<(winnerIdx: number) => void>();
  private roundListeners = new Set<(result: Result) => void>();
  private timerListeners = new Set<(seconds: number) => void>();
  private syncListeners = new Set<(status: SyncStatus) => void>();
  private powerListeners = new Set<(activation: PowerCardActivation) => void>();

  constructor(private opts: Options) {}

  start = () => { void this.startRound(); };
  nextRound = () => {
    this.stopSnapshots(); this.stopDealing(); this.stopReplay();
    this.matchId = null; this.match = null; this.hand = [];
    this.emittedActions.clear(); this.emittedPowerIds.clear(); this.emittedResult = false;
    this.turnCountdownEndsAt = 0; this.lastCountdownTurnId = "";
    void this.startRound();
  };

  private status(state: SyncStatus["state"], message?: string) {
    const value = { state, message, updatedAt: Date.now() } satisfies SyncStatus;
    this.syncListeners.forEach((listener) => listener(value));
  }

  private async requestStart() {
    if (this.startPending || this.destroyed) return;
    this.startPending = true;
    try {
      const call = backendCallable<Record<string, unknown>, ServerState | MatchmakingState>("startMatch");
      const response = await call({
        idempotencyKey: `start_${crypto.randomUUID()}`,
        mode: this.opts.mode,
        stake: this.opts.mode === "friends" ? 0 : this.opts.stake,
        botCount: this.opts.botCount,
        roomId: this.opts.roomId,
        eventRunId: this.opts.eventRunId,
      });
      if ("waiting" in response.data) {
        this.status("connecting", `File du Ter : ${response.data.playersFound}/${response.data.playersRequired} joueurs`);
        return;
      }
      this.beginDealingWindow(response.data.match);
      this.applyServerState(response.data);
      this.subscribe(response.data.matchId);
    } catch (cause) {
      this.status("error", cause instanceof Error ? cause.message : "Démarrage refusé");
    } finally {
      this.startPending = false;
    }
  }

  private async startRound() {
    this.status("connecting", "Le serveur prépare la table…");
    if (this.opts.roomId && this.opts.hostId !== this.opts.uid) {
      this.roomUnsub = onSnapshot(doc(db, "rooms", this.opts.roomId), (snapshot) => {
        const activeMatchId = snapshot.get("activeMatchId");
        if (typeof activeMatchId === "string" && activeMatchId !== this.matchId) void this.reconnect(activeMatchId);
      }, () => this.status("error", "Salle indisponible"));
      return;
    }
    if (this.opts.mode === "event" && this.opts.eventRunId) {
      this.eventRunUnsub = onSnapshot(doc(db, "event_runs", this.opts.eventRunId), (snapshot) => {
        if (!snapshot.exists()) { this.status("error", "Participation introuvable"); return; }
        const currentMatchId = snapshot.get("currentMatchId");
        const status = String(snapshot.get("status"));
        if (typeof currentMatchId === "string" && currentMatchId !== this.matchId) {
          if (!this.startPending) void this.reconnect(currentMatchId);
          return;
        }
        if (["active", "matchmaking"].includes(status) && !this.matchId) {
          void this.requestStart();
          return;
        }
        if (status === "completed") this.status("live", "Événement terminé — récompenses versées");
        if (status === "eliminated") this.status("error", "Participation éliminée après le nombre maximal de défaites");
      }, () => this.status("offline", "File du Ter indisponible"));
      return;
    }
    await this.requestStart();
  }

  private async reconnect(matchId: string) {
    try {
      const call = backendCallable<Record<string, unknown>, ServerState>("reconnectMatch");
      const response = await call({ idempotencyKey: `reconnect_${crypto.randomUUID()}`, matchId });
      // Reprise en cours de partie : état appliqué directement, AUCUN replay
      // des vols du dernier batch (le passage par le seed d'ingestMatch
      // marque les playIds existants comme déjà émis).
      this.stopReplay();
      this.match = null;
      this.emittedActions.clear(); this.emittedPowerIds.clear(); this.emittedResult = false;
      this.lastCountdownTurnId = "";
      this.applyServerState(response.data);
      this.subscribe(matchId);
    } catch (cause) { this.status("error", cause instanceof Error ? cause.message : "Reconnexion refusée"); }
  }

  private subscribe(matchId: string) {
    this.stopSnapshots();
    this.matchId = matchId;
    this.matchUnsub = onSnapshot(doc(db, "matches", matchId), (snapshot) => {
      if (!snapshot.exists()) return;
      this.ingestMatch(snapshot.data() as ServerMatch);
    }, () => this.status("offline", "Synchronisation interrompue"));
    this.handUnsub = onSnapshot(doc(db, "matches", matchId, "private", this.opts.uid), (snapshot) => {
      if (!snapshot.exists()) return;
      this.hand = (snapshot.get("hand") ?? []) as Card[];
      this.emitState();
    });
    this.timer = setInterval(() => {
      const frozen = this.dealing || this.replaying || this.turnCountdownEndsAt === 0 || this.match?.status !== "playing";
      const seconds = frozen
        ? GAME_CONFIG.turnSeconds
        : Math.max(0, Math.ceil((this.turnCountdownEndsAt - Date.now()) / 1000));
      this.timerListeners.forEach((listener) => listener(seconds));
    }, 1_000);
    this.status("live");
  }

  private applyServerState(state: ServerState) {
    this.matchId = state.matchId; this.hand = state.hand;
    this.ingestMatch(state.match);
  }

  /** (Re)démarre le décompte affiché — uniquement quand un NOUVEAU tour
   *  commence (turnId) et hors animations (dealing/replay). */
  private startTurnCountdown() {
    const match = this.match;
    if (!match || match.status !== "playing" || this.dealing || this.replaying) return;
    if (match.turnId === this.lastCountdownTurnId) return;
    this.lastCountdownTurnId = match.turnId;
    this.turnCountdownEndsAt = Date.now() + GAME_CONFIG.turnSeconds * 1_000;
  }

  /** Point d'entrée UNIQUE des docs match (snapshot WS et réponses HTTP).
   *  Enfile les actions inédites dans la file de replay — jamais de
   *  remplacement de file : un update arrivé PENDANT un replay met à jour la
   *  cible (targetMatch) et appende ses nouveaux coups. */
  private ingestMatch(match: ServerMatch) {
    if (this.destroyed) return;
    this.targetMatch = match;

    // Premier doc (démarrage frais ou reconnexion) : seed sans replay.
    if (!this.match) {
      this.match = match;
      for (const action of match.recentActions ?? []) if (action?.playId) this.emittedActions.add(action.playId);
      for (const activation of match.recentPowerActivations ?? []) if (activation?.playId) this.emittedPowerIds.add(activation.playId);
      this.simTrickPlays = match.trickPlays.map((play) => ({ uid: play.uid, card: play.card }));
      this.emitState();
      this.maybeEmitResult();
      this.startTurnCountdown();
      return;
    }

    // Activations de pouvoir : hors file (l'orchestrateur a sa propre cadence).
    this.emitBroadcastPowerActivations(match);

    for (const action of match.recentActions ?? []) {
      if (!action?.playId || this.emittedActions.has(action.playId)) continue;
      this.emittedActions.add(action.playId);
      // Mon propre coup en tête de file part immédiatement (le vol répond au
      // clic) ; les coups adverses "réfléchissent" comme les bots locaux.
      const immediate = action.uid === this.opts.uid && this.replayQueue.length === 0 && !this.replaying;
      const { replayBotThinkMin, replayBotThinkMax } = GAME_CONFIG.anim;
      const delayBefore = immediate ? 0 : replayBotThinkMin + Math.random() * (replayBotThinkMax - replayBotThinkMin);
      this.replayQueue.push({ kind: "play", action, delayBefore });
      this.simTrickPlays.push({ uid: action.uid, card: action.card });
      if (this.simTrickPlays.length === match.participants.length) {
        this.replayQueue.push({ kind: "trickEnd", winnerServerIdx: this.simulatedTrickWinner(match.participants) });
        this.simTrickPlays = [];
      }
    }

    // Un unique flush TERMINAL : il applique toujours le dernier targetMatch.
    const flushIndex = this.replayQueue.findIndex((step) => step.kind === "flush");
    if (flushIndex >= 0) this.replayQueue.splice(flushIndex, 1);
    this.replayQueue.push({ kind: "flush" });

    if (!this.replaying && !this.dealing) this.pump();
  }

  /** Miroir du winnerIndex serveur : couleur demandée = suit BRUTE de la 1re
   *  carte, comparaison sur effectiveSuit/effectiveValue (les cartes du
   *  broadcast sont déjà les resolvedCard post-modificateurs de pouvoir). */
  private simulatedTrickWinner(participants: ServerParticipant[]): number {
    const plays = this.simTrickPlays;
    if (plays.length === 0) return -1;
    const effSuit = (card: Card) => card.effectiveSuit ?? card.suit;
    const effValue = (card: Card) => card.effectiveValue ?? card.value;
    const led = plays[0].card.suit;
    let best: { uid: string; card: Card } | null = null;
    for (const play of plays) {
      if (effSuit(play.card) === led && (!best || effValue(play.card) > effValue(best.card))) best = play;
    }
    const winner = best ?? plays[0];
    return participants.findIndex((participant) => participant.uid === winner.uid);
  }

  /** Déroule la file : play → vol + état intermédiaire, fin de pli →
   *  bannière + trickPause, flush → état serveur final + résultat + timer. */
  private pump() {
    if (this.destroyed || this.dealing) { this.replaying = false; return; }
    const step = this.replayQueue.shift();
    if (!step) { this.replaying = false; return; }
    this.replaying = true;

    if (step.kind === "play") {
      const run = () => {
        if (this.destroyed) return;
        this.emitPlay(step.action);
        this.applyPlayToDisplay(step.action);
        this.emitState();
        // Espacer d'au moins la durée du vol pour ne jamais écraser un vol en cours.
        this.replayTimer = setTimeout(() => this.pump(), GAME_CONFIG.anim.dropFlight + GAME_CONFIG.anim.landSettle);
      };
      if (step.delayBefore <= 0) run();
      else this.replayTimer = setTimeout(run, step.delayBefore);
      return;
    }

    if (step.kind === "trickEnd") {
      if (step.winnerServerIdx >= 0) this.trickListeners.forEach((listener) => listener(this.localIndex(step.winnerServerIdx)));
      this.applyTrickEndToDisplay(step.winnerServerIdx);
      // État émis APRÈS la pause : les cartes restent visibles pendant la bannière.
      this.replayTimer = setTimeout(() => { this.emitState(); this.pump(); }, GAME_CONFIG.anim.trickPause);
      return;
    }

    // flush
    this.match = this.targetMatch ?? this.match;
    this.displayMatch = null;
    this.emitState();
    this.maybeEmitResult();
    if (this.replayQueue.length > 0) { this.pump(); return; }
    this.replaying = false;
    this.startTurnCountdown();
  }

  private emitPlay(action: ServerAction) {
    const match = this.displayMatch ?? this.match;
    if (!match) return;
    const serverIndex = match.participants.findIndex((participant) => participant.uid === action.uid);
    const playerIdx = this.localIndex(serverIndex);
    let cardIdx: number;
    if (playerIdx === 0 && this.pendingPlay?.cardId === action.card.id) {
      cardIdx = this.pendingPlay.cardIdx;
      this.pendingPlay = null;
    } else {
      const currentHand = playerIdx === 0 ? this.hand : [];
      cardIdx = Math.max(0, currentHand.findIndex((card) => card.id === action.card.id));
    }
    this.playListeners.forEach((listener) => listener({ playerIdx, cardIdx, card: action.card, playId: action.playId }));
  }

  /** Clone paresseux de l'état confirmé, muté coup par coup pendant le replay. */
  private ensureDisplayMatch(): ServerMatch | null {
    if (!this.displayMatch) {
      const base = this.match;
      if (!base) return null;
      this.displayMatch = {
        ...base,
        trickPlays: base.trickPlays.map((play) => ({ ...play })),
        deposits: Object.fromEntries(Object.entries(base.deposits ?? {}).map(([uid, cards]) => [uid, [...cards]])),
        handCounts: { ...(base.handCounts ?? {}) },
      };
    }
    return this.displayMatch;
  }

  private applyPlayToDisplay(action: ServerAction) {
    const display = this.ensureDisplayMatch();
    if (!display) return;
    display.handCounts[action.uid] = Math.max(0, Number(display.handCounts[action.uid] ?? 0) - 1);
    display.deposits[action.uid] = [...(display.deposits[action.uid] ?? []), action.card];
    display.trickPlays = [...display.trickPlays, { uid: action.uid, card: action.card }];
    display.turnIndex = (display.turnIndex + 1) % display.participants.length;
  }

  private applyTrickEndToDisplay(winnerServerIdx: number) {
    const display = this.ensureDisplayMatch();
    if (!display) return;
    display.trickPlays = [];
    display.trickNumber += 1;
    if (winnerServerIdx >= 0) { display.leaderIndex = winnerServerIdx; display.turnIndex = winnerServerIdx; }
  }

  private stopReplay() {
    if (this.replayTimer) clearTimeout(this.replayTimer);
    this.replayTimer = null;
    this.replayQueue = [];
    this.replaying = false;
    this.displayMatch = null;
    this.targetMatch = null;
    this.simTrickPlays = [];
    this.pendingPlay = null;
  }

  /** Démarre la fenêtre "dealing" si le match vient d'être créé (jamais lors
   *  d'un reconnect : la partie est déjà en cours). Pendant cette fenêtre,
   *  emitState publie phase "dealing" (→ animation dealFly du Fan) et les
   *  événements dérivés sont différés jusqu'à la fin de la chorégraphie. */
  private beginDealingWindow(match: ServerMatch) {
    if (this.destroyed || match.status !== "playing") return;
    const fresh = match.trickNumber === 0 && match.trickPlays.length === 0 && (match.recentActions ?? []).length === 0;
    if (!fresh) return;
    const { dealPerCard, dealFlight } = GAME_CONFIG.anim;
    const dealTime = match.participants.length * GAME_CONFIG.cardsPerPlayer * dealPerCard + dealFlight + 350;
    this.dealing = true;
    if (this.dealTimer) clearTimeout(this.dealTimer);
    this.dealTimer = setTimeout(() => {
      this.dealTimer = null;
      this.dealing = false;
      if (this.destroyed) return;
      this.emitState();
      this.startTurnCountdown();
      // Des coups ont pu être enfilés pendant la donne (adversaire rapide).
      if (this.replayQueue.length > 0 && !this.replaying) this.pump();
    }, dealTime);
  }

  private stopDealing() {
    if (this.dealTimer) clearTimeout(this.dealTimer);
    this.dealTimer = null;
    this.dealing = false;
  }

  private localOrder() {
    if (!this.match) return [] as number[];
    const mine = this.match.participants.findIndex((participant) => participant.uid === this.opts.uid);
    return Array.from({ length: this.match.participants.length }, (_, index) => (mine + index) % this.match!.participants.length);
  }

  private localIndex(serverIndex: number) { return this.localOrder().indexOf(serverIndex); }

  /** État lu par le rendu : le clone de replay s'il existe, sinon le confirmé. */
  private viewMatch(): ServerMatch | null { return this.displayMatch ?? this.match; }

  private players(): Player[] {
    const match = this.viewMatch();
    if (!match) return [];
    return this.localOrder().map((serverIndex) => {
      const participant = match.participants[serverIndex];
      const isYou = participant.uid === this.opts.uid;
      const count = Number(match.handCounts?.[participant.uid] ?? 0);
      const hidden = Array.from({ length: count }, (_, index): Card => ({ id: `hidden-${participant.uid}-${index}`, rank: "?", value: 0, suit: "♠", color: "#1e1e1e" }));
      return {
        name: participant.name, emoji: participant.emoji, isYou,
        balance: isYou ? this.opts.profile.balance : 0,
        hand: isYou ? this.hand : hidden,
        deposit: match.deposits?.[participant.uid] ?? [],
        equippedPowers: isYou ? [] : undefined,
      };
    });
  }

  private emitState() {
    const match = this.viewMatch();
    if (!match) return;
    const state: GameState = {
      phase: match.status === "settled" ? "result" : this.dealing ? "dealing" : "turns",
      trickNo: match.trickNumber + 1,
      trickPlays: match.trickPlays.map((play) => ({
        playerIdx: this.localIndex(match.participants.findIndex((participant) => participant.uid === play.uid)), card: play.card,
      })),
      leaderIdx: this.localIndex(match.leaderIndex),
      turnIdx: this.localIndex(match.turnIndex),
      pot: match.potNkap,
      dominantIdx: null,
      banner: "",
      players: this.players(),
    };
    this.stateListeners.forEach((listener) => listener(state));
  }

  private emitBroadcastPowerActivations(match: ServerMatch) {
    for (const activation of match.recentPowerActivations ?? []) {
      if (!activation?.playId) continue;
      // Mes propres activations arrivent toujours par la réponse de commande
      // (version complète, non expurgée) — ignorer la copie broadcast.
      if (activation.activatedByUid === this.opts.uid) { this.emittedPowerIds.add(activation.playId); continue; }
      this.emitPowerActivation(activation);
    }
  }

  private maybeEmitResult() {
    const match = this.match;
    if (!match?.result || this.emittedResult) return;
    this.emittedResult = true;
    const serverWinner = match.participants.findIndex((participant) => participant.uid === match.result!.winnerUid);
    const winnerIdx = this.localIndex(serverWinner);
    const players = this.players();
    const lastCard = match.recentActions?.at(-1)?.card ?? ({ id: "result", rank: "3", value: 3, suit: "♠", color: "#1e1e1e" } as Card);
    const result: Result = { type: "lastTrick", winnerIdx, winner: players[winnerIdx], doubles: false, lastCard, gain: match.potNkap, playersCount: players.length };
    this.roundListeners.forEach((listener) => listener(result));
    this.opts.onResult(result);
  }

  playCard = (cardIdx: number) => {
    // Pendant un replay, this.match (et son turnId) est en retard sur le
    // serveur → un envoi produirait un STALE_TURN parasite. Le tour du
    // joueur n'est de toute façon affiché qu'au flush.
    if (!this.matchId || !this.match || this.match.status !== "playing" || this.dealing || this.replaying) return;
    const card = this.hand[cardIdx];
    if (!card) return;
    this.pendingPlay = { cardId: card.id, cardIdx };
    const call = backendCallable<Record<string, unknown>, ServerState>("submitGameAction");
    void call({ idempotencyKey: `play_${crypto.randomUUID()}`, matchId: this.matchId, turnId: this.match.turnId, cardId: card.id })
      .then((response) => this.applyServerState(response.data))
      .catch((cause) => this.status("error", cause instanceof Error ? cause.message : "Action refusée"));
  };

  usePowerCard = (cardId: PowerCardId, targetIdx?: number, choices?: PowerChoices) => {
    if (!this.matchId || !this.match || this.match.status !== "playing" || this.dealing || this.replaying || this.powerPending) return;
    let targetUid: string | undefined;
    if (targetIdx !== undefined) {
      const serverIndex = this.localOrder()[targetIdx];
      targetUid = this.match.participants[serverIndex]?.uid;
      if (!targetUid) return;
    }
    this.powerPending = true;
    const call = backendCallable<Record<string, unknown>, { state: ServerState; activation: PowerCardActivation }>("usePowerCard");
    void call({
      idempotencyKey: `power_${crypto.randomUUID()}`,
      matchId: this.matchId,
      cardId,
      targetUid: targetUid ?? null,
      choices: choices ?? null,
    })
      .then((response) => {
        // L'activation de la réponse est la version COMPLÈTE (identités des
        // cartes cachées, revealedHand) — émise avant l'état pour que
        // l'orchestrateur démarre la transition avant le repaint.
        this.emitPowerActivation(response.data.activation);
        this.applyServerState(response.data.state);
      })
      .catch((cause) => this.status("error", cause instanceof Error ? cause.message : "Pouvoir refusé"))
      .finally(() => { this.powerPending = false; });
  };

  private emitPowerActivation(activation: PowerCardActivation) {
    if (!activation?.playId || this.emittedPowerIds.has(activation.playId)) return;
    this.emittedPowerIds.add(activation.playId);
    this.powerListeners.forEach((listener) => listener(activation));
  }

  onStateUpdate = (cb: (state: GameState) => void) => { this.stateListeners.add(cb); return () => this.stateListeners.delete(cb); };
  onPlayCard = (cb: PlayListener) => { this.playListeners.add(cb); return () => this.playListeners.delete(cb); };
  onTrickEnd = (cb: (winnerIdx: number) => void) => { this.trickListeners.add(cb); return () => this.trickListeners.delete(cb); };
  onRoundEnd = (cb: (result: Result) => void) => { this.roundListeners.add(cb); return () => this.roundListeners.delete(cb); };
  onTimerTick = (cb: (seconds: number) => void) => { this.timerListeners.add(cb); return () => this.timerListeners.delete(cb); };
  onSyncStatus = (cb: (status: SyncStatus) => void) => { this.syncListeners.add(cb); return () => this.syncListeners.delete(cb); };
  onPowerActivated = (cb: (activation: PowerCardActivation) => void) => { this.powerListeners.add(cb); return () => this.powerListeners.delete(cb); };

  private stopSnapshots() {
    this.matchUnsub?.(); this.handUnsub?.(); this.roomUnsub?.(); this.eventRunUnsub?.();
    this.matchUnsub = null; this.handUnsub = null; this.roomUnsub = null; this.eventRunUnsub = null;
    if (this.timer) clearInterval(this.timer); this.timer = null;
  }
  destroy = () => {
    if (this.opts.mode === "event" && this.opts.eventRunId && !this.matchId) {
      const leave = backendCallable<Record<string, unknown>, { ticketReturned: boolean }>("leaveEvent");
      void leave({ idempotencyKey: `leave_${crypto.randomUUID()}`, runId: this.opts.eventRunId });
    }
    this.destroyed = true;
    this.stopSnapshots();
    this.stopDealing();
    this.stopReplay();
    this.stateListeners.clear(); this.playListeners.clear(); this.trickListeners.clear(); this.roundListeners.clear();
    this.timerListeners.clear(); this.syncListeners.clear(); this.powerListeners.clear();
  };
}
