import type { PowerModule } from "@/engine/power/types";

/** Masque du Bluffeur — annule la prochaine révélation/lecture adverse contre toi. */
export const masqueBluffeur: PowerModule = {
  def: {
    id: "masque_bluffeur",
    name: "Masque du Bluffeur",
    category: "defense",
    icon: "eye",
    tone: "pink",
    rarity: "rare",
    targetMode: "self",
    art: "/assets/power-cards/masque_bluffeur.webp",
    activationTitle: "BLUFF",
    activationText: "La prochaine lecture est annulée",
    description: "Annule la prochaine révélation ou lecture adverse contre toi.",
    costCauris: 38,
    costFcfa: 640,
    animTags: ["future_block"],
  },
  script: {
    id: "masque_bluffeur",
    target: { count: "none" },
    steps: [
      {
        ops: [{ op: "grantShield", player: "self", blocks: ["reveal"] }],
        anim: [{ cue: "avatarAura", player: "self", style: "mask" }],
      },
    ],
  },
};
