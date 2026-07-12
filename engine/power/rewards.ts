/* Consommation des effets pouvoir au fil du jeu (fonctions PURES, partagées
   entre LocalGameSync et le host FirestoreGameSync) :
   - modificateurs « prochaine carte » (Éclair, Pagne Changeant) ;
   - bonus/multiplicateurs de pot à la résolution d'un pli. */

import type { ActivePowerEffect, Card } from "@/types/game";

/**
 * Applique et consomme les modificateurs « prochaine carte » du joueur
 * (valueBonus → effectiveValue, suitOverride → effectiveSuit).
 */
export function consumeNextCardModifiers(
  effects: ActivePowerEffect[],
  seat: number,
  card: Card,
  ledSuit: string | null,
  maxValue: number,
): { card: Card; effects: ActivePowerEffect[] } {
  const next = { ...card };
  const consumed = new Set<ActivePowerEffect>();

  const valueBoost = effects.find((effect) => effect.activatedBy === seat && effect.valueBonus);
  if (valueBoost?.valueBonus) {
    next.effectiveValue = Math.min(maxValue, card.value + valueBoost.valueBonus);
    next.powerTag = valueBoost.cardId;
    consumed.add(valueBoost);
  }

  const suitOverride = effects.find((effect) => effect.activatedBy === seat && effect.suitOverride);
  if (suitOverride && ledSuit && card.suit !== ledSuit) {
    next.effectiveSuit = ledSuit;
    next.powerTag = suitOverride.cardId;
    consumed.add(suitOverride);
  }

  return {
    card: next,
    effects: consumed.size > 0 ? effects.filter((effect) => !consumed.has(effect)) : effects,
  };
}

/**
 * À la résolution d'un pli : applique au pot les bonus conditionnels et
 * multiplicateurs du VAINQUEUR, puis purge tous les effets scoped à ce pli.
 */
export function applyTrickPowerRewards(
  effects: ActivePowerEffect[],
  trickNo: number,
  winnerSeat: number,
  pot: number,
): { pot: number; effects: ActivePowerEffect[] } {
  let nextPot = pot;
  for (const effect of effects) {
    if (effect.scopeTrickNo !== trickNo || effect.activatedBy !== winnerSeat) continue;
    if (effect.scoreMultiplier && effect.scoreMultiplier > 1) nextPot *= effect.scoreMultiplier;
    if (effect.conditionalPotBonus && effect.potBonus) nextPot += effect.potBonus;
  }
  return {
    pot: nextPot,
    effects: effects.filter((effect) => {
      if (effect.scopeTrickNo !== trickNo) return true;
      return !(effect.scoreMultiplier || effect.conditionalPotBonus);
    }),
  };
}
