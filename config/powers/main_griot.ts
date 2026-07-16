import type { PowerModule } from "../../engine/power/types";

/** Main du Griot — suggère ta meilleure carte légale pendant 6 secondes. */
export const mainGriot: PowerModule = {
  def: {
    id: "main_griot",
    name: "Main du Griot",
    category: "tactical",
    icon: "profile",
    tone: "teal",
    rarity: "rare",
    targetMode: "self",
    art: "/assets/power-cards/main_griot.webp",
    activationTitle: "CONSEIL",
    activationText: "Meilleure carte suggérée",
    description: "Suggère ta meilleure carte légale pendant 6 secondes.",
    costCauris: 32,
    costNkap: 520,
    animTags: ["hand_self_recommend"],
  },
  script: {
    id: "main_griot",
    target: { count: "none" },
    steps: [
      {
        ops: [
          {
            op: "highlightCard",
            player: "self",
            select: { kind: "bestLegal" },
            durationMs: 6000,
          },
        ],
        anim: [
          {
            cue: "highlightHandCard",
            player: "self",
            cards: "resolved:highlight",
            style: "recommend",
            durationMs: 6000,
          },
        ],
      },
    ],
  },
};
