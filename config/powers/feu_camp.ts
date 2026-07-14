import type { PowerModule } from "@/engine/power/types";

/** Feu de Camp — +100 NKAP au pot si tu remportes ce pli. */
export const feuCamp: PowerModule = {
  def: {
    id: "feu_camp",
    name: "Feu de Camp",
    category: "score",
    icon: "spark",
    tone: "gold",
    rarity: "common",
    targetMode: "none",
    art: "/assets/power-cards/feu_camp.webp",
    activationTitle: "FEU ALLUMÉ",
    activationText: "+100 Nkap au pot",
    description: "+100 Nkap au pot si tu domines ce pli.",
    costCauris: 24,
    costNkap: 380,
    animTags: ["pot_bonus"],
  },
  script: {
    id: "feu_camp",
    target: { count: "none" },
    steps: [
      {
        ops: [{ op: "potBonus", amount: 100, when: "winTrick" }],
        anim: [{ cue: "potFlash", amountLabel: "+100" }],
      },
    ],
  },
};
