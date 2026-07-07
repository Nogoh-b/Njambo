/* ═══════════════ sync/LocalGameSync.ts ═══════════════
   Implémentation locale du GameSync pour le mode bot.
   Contient toute la logique de jeu (deck, deal, plays, resolve).
   Le TableScreen ne fait que le rendu + appelle playCard(). */

import { buildDeck, shuffle } from "@/engine/deck";
import {
  checkInstantWin,
  lastCardDoubles,
  legalCards,
  trickWinner,
} from "@/engine/rules";
import { botChooseCard } from "@/engine/bot";
import type { BOTS as BotsType } from "@/data/mock";
import type {
  Card,
  DepositedCard,
  GameConfig,
  GameState,
  GameSyncActions,
  Phase,
  Player,
  Result,
  TrickPlay,
  WinInfo,
  Profile,
} from "@/types/game";

interface LocalSyncOptions {
  profile: Profile;
  bots: typeof BotsType;
  cfg: GameConfig;
  mise: number;
  initialBotCount: number;
  onResult: (result: Result) => void;
  onUpdateBalance: (balance: number) => void;
  onBanner: (text: string) => void;
}

type Unsubscribe = () => void;

export class LocalGameSync implements GameSyncActions {
  private players: Player[] = [];
  private phase: Phase = "idle";
  private trickNo = 1;
  private leader = 0;
  private turnIdx = 0;
  private trickPlays: TrickPlay[] = [];
  private pot = 0;
  private dominantIdx: number | null = null;
  private result: Result | null = null;

  private opts: LocalSyncOptions;
  private timerHandle: ReturnType<typeof setTimeout> | null = null;
  private botHandle: ReturnType<typeof setTimeout> | null = null;

  /* Listeners */
  private stateListeners = new Set<(state: GameState) => void>();
  private playCardListeners = new Set<(play: { playerIdx: number; cardIdx: number; card: Card }) => void>();
  private trickEndListeners = new Set<(winnerIdx: number) => void>();
  private roundEndListeners = new Set<(result: Result) => void>();
  private timerListeners = new Set<(seconds: number) => void>();

  private seconds = 0;

  constructor(opts: LocalSyncOptions) {
    this.opts = opts;
  }

  /* ── Démarrer la partie ── */
  start() {
    const { profile, bots, cfg, initialBotCount } = this.opts;
    const ps: Player[] = [{ ...profile, isYou: true, hand: [], deposit: [] }];
    for (let i = 0; i < initialBotCount; i++)
      ps.push({ ...bots[i], balance: cfg.startingBalance, isYou: false, hand: [], deposit: [] });
    this.dealRound(ps, cfg.firstLeaderIndex);
  }

  /* ── Manche suivante ── */
  nextRound() {
    if (!this.result) return;
    const winIdx = this.result.winnerIdx;
    const newLeader = this.opts.cfg.winnerPlaysLastNextRound
      ? (winIdx + 1) % this.players.length
      : this.opts.cfg.firstLeaderIndex;
    this.dealRound(this.players, newLeader);
  }

  /* ═══════════════ Logique de jeu ═══════════════ */

  private dealRound(basePlayers: Player[], leaderIdx: number) {
    const { cfg, mise } = this.opts;
    const ps: Player[] = basePlayers.map((p) => ({ ...p, hand: [], deposit: [] }));
    ps.forEach((p) => (p.balance -= mise));
    const deck = shuffle(buildDeck(cfg));
    for (let k = 0; k < cfg.cardsPerPlayer; k++) for (const p of ps) p.hand.push(deck.shift()!);

    this.players = ps;
    this.pot = mise * ps.length;
    this.trickNo = 1;
    this.trickPlays = [];
    this.dominantIdx = null;
    this.result = null;
    this.leader = leaderIdx;
    this.phase = "dealing";
    this.emitState();
    this.opts.onBanner("Distribution…");

    const dealTime = ps.length * cfg.cardsPerPlayer * cfg.anim.dealPerCard + cfg.anim.dealFlight + 350;

    setTimeout(() => {
      this.opts.onBanner("");
      const inst = checkInstantWin(ps, cfg);
      if (inst) {
        this.resolveWin(ps, inst.winnerIdx, {
          type: "instant",
          winnerIdx: inst.winnerIdx,
          reason: inst.reason,
          total: inst.total,
          doubles: inst.doubles,
        });
        return;
      }
      this.turnIdx = leaderIdx;
      this.phase = "turns";
      this.seconds = cfg.turnSeconds;
      this.emitState();
      this.startTimer();
      this.scheduleBotTurn();
    }, dealTime);
  }

