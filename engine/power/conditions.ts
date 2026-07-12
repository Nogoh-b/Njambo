/* Évaluation des conditions d'activation déclaratives des scripts.
   Remplace les branches par-carte de canActivatePowerCard. */

import type { PowerCondition, PowerRunContext } from "./types";

/** Retourne le message d'erreur (français) de la première condition violée, sinon null. */
export function checkConditions(
  conditions: PowerCondition[] | undefined,
  ctx: PowerRunContext,
): string | null {
  for (const condition of conditions ?? []) {
    const error = checkCondition(condition, ctx);
    if (error) return error;
  }
  return null;
}

function checkCondition(condition: PowerCondition, ctx: PowerRunContext): string | null {
  const { state, activatedBy, deck } = ctx;
  switch (condition.kind) {
    case "deckNotEmpty":
      return deck.length > 0 ? null : "Pioche vide - impossible d'échanger.";
    case "isTrickLeader":
      return state.leaderIdx === activatedBy && state.trickPlays.length === 0
        ? null
        : "Cette carte se joue en ouvrant le pli.";
    case "ledSuitKnown":
      return state.trickPlays[0]?.card.suit
        ? null
        : "Cette carte se joue quand une tendance existe.";
    case "activatorLacksLedSuit": {
      const ledSuit = state.trickPlays[0]?.card.suit ?? null;
      if (!ledSuit) return null; // couvert par ledSuitKnown
      const hand = state.players[activatedBy]?.hand ?? [];
      return hand.some((card) => card.suit === ledSuit)
        ? "Tu as déjà la tendance en main."
        : null;
    }
  }
}
