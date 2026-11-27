/* ═══════════════ Académie : table d'une scène ═══════════════
   Joue une scène coup par coup avec les règles du jeu (engine/rules.ts) et le
   moteur des cartes Pouvoir, par le même chemin que LocalGameSync : ciblage →
   validation → interception (bouclier, masque) → interprétation → application.
   Sans chrono, sans mise, sans Énergie, sans serveur. PUR et synchrone : le
   rythme (pauses, réflexion des bots) est donné par sync/AcademyGameSync.ts. */

import { GAME_CONFIG } from "../../config/gameConfig";
import { POWER_CARDS_BY_ID } from "../../config/powerCards";
import { powerScriptOf } from "../../config/powers";
import { buildDeck } from "../deck";
import { depositToss } from "../depositToss";
import { lastCardDoubles, legalCards, trickWinner } from "../rules";
import type { PowerStateAdapter } from "../power/adapter";
import { applyResolvedOps } from "../power/apply";
import { findBlockingEffect } from "../power/blocking";
import { bluffHand, isBluff } from "../power/bluff";
import { canActivatePower } from "../power/canActivate";
import { interpretPowerScript } from "../power/interpret";
import { applyTrickPowerRewards, consumeNextCardModifiers } from "../power/rewards";
import { PowerRuntimeState } from "../power/runtimeState";
import { resolveTargets } from "../power/targets";
import type { PowerChoices, PowerResolved, PowerScript } from "../power/types";
import type { ActivePowerEffect, Card, GameConfig, GameState, Phase, Player, PowerCardActivation, PowerCardId, TrickPlay } from "../../types/game";
import type { AcademyScene, CardCode, CoachKey, SceneOutcome, YourExpectation } from "./types";

/** Ce que la scène attend maintenant. */
export type AcademyStep =
  /** Coup joué par la scène elle-même (bot, ou joueur dans un rejeu à regarder). */
  | { kind: "auto"; seat: number }
  /** Coup du joueur. */
  | { kind: "you"; expect: YourExpectation }
  /** Pli complet, encore affiché : à fermer après la pause de lecture. */
  | { kind: "closeTrick"; winnerIdx: number }
  | { kind: "end"; outcome: SceneOutcome };

export interface AcademyPlay {
  playerIdx: number;
  cardIdx: number;
  /** Carte telle qu'elle était en main (avant les bonus « prochaine carte »). */
  card: Card;
}

export type AcademyEvent =
  | { type: "play"; play: AcademyPlay; coach?: CoachKey }
  | { type: "power"; seat: number; activation: PowerCardActivation; secret: boolean; coach?: CoachKey };

export type RefusalReason =
  | "notNow" | "illegal" | "locked" | "wrongCard" | "powerFirst"
  | "unexpectedPower" | "wrongPower" | "wrongTarget" | "wrongChoice" | "powerRefused";

export interface Refusal {
  ok: false;
  reason: RefusalReason;
  /** Réplique du coach prévue par la scène pour ce refus. */
  coach?: CoachKey;
  /** Message du moteur (refus d'activation d'un pouvoir). */
  message?: string;
}

export interface RoundEnd {
  winnerIdx: number;
  doubles: boolean;
  lastCard: Card;
}

export interface AcademyTableOptions {
  /** Nom, avatar et solde du joueur (siège 0) ; défaut : ceux de la scène. */
  you?: { name: string; emoji: string; balance: number };
}

/** Erreur d'écriture d'une scène (relevée par validateScene). */
export class AcademySceneError extends Error {}

const fail = (message: string): never => {
  throw new AcademySceneError(message);
};

const uidOf = (seat: number) => (seat === 0 ? "local" : `bot-${seat}`);

export class AcademyTable {
  readonly scene: AcademyScene;
  readonly cfg: GameConfig;
  private players: Player[];
  private phase: Phase = "turns";
  private trickNo = 1;
  private leader: number;
  private turnIdx: number;
  private trickPlays: TrickPlay[] = [];
  private dominantIdx: number | null = null;
  private pot = 0;
  private deck: Card[];
  private effects: ActivePowerEffect[] = [];
  private runtime = new PowerRuntimeState();
  private cursor = 0;
  private activationCount = 0;
  private lastWinner: number | null = null;
  private roundEndInfo: RoundEnd | null = null;
  private result: SceneOutcome | null = null;

