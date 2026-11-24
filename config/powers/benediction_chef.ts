import type { PowerModule } from "../../engine/power/types";

/** Bénédiction du Chef — double le pot si tu gagnes la manche (c'est toi qui le rafles).
 *  (Avant : « si tu remportes ce pli » — le pot doublé pouvait revenir à un adversaire.) */
export const benedictionChef: PowerModule = {
  def: {
    id: "benediction_chef",
    name: "Bénédiction du Chef",
    category: "score",
    icon: "star",
    tone: "gold",
    rarity: "epic",
    targetMode: "none",
    art: "/assets/power-cards/v2/benediction_chef.webp",
    activationTitle: "BÉNÉDICTION",
    activationText: "Pot ×2 si tu gagnes la manche",
    description: "Double le pot si tu gagnes la manche.",
    costCauris: 35,
    costNkap: 600,
    animTags: ["pot_bonus"],
  },
  script: {
    id: "benediction_chef",
    target: { count: "none" },
    steps: [
      {
        ops: [{ op: "potMultiplier", factor: 2, when: "winRound" }],
        anim: [{ cue: "potFlash", amountLabel: "×2" }],
      },
    ],
  },
};
