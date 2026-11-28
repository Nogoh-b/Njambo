/* Porte d'entrée de l'Académie (A5, D1) : au tout premier lancement, « Je découvre
   Njambo », « Je connais le Njambo » ou « Passer ». Montrée une seule fois ; jamais
   à un joueur qui arrive par un lien (salle d'un ami, événement, Académie) ni à
   un joueur qui revient. */

export type EntryDoorChoice = "discover" | "known" | "skipped";

/** Choix fait à la porte (gardé sur l'appareil ; la progression de l'Académie s'y ajoutera en A6). */
const DOOR_KEY = "njambo-academy-v1";

/** Joueur déjà venu sur cet appareil : l'application y laisse toujours des clés « njambo… »
 *  (pack d'assets, catalogue audio, profil…). La session de compte, elle, n'y est pas forcément. */
export function isFirstLaunch(storageKeys: string[]): boolean {
  return !storageKeys.some((key) => key.startsWith("njambo"));
}

export interface EntryDoorBoot {
  /** Rien n'indique une visite précédente sur cet appareil. */
  firstLaunch: boolean;
  /** La porte a déjà reçu une réponse. */
  answered: boolean;
  search: string;
  hash: string;
}

/** Arrivée sur l'accueil, sans lien qui mène ailleurs (salle, événement, Académie). */
export function shouldOpenEntryDoor(boot: EntryDoorBoot): boolean {
  if (!boot.firstLaunch || boot.answered) return false;
  if (/[?&](event|academie|room)=/.test(boot.search)) return false;
  const hash = boot.hash.replace(/^#\/?/, "");
  return hash === "" || hash === "menu";
}

function readBoot(): EntryDoorBoot {
  if (typeof window === "undefined") return { firstLaunch: false, answered: true, search: "", hash: "" };
  try {
    return {
      firstLaunch: isFirstLaunch(Object.keys(localStorage)),
      answered: Boolean(JSON.parse(localStorage.getItem(DOOR_KEY) ?? "{}")?.door),
      search: window.location.search,
      hash: window.location.hash,
    };
  } catch {
    return { firstLaunch: false, answered: true, search: "", hash: "" };
  }
}

/* Photographié au chargement du module, avant que l'application n'enregistre le profil
   ou ne consomme les liens d'arrivée. */
const BOOT = readBoot();

export function entryDoorAtBoot(): EntryDoorBoot {
  return BOOT;
}

export function markEntryDoor(choice: EntryDoorChoice) {
  try {
    const saved = JSON.parse(localStorage.getItem(DOOR_KEY) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(DOOR_KEY, JSON.stringify({ ...saved, door: choice, doorAt: Date.now() }));
  } catch { /* stockage indisponible */ }
}
