/* Lancement d'une carte pouvoir : de son emplacement (éventail des pouvoirs du
   lanceur, ou son avatar chez les autres) jusqu'à l'annonce. Donne les
   variables CSS de `.nj-power-activation-card.is-launch` (globals.css). */

import type { CSSProperties } from "react";

/** Place finale de la carte d'annonce : centre et largeur à l'écran. */
export interface LaunchTarget {
  cx: number;
  cy: number;
  width: number;
}

/** Écart et taille de départ, ou null si l'emplacement est inconnu (l'annonce garde son entrée habituelle). */
export function launchStyle(from: DOMRect | null | undefined, target: LaunchTarget, rotate = 0): CSSProperties | null {
  if (!from || from.width <= 0 || target.width <= 0) return null;
  const scale = Math.max(0.12, Math.min(1, from.width / target.width));
  return {
    "--launch-x": `${Math.round(from.left + from.width / 2 - target.cx)}px`,
    "--launch-y": `${Math.round(from.top + from.height / 2 - target.cy)}px`,
    "--launch-scale": scale.toFixed(3),
    "--launch-rotate": `${rotate}deg`,
  } as CSSProperties;
}

/** Annonce du jeu : carte centrée à l'écran, `min(78vw, 330px)` de large (voir .nj-power-activation-card). */
export function screenLaunchTarget(): LaunchTarget {
  return { cx: window.innerWidth / 2, cy: window.innerHeight / 2, width: Math.min(window.innerWidth * 0.78, 330) };
}
