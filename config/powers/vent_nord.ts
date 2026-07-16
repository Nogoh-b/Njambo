import type { PowerModule } from "../../engine/power/types";

/** Vent du Nord — échange ta plus faible carte contre le dessus de la pioche. */
export const ventNord: PowerModule = {
  def: {
    id: "vent_nord",
    name: "Vent du Nord",
    category: "perturbation",
    icon: "wind",
    tone: "teal",
    rarity: "common",
    targetMode: "none",
    art: "/assets/power-cards/vent_nord.webp",
    activationTitle: "VENT LEVÉ",
    activationText: "Ta plus faible carte change",
    description: "Échange une carte faible de ta main contre une carte de la pioche.",
    costCauris: 25,
    costNkap: 400,
    animTags: ["hand_self_mutate"],
  },
  script: {
    id: "vent_nord",
    target: { count: "none" },
    conditions: [{ kind: "deckNotEmpty" }],
    steps: [
      {
        ops: [
          {
            op: "moveCards",
            from: { zone: "hand", player: "self" },
            select: { kind: "weakest" },
            to: { zone: "deck" },
            swap: { incoming: { kind: "topOfDeck" } },
          },
        ],
        anim: [
          {
            cue: "flyCards",
            from: { zone: "hand", player: "self" },
            to: { zone: "deck" },
            cards: "resolved:outgoing",
            mode: "move",
          },
          {
            cue: "flyCards",
            from: { zone: "deck" },
            to: { zone: "hand", player: "self" },
            cards: "resolved:incoming",
            mode: "move",
          },
          {
            cue: "highlightHandCard",
            player: "self",
            cards: "resolved:incoming",
            style: "swapped",
            durationMs: 2600,
          },
        ],
      },
    ],
  },
};
