/* ═══════════════ Jeté d'une carte posée sur un dépôt ═══════════════
   Petite inclinaison et léger décalage, comme une carte lancée à la main.
   Calculé depuis l'identifiant de la carte (fonction pure) :
   - identique chez tous les joueurs, sans rien demander au serveur ;
   - connu AVANT que la carte se pose : le vol vise sa place exacte, il n'y a
     plus d'à-coup à l'atterrissage. */

import type { DepositedCard } from "../types/game";

/** Bornes du jeté (mêmes valeurs que l'ancien tirage du mode local). */
export const TOSS_LIMITS = { rot: 9, dx: 6, dy: 4 } as const;

export interface DepositToss { dropRot: number; dx: number; dy: number }

/** Empreinte 32 bits d'un texte (FNV-1a), décalée par `seed` pour obtenir plusieurs tirages indépendants. */
function hash32(text: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Mélange final : les identifiants proches donnent des valeurs éloignées.
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/** Valeur entre −1 et 1 (l'arrondi se fait sur le résultat final). */
const signed = (text: string, seed: number) => (hash32(text, seed) / 0xffffffff) * 2 - 1;

export function depositToss(cardId: string): DepositToss {
  return {
    dropRot: Math.round(signed(cardId, 1) * TOSS_LIMITS.rot * 10) / 10,
    dx: Math.round(signed(cardId, 2) * TOSS_LIMITS.dx * 10) / 10,
    dy: Math.round(signed(cardId, 3) * TOSS_LIMITS.dy * 10) / 10,
  };
}

/** Jeté d'une carte du dépôt : celui fourni par la partie s'il existe (bac à sable, anciennes parties), sinon le jeté calculé. */
export function tossOf(card: Pick<DepositedCard, "id" | "dropRot" | "dx" | "dy">): DepositToss {
  if (card.dropRot === undefined && card.dx === undefined && card.dy === undefined) return depositToss(card.id);
  return { dropRot: card.dropRot ?? 0, dx: card.dx ?? 0, dy: card.dy ?? 0 };
}
