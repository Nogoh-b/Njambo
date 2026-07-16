import type { PowerModule } from "../../engine/power/types";

/** Bénédiction du Chef — double le gain si tu remportes ce pli. */
export const benedictionChef: PowerModule = {
  def: {
    id: "benediction_chef",
    name: "Bénédiction du Chef",
    category: "score",
    icon: "star",
    tone: "gold",
    rarity: "epic",
    targetMode: "none",
    art: "/assets/power-cards/benediction_chef.webp",
    activationTitle: "BÉNÉDICTION",
    activationText: "Gain du pli x2",
    description: "Double le gain si tu remportes ce pli.",
    costCauris: 35,
    costNkap: 600,
    animTags: ["pot_bonus"],
  },
  script: {
    id: "benediction_chef",
    target: { count: "none" },
    steps: [
      {
        ops: [{ op: "potMultiplier", factor: 2, when: "winTrick" }],
        anim: [{ cue: "potFlash", amountLabel: "×2" }],
      },
    ],
  },
};
