import type { PowerModule } from "../../engine/power/types";

/** Pluie d'Étoiles — +200 Nkap au pot si tu gagnes la manche (c'est toi qui le rafles).
 *  (Avant : « si tu remportes ce pli » — le bonus pouvait revenir à un adversaire.) */
export const pluieEtoiles: PowerModule = {
  def: {
    id: "pluie_etoiles",
    name: "Pluie d'Étoiles",
    category: "score",
    icon: "sparkle",
    tone: "gold",
    rarity: "rare",
    targetMode: "none",
    art: "/assets/power-cards/v2/pluie_etoiles.webp",
    activationTitle: "PLUIE D'OR",
    activationText: "+200 Nkap au pot si tu gagnes la manche",
    description: "+200 Nkap au pot si tu gagnes la manche.",
    costCauris: 50,
    costNkap: 800,
    animTags: ["pot_bonus"],
  },
  script: {
    id: "pluie_etoiles",
    target: { count: "none" },
    steps: [
      {
        ops: [{ op: "potBonus", amount: 200, when: "winRound" }],
        anim: [{ cue: "potFlash", amountLabel: "+200" }],
      },
    ],
  },
};
