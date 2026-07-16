"use client";

import { doc, onSnapshot, type DocumentSnapshot, type Unsubscribe } from "@/lib/firestoreClient";
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
  eliminatedUids?: string[];
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

interface ServerState { matchId: string; match: ServerMatch; hand: Card[]; equippedPowers?: PowerCardId[] }
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
  /** Activation de pouvoir ADVERSE (broadcast) — rejouée en séquence. */
  | { kind: "power"; activation: PowerCardActivation }
  /** Applique le dernier doc serveur reçu (source de vérité) en fin de file. */
  | { kind: "flush" };

export class AuthoritativeGameSync implements GameSyncActions {
  private matchId: string | null = null;
  private match: ServerMatch | null = null;
  private hand: Card[] = [];
  private equippedPowers: PowerCardId[] = [];
  private currentHostId?: string;
  private matchUnsub: Unsubscribe | null = null;
  private handUnsub: Unsubscribe | null = null;
  private roomUnsub: Unsubscribe | null = null;
  private latestRoomSnapshot: DocumentSnapshot | null = null;
  private eventRunUnsub: Unsubscribe | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startPending = false;
  private destroyed = false;
  private emittedActions = new Set<string>();
  private emittedPowerIds = new Set<string>();
  private emittedResult = false;
  /** Match terminé et « consommé » par nextRound : le listener de salle ne
   *  doit plus s'y reconnecter (revanche = attendre un NOUVEL activeMatchId). */
  private consumedMatchId: string | null = null;
  private rematchPending = false;
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

  private stateListeners = new Set<(state: GameState) => void>();
  private playListeners = new Set<PlayListener>();
  private trickListeners = new Set<(winnerIdx: number) => void>();
  private roundListeners = new Set<(result: Result) => void>();
  private timerListeners = new Set<(seconds: number) => void>();
  private syncListeners = new Set<(status: SyncStatus) => void>();
  private powerListeners = new Set<(activation: PowerCardActivation) => void>();

  constructor(private opts: Options) {
    this.currentHostId = opts.hostId;
  }

