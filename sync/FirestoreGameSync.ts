import {
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { buildDeck, shuffle } from "@/engine/deck";
import {
  checkInstantWin,
  lastCardDoubles,
  legalCards,
  trickWinner,
} from "@/engine/rules";
import type {
  Card,
  DepositedCard,
  GameConfig,
  GameDoc,
  GameState,
  GameSyncActions,
  Phase,
  Player,
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
  private playCardListeners = new Set<(play: { playerIdx: number; cardIdx: number; card: Card }) => void>();
  private trickEndListeners = new Set<(winnerIdx: number) => void>();
  private roundEndListeners = new Set<(result: Result) => void>();
  private timerListeners = new Set<(seconds: number) => void>();

  private unsubGame: Unsubscribe | null = null;
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private dealHandle: ReturnType<typeof setTimeout> | null = null;
  private rematchHandle: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private sawFirstSnapshot = false;
  private lastEmittedPlayId: string | null = null;
  private lastEmittedResultKey: string | null = null;
  private lastTrickEndKey: string | null = null;
  private processingPlayIds = new Set<string>();
  private rematchStarting = false;

  constructor(opts: FirestoreSyncOptions) {
    this.opts = opts;
    this.isHost = opts.myUid === opts.hostId;
    this.myIdx = opts.roomPlayers.findIndex((p) => p.uid === opts.myUid);
    if (this.myIdx < 0) this.myIdx = 0;
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
      updatedAt: Date.now(),
    });
  }

  playCard = (cardIdx: number) => {
    if (this.phase !== "turns" || this.turnIdx !== this.myIdx) return;

    const uid = this.opts.roomPlayers[this.myIdx]?.uid;
    const hand = uid ? this.allHands[uid] : undefined;
    if (!uid || !hand) return;

    const led = this.trickPlays[0]?.card.suit ?? null;
    if (!legalCards(hand, led).includes(cardIdx)) return;

    const card = hand[cardIdx];
    if (!card) return;

    const playId = `${Date.now()}-${uid}-${card.id}-${cardIdx}`;
    this.lastEmittedPlayId = playId;
    this.playCardListeners.forEach((cb) => cb({ playerIdx: 0, cardIdx, card }));

    const gameRef = doc(db, "rooms", this.opts.roomId, "game", "current");
    void updateDoc(gameRef, {
      pendingPlay: {
        playerIdx: this.myIdx,
        cardIdx,
        uid,
        playId,
        createdAt: Date.now(),
      } satisfies PendingPlay,
      updatedAt: Date.now(),
    });
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
    const previousPhase = this.phase;
    this.applyDoc(game);

    const firstSnapshot = !this.sawFirstSnapshot;
    this.sawFirstSnapshot = true;

    if (previousPhase === "result" && game.phase !== "result") {
      this.lastEmittedResultKey = null;
      this.opts.onRoundRestart?.();
    }

    if (firstSnapshot) {
      this.lastEmittedPlayId = game.lastPlay?.playId ?? null;
    } else if (game.lastPlay && game.lastPlay.playId !== this.lastEmittedPlayId) {
      this.lastEmittedPlayId = game.lastPlay.playId;
      this.emitPlayEvent(game.lastPlay);
    }

    const trickEndKey = `${game.trickNo}:${game.dominantIdx ?? "none"}:${game.trickPlays.length}`;
    if (game.phase === "trickEnd" && game.dominantIdx != null && trickEndKey !== this.lastTrickEndKey) {
      this.lastTrickEndKey = trickEndKey;
      this.trickEndListeners.forEach((cb) => cb(this.toUiIdx(game.dominantIdx!)));
    }

    this.emitState();
    this.syncTimer(game);

    if (game.result) {
      this.emitResultOnce(game.result);
    }

    this.syncRematch(game);

    if (this.isHost && game.pendingPlay) {
      void this.hostProcessPendingPlay(game.pendingPlay, game);
    }

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

  private syncTimer(game: GameDoc) {
    if (game.phase !== "turns" || !game.updatedAt) {
      this.stopTimer();
      return;
    }

    const elapsed = Math.floor((Date.now() - game.updatedAt) / 1000);
    this.seconds = Math.max(0, this.opts.cfg.turnSeconds - elapsed);
    this.startTimer();
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

      if (Date.now() >= game.rematch!.deadlineAt) {
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
      updatedAt: Date.now(),
      startedAt: Date.now(),
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
      updatedAt: Date.now(),
    });
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
        await updateDoc(gameRef, { pendingPlay: null, updatedAt: Date.now() });
        return;
      }

      const hand = this.allHands[pending.uid] ?? [];
      const card = hand[pending.cardIdx];
      const led = this.trickPlays[0]?.card.suit ?? null;

      if (!card || !legalCards(hand, led).includes(pending.cardIdx)) {
        await updateDoc(gameRef, { pendingPlay: null, updatedAt: Date.now() });
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

    const drop = {
      dropRot: Math.random() * 18 - 9,
      dx: Math.random() * 12 - 6,
      dy: Math.random() * 8 - 4,
    };
    const depCard: DepositedCard = { ...removed, ...drop };
    this.depositsByUid[player.uid] = [...(this.depositsByUid[player.uid] ?? []), depCard];
    this.trickPlays = [...this.trickPlays, { playerIdx, card: { ...removed } }];

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
        updatedAt: Date.now(),
      });

      setTimeout(() => {
        void this.hostAfterTrick(win);
      }, cfg.anim.trickPause);
      return;
    }

    this.turnIdx = (playerIdx + 1) % roomPlayers.length;
    this.seconds = cfg.turnSeconds;
    this.stopTimer();

    await updateDoc(gameRef, {
      hands: cloneHands(this.allHands),
      deposits: cloneDeposits(this.depositsByUid),
      trickPlays: this.trickPlays,
      turnIdx: this.turnIdx,
      phase: "turns" as Phase,
      pendingPlay: null,
      lastPlay,
      updatedAt: Date.now(),
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
      updatedAt: Date.now(),
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
    final[winnerIdx].balance += potNow;

    if (info.doubles) {
      final.forEach((player, i) => {
        if (i !== winnerIdx) {
          player.balance -= mise;
          final[winnerIdx].balance += mise;
        }
      });
    }

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
      gain: potNow,
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
        deadlineAt: Date.now() + 20000,
        requestedAt: Date.now(),
      },
      pendingPlay: null,
      updatedAt: Date.now(),
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
    const playId = `${Date.now()}-${player.uid}-timeout-${lowest}`;
    await this.hostCommitPlay(this.turnIdx, lowest, card, playId);
  }

  private stopTimer() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private emitPlayEvent(lastPlay: LastPlay) {
    this.playCardListeners.forEach((cb) => cb({
      playerIdx: this.toUiIdx(lastPlay.playerIdx),
      cardIdx: lastPlay.cardIdx,
      card: lastPlay.card,
    }));
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

  onStateUpdate = (cb: (state: GameState) => void): Unsubscribe => {
    this.stateListeners.add(cb);
    this.emitState();
    return () => this.stateListeners.delete(cb);
  };

  onPlayCard = (cb: (play: { playerIdx: number; cardIdx: number; card: Card }) => void): Unsubscribe => {
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
    this.processingPlayIds.clear();
  }
}
