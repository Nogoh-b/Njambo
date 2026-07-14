import type { PowerModule } from "@/engine/power/types";

/** Marché de Nuit — remplace ta plus faible carte par une MEILLEURE carte de
 *  la pioche. Peut no-op (aucune carte plus forte) → la carte n'est pas consommée. */
export const marcheNuit: PowerModule = {
  def: {
    id: "marche_nuit",
    name: "Marché de Nuit",
    category: "tactical",
    icon: "coin",
    tone: "cobalt",
    rarity: "epic",
    targetMode: "self",
    art: "/assets/power-cards/marche_nuit.webp",
    activationTitle: "MARCHÉ",
    activationText: "Carte faible améliorée",
    description: "Remplace ta plus faible carte par une meilleure carte si la pioche le permet.",
    costCauris: 60,
    costNkap: 1000,
    animTags: ["hand_self_mutate"],
  },
  script: {
    id: "marche_nuit",
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
            swap: { incoming: { kind: "firstBetterThanWeakest" } },
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
