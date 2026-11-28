/* Lien direct vers l'Académie, en attendant le hub (A6) ; consommé une fois au démarrage :
   - `/?academie=bases` : parcours des chapitres 1 à 3, puis la partie de fin ;
   - `/?academie=finale` : la partie de fin seule ;
   - `/?academie=porte` : la porte d'entrée, comme au premier lancement ;
   - `/?academie=ch1-follow` : une scène seule. */

import { BASICS_COURSE, FINAL_GAME_STEP, type AcademyStep } from "@/data/academy/course";
import { ACADEMY_SCENES } from "@/data/academy/scenes";
import type { AcademyScene } from "@/engine/academy/types";

const COURSES: Record<string, AcademyStep[]> = { bases: BASICS_COURSE, finale: [FINAL_GAME_STEP] };

export function consumeAcademyDeepLink(): { course?: AcademyStep[]; scene?: AcademyScene; door?: true } | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const id = url.searchParams.get("academie");
  if (!id) return null;
  url.searchParams.delete("academie");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  if (id === "porte") return { door: true };
  if (COURSES[id]) return { course: COURSES[id] };
  const scene = ACADEMY_SCENES.find((candidate) => candidate.id === id);
  return scene ? { scene } : null;
}
