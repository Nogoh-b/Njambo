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
import {
  applyPowerCard,
  canActivatePowerCard,
  requiresTarget,
  type PowerEffectResult,
} from "@/engine/powerEffects";
import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import type { BOTS as BotsType } from "@/data/mock";
import type {
  BotDifficulty,
  Card,
  DepositedCard,
  GameConfig,
  GameState,
  GameSyncActions,
  Phase,
  Player,
  PowerCardActivation,
  PowerCardId,
  ActivePowerEffect,
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
  difficulty?: BotDifficulty;
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

  /** Pioche restante (pour Vent du Nord). */
  private deck: Card[] = [];
  /** Effets de pouvoir actifs sur le pli courant. */
  private activePowerEffects: ActivePowerEffect[] = [];
  /** Joueurs forcés de jouer leur carte la plus faible (Coupe-Circuit). */
  private forcedLowest: Set<number> = new Set();
  /** Timer gelé pour un joueur (Sable du Temps) jusqu'à ce timestamp (ms). */
  private frozenUntil: Record<number, number> = {};
  private botPowerUsed = new Set<number>();

  private opts: LocalSyncOptions;
  private timerHandle: ReturnType<typeof setTimeout> | null = null;
  private botHandle: ReturnType<typeof setTimeout> | null = null;
  private dealHandle: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  /* Listeners */
  private stateListeners = new Set<(state: GameState) => void>();
  private playCardListeners = new Set<(play: { playerIdx: number; cardIdx: number; card: Card }) => void>();
  private trickEndListeners = new Set<(winnerIdx: number) => void>();
  private roundEndListeners = new Set<(result: Result) => void>();
  private timerListeners = new Set<(seconds: number) => void>();
  private powerActivatedListeners = new Set<(activation: PowerCardActivation) => void>();

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

  private botPowerLoadout(playerIdx: number): PowerCardId[] {
    const difficulty = this.opts.difficulty ?? "normal";
    if (playerIdx === 0 || difficulty === "easy") return [];
    const normal: PowerCardId[] = ["tambour_appel", "feu_camp", "coupe_circuit"];
    const hard: PowerCardId[] = ["eclair_mfoundi", "filet_pecheur", "cauris_chanceux", "feu_camp"];
    const pool = difficulty === "hard" ? hard : normal;
    return [pool[playerIdx % pool.length]];
  }

  private dealRound(basePlayers: Player[], leaderIdx: number) {
    if (this.destroyed) return;
    // Annuler une distribution déjà programmée (évite un double deal)
    if (this.dealHandle) {
      clearTimeout(this.dealHandle);
      this.dealHandle = null;
    }
    const { cfg, mise } = this.opts;
    const ps: Player[] = basePlayers.map((p, index) => ({
      ...p,
      hand: [],
      deposit: [],
      powerActivations: [],
      equippedPowers: p.isYou ? p.equippedPowers : this.botPowerLoadout(index),
    }));
    ps.forEach((p) => (p.balance -= mise));
    const deck = shuffle(buildDeck(cfg));
    for (let k = 0; k < cfg.cardsPerPlayer; k++) for (const p of ps) p.hand.push(deck.shift()!);

    this.players = ps;
    this.pot = mise * ps.length;
    this.trickNo = 1;
    this.trickPlays = [];
    this.dominantIdx = null;
    this.result = null;
    this.deck = deck; // Garder la pioche restante pour Vent du Nord
    this.activePowerEffects = [];
    this.forcedLowest.clear();
    this.frozenUntil = {};
    this.botPowerUsed.clear();
    this.leader = leaderIdx;
    this.phase = "dealing";
    this.emitState();
    this.opts.onBanner("Distribution…");

    const dealTime = ps.length * cfg.cardsPerPlayer * cfg.anim.dealPerCard + cfg.anim.dealFlight + 350;

    this.dealHandle = setTimeout(() => {
      this.dealHandle = null;
      if (this.destroyed) return;
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
    // Si le joueur est forcé de jouer sa carte la plus faible (Coupe-Circuit)
    if (this.forcedLowest.has(0)) {
      this.forcedLowest.delete(0);
      const led = this.trickPlays[0]?.card.suit ?? null;
      const legal = legalCards(this.players[0].hand, led);
      const lowestIdx = [...legal].sort((a, b) => this.players[0].hand[a].value - this.players[0].hand[b].value)[0];
      if (lowestIdx !== undefined) {
        this.executePlay(0, lowestIdx);
        return;
      }
    }
    this.executePlay(0, cardIdx);
  };

  /* ── Interface GameSyncActions.usePowerCard ── */
  usePowerCard = (cardId: PowerCardId, targetIdx?: number) => {
    if (this.phase !== "turns") return;

    const me = this.players[0];
    if (!me) return;

    // Vérifier que la carte est équipée
    const equipped = me.equippedPowers ?? [];
    if (!equipped.includes(cardId)) return;

    // Vérifier qu'elle n'est pas déjà utilisée
    const activations = me.powerActivations ?? [];
    if (activations.some((a) => a.cardId === cardId && a.used)) return;

    const ctx = {
      state: this.buildGameState(),
      activatedBy: 0,
      target: targetIdx,
      deck: this.deck,
      maxValue: this.opts.cfg.ranks.max,
    };

    const error = canActivatePowerCard(cardId, ctx);
    if (error) return;

    const blockedByCardId = this.blockingPowerFor(cardId, targetIdx);
    if (!blockedByCardId) {
      const result = applyPowerCard(cardId, ctx);
      this.applyPowerEffect(cardId, 0, result, targetIdx);
    }

    // Marquer comme utilisée
    const activation: PowerCardActivation = {
      cardId,
      activatedByUid: "local",
      targetUid: targetIdx !== undefined ? `bot-${targetIdx}` : undefined,
      trickNo: this.trickNo,
      used: true,
      playId: `local-${Date.now()}-${Math.random()}`,
      blockedByCardId,
      consumedCardIds: [cardId],
    };

    const ps = this.players.map((p) => ({ ...p }));
    if (!ps[0].powerActivations) ps[0].powerActivations = [];
    ps[0].powerActivations.push(activation);
    this.players = ps;

    this.powerActivatedListeners.forEach((cb) => cb(activation));
    this.emitState();
  };

  private blockingPowerFor(cardId: PowerCardId, targetIdx?: number): PowerCardId | undefined {
    if (targetIdx === undefined) return undefined;
    const shield = this.activePowerEffects.find((effect) => effect.activatedBy === targetIdx && effect.shield);
    if (shield) {
      this.activePowerEffects = this.activePowerEffects.filter((effect) => effect !== shield);
      return shield.cardId;
    }
    const mask = this.activePowerEffects.find((effect) => effect.activatedBy === targetIdx && effect.cancelReveal);
    if (mask && cardId === "oeil_sorcier") {
      this.activePowerEffects = this.activePowerEffects.filter((effect) => effect !== mask);
      return mask.cardId;
    }
    return undefined;
  }

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

  private applyNextCardModifiers(playerIdx: number, card: Card): Card {
    const led = this.trickPlays[0]?.card.suit ?? null;
    const next = { ...card };
    const consumed: ActivePowerEffect[] = [];

    const valueBoost = this.activePowerEffects.find((effect) => effect.activatedBy === playerIdx && effect.valueBonus);
    if (valueBoost?.valueBonus) {
      next.effectiveValue = Math.min(this.opts.cfg.ranks.max, card.value + valueBoost.valueBonus);
      next.powerTag = valueBoost.cardId;
      consumed.push(valueBoost);
    }

    const suitOverride = this.activePowerEffects.find((effect) => effect.activatedBy === playerIdx && effect.suitOverride);
    if (suitOverride && led && card.suit !== led) {
      next.effectiveSuit = led;
      next.powerTag = suitOverride.cardId;
      consumed.push(suitOverride);
    }

    if (consumed.length > 0) {
      this.activePowerEffects = this.activePowerEffects.filter((effect) => !consumed.includes(effect));
    }
    return next;
  }

  private applyTrickPowerRewards(winnerIdx: number) {
    const scoped = this.activePowerEffects.filter((effect) => effect.scopeTrickNo === this.trickNo && effect.activatedBy === winnerIdx);
    scoped.forEach((effect) => {
      if (effect.scoreMultiplier && effect.scoreMultiplier > 1) {
        this.pot *= effect.scoreMultiplier;
      }
      if (effect.conditionalPotBonus && effect.potBonus) {
        this.pot += effect.potBonus;
      }
    });
    this.activePowerEffects = this.activePowerEffects.filter((effect) => {
      if (effect.scopeTrickNo !== this.trickNo) return true;
      if (effect.scoreMultiplier || effect.conditionalPotBonus) return false;
      return true;
    });
  }

  private commitPlay(playerIdx: number, cardIdx: number, drop: { dropRot?: number; dx?: number; dy?: number }) {
    const ps = this.players.map((p) => ({ ...p, hand: [...p.hand], deposit: [...p.deposit] }));
    const removed = ps[playerIdx].hand.splice(cardIdx, 1)[0];
    const resolvedCard = this.applyNextCardModifiers(playerIdx, removed);
    const card: DepositedCard = { ...resolvedCard, ...drop };
    ps[playerIdx].deposit.push(card);
    this.trickPlays = [...this.trickPlays, { playerIdx, card: { ...resolvedCard } }];
    this.players = ps;

    if (this.trickPlays.length === ps.length) {
      const led = this.trickPlays[0].card.suit;
      const win = trickWinner(this.trickPlays, led);
      this.applyTrickPowerRewards(win);
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

  /* ═══════════════ Effets des cartes pouvoir ═══════════════ */

  private buildGameState(): GameState {
    return {
      phase: this.phase,
      trickNo: this.trickNo,
      trickPlays: [...this.trickPlays],
      leaderIdx: this.leader,
      turnIdx: this.turnIdx,
      pot: this.pot,
      dominantIdx: this.dominantIdx,
      banner: "",
      activePowerEffects: [...this.activePowerEffects],
      players: this.players.map((p) => ({ ...p, hand: [...p.hand], deposit: [...p.deposit] })),
    };
  }

  /** Applique le résultat d'une carte pouvoir sur l'état local. */
  private applyPowerEffect(
    cardId: PowerCardId,
    activatedBy: number,
    result: PowerEffectResult,
    targetIdx?: number,
  ) {
    const def = POWER_CARDS_BY_ID[cardId];
    if (def) {
      this.opts.onBanner(`${def.name} !`);
      setTimeout(() => this.opts.onBanner(""), 2000);
    }

    // Mains mutées (Vent du Nord)
    if (result.handsMutated) {
      const ps = this.players.map((p) => ({ ...p }));
      for (const [idxStr, newHand] of Object.entries(result.handsMutated)) {
        const idx = Number(idxStr);
        if (ps[idx]) ps[idx].hand = newHand;
      }
      this.players = ps;
    }

    // Nouvelle pioche (Vent du Nord)
    if (result.newDeck) {
      this.deck = result.newDeck;
    }

    // Révélation de main (Œil du Sorcier) — gérée par l'UI via onPowerActivated
    // (le client lit directement la main du joueur ciblé en mode local)

    // Forcer la carte la plus faible (Coupe-Circuit)
    if (result.forceLowestCard && targetIdx !== undefined) {
      this.forcedLowest.add(targetIdx);
    }

    // Multiplicateur de score (Bénédiction du Chef)
    if (result.trickScoreMultiplier) {
      this.activePowerEffects.push({
        cardId,
        activatedBy,
        scopeTrickNo: this.trickNo,
        scoreMultiplier: result.trickScoreMultiplier,
      });
    }

    // Bonus de pot (Pluie d'Étoiles)
    if (result.potBonus) {
      this.pot += result.potBonus;
      this.activePowerEffects.push({
        cardId,
        activatedBy,
        scopeTrickNo: this.trickNo,
        potBonus: result.potBonus,
      });
    }

    if (result.conditionalPotBonus) {
      this.activePowerEffects.push({
        cardId,
        activatedBy,
        scopeTrickNo: this.trickNo,
        potBonus: result.conditionalPotBonus,
        conditionalPotBonus: true,
      });
    }

    // Gel du timer (Sable du Temps)
    if (result.timerFreeze && targetIdx !== undefined) {
      this.frozenUntil[targetIdx] = Date.now() + result.timerFreeze.durationMs;
    }

    if (result.timerDelta) {
      this.applyTimerDelta(result.timerDelta.playerIdx, result.timerDelta.seconds);
    }

    if (result.opponentTimerDelta) {
      this.players.forEach((_, idx) => {
        if (idx !== activatedBy) this.applyTimerDelta(idx, result.opponentTimerDelta!.seconds);
      });
    }

    if (result.shield) {
      this.activePowerEffects.push({ cardId, activatedBy, scopeTrickNo: this.trickNo, shield: true });
    }

    if (result.refundOnLoss) {
      this.activePowerEffects.push({
        cardId,
        activatedBy,
        scopeTrickNo: this.trickNo,
        refundOnLoss: result.refundOnLoss.ratio,
      });
    }

    if (result.valueBonusNext) {
      this.activePowerEffects.push({
        cardId,
        activatedBy,
        scopeTrickNo: this.trickNo,
        valueBonus: result.valueBonusNext.amount,
      });
    }

    if (result.preventDoublePenalty) {
      this.activePowerEffects.push({ cardId, activatedBy, scopeTrickNo: this.trickNo, preventDoublePenalty: true });
    }

    if (result.cancelReveal) {
      this.activePowerEffects.push({ cardId, activatedBy, scopeTrickNo: this.trickNo, cancelReveal: true });
    }

    if (result.suitOverrideNext) {
      this.activePowerEffects.push({ cardId, activatedBy, scopeTrickNo: this.trickNo, suitOverride: true });
    }
  }

  private applyTimerDelta(playerIdx: number, seconds: number) {
    if (this.turnIdx !== playerIdx) return;
    this.seconds = Math.max(1, Math.min(this.opts.cfg.turnSeconds + 10, this.seconds + seconds));
    this.timerListeners.forEach((cb) => cb(this.seconds));
  }

  private resolveWin(ps: Player[], winnerIdx: number, info: WinInfo) {
    const final = ps.map((p) => ({ ...p }));
    let potNow = this.pot || this.opts.mise * ps.length;

    // Appliquer le multiplicateur de score (Bénédiction du Chef)
    const scoreMultiplier = this.activePowerEffects.find(
      (e) => e.activatedBy === winnerIdx && e.scoreMultiplier,
    )?.scoreMultiplier;
    if (scoreMultiplier && scoreMultiplier > 1) {
      potNow = potNow * scoreMultiplier;
    }

    final[winnerIdx].balance += potNow;
    if (info.doubles) {
      final.forEach((p, i) => {
        if (i !== winnerIdx) {
          const protectedByTotem = this.activePowerEffects.some((effect) => effect.activatedBy === i && effect.preventDoublePenalty);
          if (!protectedByTotem) {
            p.balance -= this.opts.mise;
            final[winnerIdx].balance += this.opts.mise;
          }
        }
      });
    }
    final.forEach((p, i) => {
      if (i === winnerIdx) return;
      const refund = this.activePowerEffects.find((effect) => effect.activatedBy === i && effect.refundOnLoss)?.refundOnLoss;
      if (refund) p.balance += Math.round(this.opts.mise * refund);
    });
    this.players = final;
    this.phase = "result";
    this.pot = 0;
    this.activePowerEffects = []; // Nettoyer après résolution
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
      if ((this.frozenUntil[this.turnIdx] ?? 0) > Date.now()) {
        this.timerListeners.forEach((cb) => cb(this.seconds));
        return;
      }
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

  private maybeUseBotPower(): void {
    const botIdx = this.turnIdx;
    const difficulty = this.opts.difficulty ?? "normal";
    if (difficulty === "easy" || botIdx <= 0 || this.botPowerUsed.has(botIdx)) return;
    const chance = difficulty === "hard" ? 0.72 : 0.36;
    if (Math.random() > chance) return;

    const powers = this.players[botIdx]?.equippedPowers ?? [];
    const cardId = powers.find((id) => !(this.players[botIdx].powerActivations ?? []).some((a) => a.cardId === id && a.used));
    if (!cardId) return;
    const targetIdx = requiresTarget(cardId) ? 0 : undefined;
    const ctx = {
      state: this.buildGameState(),
      activatedBy: botIdx,
      target: targetIdx,
      deck: this.deck,
      maxValue: this.opts.cfg.ranks.max,
    };
    if (canActivatePowerCard(cardId, ctx)) return;

    const blockedByCardId = this.blockingPowerFor(cardId, targetIdx);
    if (!blockedByCardId) {
      this.applyPowerEffect(cardId, botIdx, applyPowerCard(cardId, ctx), targetIdx);
    }

    const activation: PowerCardActivation = {
      cardId,
      activatedByUid: `bot-${botIdx}`,
      targetUid: targetIdx === 0 ? "local" : undefined,
      trickNo: this.trickNo,
      used: true,
      playId: `bot-${botIdx}-${Date.now()}-${Math.random()}`,
      blockedByCardId,
      consumedCardIds: [cardId],
    };
    const ps = this.players.map((p) => ({ ...p }));
    if (!ps[botIdx].powerActivations) ps[botIdx].powerActivations = [];
    ps[botIdx].powerActivations.push(activation);
    this.players = ps;
    this.botPowerUsed.add(botIdx);
    this.powerActivatedListeners.forEach((cb) => cb(activation));
    this.emitState();
  }

  private scheduleBotTurn() {
    if (this.botHandle) clearTimeout(this.botHandle);
    const p = this.players[this.turnIdx];
    if (!p || p.isYou || this.phase !== "turns") return;

    this.botHandle = setTimeout(() => {
      if (this.phase !== "turns" || this.turnIdx !== this.players.indexOf(p)) return;
      this.maybeUseBotPower();
      const led = this.trickPlays[0]?.card.suit ?? null;
      // Si le bot est forcé de jouer sa carte la plus faible (Coupe-Circuit)
      if (this.forcedLowest.has(this.turnIdx)) {
        this.forcedLowest.delete(this.turnIdx);
        const legalIdxs = legalCards(this.players[this.turnIdx].hand, led);
        const lowestIdx = [...legalIdxs].sort((a, b) => this.players[this.turnIdx].hand[a].value - this.players[this.turnIdx].hand[b].value)[0];
        if (lowestIdx !== undefined) {
          this.executePlay(this.turnIdx, lowestIdx);
          return;
        }
      }
      const best = this.trickPlays.length
        ? Math.max(0, ...this.trickPlays.filter((x) => x.card.suit === led).map((x) => x.card.value))
        : null;
      const idx = botChooseCard(
        this.players[this.turnIdx].hand,
        led,
        this.trickNo >= this.opts.cfg.cardsPerPlayer,
        best,
        {
          difficulty: this.opts.difficulty ?? "normal",
          // toutes les cartes déjà jouées ce round (dépôts) = mémoire du bot
          seen: this.players.flatMap((p) => p.deposit),
        },
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

  onPowerActivated = (cb: (activation: PowerCardActivation) => void): Unsubscribe => {
    this.powerActivatedListeners.add(cb);
    return () => this.powerActivatedListeners.delete(cb);
  };

  /* ═══════════════ Cleanup ═══════════════ */

  destroy() {
    this.destroyed = true;
    this.stopTimer();
    if (this.botHandle) clearTimeout(this.botHandle);
    if (this.dealHandle) {
      clearTimeout(this.dealHandle);
      this.dealHandle = null;
    }
    this.stateListeners.clear();
    this.playCardListeners.clear();
    this.trickEndListeners.clear();
    this.roundEndListeners.clear();
    this.timerListeners.clear();
    this.powerActivatedListeners.clear();
  }
}
