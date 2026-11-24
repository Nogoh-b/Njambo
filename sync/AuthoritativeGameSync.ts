"use client";

import type { PlayerCosmetics } from "@/domain";

import { doc, onSnapshot, type DocumentSnapshot, type Unsubscribe } from "@/lib/firestoreClient";
import { generateSecureId } from "@/lib/cryptoUtils";
import { db } from "@/lib/firebase";
import { backendCallable } from "@/lib/backendCallable";
import { GAME_CONFIG } from "@/config/gameConfig";
import { dealDurationMs, dealTimingOf, type DealTiming } from "@/domain/gameplayConfig";
import { loadAssets, imageAsset, prefetchAssets } from "@/lib/assets/AssetLoader";
import { tableManifest } from "@/lib/assets/manifests";
import { legalCards } from "@/engine/rules";
import type { PowerChoices } from "@/engine/power";
import type {
  Card, GameState, GameSyncActions, Player, PowerCardActivation, PowerCardId, Profile,
  Result, RoomPlayer, SyncStatus,
} from "@/types/game";

interface ServerParticipant { uid: string; name: string; emoji: string; bot: boolean; crowns: number; cosmetics?: PlayerCosmetics; boss?: boolean; avatarUrl?: string }
interface ServerAction { uid: string; card: Card; playId: string; automatic: boolean }
interface ServerMatch {
  id: string;
  mode: "bot" | "online" | "friends" | "event";
  status: "playing" | "between_rounds" | "settled" | "forfeit" | "cancelled";
  series?: { round: number; total: number; winners: string[] };
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
  /** Règles de la table (événement : minuteur par table, etc.). */
  rules?: { turnSeconds?: number; maxEquippedPowers?: number; dealPerCardMs?: number; dealFlightMs?: number; unlimitedTurns?: boolean };
  result: null | {
    winnerUid: string; winnerName: string; winnerIsBot: boolean; type: "lastTrick"; crownGain?: number;
    /** Règlement par joueur calculé au serveur (cf. matchCommands, settle). */
    settlement?: Array<{ uid: string; bot?: boolean; contributed: number; nkapDelta: number; refund?: number; crownsBefore?: number; crownsDelta?: number }>;
  };
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
  difficulty?: string;
  onResult: (result: Result) => void;
  /** Reconnexion directe à un match existant après actualisation (sans relancer startMatch). */
  reconnectMatchId?: string;
  /** Notifié dès que le matchId serveur est connu ou réinitialisé. */
  onMatchId?: (matchId: string | null) => void;
  /** Appelé si la reconnexion à un match restauré échoue ou est déjà terminée. */
  onReconnectFailed?: () => void;
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
  /** Main reçue par le canal privé pendant mon activation de pouvoir (voir le listener de main). */
  private heldPowerHand: Card[] | null = null;
  /** Main échangée par le pouvoir d'un adversaire (Pacte des Mains…) arrivée avant son animation : retenue
   *  jusqu'à ce que l'activation soit jouée (sécurité : relâchée si elle ne vient pas). */
  private heldSwapHand: Card[] | null = null;
  private heldSwapTimer: ReturnType<typeof setTimeout> | null = null;
  /** Activation qui échange ma main déjà jouée, sa nouvelle main pas encore reçue. */
  private swapPowerShown = false;
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
  /** Carte déjà lancée en vol optimiste (0 ms) côté client en attente de l'écho serveur. */
  private optimisticCardId: string | null = null;
  /** Fin de la fenêtre post-coup optimiste (vol + sortie de surbrillance avant le tour suivant). */
  private optimisticPlayUntil = 0;
  /** Matchs ayant déjà joué leur chorégraphie de donne (1 seule fois par matchId). */
  private dealtMatchIds = new Set<string>();
  /** Si true, le premier doc match contient déjà des coups d'ouverture à rejouer après la donne. */
  private pendingOpeningReplay = false;
  private advancingRound = 0;
  private pendingRoundMatch: ServerMatch | null = null;
  private roundHands = new Map<number, Card[]>();

