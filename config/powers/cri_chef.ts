import type { PowerModule } from "../../engine/power/types";

/** Cri du Chef — si tu ouvres le pli, retire 3 secondes aux adversaires. */
export const criChef: PowerModule = {
  def: {
    id: "cri_chef",
    name: "Cri du Chef",
    category: "perturbation",
    icon: "sound",
    tone: "pink",
    rarity: "rare",
    targetMode: "none",
    art: "/assets/power-cards/cri_chef.webp",
    activationTitle: "CRI DU CHEF",
    activationText: "-3s aux adversaires",
    description: "Si tu es leader du pli, retire 3 secondes aux adversaires.",
    costCauris: 36,
    costNkap: 580,
    animTags: ["timer_all_opponents"],
  },
  script: {
    id: "cri_chef",
    target: { count: "none" },
    conditions: [{ kind: "isTrickLeader", beforeAnyPlay: true }],
    steps: [
      {
        ops: [{ op: "timerDelta", player: "all_opponents", seconds: -3 }],
        anim: [{ cue: "timerFx", player: "all_opponents", kind: "loss", seconds: 3 }],
      },
    ],
  },
};
