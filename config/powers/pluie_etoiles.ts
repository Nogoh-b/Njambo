import type { PowerModule } from "@/engine/power/types";

/** Pluie d'Étoiles — +200 NKAP au pot si l'activateur remporte ce pli. */
export const pluieEtoiles: PowerModule = {
  def: {
    id: "pluie_etoiles",
    name: "Pluie d'Étoiles",
    category: "score",
    icon: "sparkle",
    tone: "gold",
    rarity: "rare",
    targetMode: "none",
    art: "/assets/power-cards/pluie_etoiles.webp",
    activationTitle: "PLUIE D'OR",
    activationText: "+200 Nkap dans le pot",
    description: "+200 Nkap bonus au pot si tu remportes ce pli.",
    costCauris: 50,
    costNkap: 800,
    animTags: ["pot_bonus"],
  },
  script: {
    id: "pluie_etoiles",
    target: { count: "none" },
    steps: [
      {
        ops: [{ op: "potBonus", amount: 200, when: "winTrick" }],
        anim: [{ cue: "potFlash", amountLabel: "+200" }],
      },
    ],
  },
};
