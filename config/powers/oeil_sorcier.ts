import type { PowerModule } from "../../engine/power/types";

/** Œil du Sorcier — révèle la main d'un adversaire pendant 5 secondes.
 *  Révélation sur la table (PowerFxOrchestrator.revealOnTable) : chez tous, un œil s'ouvre au-dessus de la main visée et la
 *  balaie ; ses cartes volent une par une au centre, face visible pour le lanceur, de dos pour les autres, puis repartent.
 *  Rien ne bloque le jeu : le lanceur joue en regardant. (Avant : plein écran sombre qui mangeait ~5 s de son tour.) */
export const oeilSorcier: PowerModule = {
  def: {
    id: "oeil_sorcier",
    name: "Œil du Sorcier",
    category: "offensive",
    icon: "eye",
    tone: "pink",
    rarity: "rare",
    targetMode: "opponent",
    art: "/assets/power-cards/v2/oeil_sorcier.webp",
    activationTitle: "ŒIL DU SORCIER",
    activationText: "Tu vois sa main pendant 5 secondes",
    activationTextOthers: "{activator} lit la main de {target}",
    description: "Vois la main d'un adversaire pendant 5 secondes.",
    costCauris: 30,
    costNkap: 500,
    animTags: ["hand_target_reveal"],
  },
  script: {
    id: "oeil_sorcier",
    target: { count: "one", chooser: "activator" },
    steps: [
      {
        ops: [{ op: "revealHand", player: "target", durationMs: 5000 }],
        anim: [{ cue: "revealOverlay", player: "target", durationMs: 5000 }],
      },
    ],
  },
};