  start = () => { void this.startRound(); };
  nextRound = () => {
    // Le listener de salle (roomUnsub) SURVIT au changement de manche : c'est
    // lui qui apprendra l'activeMatchId de la revanche.
    this.consumedMatchId = this.matchId;
    this.stopMatchSnapshots(); this.stopDealing(); this.stopReplay();
    this.matchId = null; this.match = null; this.hand = [];
    this.emittedActions.clear(); this.emittedPowerIds.clear(); this.emittedResult = false;
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
    const roomMode = this.opts.mode === "online" || this.opts.mode === "friends";
    if (roomMode && this.opts.roomId) {
      if (this.currentHostId !== this.opts.uid) {
        // INVITÉ : écoute persistante de la salle. Pour une revanche
        // (consumedMatchId présent), se déclarer prêt — l'hôte relancera
        // quand tous les invités auront validé.
        this.subscribeRoom();
        if (this.consumedMatchId) {
          this.status("connecting", "En attente de l'hôte…");
          const ready = backendCallable<Record<string, unknown>, { roomId: string; ready: boolean }>("setRoomReady");
          void ready({ idempotencyKey: `ready_${crypto.randomUUID()}`, roomId: this.opts.roomId, ready: true })
            .catch((cause) => this.status("error", cause instanceof Error ? cause.message : "Impossible de se déclarer prêt"));
        }
        return;
      }
      // HÔTE. Premier match : la salle est déjà "playing" (startGame du
      // lobby) → démarrage direct. Revanche : attendre que les invités
      // re-valident, puis startGame + startMatch (flux lobby standard).
      if (this.consumedMatchId) {
        this.status("connecting", "Les autres joueurs doivent valider…");
        this.subscribeRoom();
        const ready = backendCallable<Record<string, unknown>, { roomId: string; ready: boolean }>("setRoomReady");
        try {
          await ready({ idempotencyKey: `ready_${crypto.randomUUID()}`, roomId: this.opts.roomId, ready: true });
        } catch (cause) {
          this.status("error", cause instanceof Error ? cause.message : "Impossible de valider la revanche");
          return;
        }
        if (this.latestRoomSnapshot) void this.maybeStartRematch(this.latestRoomSnapshot);
        return;
      }
      await this.requestStart();
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

  /** Écoute persistante de la salle (invité ET hôte en revanche) : survit
   *  aux changements de manche — c'est le canal qui annonce le match suivant. */
  private subscribeRoom() {
    if (this.roomUnsub || !this.opts.roomId) return;
    this.roomUnsub = onSnapshot(doc(db, "rooms", this.opts.roomId), (snapshot) => {
      this.latestRoomSnapshot = snapshot;
      if (!snapshot.exists()) { this.status("error", "La salle a été fermée."); return; }
      const hostId = snapshot.get("hostId");
      if (typeof hostId === "string") this.currentHostId = hostId;
      const activeMatchId = snapshot.get("activeMatchId");
      if (typeof activeMatchId === "string" && activeMatchId !== this.matchId && activeMatchId !== this.consumedMatchId) {
        if (!this.startPending) void this.reconnect(activeMatchId);
        return;
      }
      if (this.currentHostId === this.opts.uid) void this.maybeStartRematch(snapshot);
    }, () => this.status("error", "Salle indisponible"));
  }

  /** Hôte en attente de revanche : relance dès que tous les invités ont
   *  re-validé (players[].ready, re-vérifié côté serveur par startGame). */
  private async maybeStartRematch(snapshot: DocumentSnapshot) {
    if (this.destroyed || this.matchId || this.startPending || this.rematchPending) return;
    if (String(snapshot.get("status")) !== "waiting") return;
    const players = (snapshot.get("players") ?? []) as Array<{ uid: string; ready?: boolean }>;
    if (players.length < 2) return;
    const guestsReady = players.filter((player) => player.uid !== this.opts.uid).every((player) => player.ready === true);
    if (!guestsReady) return;
    this.rematchPending = true;
    try {
      const start = backendCallable<Record<string, unknown>, { roomId: string; status: string }>("startGame");
      await start({ idempotencyKey: `rematch_${crypto.randomUUID()}`, roomId: this.opts.roomId });
      await this.requestStart();
    } catch (cause) {
      this.status("error", cause instanceof Error ? cause.message : "Relance impossible");
    } finally {
      this.rematchPending = false;
    }
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
      // Un match FRAIS reçu par ce chemin (invité qui rejoint, revanche) a
      // droit à sa chorégraphie de donne — le critère "fresh" de
      // beginDealingWindow écarte les vraies reprises en cours de partie.
      this.beginDealingWindow(response.data.match);
      this.applyServerState(response.data);
      this.subscribe(matchId);
    } catch (cause) { this.status("error", cause instanceof Error ? cause.message : "Reconnexion refusée"); }
  }

  private subscribe(matchId: string) {
    // Ne coupe QUE les abonnements de match : l'écoute de salle/événement
    // reste vivante (c'est elle qui annonce les manches suivantes).
    this.stopMatchSnapshots();
    this.matchId = matchId;
    this.matchUnsub = onSnapshot(doc(db, "matches", matchId), (snapshot) => {
      if (!snapshot.exists()) return;
      this.ingestMatch(snapshot.data() as ServerMatch);
    }, () => this.status("offline", "Synchronisation interrompue"));
    this.handUnsub = onSnapshot(doc(db, "matches", matchId, "private", this.opts.uid), (snapshot) => {
      if (!snapshot.exists()) return;
      this.hand = (snapshot.get("hand") ?? []) as Card[];
      this.equippedPowers = (snapshot.get("equippedPowers") ?? this.equippedPowers) as PowerCardId[];
      this.emitState();
    });
    this.timer = setInterval(() => {
      // Décompte SYNCHRONE entre tous les clients : dérivé de la deadline
      // serveur (qui inclut le budget d'animation du batch — le clamp à
      // turnSeconds garde l'anneau plein pendant le replay et la donne).
      const source = this.targetMatch ?? this.match;
      const animationsPending = this.dealing || this.replaying || this.replayQueue.length > 0;
      const seconds = animationsPending
        ? GAME_CONFIG.turnSeconds
        : source?.status === "playing"
        ? Math.max(0, Math.min(GAME_CONFIG.turnSeconds, Math.ceil((source.actionDeadlineAt - Date.now()) / 1_000)))
        : 0;
      this.timerListeners.forEach((listener) => listener(seconds));
    }, 1_000);
    this.status("live");
  }

  private applyServerState(state: ServerState) {
    this.matchId = state.matchId; this.hand = state.hand;
    if (state.equippedPowers) this.equippedPowers = state.equippedPowers;
    this.ingestMatch(state.match);
  }

  /** Point d'entrée UNIQUE des docs match (snapshot WS et réponses HTTP).
   *  Enfile les actions inédites dans la file de replay — jamais de
   *  remplacement de file : un update arrivé PENDANT un replay met à jour la
   *  cible (targetMatch) et appende ses nouveaux coups. */
  private ingestMatch(match: ServerMatch) {
    if (this.destroyed) return;
    // Les abandons ordinaires restent en playing/settled : seuls un forfait
    // d'événement ou une annulation technique passent dans cette branche.
    if (match.status === "cancelled" || match.status === "forfeit") {
      this.stopReplay(); this.stopDealing();
      this.match = match; this.targetMatch = match;
      this.status("error", this.opts.mode === "event"
        ? "Un joueur a déclaré forfait — la partie est terminée."
        : "La partie a été annulée.");
      return;
    }
    this.targetMatch = match;

    // Premier doc (démarrage frais ou reconnexion) : seed sans replay.
    if (!this.match) {
      this.match = match;
      for (const action of match.recentActions ?? []) if (action?.playId) this.emittedActions.add(action.playId);
      for (const activation of match.recentPowerActivations ?? []) if (activation?.playId) this.emittedPowerIds.add(activation.playId);
      this.simTrickPlays = match.trickPlays.map((play) => ({ uid: play.uid, card: play.card }));
      this.emitState();
      this.maybeEmitResult();
      return;
    }

    // Activations de pouvoir ADVERSES : enfilées comme les coups pour que
    // toutes les animations restent strictement séquentielles. Les miennes
    // arrivent par la réponse HTTP (version complète) et restent immédiates.
    for (const activation of match.recentPowerActivations ?? []) {
      if (!activation?.playId || this.emittedPowerIds.has(activation.playId)) continue;
      if (activation.activatedByUid === this.opts.uid) { this.emittedPowerIds.add(activation.playId); continue; }
      this.emittedPowerIds.add(activation.playId);
      this.replayQueue.push({ kind: "power", activation });
    }

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
      const activeCount = match.participants.filter((participant) => !(match.eliminatedUids ?? []).includes(participant.uid)).length;
      if (this.simTrickPlays.length === activeCount) {
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

    if (step.kind === "power") {
      // Déjà dédupliquée à l'enfilage — émission directe aux listeners, puis
      // un beat de lecture avant l'événement suivant.
      this.powerListeners.forEach((listener) => listener(step.activation));
      this.replayTimer = setTimeout(() => this.pump(), GAME_CONFIG.anim.powerBeat);
      return;
    }

    // flush
    this.match = this.targetMatch ?? this.match;
    this.displayMatch = null;
    this.emitState();
    this.maybeEmitResult();
    if (this.replayQueue.length > 0) { this.pump(); return; }
    this.replaying = false;
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
    const eliminated = new Set(display.eliminatedUids ?? []);
    let next = display.turnIndex;
    do next = (next + 1) % display.participants.length;
    while (eliminated.has(display.participants[next].uid) && next !== display.turnIndex);
    display.turnIndex = next;
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
    const match = this.viewMatch();
    if (!match) return [] as number[];
    const eliminated = new Set(match.eliminatedUids ?? []);
    const active = match.participants
      .map((participant, index) => ({ participant, index }))
      .filter(({ participant }) => !eliminated.has(participant.uid))
      .map(({ index }) => index);
    const mine = active.findIndex((index) => match.participants[index].uid === this.opts.uid);
    return mine < 0 ? active : [...active.slice(mine), ...active.slice(0, mine)];
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
        equippedPowers: isYou ? this.equippedPowers : undefined,
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
        // FORCE : le broadcast WS de ma propre activation a pu arriver avant
        // cette réponse et déjà marquer le playId (sans l'animer) → sans force,
        // mon propre FX serait sauté par le dédup (bug "certains pouvoirs ne
        // s'affichent pas chez moi").
        this.emitPowerActivation(response.data.activation, true);
        this.applyServerState(response.data.state);
      })
      .catch((cause) => this.status("error", cause instanceof Error ? cause.message : "Pouvoir refusé"))
      .finally(() => { this.powerPending = false; });
  };

