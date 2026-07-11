import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import { legalCards } from "@/engine/rules";
import type { Card, GameState, PowerCardId } from "@/types/game";

export interface PowerActivationContext {
  state: GameState;
  activatedBy: number;
  target?: number;
  deck?: Card[];
  maxValue?: number;
}

export const REVEAL_DURATION_MS = 5000;
export const RECOMMEND_DURATION_MS = 6000;
export const FREEZE_DURATION_MS = 10000;
export const STAR_RAIN_BONUS = 200;
export const CAMPFIRE_BONUS = 100;
export const TIMER_BOOST_SECONDS = 8;
export const CHIEF_CRY_SECONDS = 3;
export const LIGHTNING_BONUS = 2;

export interface PowerEffectResult {
  handsMutated?: Record<number, Card[]>;
  revealHand?: { playerIdx: number; durationMs: number };
  forceLowestCard?: { playerIdx: number };
  trickScoreMultiplier?: number;
  potBonus?: number;
  conditionalPotBonus?: number;
  timerFreeze?: { playerIdx: number; durationMs: number };
  timerDelta?: { playerIdx: number; seconds: number };
  opponentTimerDelta?: { seconds: number };
  newDeck?: Card[];
  shield?: { playerIdx: number };
  refundOnLoss?: { playerIdx: number; ratio: number };
  recommendCard?: { playerIdx: number; cardIdx: number; durationMs: number };
  valueBonusNext?: { playerIdx: number; amount: number; maxValue: number };
  preventDoublePenalty?: { playerIdx: number };
  cancelReveal?: { playerIdx: number };
  suitOverrideNext?: { playerIdx: number };
}

function weakestCardIndex(hand: Card[]): number {
  return hand.reduce((minIdx, card, index) => (card.value < hand[minIdx].value ? index : minIdx), 0);
}

function bestRecommendation(state: GameState, playerIdx: number): number | null {
  const hand = state.players[playerIdx]?.hand ?? [];
  if (hand.length === 0) return null;
  const ledSuit = state.trickPlays[0]?.card.suit ?? null;
  const legal = legalCards(hand, ledSuit);
  if (legal.length === 0) return null;

  const currentBest = ledSuit
    ? Math.max(0, ...state.trickPlays.filter((play) => (play.card.effectiveSuit ?? play.card.suit) === ledSuit).map((play) => play.card.effectiveValue ?? play.card.value))
    : 0;
  const winning = legal
    .filter((index) => !ledSuit || hand[index].suit === ledSuit)
    .filter((index) => hand[index].value > currentBest)
    .sort((a, b) => hand[a].value - hand[b].value);
  if (winning[0] !== undefined) return winning[0];

  return [...legal].sort((a, b) => hand[a].value - hand[b].value)[0] ?? null;
}

function replaceWeakestWithDeckCard(
  hand: Card[],
  deck: Card[] | undefined,
  onlyBetter: boolean,
): { hand: Card[]; deck: Card[] } | null {
  if (hand.length === 0 || !deck?.length) return null;
  const weakestIdx = weakestCardIndex(hand);
  const weakest = hand[weakestIdx];
  const replacementIdx = onlyBetter ? deck.findIndex((card) => card.value > weakest.value) : 0;
  if (replacementIdx < 0) return null;
  const replacement = deck[replacementIdx];
  const nextDeck = deck.filter((_, index) => index !== replacementIdx);
  const nextHand = [...hand];
  nextHand[weakestIdx] = replacement;
  return { hand: nextHand, deck: [...nextDeck, weakest] };
}

