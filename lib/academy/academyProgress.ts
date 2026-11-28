/* Progression de l'Académie gardée sur l'appareil (A6), dans la même clé que la
   réponse à la porte d'entrée : étapes finies (avec leur date). Store externe
   pour le hub (useSyncExternalStore). La copie sur le compte viendra avec les
   récompenses (A9). */

const KEY = "njambo-academy-v1";

export interface AcademyProgress {
  /** Étapes finies : id → date. */
  steps: Record<string, number>;
}

const EMPTY: AcademyProgress = { steps: {} };

function load(): AcademyProgress {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { steps?: unknown };
    const steps = raw.steps && typeof raw.steps === "object" ? (raw.steps as Record<string, number>) : {};
    return { steps };
  } catch {
    return EMPTY;
  }
}

let progress: AcademyProgress | null = null;
const listeners = new Set<() => void>();

export const academyProgress = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getSnapshot: (): AcademyProgress => {
    progress ??= load();
    return progress;
  },
  getServerSnapshot: (): AcademyProgress => EMPTY,

  /** Étape finie (réussie, ou rejeu regardé). */
  stepDone(stepId: string) {
    const current = academyProgress.getSnapshot();
    if (stepId in current.steps) return;
    progress = { steps: { ...current.steps, [stepId]: Date.now() } };
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
      localStorage.setItem(KEY, JSON.stringify({ ...saved, steps: progress.steps }));
    } catch { /* stockage indisponible */ }
    listeners.forEach((listener) => listener());
  },

  /** Tests : repartir de zéro. */
  reset() {
    progress = EMPTY;
    listeners.forEach((listener) => listener());
  },
};
