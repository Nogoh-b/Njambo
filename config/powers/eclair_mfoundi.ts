import type { PowerModule } from "../../engine/power/types";

/** Éclair du Mfoundi — ta prochaine carte gagne +2 valeur virtuelle (max 10).
 *  Le badge « boosté » apparaît sur le dépôt au moment où la carte est jouée. */
export const eclairMfoundi: PowerModule = {
  def: {
    id: "eclair_mfoundi",
    name: "Éclair du Mfoundi",
    category: "offensive",
    icon: "spark",
    tone: "teal",
    rarity: "epic",
    targetMode: "self",
    art: "/assets/power-cards/eclair_mfoundi.webp",
    activationTitle: "ÉCLAIR",
    activationText: "+2 sur ta prochaine carte",
    description: "Ta prochaine carte gagne +2 valeur virtuelle, max 10.",
    costCauris: 58,
    costNkap: 950,
    animTags: ["hand_self_boost"],
  },
  script: {
    id: "eclair_mfoundi",
    target: { count: "none" },
    steps: [
      {
        ops: [{ op: "boostNextCard", player: "self", valueBonus: 2 }],
      },
    ],
  },
};