export function applyPowerCard(
  cardId: PowerCardId,
  ctx: PowerActivationContext,
): PowerEffectResult {
  const { state, activatedBy, target, deck, maxValue = 10 } = ctx;
  const players = state.players;

  switch (cardId) {
    case "oeil_sorcier":
      return target === undefined || !players[target]
        ? {}
        : { revealHand: { playerIdx: target, durationMs: REVEAL_DURATION_MS } };

    case "coupe_circuit":
    case "filet_pecheur":
      return target === undefined || !players[target]
        ? {}
        : { forceLowestCard: { playerIdx: target } };

    case "benediction_chef":
      return { trickScoreMultiplier: 2 };

    case "pluie_etoiles":
      // Bonus au pot SEULEMENT si l'activateur remporte le pli (comme Feu de Camp),
      // conforme à la description « +200 au pot si tu remportes ce pli ».
      return { conditionalPotBonus: STAR_RAIN_BONUS };

    case "vent_nord": {
      const swap = replaceWeakestWithDeckCard(players[activatedBy]?.hand ?? [], deck, false);
      return swap ? { handsMutated: { [activatedBy]: swap.hand }, newDeck: swap.deck } : {};
    }

    case "sable_temps":
      return target === undefined || !players[target]
        ? {}
        : { timerFreeze: { playerIdx: target, durationMs: FREEZE_DURATION_MS } };

    case "bouclier_village":
      return { shield: { playerIdx: activatedBy } };

    case "tambour_appel":
      return { timerDelta: { playerIdx: activatedBy, seconds: TIMER_BOOST_SECONDS } };

    case "cauris_chanceux":
      return { refundOnLoss: { playerIdx: activatedBy, ratio: 0.5 } };

    case "main_griot": {
      const cardIdx = bestRecommendation(state, activatedBy);
      return cardIdx == null
        ? {}
        : { recommendCard: { playerIdx: activatedBy, cardIdx, durationMs: RECOMMEND_DURATION_MS } };
    }

    case "eclair_mfoundi":
      return { valueBonusNext: { playerIdx: activatedBy, amount: LIGHTNING_BONUS, maxValue } };

    case "totem_ancetres":
      return { preventDoublePenalty: { playerIdx: activatedBy } };

    case "masque_bluffeur":
      return { cancelReveal: { playerIdx: activatedBy } };

    case "marche_nuit": {
      const swap = replaceWeakestWithDeckCard(players[activatedBy]?.hand ?? [], deck, true);
      return swap ? { handsMutated: { [activatedBy]: swap.hand }, newDeck: swap.deck } : {};
    }

    case "cri_chef":
      return { opponentTimerDelta: { seconds: -CHIEF_CRY_SECONDS } };

    case "feu_camp":
      return { conditionalPotBonus: CAMPFIRE_BONUS };

    case "pagne_changeant":
      return { suitOverrideNext: { playerIdx: activatedBy } };

    default:
      return {};
  }
}

export function requiresTarget(cardId: PowerCardId): boolean {
  return POWER_CARDS_BY_ID[cardId]?.targetMode === "opponent";
}

export function canActivatePowerCard(
  cardId: PowerCardId,
  ctx: PowerActivationContext,
): string | null {
  const { state, activatedBy, target, deck } = ctx;
  const def = POWER_CARDS_BY_ID[cardId];
  if (!def) return "Carte inconnue.";

  if (state.phase !== "turns") return "Ce n'est pas le moment de jouer une carte pouvoir.";
  if (state.turnIdx !== activatedBy) return "Attends ton tour.";

  const me = state.players[activatedBy];
  if (!me) return "Joueur introuvable.";

  const alreadyUsed = (me.powerActivations ?? []).some((a) => a.cardId === cardId && a.used);
  if (alreadyUsed) return "Carte déjà utilisée.";

  if (def.targetMode === "opponent") {
    if (target === undefined) return "Cette carte nécessite une cible.";
    if (target === activatedBy) return "Tu ne peux pas te cibler toi-même.";
    if (!state.players[target]) return "Cible invalide.";
  }

  if ((cardId === "vent_nord" || cardId === "marche_nuit") && (!deck || deck.length === 0)) {
    return "Pioche vide - impossible d'échanger.";
  }

  if (cardId === "cri_chef" && (state.leaderIdx !== activatedBy || state.trickPlays.length > 0)) {
    return "Le Cri du Chef se joue en ouvrant le pli.";
  }

  if (cardId === "pagne_changeant") {
    const ledSuit = state.trickPlays[0]?.card.suit ?? null;
    if (!ledSuit) return "Le Pagne Changeant se joue quand une tendance existe.";
    if (me.hand.some((card) => card.suit === ledSuit)) {
      return "Tu as déjà la tendance en main.";
    }
  }

  return null;
}