  /* ── Interface GameSyncActions.playCard ── */
  playCard = (cardIdx: number) => {
    if (this.phase !== "turns" || this.turnIdx !== 0) return; // seul le joueur humain appelle ça directement
    this.executePlay(0, cardIdx);
  };

  private executePlay(playerIdx: number, cardIdx: number) {
    if (this.phase !== "turns" || this.turnIdx !== playerIdx) return;
    const led = this.trickPlays[0]?.card.suit ?? null;
    const legal = legalCards(this.players[playerIdx].hand, led);
    if (!legal.includes(cardIdx)) return;

    const card = this.players[playerIdx].hand[cardIdx];
    const drop = {
      dropRot: Math.random() * 18 - 9,
      dx: Math.random() * 12 - 6,
      dy: Math.random() * 8 - 4,
    };

    // Émettre l'événement playCard pour l'animation
    this.playCardListeners.forEach((cb) => cb({ playerIdx, cardIdx, card }));

    this.commitPlay(playerIdx, cardIdx, drop);
  }

  private commitPlay(playerIdx: number, cardIdx: number, drop: { dropRot?: number; dx?: number; dy?: number }) {
    const ps = this.players.map((p) => ({ ...p, hand: [...p.hand], deposit: [...p.deposit] }));
    const removed = ps[playerIdx].hand.splice(cardIdx, 1)[0];
    const card: DepositedCard = { ...removed, ...drop };
    ps[playerIdx].deposit.push(card);
    this.trickPlays = [...this.trickPlays, { playerIdx, card: { ...removed } }];
    this.players = ps;

    if (this.trickPlays.length === ps.length) {
      const led = this.trickPlays[0].card.suit;
      const win = trickWinner(this.trickPlays, led);
      this.dominantIdx = win;
      this.phase = "trickEnd";
      this.stopTimer();
      this.emitState();
      this.opts.onBanner(`${ps[win].name} domine le tour`);
      this.trickEndListeners.forEach((cb) => cb(win));

      setTimeout(() => {
        this.opts.onBanner("");
        this.dominantIdx = null;
        if (this.trickNo >= this.opts.cfg.cardsPerPlayer) {
          const lastCard = this.trickPlays.find((p) => p.playerIdx === win)!.card;
          this.resolveWin(ps, win, {
            type: "lastTrick",
            winnerIdx: win,
            doubles: lastCardDoubles(lastCard, this.opts.cfg),
            lastCard,
          });
        } else {
          this.trickNo++;
          this.trickPlays = [];
          this.leader = win;
          this.turnIdx = win;
          this.phase = "turns";
          this.seconds = this.opts.cfg.turnSeconds;
          this.emitState();
          this.startTimer();
          this.scheduleBotTurn();
        }
      }, this.opts.cfg.anim.trickPause);
    } else {
      this.turnIdx = (playerIdx + 1) % ps.length;
      this.seconds = this.opts.cfg.turnSeconds;
      this.emitState();
      this.stopTimer();
      this.startTimer();
      this.scheduleBotTurn();
    }
  }

