/* Lien direct vers une scène de l'Académie : `/?academie=ch1-follow`.
   Sert aux essais en attendant le hub (A6) ; consommé une fois au démarrage. */

import { ACADEMY_SCENES } from "@/data/academy/scenes";
import type { AcademyScene } from "@/engine/academy/types";

export function consumeAcademyDeepLink(): AcademyScene | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const sceneId = url.searchParams.get("academie");
  if (!sceneId) return null;
  url.searchParams.delete("academie");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return ACADEMY_SCENES.find((scene) => scene.id === sceneId) ?? null;
}