  private stateListeners = new Set<(state: GameState) => void>();
  private playListeners = new Set<PlayListener>();
  private trickListeners = new Set<(winnerIdx: number) => void>();
  private roundListeners = new Set<(result: Result) => void>();
  private timerListeners = new Set<(seconds: number) => void>();
  private syncListeners = new Set<(status: SyncStatus) => void>();
  private powerListeners = new Set<(activation: PowerCardActivation) => void>();

  private initialReconnectMatchId: string | null = null;

  constructor(private opts: Options) {
    this.currentHostId = opts.hostId;
    this.initialReconnectMatchId = opts.reconnectMatchId ?? null;
  }

  start = () => { void this.startRound(); };
  nextRound = () => {
    // Le listener de salle (roomUnsub) SURVIT au changement de manche : c'est
    // lui qui apprendra l'activeMatchId de la revanche.
    this.consumedMatchId = this.matchId;
    this.initialReconnectMatchId = null;
    this.opts.onMatchId?.(null);
    this.stopMatchSnapshots(); this.stopDealing(); this.stopReplay();
    this.matchId = null; this.match = null; this.hand = [];
    this.advancingRound = 0; this.pendingRoundMatch = null; this.roundHands.clear();
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
        idempotencyKey: `start_${generateSecureId(24)}`,
        mode: this.opts.mode,
        stake: this.opts.mode === "friends" ? 0 : this.opts.stake,
        botCount: this.opts.botCount,
        roomId: this.opts.roomId,
        eventRunId: this.opts.eventRunId,
        difficulty: this.opts.difficulty,
      });
      if (this.destroyed) return;
      if ("waiting" in response.data) {
        this.status("connecting", `File du Ter : ${response.data.playersFound}/${response.data.playersRequired} joueurs`);
        return;
      }
      await this.prepareAssets(response.data);
      if (this.destroyed) return;
      this.beginDealingWindow(response.data.match, true);
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
    if (this.initialReconnectMatchId && !this.consumedMatchId) {
      const targetMatchId = this.initialReconnectMatchId;
      this.initialReconnectMatchId = null;
      if ((this.opts.mode === "online" || this.opts.mode === "friends") && this.opts.roomId) {
        this.subscribeRoom();
      }
      await this.reconnect(targetMatchId, true);
      return;
    }
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
          void ready({ idempotencyKey: `ready_${generateSecureId(24)}`, roomId: this.opts.roomId, ready: true })
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
          await ready({ idempotencyKey: `ready_${generateSecureId(24)}`, roomId: this.opts.roomId, ready: true });
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
      await start({ idempotencyKey: `rematch_${generateSecureId(24)}`, roomId: this.opts.roomId });
      await this.requestStart();
    } catch (cause) {
      this.status("error", cause instanceof Error ? cause.message : "Relance impossible");
    } finally {
      this.rematchPending = false;
    }
  }

  private async reconnect(matchId: string, isResumeAfterReload = false) {
    try {
      const call = backendCallable<Record<string, unknown>, ServerState>("reconnectMatch");
      const response = await call({ idempotencyKey: `reconnect_${generateSecureId(24)}`, matchId });
      if (this.destroyed) return;
      if (isResumeAfterReload && ["settled", "forfeit", "cancelled"].includes(response.data.match.status)) {
        this.opts.onMatchId?.(null);
        this.opts.onReconnectFailed?.();
        return;
      }
      await this.prepareAssets(response.data);
      // Reprise en cours de partie : état appliqué directement, AUCUN replay
      // des vols du dernier batch (le passage par le seed d'ingestMatch
      // marque les playIds existants comme déjà émis).
      if (this.destroyed) return;
      this.stopReplay();
      this.match = null;
      this.emittedActions.clear(); this.emittedPowerIds.clear(); this.emittedResult = false;
      // Un match FRAIS reçu par ce chemin (invité qui rejoint, revanche) a
      // droit à sa chorégraphie de donne — le critère "fresh" de
      // beginDealingWindow écarte les vraies reprises en cours de partie.
      this.beginDealingWindow(response.data.match, true);
      this.applyServerState(response.data);
      this.subscribe(matchId);
    } catch (cause) {
      if (isResumeAfterReload) {
        this.opts.onMatchId?.(null);
        this.opts.onReconnectFailed?.();
        return;
      }
      this.status("error", cause instanceof Error ? cause.message : "Reconnexion refusée");
    }
  }

  private subscribe(matchId: string) {
    // Ne coupe QUE les abonnements de match : l'écoute de salle/événement
    // reste vivante (c'est elle qui annonce les manches suivantes).
    this.stopMatchSnapshots();
    this.matchId = matchId;
    this.opts.onMatchId?.(matchId);
    this.matchUnsub = onSnapshot(doc(db, "matches", matchId), (snapshot) => {
      if (!snapshot.exists()) return;
      this.ingestMatch(snapshot.data() as ServerMatch);
    }, () => this.status("offline", "Synchronisation interrompue"));
    this.handUnsub = onSnapshot(doc(db, "matches", matchId, "private", this.opts.uid), (snapshot) => {
      if (!snapshot.exists()) return;
      const round = Number(snapshot.get("round") ?? this.match?.series?.round ?? 1);
      const hand = (snapshot.get("hand") ?? []) as Card[];
      this.roundHands.set(round, hand);
      if (round !== (this.match?.series?.round ?? 1)) return;
      // Mon pouvoir est en cours : sa main modifiée (Vent du Nord…) arrive souvent par ce canal AVANT
      // la réponse HTTP qui porte l'activation. La montrer tout de suite gâcherait l'animation :
      // elle est retenue, et la réponse (activation, puis état) prend le relais.
      if (this.powerPending) { this.heldPowerHand = hand; return; }
      // Même nombre de cartes, cartes différentes : le pouvoir d'un adversaire a échangé ma main. Son activation
      // (canal du match) n'est peut-être pas encore jouée : la nouvelle main attend son animation.
      const swapped = hand.length > 0 && hand.length === this.hand.length && hand.some((card) => !this.hand.some((mine) => mine.id === card.id));
      if (swapped && !this.swapPowerShown) { this.holdSwapHand(hand); return; }
      this.swapPowerShown = false;
      this.hand = hand;
      this.equippedPowers = (snapshot.get("equippedPowers") ?? this.equippedPowers) as PowerCardId[];
      // Éviter un repaint intermédiaire pendant qu'un coup optimiste est encore en vol.
      if (!this.optimisticCardId) this.emitState();
    });
    this.timer = setInterval(() => {
      // Décompte SYNCHRONE entre tous les clients : dérivé de la deadline
      // serveur (qui inclut le budget d'animation du batch — le clamp à
      // turnSeconds garde l'anneau plein pendant le replay et la donne).
      const source = this.targetMatch ?? this.match;
      const animationsPending = this.dealing || this.replaying || this.replayQueue.length > 0;
      if (this.destroyed || this.emittedResult || (source && ["settled", "forfeit", "cancelled"].includes(source.status) && !animationsPending)) {
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
        return;
      }
      const budget = this.turnBudget(source);
      const seconds = animationsPending
        ? budget
        : source?.status === "playing"
        ? Math.max(0, Math.min(budget, Math.ceil((source.actionDeadlineAt - Date.now()) / 1_000)))
        : budget;
      this.timerListeners.forEach((listener) => listener(seconds));
    }, 1_000);
    this.status("live");
  }

  private applyServerState(state: ServerState) {
    if ((state.match.series?.round ?? 1) < (this.match?.series?.round ?? 1)) return;
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
    if ((match.series?.round ?? 1) < (this.match?.series?.round ?? 1)) return;
    if (this.match && (match.series?.round ?? 1) > (this.match.series?.round ?? 1)) {
      if (this.replaying || this.dealing) { this.pendingRoundMatch = match; return; }
      this.match = null;
      this.displayMatch = null;
      this.hand = this.roundHands.get(match.series!.round) ?? [];
      this.heldSwapHand = null; this.swapPowerShown = false;
      this.emittedActions.clear(); this.emittedPowerIds.clear();
      this.simTrickPlays = [];
      this.beginDealingWindow(match, true);
    }
    // Match déjà réglé et écran de résultat ouvert : figer définitivement la partie.
    if (this.emittedResult && match.id === this.matchId && match.status === "settled") {
      this.match = match;
      this.targetMatch = match;
      return;
    }
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

    // Premier doc (démarrage frais ou reconnexion).
    if (!this.match) {
      if (this.pendingOpeningReplay && (match.recentActions ?? []).length > 0) {
        // Match neuf où un bot/adversaire a déjà ouvert le 1er pli côté serveur :
        // on affiche d'abord la donne complète (5 cartes chacun), puis on enfile
        // ces coups d'ouverture pour qu'ils volent vers les dépôts juste après la donne.
        this.pendingOpeningReplay = false;
        const prePlayMatch: ServerMatch = {
          ...match,
          trickPlays: [],
          deposits: Object.fromEntries(match.participants.map((p) => [p.uid, []])),
          handCounts: Object.fromEntries(match.participants.map((p) => [p.uid, GAME_CONFIG.cardsPerPlayer])),
          turnIndex: match.leaderIndex,
          recentActions: [],
          recentPowerActivations: [],
        };
        this.match = prePlayMatch;
        this.displayMatch = {
          ...prePlayMatch,
          trickPlays: [],
          deposits: Object.fromEntries(match.participants.map((p) => [p.uid, []])),
          handCounts: { ...prePlayMatch.handCounts },
        };
        this.simTrickPlays = [];
        this.emitState();
      } else {
        this.pendingOpeningReplay = false;
        this.match = match;
        for (const action of match.recentActions ?? []) if (action?.playId) this.emittedActions.add(action.playId);
        for (const activation of match.recentPowerActivations ?? []) if (activation?.playId) this.emittedPowerIds.add(activation.playId);
        this.simTrickPlays = match.trickPlays.map((play) => ({ uid: play.uid, card: play.card }));
        this.emitState();
        this.maybeEmitResult();
        this.scheduleNextSeriesRound();
        return;
      }
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

      // Si mon coup vient déjà de voler en optimiste (0 ms) et d'être posé sur
      // `displayMatch`, on évite tout double vol et toute double écriture.
      const isOptimisticEcho = action.uid === this.opts.uid && this.optimisticCardId === action.card.id;
      if (isOptimisticEcho) {
        this.optimisticCardId = null;
        this.pendingPlay = null;
      } else {
        // Mon propre coup en tête de file part immédiatement ; les coups adverses
        // respectent une cadence naturelle et fluide.
        const immediate = action.uid === this.opts.uid && this.replayQueue.length === 0 && !this.replaying;
        const { replayBotThinkMin, replayBotThinkMax } = GAME_CONFIG.anim;
        const delayBefore = immediate ? 0 : replayBotThinkMin + Math.random() * (replayBotThinkMax - replayBotThinkMin);
        this.replayQueue.push({ kind: "play", action, delayBefore });
      }
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
      const waitAfterOptimistic = Math.max(0, this.optimisticPlayUntil - Date.now());
      this.optimisticPlayUntil = 0;
      const run = () => {
        if (this.destroyed) return;
        this.emitPlay(step.action);
        this.applyPlayToDisplay(step.action);
        this.emitState();
        // Espacer d'au moins la durée du vol pour ne jamais écraser un vol en
        // cours ; une IA marque en plus une pause après sa carte.
        const afterPlay = this.isBot(step.action.uid) ? GAME_CONFIG.anim.botAfterPlay : 0;
        this.replayTimer = setTimeout(() => this.pump(), GAME_CONFIG.anim.dropFlight + GAME_CONFIG.anim.landSettle + afterPlay);
      };
      const totalDelay = step.delayBefore + waitAfterOptimistic;
      if (totalDelay <= 0) run();
      else this.replayTimer = setTimeout(run, totalDelay);
      return;
    }

    if (step.kind === "trickEnd") {
      const waitAfterOptimistic = Math.max(0, this.optimisticPlayUntil - Date.now());
      this.optimisticPlayUntil = 0;
      const runTrickEnd = () => {
        if (this.destroyed) return;
        if (step.winnerServerIdx >= 0) this.trickListeners.forEach((listener) => listener(this.localIndex(step.winnerServerIdx)));
        this.applyTrickEndToDisplay(step.winnerServerIdx);
        // État émis APRÈS la pause : les cartes restent visibles pendant la bannière,
        // puis seul le vrai vainqueur du pli entre en surbrillance pour le pli suivant.
        this.replayTimer = setTimeout(() => { this.emitState(); this.pump(); }, GAME_CONFIG.anim.trickPause);
      };
      if (waitAfterOptimistic > 0) this.replayTimer = setTimeout(runTrickEnd, waitAfterOptimistic);
      else runTrickEnd();
      return;
    }

    if (step.kind === "power") {
      // Déjà dédupliquée à l'enfilage — émission directe aux listeners, puis
      // un beat de lecture avant l'événement suivant.
      this.powerListeners.forEach((listener) => listener(step.activation));
      // Ma main échangée par ce pouvoir : montrée maintenant (la table la retient jusqu'à la fin de l'animation).
      if (step.activation.targetUid === this.opts.uid && step.activation.used) {
        if (this.heldSwapHand) this.releaseSwapHand();
        else this.swapPowerShown = true;
      }
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
    if (this.pendingRoundMatch) {
      const next = this.pendingRoundMatch;
      this.pendingRoundMatch = null;
      this.ingestMatch(next);
      return;
    }
    this.scheduleNextSeriesRound();
  }

  private scheduleNextSeriesRound() {
    const match = this.match;
    if (match?.status !== "between_rounds" || !match.series || this.advancingRound >= match.series.round) return;
    this.advancingRound = match.series.round;
    this.replayTimer = setTimeout(() => {
      if (this.destroyed || !this.matchId) return;
      const call = backendCallable("advanceMatchRound");
      void call({ idempotencyKey: `round_${this.matchId}_${match.series!.round}`, matchId: this.matchId, round: match.series!.round })
        .catch(() => this.status("connecting", "Préparation de la manche suivante…"));
    }, 2200);
  }

  private async prepareAssets(state: ServerState) {
    const manifest = tableManifest({ myPowers: state.equippedPowers, participants: state.match.participants.map((participant) => participant.cosmetics) });
    const avatars = state.match.participants.map((participant) => imageAsset(participant.avatarUrl));
    this.status("connecting", "Chargement des visuels de la table…");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      loadAssets([...manifest.critical, ...avatars]),
      new Promise<void>((resolve) => { timeout = setTimeout(resolve, 6000); }),
    ]);
    if (timeout) clearTimeout(timeout);
    prefetchAssets(manifest.background);
  }

  private emitPlay(action: ServerAction) {
    const match = this.displayMatch ?? this.match;
    if (!match) return;
    const serverIndex = match.participants.findIndex((participant) => participant.uid === action.uid);
    const playerIdx = this.localIndex(serverIndex);
    if (playerIdx < 0) return;
    let cardIdx: number;
    if (playerIdx === 0 && this.pendingPlay?.cardId === action.card.id) {
      cardIdx = this.pendingPlay.cardIdx;
      this.pendingPlay = null;
    } else if (playerIdx === 0) {
      cardIdx = Math.max(0, this.hand.findIndex((card) => card.id === action.card.id));
    } else {
      // Adversaires (Solo & Multijoueur) : la carte quitte le centre de leur éventail.
      const remaining = Number(match.handCounts?.[action.uid] ?? 3);
      cardIdx = Math.floor(Math.max(0, remaining - 1) / 2);
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
    const activeCount = display.participants.filter((participant) => !eliminated.has(participant.uid)).length;
    // Fin de pli : ne JAMAIS pré-avancer turnIndex vers n+1, car le prochain
    // meneur est le vainqueur du pli (connu et appliqué à l'étape trickEnd).
    if (display.trickPlays.length >= activeCount) return;
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

  private holdSwapHand(hand: Card[]) {
    this.heldSwapHand = hand;
    if (this.heldSwapTimer) clearTimeout(this.heldSwapTimer);
    const check = () => {
      // L'activation attend encore dans la file (derrière d'autres coups) : on patiente.
      const queued = this.replayQueue.some((step) => step.kind === "power" && step.activation.targetUid === this.opts.uid);
      if (queued && !this.destroyed) { this.heldSwapTimer = setTimeout(check, 1_000); return; }
      this.releaseSwapHand();
    };
    this.heldSwapTimer = setTimeout(check, 4_000);
  }

  private releaseSwapHand() {
    if (this.heldSwapTimer) clearTimeout(this.heldSwapTimer);
    this.heldSwapTimer = null;
    const hand = this.heldSwapHand;
    this.heldSwapHand = null;
    if (!hand || this.destroyed) return;
    this.hand = hand;
    if (!this.optimisticCardId) this.emitState();
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
    this.optimisticCardId = null;
    this.optimisticPlayUntil = 0;
    this.pendingOpeningReplay = false;
  }

  /** Démarre la fenêtre "dealing" dès qu'un match neuf commence (y compris en
   *  multijoueur pour les invités ou quand un bot ouvre le 1er pli côté serveur). */
  private beginDealingWindow(match: ServerMatch, allowOpeningReplay = false) {
    const dealKey = `${match.id}:${match.series?.round ?? 1}`;
    if (this.destroyed || match.status !== "playing" || this.dealtMatchIds.has(dealKey)) return;
    const actionCount = (match.recentActions ?? []).length;
    const fresh = match.trickNumber === 0 && (
      allowOpeningReplay
        ? actionCount < match.participants.length
        : match.trickPlays.length === 0 && actionCount === 0
    );
    if (!fresh) return;
    this.dealtMatchIds.add(dealKey);
    this.pendingOpeningReplay = allowOpeningReplay && actionCount > 0;
    // Rythme de la donne de CETTE partie (copié dans ses règles par le serveur) : même durée que le budget serveur.
    const dealTime = dealDurationMs(this.dealTiming(match), match.participants.length, GAME_CONFIG.cardsPerPlayer) + 200;
    this.dealing = true;
    if (this.dealTimer) clearTimeout(this.dealTimer);
    this.dealTimer = setTimeout(() => {
      this.dealTimer = null;
      this.dealing = false;
      if (this.destroyed) return;
      this.emitState();
      // Des coups d'ouverture ou adverses enfilés pendant la donne démarrent maintenant.
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
        ...(participant.cosmetics ? { cosmetics: participant.cosmetics } : {}),
        balance: isYou ? this.opts.profile.balance : 0,
        hand: isYou ? this.hand : hidden,
        deposit: match.deposits?.[participant.uid] ?? [],
        equippedPowers: isYou ? this.equippedPowers : undefined,
      };
    });
  }

  private isBot(uid: string): boolean {
    return Boolean((this.targetMatch ?? this.match)?.participants.find((participant) => participant.uid === uid)?.bot);
  }

  /** Rythme de la donne de CE match (règles copiées au départ), sinon celui du jeu. */
  private dealTiming(match: ServerMatch | null | undefined): DealTiming {
    return dealTimingOf(match?.rules, { perCardMs: GAME_CONFIG.anim.dealPerCard, flightMs: GAME_CONFIG.anim.dealFlight });
  }

  /** Secondes par tour de CE match (minuteur de table d'événement), sinon la valeur globale. */
  private turnBudget(match: ServerMatch | null | undefined): number {
    const seconds = Number(match?.rules?.turnSeconds);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : GAME_CONFIG.turnSeconds;
  }

  private emitState() {
    const match = this.viewMatch();
    if (!match) return;
    const mappedTrickPlays = match.trickPlays
      .map((play) => ({
        playerIdx: this.localIndex(match.participants.findIndex((participant) => participant.uid === play.uid)),
        card: play.card,
      }))
      .filter((play) => play.playerIdx >= 0);

    let dominantIdx: number | null = null;
    if (mappedTrickPlays.length > 0) {
      const led = mappedTrickPlays[0].card.suit;
      let best = mappedTrickPlays[0];
      for (const play of mappedTrickPlays) {
        const suit = play.card.effectiveSuit ?? play.card.suit;
        const val = play.card.effectiveValue ?? play.card.value;
        const bestSuit = best.card.effectiveSuit ?? best.card.suit;
        const bestVal = best.card.effectiveValue ?? best.card.value;
        if (suit === led && (bestSuit !== led || val > bestVal)) best = play;
      }
      dominantIdx = best.playerIdx;
    } else if (match.status === "settled" && match.result?.winnerUid) {
      const serverWinner = match.participants.findIndex((participant) => participant.uid === match.result!.winnerUid);
      const localWinner = this.localIndex(serverWinner);
      if (localWinner >= 0) dominantIdx = localWinner;
    }

    const activePlayers = this.players();
    const trickComplete = activePlayers.length > 0 && mappedTrickPlays.length >= activePlayers.length;
    const roundTricksDone = match.trickNumber >= GAME_CONFIG.cardsPerPlayer;

    const state: GameState = {
      phase:
        match.status === "settled"
          ? "result"
          : match.status === "between_rounds" || trickComplete || roundTricksDone
            ? "trickEnd"
            : this.dealing
              ? "dealing"
              : "turns",
      trickNo: match.trickNumber + 1,
      trickPlays: mappedTrickPlays,
      leaderIdx: Math.max(0, this.localIndex(match.leaderIndex)),
      turnIdx: Math.max(0, this.localIndex(match.turnIndex)),
      pot: match.potNkap,
      dominantIdx,
      banner: "",
      players: activePlayers,
      turnStartSeconds: this.turnBudget(match),
      dealTiming: this.dealTiming(match),
      unlimitedTurns: match.rules?.unlimitedTurns === true,
      ...(match.series ? { series: {
        round: match.series.round, total: match.series.total,
        scores: this.localOrder().map((index) => match.series!.winners.filter((uid) => uid === match.participants[index].uid).length),
        lastWinnerName: match.status === "between_rounds" ? match.participants.find((participant) => participant.uid === match.series!.winners.at(-1))?.name : undefined,
      } } : {}),
    };
    this.stateListeners.forEach((listener) => listener(state));
  }

  private maybeEmitResult() {
    const match = this.match;
    if (!match?.result || this.emittedResult) return;
    this.emittedResult = true;

    // Arrêter immédiatement toute horloge, donne ou file de replay dès que le match est réglé.
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.stopDealing();
    this.stopReplay();

    const serverWinner = match.participants.findIndex((participant) => participant.uid === match.result!.winnerUid);
    const winnerIdx = Math.max(0, this.localIndex(serverWinner));
    const players = this.players();
    const lastCard = match.recentActions?.at(-1)?.card ?? ({ id: "result", rank: "3", value: 3, suit: "♠", color: "#1e1e1e" } as Card);
    /* Le serveur indexe le règlement par uid ; l'UI raisonne en sièges locaux. */
    const settlement = match.result.settlement
      ?.map((entry) => {
        const serverIdx = match.participants.findIndex((participant) => participant.uid === entry.uid);
        if (serverIdx < 0) return null;
        const localIdx = this.localIndex(serverIdx);
        if (localIdx < 0) return null;
        return {
          playerIdx: localIdx,
          uid: entry.uid,
          bot: entry.bot ?? match.participants[serverIdx]?.bot,
          contributed: entry.contributed,
          nkapDelta: entry.nkapDelta,
          crownsBefore: entry.crownsBefore,
          crownsDelta: entry.crownsDelta,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const result: Result = {
      type: "lastTrick", winnerIdx, winner: players[winnerIdx], doubles: false, lastCard,
      gain: match.potNkap, playersCount: players.length, players, settlement,
      // Remboursement Cauris Chanceux (déjà compris dans mon nkapDelta) : ligne dédiée à l'écran de résultat.
      refund: match.result.settlement?.find((entry) => entry.uid === this.opts.uid)?.refund || undefined,
      series: match.series ? { total: match.series.total, scores: this.localOrder().map((index) => match.series!.winners.filter((uid) => uid === match.participants[index].uid).length) } : undefined,
    };
    this.roundListeners.forEach((listener) => listener(result));
    this.opts.onResult(result);
  }

  playCard = (cardIdx: number) => {
    // Pendant un replay ou un coup optimiste déjà parti, ignorer les doubles clics.
    if (!this.matchId || !this.match || this.match.status !== "playing" || this.dealing || this.replaying || this.optimisticCardId) return;
    if (this.localIndex(this.match.turnIndex) !== 0) return;
    const card = this.hand[cardIdx];
    if (!card) return;
    const led = this.match.trickPlays[0]?.card.suit ?? null;
    if (!legalCards(this.hand, led).includes(cardIdx)) return;

    // Vol optimiste immédiat (0 ms de latence ressentie en solo serveur & multijoueur) :
    // la carte quitte tout de suite son emplacement vers le dépôt et s'y pose
    // dès l'atterrissage (sans scintillement même sur réseau lent).
    const prevHand = [...this.hand];
    this.pendingPlay = { cardId: card.id, cardIdx };
    this.optimisticCardId = card.id;
    this.playListeners.forEach((listener) => listener({
      playerIdx: 0,
      cardIdx,
      card,
      playId: `opt:${this.matchId}:${card.id}`,
    }));
    this.hand = this.hand.filter((_, i) => i !== cardIdx);
    this.optimisticPlayUntil = Date.now() + GAME_CONFIG.anim.dropFlight + GAME_CONFIG.anim.landSettle + GAME_CONFIG.anim.botAfterPlay;
    this.applyPlayToDisplay({ uid: this.opts.uid, card, playId: `opt:${card.id}`, automatic: false });
    this.emitState();

    const call = backendCallable<Record<string, unknown>, ServerState>("submitGameAction");
    void call({ idempotencyKey: `play_${generateSecureId(24)}`, matchId: this.matchId, turnId: this.match.turnId, cardId: card.id })
      .then((response) => this.applyServerState(response.data))
      .catch((cause) => {
        this.hand = prevHand;
        this.displayMatch = null;
        this.optimisticCardId = null;
        this.optimisticPlayUntil = 0;
        this.pendingPlay = null;
        this.emitState();
        this.status("error", cause instanceof Error ? cause.message : "Action refusée");
      });
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
      idempotencyKey: `power_${generateSecureId(24)}`,
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
      .then(() => { this.heldPowerHand = null; })
      .catch((cause) => this.status("error", cause instanceof Error ? cause.message : "Pouvoir refusé"))
      .finally(() => {
        this.powerPending = false;
        // Pas de réponse exploitable : la main retenue redevient la vérité.
        if (this.heldPowerHand) {
          this.hand = this.heldPowerHand;
          this.heldPowerHand = null;
          if (!this.optimisticCardId) this.emitState();
        }
      });
  };

  private emitPowerActivation(activation: PowerCardActivation, force = false) {
    if (!activation?.playId) return;
    if (!force && this.emittedPowerIds.has(activation.playId)) return;
    this.emittedPowerIds.add(activation.playId);
    this.powerListeners.forEach((listener) => listener(activation));
  }

  /** Abandon volontaire : le serveur élimine le joueur avant le retour menu. */
  abandon = async () => {
    if (!this.matchId && this.opts.mode === "event" && this.opts.eventRunId) {
      const leave = backendCallable<Record<string, unknown>, { matchId?: string }>("leaveEvent");
      const response = await leave({ idempotencyKey: `leave_${generateSecureId(24)}`, runId: this.opts.eventRunId });
      if (response.data.matchId) {
        const abandon = backendCallable("abandonMatch");
        await abandon({ idempotencyKey: `abandon_${generateSecureId(24)}`, matchId: response.data.matchId });
      }
      return;
    }
    if (!this.matchId || !["playing", "between_rounds"].includes(this.match?.status ?? "")) return;
    const call = backendCallable<Record<string, unknown>, { matchId: string; status: string }>("abandonMatch");
    await call({ idempotencyKey: `abandon_${generateSecureId(24)}`, matchId: this.matchId });
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
    // Nettoyage technique uniquement : l'abandon est une action explicite.
    this.destroyed = true;
    if (this.heldSwapTimer) clearTimeout(this.heldSwapTimer);
    this.stopSnapshots();
    this.stopDealing();
    this.stopReplay();
    this.stateListeners.clear(); this.playListeners.clear(); this.trickListeners.clear(); this.roundListeners.clear();
    this.timerListeners.clear(); this.syncListeners.clear(); this.powerListeners.clear();
  };
}