  constructor(scene: AcademyScene, cfg: GameConfig = GAME_CONFIG, options: AcademyTableOptions = {}) {
    this.scene = scene;
    this.cfg = cfg;
    const byCode = new Map(buildDeck(cfg).map((card) => [card.id, card]));
    const cardOf = (code: CardCode) => byCode.get(code) ?? fail(`Carte inconnue : ${code}`);
    this.players = scene.seats.map((seat, index) => ({
      name: index === 0 && options.you ? options.you.name : seat.name,
      emoji: index === 0 && options.you ? options.you.emoji : seat.emoji,
      isYou: index === 0,
      balance: index === 0 && options.you ? options.you.balance : cfg.startingBalance,
      hand: (scene.deal[index] ?? []).map(cardOf),
      deposit: [],
      equippedPowers: scene.equipped?.[index] ?? [],
      powerActivations: [],
    }));
    const dealt = new Set(scene.deal.flat());
    const top = (scene.deckTop ?? []).map(cardOf);
    const topIds = new Set(top.map((card) => card.id));
    this.deck = [...top, ...[...byCode.values()].filter((card) => !dealt.has(card.id) && !topIds.has(card.id))];
    this.leader = scene.firstLeader;
    this.turnIdx = scene.firstLeader;

    // Plis déjà joués : mêmes règles qu'en jeu (couleur suivie, le vainqueur lance le suivant).
    for (const trick of scene.history ?? []) {
      if (trick.length !== this.players.length) fail(`Pli ${this.trickNo} de l'historique : ${trick.length} cartes pour ${this.players.length} joueurs.`);
      for (const code of trick) {
        const index = this.indexOf(this.turnIdx, code);
        if (!legalCards(this.players[this.turnIdx].hand, this.ledSuit()).includes(index)) {
          fail(`Pli ${this.trickNo} de l'historique : ${this.players[this.turnIdx].name} ne peut pas jouer ${code} (couleur à suivre).`);
        }
        this.commit(this.turnIdx, index);
      }
      this.closeTrick();
    }
    if (this.trickNo > cfg.cardsPerPlayer) fail("L'historique joue toute la manche : plus aucune carte en main.");
  }

  /* ═══════════════ Lecture ═══════════════ */

  /** Coup attendu maintenant. Lève une AcademySceneError si la scène est mal écrite. */
  next(): AcademyStep {
    if (this.result) return { kind: "end", outcome: this.result };
    if (this.phase === "trickEnd") return { kind: "closeTrick", winnerIdx: this.dominantIdx ?? fail("Pli sans vainqueur.") };
    const action = this.scene.actions[this.cursor];
    if (!action) return fail(this.trickPlays.length ? "La scène s'arrête au milieu d'un pli." : "La scène n'a aucun coup.");
    if (action.seat !== this.turnIdx) {
      fail(`Coup ${this.cursor + 1} : c'est à ${this.players[this.turnIdx].name} de jouer, pas à ${this.players[action.seat]?.name ?? `siège ${action.seat}`}.`);
    }
    if (action.seat !== 0 || this.scene.goal === "watch") {
      if ("free" in action) fail(`Coup ${this.cursor + 1} : un coup libre ne peut pas être joué automatiquement.`);
      return { kind: "auto", seat: action.seat };
    }
    if ("power" in action) return { kind: "you", expect: { kind: "power", power: action.power, target: action.target, choose: action.choose, coach: action.coach } };
    if ("free" in action) return { kind: "you", expect: { kind: "free", solution: action.solution, coach: action.coach } };
    if ("card" in action) return { kind: "you", expect: { kind: "card", card: action.card, coach: action.coach } };
    return fail(`Coup ${this.cursor + 1} : une règle de bot ne s'applique pas au joueur.`);
  }

  get outcome(): SceneOutcome | null { return this.result; }
  get roundEnd(): RoundEnd | null { return this.roundEndInfo; }
  /** Index du coup courant dans scene.actions. */
  get actionIndex(): number { return this.cursor; }

  /** Cartes que le joueur peut légalement poser maintenant. */
  legalForYou(): CardCode[] {
    const hand = this.players[0].hand;
    return legalCards(hand, this.ledSuit()).map((index) => hand[index].id);
  }

  indexOf(seat: number, code: CardCode): number {
    const index = this.players[seat]?.hand.findIndex((card) => card.id === code) ?? -1;
    return index >= 0 ? index : fail(`${this.players[seat]?.name ?? `Siège ${seat}`} n'a pas ${code} en main.`);
  }

  /** État de la table au format du jeu (même forme que LocalGameSync). */
  state(): GameState {
    return {
      turnStartSeconds: this.cfg.turnSeconds,
      unlimitedTurns: true,
      series: { round: 1, total: 1, scores: this.players.map(() => 0) },
      phase: this.phase,
      trickNo: this.trickNo,
      trickPlays: [...this.trickPlays],
      leaderIdx: this.leader,
      turnIdx: this.turnIdx,
      pot: this.pot,
      dominantIdx: this.dominantIdx,
      banner: "",
      activePowerEffects: [...this.effects],
      players: this.players.map((player) => ({ ...player, hand: [...player.hand], deposit: [...player.deposit] })),
    };
  }

