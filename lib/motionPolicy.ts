import type { MotionQualityPreference } from "@/contexts/SettingsContext";

export type MotionLevel = "full" | "balanced" | "lite";

export interface MotionCapabilities {
  width: number;
  height: number;
  hardwareConcurrency: number;
  deviceMemory: number | null;
  /** Pointeur principal tactile (`pointer: coarse`). Inconnu → on se fie à la taille seule. */
  coarsePointer?: boolean;
}

/** Téléphone : écran tactile dont le petit côté fait moins de 600 px CSS. Les tablettes et une
 *  fenêtre étroite d'ordinateur (pointeur fin) n'en sont pas. */
export function isPhoneLike({ width, height, coarsePointer }: MotionCapabilities): boolean {
  return Math.min(width, height) < 600 && coarsePointer !== false;
}

const LEVEL_WEIGHT: Record<MotionLevel, number> = { lite: 0, balanced: 1, full: 2 };

export function deriveMotionLevel({ width, height, hardwareConcurrency, deviceMemory }: MotionCapabilities): MotionLevel {
  const smallestSide = Math.min(width, height);
  const isCompact = width < 640 || smallestSide < 430;
  const lowCpu = hardwareConcurrency <= 4;
  const mediumCpu = hardwareConcurrency <= 6;
  const lowMemory = deviceMemory != null && deviceMemory <= 2;
  const mediumMemory = deviceMemory != null && deviceMemory <= 4;

  if ((isCompact && (lowCpu || lowMemory)) || (lowCpu && lowMemory)) return "lite";
  if (isCompact || mediumCpu || mediumMemory) return "balanced";
  return "full";
}

export function preferenceMotionLevel(preference: MotionQualityPreference, capabilities: MotionCapabilities): MotionLevel {
  if (preference === "performance") return "lite";
  if (preference === "balanced") return "balanced";
  if (preference === "quality") return "full";
  // « Auto » : niveau Performance sur téléphone. Le goulot y est le GPU (calques, ombres, filtres,
  // animations en boucle), que le capteur de fluidité ne voit pas : il mesure les images du thread
  // principal, qui reste fluide pendant que l'écran reste vide faute de pixels dessinés.
  // Mesuré (densité ×2,7) : Performance divise par 4 à 7 le dessin GPU des transitions.
  // Ailleurs (ordinateur, tablette) : niveau maximal, le capteur redescend si besoin.
  return isPhoneLike(capabilities) ? "lite" : "full";
}

export function lowerMotionLevel(level: MotionLevel): MotionLevel {
  return level === "full" ? "balanced" : "lite";
}

export function lowestMotionLevel(left: MotionLevel, right: MotionLevel): MotionLevel {
  return LEVEL_WEIGHT[left] <= LEVEL_WEIGHT[right] ? left : right;
}

export function shouldDegradeMotion(totalFrames: number, slowFrames: number): boolean {
  return totalFrames > 20 && slowFrames / totalFrames > 0.1;
}
