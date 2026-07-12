/* Validation d'activation 100 % déclarative : règles communes + TargetSpec
   + conditions du script. Remplace canActivatePowerCard et ses branches en dur. */

import { DEV } from "@/config/devConfig";
import type { PowerRunContext, PowerScript } from "./types";
import { checkConditions } from "./conditions";

/** Retourne un message d'erreur (français) si l'activation est interdite, sinon null. */
export function canActivatePower(script: PowerScript, ctx: PowerRunContext): string | null {
  const { state, activatedBy, targets } = ctx;

  if (state.phase !== "turns") return "Ce n'est pas le moment de jouer une carte pouvoir.";
  if (state.turnIdx !== activatedBy) return "Attends ton tour.";

  const me = state.players[activatedBy];
  if (!me) return "Joueur introuvable.";

  const alreadyUsed = (me.powerActivations ?? []).some(
    (activation) => activation.cardId === script.id && activation.used,
  );
  if (alreadyUsed && !DEV.unlimitedPowers) return "Carte déjà utilisée.";

  if (
    (script.target.count === "one" || script.target.count === "many") &&
    script.target.chooser !== "engine"
  ) {
    if (targets.length === 0) return "Cette carte nécessite une cible.";
    if (script.target.count === "one" && targets.length > 1) return "Cible invalide.";
    if (
      script.target.count === "many" &&
      script.target.max !== undefined &&
      targets.length > script.target.max
    ) {
      return "Trop de cibles.";
    }
    for (const target of targets) {
      if (target === activatedBy && !script.target.allowSelf) {
        return "Tu ne peux pas te cibler toi-même.";
      }
      if (!state.players[target]) return "Cible invalide.";
    }
  }

  return checkConditions(script.conditions, ctx);
}