  /* ═══════════════ Coups ═══════════════ */

  /** Joue le coup automatique courant (bot, ou rejeu). */
  stepAuto(): AcademyEvent {
    const step = this.next();
    if (step.kind !== "auto") return fail("Aucun coup automatique attendu.");
    const action = this.scene.actions[this.cursor];
    const seat = action.seat;
    if ("power" in action) {
      const outcome = this.activate(action.power, seat, action.target, action.choose);
      if (!outcome.ok) return fail(`${this.players[seat].name} ne peut pas activer ${action.power} : ${outcome.message}`);
      this.cursor += 1;
      return { type: "power", seat, activation: outcome.activation, secret: outcome.secret, coach: action.coach?.after };
    }
    const hand = this.players[seat].hand;
    const led = this.ledSuit();
    const legal = legalCards(hand, led);
    const wanted = "card" in action ? this.indexOf(seat, action.card) : "rule" in action ? this.pickByRule(seat, action.rule) : -1;
    if (!legal.includes(wanted)) fail(`${this.players[seat].name} ne peut pas jouer ${hand[wanted]?.id ?? "?"} : il faut suivre ${led}.`);
    // Restrictions des pouvoirs (Coupe-Circuit, Sceau…) : comme un bot du jeu, il bascule sur une carte permise.
    let index = this.runtime.resolvePlay(seat, hand, led, wanted);
    for (const alternative of legal) {
      if (index !== null) break;
      if (alternative !== wanted) index = this.runtime.resolvePlay(seat, hand, led, alternative);
    }
    if (index === null) return fail(`${this.players[seat].name} n'a aucune carte permise.`);
    const play = this.commit(seat, index);
    this.cursor += 1;
    return { type: "play", play, coach: action.coach?.after };
  }

  /** Le joueur touche une carte de sa main. */
  playYou(cardIdx: number): { ok: true; event: AcademyEvent } | Refusal {
    const step = this.safeNext();
    if (step?.kind !== "you") return { ok: false, reason: "notNow" };
    const { expect } = step;
    const hand = this.players[0].hand;
    const led = this.ledSuit();
    const card = hand[cardIdx];
    if (!card || !legalCards(hand, led).includes(cardIdx)) return { ok: false, reason: "illegal" };
    const wrongCoach = expect.coach?.wrong?.[card.id] ?? expect.coach?.wrong?.default;
    if (expect.kind === "power") return { ok: false, reason: "powerFirst", coach: wrongCoach };

    // Restriction en cours : aperçu sur une copie, pour refuser une mauvaise carte sans consommer l'effet.
    const preview = PowerRuntimeState.fromJSON(this.runtime.toJSON()).resolvePlay(0, hand, led, cardIdx);
    if (preview === null) return { ok: false, reason: "locked", coach: wrongCoach };
    if (expect.kind === "card" && hand[preview].id !== expect.card) return { ok: false, reason: "wrongCard", coach: wrongCoach };

    const index = this.runtime.resolvePlay(0, hand, led, cardIdx) ?? preview;
    const play = this.commit(0, index);
    this.cursor += 1;
    return { ok: true, event: { type: "play", play, coach: expect.coach?.after } };
  }

  /** Le joueur active une carte Pouvoir. `choices` vient de l'écran de choix ; seules les cartes comptent. */
  useYourPower(cardId: PowerCardId, target?: number, choices?: PowerChoices): { ok: true; event: AcademyEvent } | Refusal {
    const step = this.safeNext();
    if (step?.kind !== "you") return { ok: false, reason: "notNow" };
    const { expect } = step;
    const wrong = expect.coach?.wrong;
    if (expect.kind !== "power") return { ok: false, reason: "unexpectedPower", coach: wrong?.power ?? wrong?.default };
    if (cardId !== expect.power) return { ok: false, reason: "wrongPower", coach: wrong?.power ?? wrong?.default };
    if (expect.target !== undefined && target !== expect.target) return { ok: false, reason: "wrongTarget", coach: wrong?.target ?? wrong?.default };
    for (const [choiceId, codes] of Object.entries(expect.choose ?? {})) {
      const picked = [choices?.[choiceId] ?? []].flat().map((choice) => choice.cardId).sort();
      if (picked.join("|") !== [...codes].sort().join("|")) return { ok: false, reason: "wrongChoice", coach: wrong?.choice ?? wrong?.default };
    }
    const outcome = this.activate(cardId, 0, target, expect.choose);
    if (!outcome.ok) return { ok: false, reason: "powerRefused", message: outcome.message };
    this.cursor += 1;
    return { ok: true, event: { type: "power", seat: 0, activation: outcome.activation, secret: outcome.secret, coach: expect.coach?.after } };
  }

