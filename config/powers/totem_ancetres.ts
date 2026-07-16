import type { PowerModule } from "../../engine/power/types";

/** Totem des Ancêtres — protège du malus double si tu perds cette manche. */
export const totemAncetres: PowerModule = {
  def: {
    id: "totem_ancetres",
    name: "Totem des Ancêtres",
    category: "defense",
    icon: "trophy",
    tone: "gold",
    rarity: "legendary",
    targetMode: "self",
    art: "/assets/power-cards/totem_ancetres.webp",
    activationTitle: "ANCESTRES",
    activationText: "Double pénalité protégée",
    description: "Protège du malus double si tu perds cette manche.",
    costCauris: 70,
    costNkap: 1200,
    animTags: ["result_economy"],
  },
  script: {
    id: "totem_ancetres",
    target: { count: "none" },
    steps: [
      {
        ops: [{ op: "preventDoublePenalty", player: "self" }],
        anim: [{ cue: "avatarAura", player: "self", style: "totem" }],
      },
    ],
  },
};
