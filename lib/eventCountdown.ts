/* Compte à rebours des événements (liste, détail, carte du menu). */

export const ENDING_SOON_MS = 2 * 60 * 60 * 1000;

export interface EventCountdown {
  phase: "upcoming" | "live" | "ended";
  /** Texte court : « Fin dans 2 j 4 h », « Ouvre dans 35 min », « Terminé ». */
  label: string;
  /** Moins de 2 h avant la fin : mise en avant visuelle. */
  endingSoon: boolean;
  /** Durée restante jusqu'à la prochaine étape (ouverture ou fin), en ms. */
  remainingMs: number;
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "moins d’1 min";
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} j ${hours} h` : `${days} j`;
  if (hours > 0) return mins > 0 ? `${hours} h ${String(mins).padStart(2, "0")}` : `${hours} h`;
  return `${mins} min`;
}

/** Événements « permanents » (fin au-delà d'un an) : pas de compte à rebours. */
const FAR_FUTURE_MS = 365 * 24 * 60 * 60 * 1000;

export function eventCountdown(event: { startsAt: number; endsAt: number }, now: number): EventCountdown | null {
  if (event.startsAt > now) {
    const remainingMs = event.startsAt - now;
    return { phase: "upcoming", label: `Ouvre dans ${formatDuration(remainingMs)}`, endingSoon: false, remainingMs };
  }
  if (event.endsAt <= now) return { phase: "ended", label: "Terminé", endingSoon: false, remainingMs: 0 };
  const remainingMs = event.endsAt - now;
  if (remainingMs > FAR_FUTURE_MS) return null;
  return { phase: "live", label: `Fin dans ${formatDuration(remainingMs)}`, endingSoon: remainingMs < ENDING_SOON_MS, remainingMs };
}
