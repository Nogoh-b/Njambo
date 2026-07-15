"use client";

import { doc, onSnapshot, type Unsubscribe } from "@/lib/firestoreClient";
import { db } from "@/lib/firebase";
import { backendCallable } from "@/lib/backendCallable";
import type {
  Card, GameState, GameSyncActions, Player, PowerCardActivation, Profile,
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
  private emittedResult = false;
  private previousTrick = 0;

  private stateListeners = new Set<(state: GameState) => void>();
  private playListeners = new Set<PlayListener>();
  private trickListeners = new Set<(winnerIdx: number) => void>();
  private roundListeners = new Set<(result: Result) => void>();
  private timerListeners = new Set<(seconds: number) => void>();
  private syncListeners = new Set<(status: SyncStatus) => void>();
  private powerListeners = new Set<(activation: PowerCardActivation) => void>();

  constructor(private opts: Options) {}

  start = () => { void this.startRound(); };
  nextRound = () => { this.stopSnapshots(); this.matchId = null; this.match = null; this.hand = []; this.emittedActions.clear(); this.emittedResult = false; void this.startRound(); };

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
      this.applyServerState(response.data);
      this.subscribe(matchId);
    } catch (cause) { this.status("error", cause instanceof Error ? cause.message : "Reconnexion refusée"); }
  }

  private subscribe(matchId: string) {
    this.stopSnapshots();
    this.matchId = matchId;
    this.matchUnsub = onSnapshot(doc(db, "matches", matchId), (snapshot) => {
      if (!snapshot.exists()) return;
      this.match = snapshot.data() as ServerMatch;
      this.emitDerivedEvents(); this.emitState();
    }, () => this.status("offline", "Synchronisation interrompue"));
    this.handUnsub = onSnapshot(doc(db, "matches", matchId, "private", this.opts.uid), (snapshot) => {
      if (!snapshot.exists()) return;
      this.hand = (snapshot.get("hand") ?? []) as Card[];
      this.emitState();
    });
    this.timer = setInterval(() => {
      const seconds = this.match ? Math.max(0, Math.ceil((this.match.actionDeadlineAt - Date.now()) / 1000)) : 0;
      this.timerListeners.forEach((listener) => listener(seconds));
    }, 1_000);
    this.status("live");
  }

  private applyServerState(state: ServerState) {
    this.matchId = state.matchId; this.match = state.match; this.hand = state.hand;
    this.emitDerivedEvents(); this.emitState();
  }

  private localOrder() {
    if (!this.match) return [] as number[];
    const mine = this.match.participants.findIndex((participant) => participant.uid === this.opts.uid);
    return Array.from({ length: this.match.participants.length }, (_, index) => (mine + index) % this.match!.participants.length);
  }

  private localIndex(serverIndex: number) { return this.localOrder().indexOf(serverIndex); }

  private players(): Player[] {
    if (!this.match) return [];
    return this.localOrder().map((serverIndex) => {
      const participant = this.match!.participants[serverIndex];
      const isYou = participant.uid === this.opts.uid;
      const count = Number(this.match!.handCounts?.[participant.uid] ?? 0);
      const hidden = Array.from({ length: count }, (_, index): Card => ({ id: `hidden-${participant.uid}-${index}`, rank: "?", value: 0, suit: "♠", color: "#1e1e1e" }));
      return {
        name: participant.name, emoji: participant.emoji, isYou,
        balance: isYou ? this.opts.profile.balance : 0,
        hand: isYou ? this.hand : hidden,
        deposit: this.match!.deposits?.[participant.uid] ?? [],
        equippedPowers: isYou ? [] : undefined,
      };
    });
  }

  private emitState() {
    if (!this.match) return;
    const state: GameState = {
      phase: this.match.status === "settled" ? "result" : "turns",
      trickNo: this.match.trickNumber + 1,
      trickPlays: this.match.trickPlays.map((play) => ({
        playerIdx: this.localIndex(this.match!.participants.findIndex((participant) => participant.uid === play.uid)), card: play.card,
      })),
      leaderIdx: this.localIndex(this.match.leaderIndex),
      turnIdx: this.localIndex(this.match.turnIndex),
      pot: this.match.potNkap,
      dominantIdx: null,
      banner: "",
      players: this.players(),
    };
    this.stateListeners.forEach((listener) => listener(state));
  }

  private emitDerivedEvents() {
    if (!this.match) return;
    for (const action of this.match.recentActions ?? []) {
      if (this.emittedActions.has(action.playId)) continue;
      this.emittedActions.add(action.playId);
      const serverIndex = this.match.participants.findIndex((participant) => participant.uid === action.uid);
      const playerIdx = this.localIndex(serverIndex);
      const currentHand = playerIdx === 0 ? this.hand : [];
      const cardIdx = Math.max(0, currentHand.findIndex((card) => card.id === action.card.id));
      this.playListeners.forEach((listener) => listener({ playerIdx, cardIdx, card: action.card, playId: action.playId }));
    }
    if (this.match.trickNumber > this.previousTrick) {
      this.previousTrick = this.match.trickNumber;
      this.trickListeners.forEach((listener) => listener(this.localIndex(this.match!.leaderIndex)));
    }
    if (this.match.result && !this.emittedResult) {
      this.emittedResult = true;
      const serverWinner = this.match.participants.findIndex((participant) => participant.uid === this.match!.result!.winnerUid);
      const winnerIdx = this.localIndex(serverWinner);
      const players = this.players();
      const lastCard = this.match.recentActions?.at(-1)?.card ?? ({ id: "result", rank: "3", value: 3, suit: "♠", color: "#1e1e1e" } as Card);
      const result: Result = { type: "lastTrick", winnerIdx, winner: players[winnerIdx], doubles: false, lastCard, gain: this.match.potNkap, playersCount: players.length };
      this.roundListeners.forEach((listener) => listener(result));
      this.opts.onResult(result);
    }
  }

  playCard = (cardIdx: number) => {
    if (!this.matchId || !this.match || this.match.status !== "playing") return;
    const card = this.hand[cardIdx];
    if (!card) return;
    const call = backendCallable<Record<string, unknown>, ServerState>("submitGameAction");
    void call({ idempotencyKey: `play_${crypto.randomUUID()}`, matchId: this.matchId, turnId: this.match.turnId, cardId: card.id })
      .then((response) => this.applyServerState(response.data))
      .catch((cause) => this.status("error", cause instanceof Error ? cause.message : "Action refusée"));
  };

  usePowerCard = () => {
    this.status("error", "Les pouvoirs serveur seront activés après leur migration complète.");
  };

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
    this.stateListeners.clear(); this.playListeners.clear(); this.trickListeners.clear(); this.roundListeners.clear();
    this.timerListeners.clear(); this.syncListeners.clear(); this.powerListeners.clear();
  };
}