  /** Ferme le pli affiché : le vainqueur lance le suivant ; au 5e pli, la manche est finie. */
  closeTrick(): { winnerIdx: number; roundEnd: RoundEnd | null } {
    if (this.phase !== "trickEnd" || this.dominantIdx === null) return fail("Aucun pli à fermer.");
    const winnerIdx = this.dominantIdx;
    this.lastWinner = winnerIdx;
    if (this.trickNo >= this.cfg.cardsPerPlayer) {
      // Manche finie : le dernier pli reste affiché, couronné.
      const lastCard = this.trickPlays.find((play) => play.playerIdx === winnerIdx)!.card;
      this.roundEndInfo = { winnerIdx, doubles: lastCardDoubles(lastCard, this.cfg), lastCard };
      this.result = this.evaluate();
      return { winnerIdx, roundEnd: this.roundEndInfo };
    }
    this.trickNo += 1;
    this.trickPlays = [];
    this.dominantIdx = null;
    this.leader = winnerIdx;
    this.turnIdx = winnerIdx;
    this.phase = "turns";
    if (this.cursor >= this.scene.actions.length) this.result = this.evaluate();
    return { winnerIdx, roundEnd: null };
  }

  /* ═══════════════ Interne ═══════════════ */

  private safeNext(): AcademyStep | null {
    try {
      return this.next();
    } catch {
      return null;
    }
  }

  private evaluate(): SceneOutcome {
    if (this.scene.goal === "watch") return "done";
    if (this.scene.goal === "winRound") return this.roundEndInfo?.winnerIdx === 0 ? "success" : "failure";
    return this.lastWinner === 0 ? "success" : "failure";
  }

  private ledSuit(): string | null {
    return this.trickPlays[0]?.card.suit ?? null;
  }

  private pickByRule(seat: number, rule: "lowest" | "highest" | "smart"): number {
    const hand = this.players[seat].hand;
    const led = this.ledSuit();
    const byValue = [...legalCards(hand, led)].sort((a, b) => hand[a].value - hand[b].value);
    if (rule === "highest") return byValue[byValue.length - 1];
    if (rule === "lowest" || !led) return byValue[0];
    const best = Math.max(0, ...this.trickPlays
      .filter((play) => (play.card.effectiveSuit ?? play.card.suit) === led)
      .map((play) => play.card.effectiveValue ?? play.card.value));
    return byValue.find((index) => hand[index].suit === led && hand[index].value > best) ?? byValue[0];
  }

  /** Pose une carte : même enchaînement que LocalGameSync.commitPlay. */
  private commit(seat: number, cardIdx: number): AcademyPlay {
    const players = this.players.map((player) => ({ ...player, hand: [...player.hand], deposit: [...player.deposit] }));
    const [card] = players[seat].hand.splice(cardIdx, 1);
    // Modificateurs « prochaine carte » (Éclair, Pagne Changeant).
    const modifiers = consumeNextCardModifiers(this.effects, seat, card, this.ledSuit(), this.cfg.ranks.max);
    this.effects = modifiers.effects;
    players[seat].deposit.push({ ...modifiers.card, ...depositToss(card.id) });
    this.trickPlays = [...this.trickPlays, { playerIdx: seat, card: { ...modifiers.card } }];
    this.players = players;
    const led = this.trickPlays[0].card.suit;
    this.dominantIdx = trickWinner(this.trickPlays, led);
    if (this.trickPlays.length === players.length) {
      const rewards = applyTrickPowerRewards(this.effects, this.trickNo, this.dominantIdx, this.pot, this.trickNo >= this.cfg.cardsPerPlayer);
      this.pot = rewards.pot;
      this.effects = rewards.effects;
      this.phase = "trickEnd";
    } else {
      this.turnIdx = (seat + 1) % players.length;
    }
    return { playerIdx: seat, cardIdx, card };
  }

  /** Choix de cartes d'un script, depuis les cartes nommées par la scène. */
  private choicesFor(script: PowerScript, seat: number, choose: Record<string, CardCode[]> | undefined): PowerChoices | undefined {
    if (!choose) return undefined;
    const choices: PowerChoices = {};
    for (const [choiceId, codes] of Object.entries(choose)) {
      const request = script.steps.find((step) => step.choice?.id === choiceId)?.choice;
      if (!request) return fail(`${script.id} n'a pas d'étape de choix « ${choiceId} ».`);
      const picks = codes.map((code) => ({ cardId: code, cardIdx: this.indexOf(seat, code) }));
      choices[choiceId] = request.count || picks.length > 1 ? picks : picks[0];
    }
    return choices;
  }

