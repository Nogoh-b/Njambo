/* Résolution des cibles (TargetSpec) et des références de joueur (PlayerRef)
   en SEATS concrets. */

import type { PlayerRef, TargetSpec } from "./types";

export interface TargetResolutionInput {
  activatedBy: number;
  playerCount: number;
  /** Cible demandée par l'activateur (modale de ciblage). */
  requested?: number;
}

/** Étape 1 du schéma : résout le TargetSpec en liste de seats. */
export function resolveTargets(spec: TargetSpec, input: TargetResolutionInput): number[] {
  const { activatedBy, playerCount, requested } = input;
  const opponents = Array.from({ length: playerCount }, (_, i) => i).filter(
    (i) => i !== activatedBy,
  );
  switch (spec.count) {
    case "none":
      return [];
    case "one":
    case "many":
      // "many" avec choix multiple arrive avec le clic générique — pour
      // l'instant une seule cible transite par la modale.
      return requested !== undefined ? [requested] : [];
    case "all_opponents":
      return opponents;
    case "random_opponent":
      return opponents.length > 0
        ? [opponents[Math.floor(Math.random() * opponents.length)]]
        : [];
  }
}

/** Résout une référence abstraite de joueur en seats concrets. */
export function resolvePlayerRef(
  ref: PlayerRef,
  ctx: { activatedBy: number; targets: number[]; playerCount: number },
): number[] {
  const all = Array.from({ length: ctx.playerCount }, (_, i) => i);
  switch (ref) {
    case "self":
      return [ctx.activatedBy];
    case "target":
      return ctx.targets.slice(0, 1);
    case "each_target":
      return [...ctx.targets];
    case "all_opponents":
      return all.filter((i) => i !== ctx.activatedBy);
    case "all":
      return all;
  }
}
