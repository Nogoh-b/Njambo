/* ═══════════════ Animation V2 — état d'une carte à un instant (étape V2-2) ═══════════════
   Fonction PURE : la carte ne dépend que du modèle, des deux poses données
   par les zones et du temps. Le lecteur, l'atelier et les tests s'en servent.

   Trajet : courbe de Bézier cubique dont les deux points de contrôle (à 30 %
   et 70 % du trajet) sont décalés sur le côté selon la courbure. Rotation et
   taille passent d'une pose à l'autre ; la carte ne se retourne que si la
   face change (de dos dans la pioche → face visible dans ta main). */

import { cubicBezier } from "../sample";
import { ANIM_V2_EASINGS, type AnimV2 } from "./model";
import type { Point, ZonePose } from "./pose";

export interface AnimV2Frame extends Point {
  phase: "waiting" | "flying" | "landed";
  rotate: number;
  /** Largeur de la carte à l'écran. */
  width: number;
  /** Petit grossissement à mi-vol (1 au départ et à l'arrivée). */
  pop: number;
  /** Angle du retournement : 0 face visible, 180 dos. */
  flip: number;
  /** Avancée sur le trajet, rythme appliqué (0 → 1). */
  progress: number;
  /** Avancée dans le temps (0 → 1). */
  time: number;
}

/** Courbure maximale en px, et part de la distance qu'elle peut atteindre (comme le prototype). */
const BEND_MAX_PX = 245;
const BEND_RATIO = 0.48;
/** Grossissement à mi-vol. */
export const POP = 0.1;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const bezier = (a: number, b: number, c: number, d: number, t: number) =>
  (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
const smooth = cubicBezier(ANIM_V2_EASINGS.smooth.curve);

/** Écart d'angle le plus court (−180 à 180) : une carte d'un siège latéral (270°) qui va au dépôt (0°) ne fait pas un tour complet. */
export function shortestTurn(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/** Points de contrôle du trajet entre deux poses. */
export function animV2Controls(model: AnimV2, from: Point, to: Point): [Point, Point] {
  const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / dist, y: dx / dist };
  const bend = model.motion.curve * Math.min(BEND_MAX_PX, dist * BEND_RATIO);
  return [
    { x: from.x + dx * 0.3 + normal.x * bend, y: from.y + dy * 0.3 + normal.y * bend },
    { x: from.x + dx * 0.7 + normal.x * bend, y: from.y + dy * 0.7 + normal.y * bend },
  ];
}

export function sampleAnimV2(model: AnimV2, from: ZonePose, to: ZonePose, elapsedMs: number): AnimV2Frame {
  const duration = Math.max(1, model.motion.durationMs);
  const time = clamp01(elapsedMs / duration);
  const progress = cubicBezier(ANIM_V2_EASINGS[model.motion.easing].curve)(time);
  const [c1, c2] = animV2Controls(model, from, to);
  const flip = from.face === to.face ? to.face : lerp(from.face, to.face, smooth(time));
  return {
    phase: elapsedMs < 0 ? "waiting" : elapsedMs >= duration ? "landed" : "flying",
    x: bezier(from.x, c1.x, c2.x, to.x, progress),
    y: bezier(from.y, c1.y, c2.y, to.y, progress),
    rotate: from.rotate + shortestTurn(from.rotate, to.rotate) * progress,
    width: lerp(from.width, to.width, progress),
    pop: 1 + POP * Math.sin(time * Math.PI),
    flip,
    progress,
    time,
  };
}
