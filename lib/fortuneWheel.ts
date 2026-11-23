/* ═══════════════ Roue des retrouvailles : géométrie & physique ═══════════════
   Logique pure (sans DOM) : ordre des cases, case correspondant à un gain,
   angle d'arrêt et courbe de décélération. Testée dans tests/fortune-wheel.test.ts. */

import { WHEEL_REWARDS, type Reward } from "@/domain/catalog";

/** Ordre des cases sur la roue (index dans WHEEL_REWARDS), dans le sens horaire
 *  depuis 12 h. Les lots sont alternés pour ne pas coller les Nkap entre eux. */
export const WHEEL_ORDER = [0, 3, 1, 4, 2, 5] as const;

export const WHEEL_SEGMENTS = WHEEL_ORDER.length;
export const SEGMENT_DEG = 360 / WHEEL_SEGMENTS;

function sameReward(a: Reward, b: Reward): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "nkap":
    case "cauris":
      return a.amount === (b as typeof a).amount;
    case "ticket":
      return a.tier === (b as typeof a).tier;
    case "energy_pass":
      return a.durationMinutes === (b as typeof a).durationMinutes;
    case "booster_book":
      return a.boosterId === (b as typeof a).boosterId;
    default:
      return false;
  }
}

/** Case (0..WHEEL_SEGMENTS-1) où se trouve ce gain, ou -1 s'il n'est pas sur la roue. */
export function segmentIndexForReward(reward: Reward): number {
  const catalogIndex = WHEEL_REWARDS.findIndex((entry) => sameReward(entry.value, reward));
  if (catalogIndex < 0) return -1;
  return WHEEL_ORDER.indexOf(catalogIndex as (typeof WHEEL_ORDER)[number]);
}

/** Rotation du disque (mod 360) qui place le centre de la case `segment` sous
 *  l'aiguille (12 h), décalée de `jitter` ∈ [-1, 1] × 35 % d'une case pour que
 *  l'arrêt ne tombe pas toujours pile au milieu. */
export function restingAngleFor(segment: number, jitter = 0): number {
  const centre = segment * SEGMENT_DEG;
  const offset = Math.max(-1, Math.min(1, jitter)) * SEGMENT_DEG * 0.35;
  return mod360(-centre + offset);
}

export function mod360(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/** Distance à parcourir (≥ minTravel) depuis `from` pour finir sur `target` (mod 360). */
export function travelTo(from: number, target: number, minTravel: number): number {
  let delta = mod360(target - from);
  while (delta < minTravel) delta += 360;
  return delta;
}

/** Décélération « quartique » : départ à la vitesse v0, arrêt doux sans à-coup.
 *  Durée choisie pour que la vitesse initiale soit exactement v0 (continuité
 *  avec la phase de rotation libre) : D = 4 Δ / v0. */
export function decelDuration(travel: number, v0: number): number {
  return (4 * travel) / v0;
}

export function decelProgress(u: number): number {
  const t = Math.max(0, Math.min(1, u));
  return 1 - (1 - t) ** 4;
}
