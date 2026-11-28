/* Parcours de l'Académie : les étapes s'enchaînent sur la même table, « Continuer »
   mène à la suivante. Une étape peut avoir plusieurs scènes (variantes d'un défi) :
   l'une est tirée au sort en y entrant, et « Réessayer » rejoue la même. La
   dernière étape des bases est une vraie partie (partie de fin, A4). */

import type { AcademyScene } from "../../engine/academy/types";
import { CH1_FOLLOW, CH2_LEAD, CH3_CHALLENGES, CH3_LAST_TRICK, CH3_WHAT_IF } from "./scenes";

export interface AcademyStep {
  id: string;
  /** Titre montré en ouvrant l'étape (début de chapitre, défi). */
  title?: { kicker: string; title: string };
  scenes: AcademyScene[];
  /** Partie de fin d'Académie : une vraie donne (LocalGameSync) au lieu d'une scène. */
  final?: boolean;
}

/** Partie de fin : vraie donne, Mado et Ya en bots faciles, gratuite et sans chrono, coach en direct. */
export const FINAL_GAME_STEP: AcademyStep = {
  id: "final-game",
  title: { kicker: "Partie de fin", title: "À toi de jouer !" },
  scenes: [],
  final: true,
};

/** Un chapitre du hub (A6) : ses étapes se jouent d'affilée ; validé quand toutes sont finies. */
export interface AcademyChapter {
  id: string;
  kicker: string;
  title: string;
  /** Ce qu'on y apprend, en quelques mots. */
  summary: string;
  steps: AcademyStep[];
  /** Pas encore jouable : affiché « bientôt ». */
  soon?: boolean;
}

export const ACADEMY_CHAPTERS: AcademyChapter[] = [
  {
    id: "ch1", kicker: "Chapitre 1", title: "Suis la tendance", summary: "Suivre la couleur, se défausser",
    steps: [{ id: "ch1", title: { kicker: "Chapitre 1", title: "Suis la tendance" }, scenes: [CH1_FOLLOW] }],
  },
  {
    id: "ch2", kicker: "Chapitre 2", title: "Prends la main", summary: "Choisir la tendance quand tu lances",
    steps: [{ id: "ch2", title: { kicker: "Chapitre 2", title: "Prends la main" }, scenes: [CH2_LEAD] }],
  },
  {
    id: "ch3", kicker: "Chapitre 3", title: "Le dernier pli et le 3", summary: "Le pli qui paie, le ×2 et son pari",
    steps: [
      { id: "ch3", title: { kicker: "Chapitre 3", title: "Le dernier pli et le 3" }, scenes: [CH3_LAST_TRICK] },
      { id: "ch3-what-if", scenes: [CH3_WHAT_IF] },
      { id: "ch3-challenge", title: { kicker: "Défi", title: "Gagne le dernier pli" }, scenes: CH3_CHALLENGES },
    ],
  },
  { id: "final", kicker: "Partie de fin", title: "À toi de jouer !", summary: "Une vraie partie, avec Tonton René", steps: [FINAL_GAME_STEP] },
  { id: "ch4", kicker: "Chapitre 4", title: "Les cartes Pouvoir", summary: "Les 4 gestes des pouvoirs", steps: [], soon: true },
];

/** Chapitres 1 à 3, puis la partie de fin : le parcours de « Je découvre Njambo ». */
export const BASICS_COURSE: AcademyStep[] = ACADEMY_CHAPTERS.filter((chapter) => !chapter.soon).flatMap((chapter) => chapter.steps);

/** Un chapitre est validé quand chacune de ses étapes a été finie. */
export function chapterDone(chapter: AcademyChapter, doneSteps: Record<string, number>): boolean {
  return !chapter.soon && chapter.steps.every((step) => step.id in doneSteps);
}

/** Scène jouée pour une étape (`random` dans [0, 1[). */
export function stepScene(step: AcademyStep, random: number = Math.random()): AcademyScene {
  return step.scenes[Math.min(step.scenes.length - 1, Math.floor(random * step.scenes.length))];
}