  private emitPowerActivation(activation: PowerCardActivation, force = false) {
    if (!activation?.playId) return;
    if (!force && this.emittedPowerIds.has(activation.playId)) return;
    this.emittedPowerIds.add(activation.playId);
    this.powerListeners.forEach((listener) => listener(activation));
  }

  /** Abandon volontaire : le serveur élimine le joueur avant le retour menu. */
  abandon = async () => {
    if (!this.matchId || this.match?.status !== "playing") return;
    const call = backendCallable<Record<string, unknown>, { matchId: string; status: string }>("abandonMatch");
    await call({ idempotencyKey: `abandon_${crypto.randomUUID()}`, matchId: this.matchId });
  };

  onStateUpdate = (cb: (state: GameState) => void) => { this.stateListeners.add(cb); return () => this.stateListeners.delete(cb); };
  onPlayCard = (cb: PlayListener) => { this.playListeners.add(cb); return () => this.playListeners.delete(cb); };
  onTrickEnd = (cb: (winnerIdx: number) => void) => { this.trickListeners.add(cb); return () => this.trickListeners.delete(cb); };
  onRoundEnd = (cb: (result: Result) => void) => { this.roundListeners.add(cb); return () => this.roundListeners.delete(cb); };
  onTimerTick = (cb: (seconds: number) => void) => { this.timerListeners.add(cb); return () => this.timerListeners.delete(cb); };
  onSyncStatus = (cb: (status: SyncStatus) => void) => { this.syncListeners.add(cb); return () => this.syncListeners.delete(cb); };
  onPowerActivated = (cb: (activation: PowerCardActivation) => void) => { this.powerListeners.add(cb); return () => this.powerListeners.delete(cb); };

  private stopMatchSnapshots() {
    this.matchUnsub?.(); this.handUnsub?.();
    this.matchUnsub = null; this.handUnsub = null;
    if (this.timer) clearInterval(this.timer); this.timer = null;
  }

  private stopSnapshots() {
    this.stopMatchSnapshots();
    this.roomUnsub?.(); this.eventRunUnsub?.();
    this.roomUnsub = null; this.eventRunUnsub = null;
    this.latestRoomSnapshot = null;
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
