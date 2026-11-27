/* ═══════════════ Orientation directionnelle naturelle de la pioche ═══════════════
   Fonctions pures pour orienter la pioche centrale comme un vrai donneur :
   - rotation continue dans le sens horaire autour de la table (3–4 joueurs) ;
   - va-et-vient naturel du poignet en face-à-face (2 joueurs, pas de toupie) ;
   - micro-variation organique (±2,4°) et léger geste d'avancée vers la main ;
   - retour au repos par le chemin le plus court. */

export interface Point2D {
  x: number;
  y: number;
}

/** Normalise un angle en degrés dans [0, 360). */
export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Angle CSS (degrés, sens horaire, 0° = vers le bas / main du joueur local)
 *  pour que la face avant (+Y local) de la pioche regarde depuis `from` vers `to`. */
export function angleFromDeckToHand(from: Point2D, to: Point2D, fallbackDeg = 0): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.hypot(dx, dy) < 1) return normalizeAngle(fallbackDeg);
  const deg = (Math.atan2(-dx, dy) * 180) / Math.PI;
  return normalizeAngle(deg);
}

/** Prochain angle cumulé dans le sens horaire (évite un retour brutal 270° → 0°). */
export function nextClockwiseAngle(currentDeg: number, targetDeg: number): number {
  const normTarget = normalizeAngle(targetDeg);
  const normCurrent = normalizeAngle(currentDeg);
  let delta = (normTarget - normCurrent + 360) % 360;
  if (delta < 0.5 || delta > 359.5) delta = 0;
  return currentDeg + delta;
}

/** Micro-variation naturelle du poignet (±2,4°, déterministe par carte) :
 *  évite l'alignement mécanique identique au degré près. */
export function humanHandJitter(stepIndex: number): number {
  return Math.round(Math.sin(stepIndex * 2.17 + 0.6) * 2.4 * 10) / 10;
}

/** Calcule l'angle humain suivant et le sens du mouvement (+1 horaire, -1 anti-horaire).
 *  - `alternate: true` (duel à 2 joueurs) : va-et-vient souple du poignet (0° ↔ 180°)
 *    au lieu de tourner sans fin sur soi-même.
 *  - `alternate: false` (3–4 joueurs) : balayage naturel dans le sens horaire. */
export function naturalAimAngle(
  currentDeg: number,
  targetDeg: number,
  opts: { alternate?: boolean; jitterDeg?: number } = {},
): { angle: number; dir: 1 | -1 } {
  const jitter = opts.jitterDeg ?? 0;
  if (opts.alternate) {
    const normTarget = normalizeAngle(targetDeg);
    const goal = normTarget > 90 && normTarget < 270 ? normTarget + jitter : jitter;
    const dir: 1 | -1 = goal >= currentDeg ? 1 : -1;
    return { angle: goal, dir };
  }
  const base = nextClockwiseAngle(currentDeg, targetDeg);
  const angle = base + jitter;
  const dir: 1 | -1 = angle >= currentDeg ? 1 : -1;
  return { angle, dir };
}

/** Légère avancée du poignet (px) vers la main visée : la pioche ne tourne pas
 *  comme une boussole clouée sur un axe, elle accompagne le geste vers le joueur. */
export function wristReachOffset(angleDeg: number, distancePx = 6): Point2D {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.round(-Math.sin(rad) * distancePx * 10) / 10,
    y: Math.round(Math.cos(rad) * distancePx * 10) / 10,
  };
}

/** Angle de repos le plus proche (congru à `restDeg` modulo 360°) pour éviter
 *  de dérouler plusieurs tours en arrière à la fin de la distribution. */
export function nearestRestAngle(currentDeg: number, restDeg = 0): number {
  const diff = ((((restDeg - currentDeg) % 360) + 540) % 360) - 180;
  return currentDeg + diff;
}
