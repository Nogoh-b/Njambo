import type { PowerCardDef, PowerCardId } from "@/types/game";

/* ═══════════════ Cartes Pouvoir — Njambo ═══════════════
   Système de cartes-pouvoir inspiré des boosters de Word Domination.
   6 cartes réparties en 3 catégories (offensive / score / perturbation).
   Chaque joueur peut équiper jusqu'à 2 cartes par partie, chacune
   utilisable une seule fois. */

export const POWER_CARDS: PowerCardDef[] = [
  /* ── Offensives ── */
  {
    id: "oeil_sorcier",
    name: "Œil du Sorcier",
    category: "offensive",
    icon: "eye",
    tone: "pink",
    description: "Vois la main d'un adversaire pendant 5 secondes.",
    costCauris: 30,
    costFcfa: 500,
  },
  {
    id: "coupe_circuit",
    name: "Coupe-Circuit",
    category: "offensive",
    icon: "cut",
    tone: "pink",
    description: "Force un adversaire à jouer sa carte la plus faible au prochain pli.",
    costCauris: 40,
    costFcfa: 700,
  },
  /* ── Score ── */
  {
    id: "benediction_chef",
    name: "Bénédiction du Chef",
    category: "score",
    icon: "star",
    tone: "gold",
    description: "Double le gain si tu remportes ce pli.",
    costCauris: 35,
    costFcfa: 600,
  },
  {
    id: "pluie_etoiles",
    name: "Pluie d'Étoiles",
    category: "score",
    icon: "sparkle",
    tone: "gold",
    description: "+200 FCFA bonus au pot si tu remportes ce pli.",
    costCauris: 50,
    costFcfa: 800,
  },
  /* ── Perturbation ── */
  {
    id: "vent_nord",
    name: "Vent du Nord",
    category: "perturbation",
    icon: "wind",
    tone: "teal",
    description: "Échange une carte de ta main contre une carte aléatoire de la pioche.",
    costCauris: 25,
    costFcfa: 400,
  },
  {
    id: "sable_temps",
    name: "Sable du Temps",
    category: "perturbation",
    icon: "hourglass",
    tone: "teal",
    description: "Gèle le timer de ton adversaire pendant 10 secondes.",
    costCauris: 30,
    costFcfa: 500,
  },
];

/** Map rapide pour récupérer une définition par id. */
export const POWER_CARDS_BY_ID: Record<PowerCardId, PowerCardDef> = Object.fromEntries(
  POWER_CARDS.map((c) => [c.id, c]),
) as Record<PowerCardId, PowerCardDef>;

/** Nombre maximum de cartes équipées par partie. */
export const MAX_EQUIPPED_POWERS = 2;

/** Récompenses en cauris. */
export const CAURIS_REWARDS = {
  /** Par victoire */
  perWin: 20,
  /** Par pli remporté */
  perTrick: 2,
  /** Défi quotidien complété */
  dailyChallenge: 50,
} as const;

/** Solde de cauris de départ pour un nouveau joueur. */
export const STARTING_CAURIS = 50;
