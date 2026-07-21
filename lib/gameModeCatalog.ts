import type { NjamboIconName } from "@/components/ui/Art";
import type { SceneName } from "@/types/game";

export type GameModeTone = "gold" | "teal" | "pink";

export interface GameModeCatalogEntry {
  scene: Extract<SceneName, "online_setup" | "bot_setup" | "friends_invite">;
  title: string;
  shortTitle: string;
  eyebrow: string;
  homeKicker: string;
  description: string;
  homeDescription: string;
  icon: NjamboIconName;
  tone: GameModeTone;
  art: string;
  primary?: boolean;
  guestAllowed: boolean;
  chips: ReadonlyArray<{ label: string; icon: NjamboIconName }>;
}

/**
 * Source unique des modes exposés par Accueil et Jouer. Les destinations et
 * restrictions restent celles des parcours historiques ; seules les pages
 * choisissent la quantité de texte qu'elles affichent.
 */
export const GAME_MODE_CATALOG: ReadonlyArray<GameModeCatalogEntry> = [
  {
    scene: "online_setup",
    title: "Classé en ligne",
    shortTitle: "En ligne",
    eyebrow: "La grande table",
    homeKicker: "Table classée",
    description: "Affronte le Mboa, fais monter ton rang et impose ton nom dans le Ter.",
    homeDescription: "Affronte le Ter et fais monter ton rang",
    icon: "online",
    tone: "teal",
    art: "/assets/njambo/menu/mode-online.webp",
    primary: true,
    guestAllowed: false,
    chips: [
      { label: "10 énergie", icon: "spark" },
      { label: "Mise Nkap", icon: "coin" },
      { label: "Couronnes", icon: "crown" },
    ],
  },
  {
    scene: "bot_setup",
    title: "Contre l’IA",
    shortTitle: "Contre l’IA",
    eyebrow: "Entraînement",
    homeKicker: "Table libre",
    description: "Choisis ta difficulté et perfectionne tes combinaisons à ton rythme.",
    homeDescription: "Entraîne ton jeu à ton rythme",
    icon: "bot",
    tone: "gold",
    art: "/assets/njambo/menu/mode-ai.webp",
    guestAllowed: true,
    chips: [
      { label: "5 énergie", icon: "spark" },
      { label: "Mises 100–500", icon: "coin" },
      { label: "Invité accepté", icon: "profile" },
    ],
  },
  {
    scene: "friends_invite",
    title: "Entre amis",
    shortTitle: "Entre amis",
    eyebrow: "Table privée",
    homeKicker: "Table libre",
    description: "Crée une invitation et retrouve tes proches autour de ta propre table.",
    homeDescription: "Invite ta bande autour de la table",
    icon: "friends",
    tone: "pink",
    art: "/assets/njambo/menu/mode-friends.webp",
    guestAllowed: false,
    chips: [
      { label: "10 énergie", icon: "spark" },
      { label: "Sans mise", icon: "coin" },
      { label: "Non classé", icon: "crown" },
    ],
  },
];

export function isGameModeLocked(mode: GameModeCatalogEntry, guest: boolean): boolean {
  return guest && !mode.guestAllowed;
}

export function resolveGameModeDestination(
  mode: GameModeCatalogEntry,
  guest: boolean,
): SceneName {
  return isGameModeLocked(mode, guest) ? "profile" : mode.scene;
}
