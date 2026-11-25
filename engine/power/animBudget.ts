/* Durée d'animation d'une carte pouvoir, calculée depuis son script.

   Sert à CADENCER le jeu : après une activation, l'IA locale, le replay en
   ligne et l'échéance serveur attendent cette durée avant l'événement suivant,
   pour que la mise en scène du pouvoir ne soit jamais recouverte par la carte
   jouée juste après. Fonction pure (partagée client / Cloud Functions). */

import { choreographyDuration } from "./choreography";
import type { AnimCue, PowerScript } from "./types";

/** Vol d'une carte déplacée par un pouvoir : nettement plus lent qu'une carte posée (dropFlight),
 *  pour qu'on suive où elle part. Plancher appliqué aussi aux modèles V2 trop rapides. */
export const POWER_FLIGHT_MS = 700;
export const POWER_FLIGHT_MIN_MS = 650;

/** Modèle de vol V2 ralenti au besoin pour un pouvoir (le modèle « Rapide » fait 420 ms). */
export function withPowerFlightFloor<T extends { motion: { durationMs: number } }>(model: T): T {
  if (model.motion.durationMs >= POWER_FLIGHT_MIN_MS) return model;
  return { ...model, motion: { ...model.motion, durationMs: POWER_FLIGHT_MIN_MS } };
}

/** Plafond de la partie « script » (hors annonce) : un pouvoir ne bloque jamais la partie plus longtemps. */
export const POWER_SCRIPT_BUDGET_CAP_MS = 4_500;

/** Durée visible estimée d'un cue non chorégraphié (l'orchestrateur ne l'attend pas, mais on le laisse se jouer). */
function cueVisibleMs(cue: AnimCue): number {
  switch (cue.cue) {
    case "flyCards": return POWER_FLIGHT_MS;
    // La main révélée reste au centre plus longtemps, mais sans bloquer la lecture du jeu.
    case "revealOverlay": return Math.min(cue.durationMs ?? 5_000, 2_500);
    case "highlightHandCard": return Math.min(cue.durationMs ?? 2_600, 1_500) + (cue.delayMs ?? 0);
    case "timerFx": return cue.kind === "freeze" ? 1_250 : 900;
    case "deckPulse": return 950;
    case "potFlash": return 1_300;
    case "avatarAura": return 1_500;
    case "toast": return 1_800;
  }
}

/** Durée d'une étape faite de cues : les vols (`flyCards`) et les `afterMs` s'enchaînent, le reste se superpose. */
function cueStepMs(cues: AnimCue[]): number {
  let cursor = 0;
  let end = 0;
  for (const cue of cues) {
    end = Math.max(end, cursor + cueVisibleMs(cue));
    if (cue.cue === "flyCards") cursor += POWER_FLIGHT_MS;
    cursor += cue.afterMs ?? (cue.cue === "flyCards" && cue.to.zone === "deck" ? 180 : 0);
  }
  return Math.max(end, cursor);
}

/** Durée de la mise en scène propre au script (après l'annonce), plafonnée. */
export function powerScriptAnimMs(script: PowerScript): number {
  const beats = script.beats ?? {};
  let total = beats.introMs ?? 0;
  for (const step of script.steps) {
    total += step.choreo ? choreographyDuration(step.choreo) : cueStepMs(step.anim ?? []);
    total += beats.stepGapMs ?? 0;
  }
  return Math.min(POWER_SCRIPT_BUDGET_CAP_MS, Math.max(0, Math.round(total)));
}

/** Durée totale d'une activation : annonce de la carte (`announceMs`) puis mise en scène du script. */
export function powerAnimationBudgetMs(script: PowerScript | null | undefined, announceMs: number): number {
  return announceMs + (script ? powerScriptAnimMs(script) : 0);
}
