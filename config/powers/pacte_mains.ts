import type { PowerModule } from "../../engine/power/types";

/** Pacte des Mains — échange 1 à 3 cartes choisies contre autant de cartes adverses. */
export const pacteMains: PowerModule = {
  def: {
    id: "pacte_mains",
    name: "Pacte des Mains",
    category: "tactical",
    icon: "cards",
    tone: "cobalt",
    rarity: "legendary",
    targetMode: "opponent",
    art: "/assets/power-cards/marche_nuit.webp",
    activationTitle: "PACTE SCELLÉ",
    activationText: "Les mains échangent leurs secrets",
    description: "Choisis jusqu'à 3 cartes et échange-les contre autant de cartes aléatoires d'un adversaire.",
    costCauris: 85,
    costNkap: 1400,
    animTags: ["hand_swap_players"],
  },
  script: {
    id: "pacte_mains",
    target: { count: "one", chooser: "activator" },
    steps: [
      {
        choice: {
          id: "give",
          surface: "hand-self",
          count: { min: 1, max: 3 },
          onTimeout: "cancel",
        },
        ops: [{
          op: "exchangeCards",
          left: "self",
          leftSelect: { kind: "chosen", choiceId: "give" },
          right: "target",
          rightSelect: { kind: "random" },
        }],
        anim: [
          {
            cue: "flyCards",
            from: { zone: "hand", player: "self" },
            to: { zone: "hand", player: "target" },
            cards: "resolved:outgoing",
            mode: "move",
            afterMs: 180,
            fx: { preset: "mystic", intensity: "spectacular" },
          },
          {
            cue: "flyCards",
            from: { zone: "hand", player: "target" },
            to: { zone: "hand", player: "self" },
            cards: "resolved:incoming",
            mode: "move",
            fx: { preset: "mystic", intensity: "spectacular" },
          },
          {
            cue: "highlightHandCard",
            player: "self",
            cards: "resolved:incoming",
            style: "swapped",
            durationMs: 3000,
          },
        ],
      },
    ],
  },
};
