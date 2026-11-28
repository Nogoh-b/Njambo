/* Préférences du coach en direct, gardées sur l'appareil : niveau, compteurs de
   retrait de chaque conseil (D12), parties gagnées (proposition de passer en
   « Conseils » après 5 victoires). Store externe pour useSyncExternalStore. */

import { updateCounter, type CoachLevel, type TipCounter } from "@/engine/academy/liveCoach";

export interface CoachPrefs {
  level: CoachLevel;
  /** Niveau choisi par le joueur (sinon : valeur par défaut, que l'Académie peut changer). */
  chosen: boolean;
  counters: Record<string, TipCounter>;
  wins: number;
  /** Proposition de passer en « Conseils » : à dire au prochain tour, puis dite. */
  levelUp: "none" | "pending" | "said";
}

const KEY = "njambo-coach-v1";
/** Gagnées avant de proposer « Conseils » (D12). */
export const LEVEL_UP_WINS = 5;
/* Joueur sans réglage : « Conseils » (les conseils importants, vite retirés). L'Académie le
   passe en « Accompagné » tant qu'il n'a rien choisi : un joueur déjà habitué n'est pas noyé de bulles. */
const DEFAULT_PREFS: CoachPrefs = { level: "tips", chosen: false, counters: {}, wins: 0, levelUp: "none" };
const LEVELS: CoachLevel[] = ["guided", "tips", "off"];

function load(): CoachPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<CoachPrefs>;
    return {
      level: LEVELS.includes(raw.level as CoachLevel) ? (raw.level as CoachLevel) : DEFAULT_PREFS.level,
      chosen: raw.chosen === true,
      counters: raw.counters && typeof raw.counters === "object" ? raw.counters : {},
      wins: Number.isFinite(raw.wins) ? Number(raw.wins) : 0,
      levelUp: raw.levelUp === "pending" || raw.levelUp === "said" ? raw.levelUp : "none",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

let prefs: CoachPrefs | null = null;
const listeners = new Set<() => void>();

function current(): CoachPrefs {
  prefs ??= load();
  return prefs;
}

function save(next: CoachPrefs) {
  prefs = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* stockage indisponible */ }
  listeners.forEach((listener) => listener());
}

export const coachPrefs = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getSnapshot: (): CoachPrefs => current(),
  getServerSnapshot: (): CoachPrefs => DEFAULT_PREFS,

  /** Réglage du joueur (Options, bouton ? de la table). */
  setLevel(level: CoachLevel) {
    save({ ...current(), level, chosen: true });
  },

  /** Nouveau joueur (Académie, « Je découvre ») : « Accompagné », sauf s'il a déjà choisi. */
  guideNewcomer() {
    if (!current().chosen && current().level !== "guided") save({ ...current(), level: "guided" });
  },

  record(key: string, event: { shown?: boolean; applied?: boolean | null }) {
    const state = current();
    save({ ...state, counters: { ...state.counters, [key]: updateCounter(state.counters[key], event) } });
  },

  /** Partie gagnée : après 5, proposer « Conseils » à un joueur resté en « Accompagné » par défaut. */
  win() {
    const state = current();
    const wins = state.wins + 1;
    const propose = wins >= LEVEL_UP_WINS && state.level === "guided" && state.levelUp === "none";
    save({ ...state, wins, levelUp: propose ? "pending" : state.levelUp });
  },

  levelUpSaid() {
    save({ ...current(), levelUp: "said" });
  },

  /** Tests : repartir de zéro. */
  reset() {
    prefs = DEFAULT_PREFS;
    listeners.forEach((listener) => listener());
  },
};
