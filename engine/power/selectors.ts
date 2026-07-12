/* Évaluation des CardSelector sur une collection (main, pioche).
   Fonctions PURES — aucune mutation. */

import { legalCards } from "@/engine/rules";
import type { Card, GameState } from "@/types/game";
import type { CardSelector, PowerChoices } from "./types";

export function weakestCardIndex(hand: Card[]): number {
  return hand.reduce((minIdx, card, index) => (card.value < hand[minIdx].value ? index : minIdx), 0);
}

export function strongestCardIndex(hand: Card[]): number {
  return hand.reduce((maxIdx, card, index) => (card.value > hand[maxIdx].value ? index : maxIdx), 0);
}

/**
 * Meilleure carte légale : la plus petite carte GAGNANTE si possible,
 * sinon la plus basse légale (stratégie de la Main du Griot).
 */
export function bestRecommendation(state: GameState, seat: number): number | null {
  const hand = state.players[seat]?.hand ?? [];
  if (hand.length === 0) return null;
  const ledSuit = state.trickPlays[0]?.card.suit ?? null;
  const legal = legalCards(hand, ledSuit);
  if (legal.length === 0) return null;

  const currentBest = ledSuit
    ? Math.max(
        0,
        ...state.trickPlays
          .filter((play) => (play.card.effectiveSuit ?? play.card.suit) === ledSuit)
          .map((play) => play.card.effectiveValue ?? play.card.value),
      )
    : 0;
  const winning = legal
    .filter((index) => !ledSuit || hand[index].suit === ledSuit)
    .filter((index) => hand[index].value > currentBest)
    .sort((a, b) => hand[a].value - hand[b].value);
  if (winning[0] !== undefined) return winning[0];

  return [...legal].sort((a, b) => hand[a].value - hand[b].value)[0] ?? null;
}

export interface HandSelectorContext {
  state: GameState;
  /** Seat du propriétaire de la main. */
  seat: number;
  choices?: PowerChoices;
}

function choiceList(choices: PowerChoices | undefined, choiceId: string) {
  const value = choices?.[choiceId];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/** Évalue un sélecteur sur une MAIN → indices de cartes (souvent 0 ou 1). */
export function selectInHand(
  hand: Card[],
  selector: CardSelector,
  ctx: HandSelectorContext,
): number[] {
  if (hand.length === 0) return [];
  switch (selector.kind) {
    case "weakest":
      return [weakestCardIndex(hand)];
    case "strongest":
      return [strongestCardIndex(hand)];
    case "random":
      return [Math.floor(Math.random() * hand.length)];
    case "byId": {
      const index = hand.findIndex((card) => card.id === selector.cardId);
      return index >= 0 ? [index] : [];
    }
    case "all":
      return hand.map((_, index) => index);
    case "bySuit": {
      const suit =
        selector.suit === "led" ? ctx.state.trickPlays[0]?.card.suit ?? null : selector.suit;
      if (!suit) return [];
      return hand.flatMap((card, index) => (card.suit === suit ? [index] : []));
    }
    case "byValue":
      return hand.flatMap((card, index) =>
        (selector.min === undefined || card.value >= selector.min) &&
        (selector.max === undefined || card.value <= selector.max)
          ? [index]
          : [],
      );
    case "bestLegal": {
      const index = bestRecommendation(ctx.state, ctx.seat);
      return index == null ? [] : [index];
    }
    case "chosen": {
      return choiceList(ctx.choices, selector.choiceId).flatMap((pick) =>
        hand[pick.cardIdx]?.id === pick.cardId ? [pick.cardIdx] : [],
      );
    }
    default:
      // topOfDeck / firstBetterThanWeakest n'ont pas de sens sur une main.
      return [];
  }
}

/** Variante multi-cartes : conserve les choix explicites et applique une
 * stratégie ordonnée pour produire au plus `count` indices uniques. */
export function selectManyInHand(
  hand: Card[],
  selector: CardSelector,
  count: number,
  ctx: HandSelectorContext,
): number[] {
  if (count <= 0 || hand.length === 0) return [];
  if (selector.kind === "weakest") {
    return hand.map((_, index) => index).sort((a, b) => hand[a].value - hand[b].value).slice(0, count);
  }
  if (selector.kind === "strongest") {
    return hand.map((_, index) => index).sort((a, b) => hand[b].value - hand[a].value).slice(0, count);
  }
  if (selector.kind === "random") {
    const pool = hand.map((_, index) => index);
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    }
    return pool.slice(0, count);
  }
  return [...new Set(selectInHand(hand, selector, ctx))].slice(0, count);
}

/** Évalue un sélecteur sur la PIOCHE → index dans deck, ou -1 si introuvable. */
export function selectInDeck(
  deck: Card[],
  selector: CardSelector,
  opts: { weakestValue?: number; choices?: PowerChoices } = {},
): number {
  if (deck.length === 0) return -1;
  switch (selector.kind) {
    case "topOfDeck":
      return 0;
    case "firstBetterThanWeakest":
      return opts.weakestValue === undefined
        ? -1
        : deck.findIndex((card) => card.value > opts.weakestValue!);
    case "byValue": {
      return deck.findIndex(
        (card) =>
          (selector.min === undefined || card.value >= selector.min) &&
          (selector.max === undefined || card.value <= selector.max),
      );
    }
    case "random":
      return Math.floor(Math.random() * deck.length);
    case "byId":
      return deck.findIndex((card) => card.id === selector.cardId);
    case "chosen": {
      const pick = choiceList(opts.choices, selector.choiceId)[0];
      if (!pick) return -1;
      return deck[pick.cardIdx]?.id === pick.cardId ? pick.cardIdx : -1;
    }
    default:
      return -1;
  }
}