  private resolveWin(ps: Player[], winnerIdx: number, info: WinInfo) {
    const final = ps.map((p) => ({ ...p }));
    const potNow = this.pot || this.opts.mise * ps.length;
    final[winnerIdx].balance += potNow;
    if (info.doubles) {
      final.forEach((p, i) => {
        if (i !== winnerIdx) {
          p.balance -= this.opts.mise;
          final[winnerIdx].balance += this.opts.mise;
        }
      });
    }
    this.players = final;
    this.phase = "result";
    this.pot = 0;
    this.result = { ...info, winner: final[winnerIdx], gain: potNow, playersCount: ps.length };

    // Mettre à jour le solde du profil
    const youPlayer = final.find((p) => p.isYou);
    if (youPlayer) this.opts.onUpdateBalance(youPlayer.balance);

    this.emitState();
    this.roundEndListeners.forEach((cb) => cb(this.result!));
    this.opts.onResult(this.result!);
  }

  /* ═══════════════ Timer ═══════════════ */

  private startTimer() {
    this.stopTimer();
    this.timerHandle = setInterval(() => {
      this.seconds--;
      this.timerListeners.forEach((cb) => cb(this.seconds));

      if (this.seconds <= 5 && this.players[this.turnIdx]?.isYou) {
        // tick sonore — délégué au TableScreen via un callback si besoin
      }

      if (this.seconds <= 0) {
        this.stopTimer();
        // Auto-play la carte la plus faible
        const led = this.trickPlays[0]?.card.suit ?? null;
        const legal = legalCards(this.players[this.turnIdx].hand, led);
        const lowest = [...legal].sort(
          (a, b) => this.players[this.turnIdx].hand[a].value - this.players[this.turnIdx].hand[b].value,
        )[0];
        if (lowest !== undefined) this.executePlay(this.turnIdx, lowest);
      }
    }, 1000);
  }

  private stopTimer() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  /* ═══════════════ Bot AI ═══════════════ */

  private scheduleBotTurn() {
    if (this.botHandle) clearTimeout(this.botHandle);
    const p = this.players[this.turnIdx];
    if (!p || p.isYou || this.phase !== "turns") return;

    this.botHandle = setTimeout(() => {
      if (this.phase !== "turns" || this.turnIdx !== this.players.indexOf(p)) return;
      const led = this.trickPlays[0]?.card.suit ?? null;
      const best = this.trickPlays.length
        ? Math.max(0, ...this.trickPlays.filter((x) => x.card.suit === led).map((x) => x.card.value))
        : null;
      const idx = botChooseCard(
        this.players[this.turnIdx].hand,
        led,
        this.trickNo >= this.opts.cfg.cardsPerPlayer,
        best,
      );
      this.executePlay(this.turnIdx, idx);
    }, 1200 + Math.random() * 1800);
  }

  /* ═══════════════ Émission d'état ═══════════════ */

  private emitState() {
    const state: GameState = {
      phase: this.phase,
      trickNo: this.trickNo,
      trickPlays: [...this.trickPlays],
      leaderIdx: this.leader,
      turnIdx: this.turnIdx,
      pot: this.pot,
      dominantIdx: this.dominantIdx,
      banner: "",
      players: this.players.map((p) => ({
        ...p,
        hand: [...p.hand],
        deposit: [...p.deposit],
      })),
    };
    this.stateListeners.forEach((cb) => cb(state));
  }

  /* ═══════════════ Interface GameSyncActions ═══════════════ */

  onStateUpdate = (cb: (state: GameState) => void): Unsubscribe => {
    this.stateListeners.add(cb);
    // Émettre l'état actuel immédiatement
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

  /* ═══════════════ Cleanup ═══════════════ */

  destroy() {
    this.stopTimer();
    if (this.botHandle) clearTimeout(this.botHandle);
    this.stateListeners.clear();
    this.playCardListeners.clear();
    this.trickEndListeners.clear();
    this.roundEndListeners.clear();
    this.timerListeners.clear();
  }
}
