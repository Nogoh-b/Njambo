import type { PowerModule } from "../../engine/power/types";

/** Troc Ciblé (carte de DEV) — démonstration du CLIC GÉNÉRIQUE : le joueur
 *  CHOISIT la carte de sa main à échanger contre le dessus de la pioche
 *  (étape `choice` du script, surface "hand-self"). Jamais en boutique. */
export const trocCible: PowerModule = {
  dev: true,
  def: {
    id: "troc_cible",
    name: "Troc Ciblé",
    category: "tactical",
    icon: "cards",
    tone: "cobalt",
    rarity: "epic",
    targetMode: "self",
    art: "/assets/power-cards/marche_nuit.webp",
    activationTitle: "TROC",
    activationText: "La carte de TON choix est échangée",
    description: "Choisis une carte de ta main : elle est échangée contre le dessus de la pioche.",
    costCauris: 40,
    costNkap: 650,
    animTags: ["hand_self_mutate"],
  },
  script: {
    id: "troc_cible",
    target: { count: "none" },
    conditions: [{ kind: "deckNotEmpty" }],
    steps: [
      {
        choice: { id: "give", surface: "hand-self", onTimeout: "cancel" },
        ops: [
          {
            op: "moveCards",
            from: { zone: "hand", player: "self" },
            select: { kind: "chosen", choiceId: "give" },
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
