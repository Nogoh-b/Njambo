import type { PowerModule } from "../../engine/power/types";

/** Pagne Changeant — ta prochaine carte hors tendance compte comme tendance
 *  si tu n'as pas la couleur demandée. */
export const pagneChangeant: PowerModule = {
  def: {
    id: "pagne_changeant",
    name: "Pagne Changeant",
    category: "tactical",
    icon: "cards",
    tone: "cobalt",
    rarity: "legendary",
    targetMode: "self",
    art: "/assets/power-cards/pagne_changeant.webp",
    activationTitle: "CAMÉLÉON",
    activationText: "Ta prochaine carte suit la tendance",
    description: "Ta prochaine carte hors tendance compte comme tendance si tu n'as pas la couleur.",
    costCauris: 72,
    costNkap: 1250,
    animTags: ["hand_self_boost"],
  },
  script: {
    id: "pagne_changeant",
    target: { count: "none" },
    conditions: [{ kind: "ledSuitKnown" }, { kind: "activatorLacksLedSuit" }],
    steps: [
      {
        ops: [{ op: "boostNextCard", player: "self", suitOverride: "led" }],
      },
    ],
  },
};
