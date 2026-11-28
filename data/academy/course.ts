/* Parcours de l'Académie : les étapes s'enchaînent sur la même table, « Continuer »
   mène à la suivante. Une étape peut avoir plusieurs scènes (variantes d'un défi) :
   l'une est tirée au sort en y entrant, et « Réessayer » rejoue la même. */

import type { AcademyScene } from "../../engine/academy/types";
import { CH1_FOLLOW, CH2_LEAD, CH3_CHALLENGES, CH3_LAST_TRICK, CH3_WHAT_IF } from "./scenes";

export interface AcademyStep {
  id: string;
  /** Titre montré en ouvrant l'étape (début de chapitre, défi). */
  title?: { kicker: string; title: string };
  scenes: AcademyScene[];
}

/** Chapitres 1 à 3 : les bases du Njambo. */
export const BASICS_COURSE: AcademyStep[] = [
  { id: "ch1", title: { kicker: "Chapitre 1", title: "Suis la tendance" }, scenes: [CH1_FOLLOW] },
  { id: "ch2", title: { kicker: "Chapitre 2", title: "Prends la main" }, scenes: [CH2_LEAD] },
  { id: "ch3", title: { kicker: "Chapitre 3", title: "Le dernier pli et le 3" }, scenes: [CH3_LAST_TRICK] },
  { id: "ch3-what-if", scenes: [CH3_WHAT_IF] },
  { id: "ch3-challenge", title: { kicker: "Défi", title: "Gagne le dernier pli" }, scenes: CH3_CHALLENGES },
];

/** Scène jouée pour une étape (`random` dans [0, 1[). */
export function stepScene(step: AcademyStep, random: number = Math.random()): AcademyScene {
  return step.scenes[Math.min(step.scenes.length - 1, Math.floor(random * step.scenes.length))];
}
