/* Texte d'une réplique de l'Académie, avec les valeurs réglables lues dans la
   config de la partie (règle stricte n° 6 : aucun chiffre en dur). */

import { ACADEMY_TEXTS_FR } from "@/data/academy/fr";
import type { GameConfig } from "@/types/game";

/** Valeurs insérables dans une réplique : `{turnSeconds}`, `{lastTrick}`… */
export function coachValues(cfg: GameConfig): Record<string, number> {
  return {
    turnSeconds: cfg.turnSeconds,
    sumBelow: cfg.instantWin.sumBelow,
    sumExact: cfg.instantWin.sumExactDoubles,
    cardsPerPlayer: cfg.cardsPerPlayer,
    /** Numéro du dernier pli (le Ngata). */
    lastTrick: cfg.cardsPerPlayer,
    /** Nombre de plis avant le dernier. */
    firstTricks: cfg.cardsPerPlayer - 1,
    maxPowers: cfg.maxEquippedPowers,
  };
}

/** Valeurs propres à un conseil en direct (carte, couleur, joueur…). */
export const TIP_VARS = ["card", "suit", "suitName", "trick", "name", "power", "effect", "seconds", "wins"] as const;

export function coachText(
  key: string,
  cfg: GameConfig,
  vars: Record<string, string | number> = {},
  texts: Record<string, string> = ACADEMY_TEXTS_FR,
): string {
  const values: Record<string, string | number> = { ...coachValues(cfg), ...vars };
  return (texts[key] ?? key).replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}