  /** Activation d'un pouvoir : même chemin que LocalGameSync.activatePower. */
  private activate(cardId: PowerCardId, seat: number, requestedTarget: number | undefined, choose: Record<string, CardCode[]> | undefined):
    { ok: true; activation: PowerCardActivation; secret: boolean } | { ok: false; message: string } {
    const def = POWER_CARDS_BY_ID[cardId];
    if (!def) return { ok: false, message: "Carte inconnue." };
    if (def.disabled) return { ok: false, message: "Cette carte est temporairement désactivée." };
    if (!(this.players[seat].equippedPowers ?? []).includes(cardId)) return { ok: false, message: "Carte non équipée." };
    const script = powerScriptOf(cardId);
    const targets = resolveTargets(script.target, { activatedBy: seat, playerCount: this.players.length, requested: requestedTarget });
    const choices = this.choicesFor(script, seat, choose);
    const ctx = { state: this.state(), activatedBy: seat, targets, deck: this.deck, maxValue: this.cfg.ranks.max, choices };
    const refusal = canActivatePower(script, ctx);
    if (refusal) return { ok: false, message: refusal };

    // Interception : bouclier ou masque de la cible.
    let blockedByCardId: PowerCardId | undefined;
    let bluffedByCardId: PowerCardId | undefined;
    if (targets.length > 0) {
      const blocker = findBlockingEffect(script, targets[0], this.effects);
      if (blocker) {
        this.effects = this.effects.filter((effect) => effect !== blocker);
        if (isBluff(blocker, script)) bluffedByCardId = blocker.cardId;
        else blockedByCardId = blocker.cardId;
      }
    }

    let used = true;
    let resolved: PowerResolved | undefined;
    let revealedHand: Card[] | undefined;
    if (!blockedByCardId) {
      const outcome = interpretPowerScript(script, ctx);
      resolved = outcome.resolved;
      if (bluffedByCardId) {
        // Scène reproductible : la fausse main n'est pas mélangée.
        revealedHand = bluffHand(ctx.state, seat, targets[0], <T>(cards: T[]) => cards);
      } else if (outcome.resolved.impact) {
        applyResolvedOps(outcome.plan, { cardId, activatedBy: seat, trickNo: this.trickNo }, this.adapter());
      } else {
        used = false;
      }
    }

    const consumed = blockedByCardId ? true : used;
    this.activationCount += 1;
    const activation: PowerCardActivation = {
      cardId,
      activatedByUid: uidOf(seat),
      targetUid: targets[0] !== undefined ? uidOf(targets[0]) : undefined,
      trickNo: this.trickNo,
      used: consumed,
      playId: `academy-${this.scene.id}-${this.activationCount}`,
      blockedByCardId,
      bluffedByCardId: seat === 0 ? undefined : bluffedByCardId,
      consumedCardIds: consumed ? [cardId] : [],
      resolved,
      scriptVersion: 1,
      ...(choices ? { choices } : {}),
      ...(revealedHand ? { revealedHand } : {}),
    };
    this.players = this.players.map((player, index) => (index === seat
      ? { ...player, powerActivations: [...(player.powerActivations ?? []), activation] }
      : player));
    return { ok: true, activation, secret: Boolean(script.secret && seat !== 0) };
  }

  /** Port du moteur de pouvoirs vers cette table. Pas de chrono : les effets de minuteur sont sans objet. */
  private adapter(): PowerStateAdapter {
    return {
      maxCardValue: this.cfg.ranks.max,
      getState: () => this.state(),
      getDeck: () => this.deck,
      setDeck: (deck) => { this.deck = deck; },
      setHand: (seat, hand) => {
        this.players = this.players.map((player, index) => (index === seat ? { ...player, hand } : player));
      },
      addPot: (amount) => { this.pot += amount; },
      multiplyPot: (factor) => { this.pot *= factor; },
      pushEffect: (effect) => { this.effects = [...this.effects, effect]; },
      takeEffect: (pred) => {
        const found = this.effects.find(pred);
        if (found) this.effects = this.effects.filter((effect) => effect !== found);
        return found;
      },
      freezeTimer: () => {},
      applyTimerDelta: () => {},
      addPendingTimerPenalty: () => {},
      setPlayRestriction: (seat, restriction) => this.runtime.setRestriction(seat, restriction),
    };
  }
}
