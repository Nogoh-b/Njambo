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
import { canActivatePower } from "@/engine/power/canActivate";
import { interpretPowerScript } from "@/engine/power/interpret";
import { applyResolvedOps } from "@/engine/power/apply";
import { findBlockingEffect } from "@/engine/power/blocking";
import { resolveTargets } from "@/engine/power/targets";
import { PowerRuntimeState } from "@/engine/power/runtimeState";
import {
  applyTrickPowerRewards,
  consumeNextCardModifiers,
} from "@/engine/power/rewards";
import type { PowerChoices, PowerResolved, PowerStateAdapter } from "@/engine/power";
import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import { powerScriptOf } from "@/config/powers";
import { DEV } from "@/config/devConfig";
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
  SyncStatus,
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
  /** Restrictions de jeu, timers gelés et pénalités différées (moteur partagé). */
  private powerRuntime = new PowerRuntimeState();
  private botPowerUsed = new Set<number>();

  /** Port du moteur générique vers l'état local (tout est indexé par seat = idx). */
  private buildAdapter(): PowerStateAdapter {
    return {
      maxCardValue: this.opts.cfg.ranks.max,
      getState: () => this.buildGameState(),
      getDeck: () => this.deck,
      setDeck: (deck) => {
        this.deck = deck;
      },
      setHand: (seat, hand) => {
        const ps = this.players.map((p) => ({ ...p }));
        if (ps[seat]) ps[seat].hand = hand;
        this.players = ps;
      },
      addPot: (amount) => {
        this.pot += amount;
      },
      multiplyPot: (factor) => {
        this.pot *= factor;
      },
      pushEffect: (effect) => {
        this.activePowerEffects.push(effect);
      },
      takeEffect: (pred) => {
        const found = this.activePowerEffects.find(pred);
        if (found) {
          this.activePowerEffects = this.activePowerEffects.filter((e) => e !== found);
        }
        return found;
      },
      freezeTimer: (seat, untilMs) => this.powerRuntime.freeze(seat, untilMs),
      applyTimerDelta: (seat, seconds) => this.applyTimerDelta(seat, seconds),
      addPendingTimerPenalty: (seat, seconds) => this.powerRuntime.addTimerPenalty(seat, seconds),
      setPlayRestriction: (seat, restriction) => this.powerRuntime.setRestriction(seat, restriction),
    };
  }

  private adapter: PowerStateAdapter | null = null;

  private getAdapter(): PowerStateAdapter {
    if (!this.adapter) this.adapter = this.buildAdapter();
    return this.adapter;
  }

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
  private syncStatusListeners = new Set<(status: SyncStatus) => void>();
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
    this.powerRuntime.reset();
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
      this.startTurnSeconds();
      this.emitState();
      this.startTimer();
      this.scheduleBotTurn();
    }, dealTime);
  }

  /* ── Interface GameSyncActions.playCard ── */
  playCard = (cardIdx: number) => {
    if (this.phase !== "turns" || this.turnIdx !== 0) return; // seul le joueur humain appelle ça directement
    // Restriction de jeu (Coupe-Circuit, Filet…) : la carte imposée remplace le choix
    const led = this.trickPlays[0]?.card.suit ?? null;
    const forcedIdx = this.powerRuntime.resolveForcedPlay(0, this.players[0].hand, led);
    if (forcedIdx !== null) {
      this.executePlay(0, forcedIdx);
      return;
    }
    this.executePlay(0, cardIdx);
  };

  /* ── Interface GameSyncActions.usePowerCard ── */
  usePowerCard = (cardId: PowerCardId, targetIdx?: number, choices?: PowerChoices) => {
    if (this.phase !== "turns") return;

    const me = this.players[0];
    if (!me) return;

    // Vérifier que la carte est équipée
    const equipped = me.equippedPowers ?? [];
    if (!equipped.includes(cardId)) return;

    // Vérifier qu'elle n'est pas déjà utilisée (bypass en dev : usage illimité)
    const activations = me.powerActivations ?? [];
    if (!DEV.unlimitedPowers && activations.some((a) => a.cardId === cardId && a.used)) return;

    this.activatePower(cardId, 0, targetIdx, choices);
  };

  /**
   * Chemin d'activation COMMUN humain/bot, entièrement générique :
   * ciblage → validation → interception (bouclier/masque) → interprétation
   * du script → application des ops. La carte n'est pas consommée si le
   * script n'a aucun effet concret (resolved.impact === false).
   */
  private activatePower(
    cardId: PowerCardId,
    activatedBy: number,
    requestedTarget?: number,
    choices?: PowerChoices,
  ): boolean {
    const script = powerScriptOf(cardId);
    const targets = resolveTargets(script.target, {
      activatedBy,
      playerCount: this.players.length,
      requested: requestedTarget,
    });
    const ctx = {
      state: this.buildGameState(),
      activatedBy,
      targets,
      deck: this.deck,
      maxValue: this.opts.cfg.ranks.max,
      choices,
    };

    if (canActivatePower(script, ctx)) return false;

    // Interception : un effet actif de la cible (bouclier, masque…) contre ce script
    let blockedByCardId: PowerCardId | undefined;
    if (targets.length > 0) {
      const blocker = findBlockingEffect(script, targets[0], this.activePowerEffects);
      if (blocker) {
        this.activePowerEffects = this.activePowerEffects.filter((e) => e !== blocker);
        blockedByCardId = blocker.cardId;
      }
    }

    let used = true;
    let resolved: PowerResolved | undefined;
    if (!blockedByCardId) {
      const outcome = interpretPowerScript(script, ctx);
      resolved = outcome.resolved;
      if (outcome.resolved.impact) {
        const def = POWER_CARDS_BY_ID[cardId];
        if (def) {
          this.opts.onBanner(`${def.name} !`);
          setTimeout(() => this.opts.onBanner(""), 2000);
        }
        applyResolvedOps(
          outcome.plan,
          { cardId, activatedBy, trickNo: this.trickNo },
          this.getAdapter(),
        );
      } else {
        // Sans effet réel (ex: Marché de Nuit sans carte plus forte dans la
        // pioche) → la carte n'est PAS consommée, on informe juste le joueur.
        used = false;
        if (activatedBy === 0) {
          this.opts.onBanner(`${POWER_CARDS_BY_ID[cardId]?.name ?? "Pouvoir"} — aucun effet, carte non consommée`);
          setTimeout(() => this.opts.onBanner(""), 2000);
        }
      }
    }

    // Bloquée = consommée quand même (elle a été contrée)
    const consumed = blockedByCardId ? true : used;
    const uidOf = (seat: number) => (seat === 0 ? "local" : `bot-${seat}`);
    const activation: PowerCardActivation = {
      cardId,
      activatedByUid: uidOf(activatedBy),
      targetUid: targets[0] !== undefined ? uidOf(targets[0]) : undefined,
      trickNo: this.trickNo,
      used: consumed,
      playId: `local-${Date.now()}-${Math.random()}`,
      blockedByCardId,
      consumedCardIds: consumed ? [cardId] : [],
      resolved,
      scriptVersion: 1,
    };

    const ps = this.players.map((p) => ({ ...p }));
    if (!ps[activatedBy].powerActivations) ps[activatedBy].powerActivations = [];
    ps[activatedBy].powerActivations!.push(activation);
    this.players = ps;

    this.powerActivatedListeners.forEach((cb) => cb(activation));
    this.emitState();
    return true;
  }

  private executePlay(playerIdx: number, cardIdx: number) {
    if (this.phase !== "turns" || this.turnIdx !== playerIdx) return;
    const led = this.trickPlays[0]?.card.suit ?? null;
    const legal = legalCards(this.players[playerIdx].hand, led);
    if (!legal.includes(cardIdx)) return;

    let restrictedIdx = this.powerRuntime.resolvePlay(
      playerIdx,
      this.players[playerIdx].hand,
      led,
      cardIdx,
    );
    if (restrictedIdx === null && !this.players[playerIdx].isYou) {
      for (const alternative of legal) {
        if (alternative === cardIdx) continue;
        restrictedIdx = this.powerRuntime.resolvePlay(
          playerIdx,
          this.players[playerIdx].hand,
          led,
          alternative,
        );
        if (restrictedIdx !== null) break;
      }
    }
    if (restrictedIdx === null) {
      this.opts.onBanner("Cette carte est bloquée — choisis-en une autre.");
      setTimeout(() => this.opts.onBanner(""), 1600);
      return;
    }
    cardIdx = restrictedIdx;

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
    // Modificateurs « prochaine carte » (Éclair, Pagne Changeant) — helper partagé
    const modifiers = consumeNextCardModifiers(
      this.activePowerEffects,
      playerIdx,
      removed,
      this.trickPlays[0]?.card.suit ?? null,
      this.opts.cfg.ranks.max,
    );
    this.activePowerEffects = modifiers.effects;
    const resolvedCard = modifiers.card;
    const card: DepositedCard = { ...resolvedCard, ...drop };
    ps[playerIdx].deposit.push(card);
    this.trickPlays = [...this.trickPlays, { playerIdx, card: { ...resolvedCard } }];
    this.players = ps;

    if (this.trickPlays.length === ps.length) {
      const led = this.trickPlays[0].card.suit;
      const win = trickWinner(this.trickPlays, led);
      const rewards = applyTrickPowerRewards(this.activePowerEffects, this.trickNo, win, this.pot);
      this.pot = rewards.pot;
      this.activePowerEffects = rewards.effects;
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
          this.startTurnSeconds();
          this.emitState();
          this.startTimer();
          this.scheduleBotTurn();
        }
      }, this.opts.cfg.anim.trickPause);
    } else {
      this.turnIdx = (playerIdx + 1) % ps.length;
      this.startTurnSeconds();
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

  /** Secondes de départ d'un tour = turnSeconds moins une éventuelle pénalité
      différée (Cri du Chef), consommée une seule fois. */
  private startTurnSeconds() {
    this.seconds = this.powerRuntime.consumeTimerPenalty(this.turnIdx, this.opts.cfg.turnSeconds);
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
    let youRefund = 0;
    final.forEach((p, i) => {
      if (i === winnerIdx) return;
      const refund = this.activePowerEffects.find((effect) => effect.activatedBy === i && effect.refundOnLoss)?.refundOnLoss;
      if (refund) {
        const amount = Math.round(this.opts.mise * refund);
        p.balance += amount;
        if (p.isYou) youRefund = amount;
      }
    });
    this.players = final;
    this.phase = "result";
    this.pot = 0;
    this.activePowerEffects = []; // Nettoyer après résolution
    // Le remboursement reste purement local : cet adaptateur ne sert qu'à
    // l'entraînement invité et ne peut jamais écrire l'économie serveur.
    this.result = { ...info, winner: final[winnerIdx], gain: potNow, playersCount: ps.length, refund: youRefund || undefined };

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
    // Dev : temps illimité → on n'arme pas le décompte (aucun timeout).
    if (DEV.unlimitedTime) {
      this.timerListeners.forEach((cb) => cb(this.seconds));
      return;
    }
    this.timerHandle = setInterval(() => {
      if (this.powerRuntime.isFrozen(this.turnIdx)) {
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

  /** @returns true si un pouvoir a été activé (→ lui donner un beat avant le coup). */
  private maybeUseBotPower(): boolean {
    const botIdx = this.turnIdx;
    const difficulty = this.opts.difficulty ?? "normal";
    if (difficulty === "easy" || botIdx <= 0 || this.botPowerUsed.has(botIdx)) return false;
    const chance = difficulty === "hard" ? 0.72 : 0.36;
    if (Math.random() > chance) return false;

    const powers = this.players[botIdx]?.equippedPowers ?? [];
    const cardId = powers.find((id) => !(this.players[botIdx].powerActivations ?? []).some((a) => a.cardId === id && a.used));
    if (!cardId) return false;

    // Cible : si le script attend un choix de l'activateur, le bot tire un
    // adversaire au hasard (l'humain n'est plus systématiquement visé).
    const script = powerScriptOf(cardId);
    let targetIdx: number | undefined;
    if (script.target.count !== "none" && script.target.chooser !== "engine") {
      const opponents = this.players.map((_, i) => i).filter((i) => i !== botIdx);
      targetIdx = opponents[Math.floor(Math.random() * opponents.length)];
    }

    const activated = this.activatePower(cardId, botIdx, targetIdx);
    if (activated) this.botPowerUsed.add(botIdx);
    return activated;
  }

  private scheduleBotTurn() {
    if (this.botHandle) clearTimeout(this.botHandle);
    const p = this.players[this.turnIdx];
    if (!p || p.isYou || this.phase !== "turns") return;

    this.botHandle = setTimeout(() => {
      const seatIdx = this.turnIdx;
      if (this.phase !== "turns" || this.players[seatIdx] !== p) return;

      // Le bot tente d'abord son pouvoir. Si activé, on laisse le FX/overlay
      // RESPIRER (powerBeat) avant que sa carte ne parte — sinon tout se superpose.
      const usedPower = this.maybeUseBotPower();

      // Choix + jeu de la carte, calculés APRÈS le pouvoir (état à jour). On
      // garde l'index numérique du siège : les effets pouvoir recréent les
      // objets `players`, la référence `p` peut devenir obsolète.
      const doPlay = () => {
        if (this.phase !== "turns" || this.turnIdx !== seatIdx) return;
        const led = this.trickPlays[0]?.card.suit ?? null;
        const best = this.trickPlays.length
          ? Math.max(0, ...this.trickPlays.filter((x) => x.card.suit === led).map((x) => x.card.value))
          : null;
        const idx = botChooseCard(
          this.players[seatIdx].hand,
          led,
          this.trickNo >= this.opts.cfg.cardsPerPlayer,
          best,
          {
            difficulty: this.opts.difficulty ?? "normal",
            // toutes les cartes déjà jouées ce round (dépôts) = mémoire du bot
            seen: this.players.flatMap((pl) => pl.deposit),
          },
        );
        this.executePlay(seatIdx, idx);
      };

      if (usedPower) {
        this.botHandle = setTimeout(doPlay, this.opts.cfg.anim.powerBeat);
      } else {
        doPlay();
      }
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

  onSyncStatus = (cb: (status: SyncStatus) => void): Unsubscribe => {
    this.syncStatusListeners.add(cb);
    cb({ state: "live", updatedAt: Date.now() });
    return () => this.syncStatusListeners.delete(cb);
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
    this.syncStatusListeners.clear();
    this.powerActivatedListeners.clear();
  }
}
