/* Interception générique des activations (bouclier, masque…).

   Un `grantShield` déclare quels tags il intercepte (`blocks`). Les tags d'un
   script attaquant sont DÉRIVÉS de son contenu — l'interception devient un
   simple test d'intersection, sans aucun `if (cardId === ...)`. */

import type { ActivePowerEffect } from "../../types/game";
import type { PowerScript, PowerScriptTag } from "./types";

/** Tags dérivés automatiquement d'un script (voir doc de PowerScriptTag). */
export function deriveScriptTags(script: PowerScript): PowerScriptTag[] {
  const tags = new Set<PowerScriptTag>();
  if (script.target.count !== "none") tags.add("targeted");
  for (const step of script.steps) {
    for (const op of step.ops ?? []) {
      if (op.op === "revealHand") tags.add("reveal");
      if (op.op === "restrictNextPlay" || op.op === "blockNextLegalCard") tags.add("restrict");
      if (op.op === "timerFreeze" && op.player !== "self") tags.add("timer_attack");
      if (op.op === "timerDelta" && op.player !== "self" && op.seconds < 0) {
        tags.add("timer_attack");
      }
    }
  }
  return [...tags];
}

/** Tags interceptés par un effet actif (nouveaux : blocks[] ; legacy : shield/cancelReveal). */
export function effectBlocks(effect: ActivePowerEffect): PowerScriptTag[] {
  if (effect.blocks?.length) return effect.blocks;
  const legacy: PowerScriptTag[] = [];
  if (effect.shield) legacy.push("targeted");
  if (effect.cancelReveal) legacy.push("reveal");
  return legacy;
}

/**
 * Cherche l'effet actif de la CIBLE qui intercepte ce script.
 * Ne consomme PAS l'effet — c'est au sync de le retirer (takeEffect).
 */
export function findBlockingEffect(
  script: PowerScript,
  targetSeat: number,
  effects: ActivePowerEffect[],
): ActivePowerEffect | undefined {
  const tags = deriveScriptTags(script);
  if (tags.length === 0) return undefined;
  return effects.find(
    (effect) =>
      effect.activatedBy === targetSeat &&
      effectBlocks(effect).some((tag) => tags.includes(tag)),
  );
}
