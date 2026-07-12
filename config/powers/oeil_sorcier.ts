import type { PowerModule } from "@/engine/power/types";

/** Œil du Sorcier — révèle la main d'un adversaire pendant 5 secondes. */
export const oeilSorcier: PowerModule = {
  def: {
    id: "oeil_sorcier",
    name: "Œil du Sorcier",
    category: "offensive",
    icon: "eye",
    tone: "pink",
    rarity: "rare",
    targetMode: "opponent",
    art: "/assets/power-cards/oeil_sorcier.webp",
    activationTitle: "VISION",
    activationText: "Main adverse révélée",
    description: "Vois la main d'un adversaire pendant 5 secondes.",
    costCauris: 30,
    costFcfa: 500,
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
