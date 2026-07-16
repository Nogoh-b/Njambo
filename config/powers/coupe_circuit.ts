import type { PowerModule } from "../../engine/power/types";

/** Coupe-Circuit — force un adversaire à jouer sa plus faible carte légale. */
export const coupeCircuit: PowerModule = {
  def: {
    id: "coupe_circuit",
    name: "Coupe-Circuit",
    category: "offensive",
    icon: "cut",
    tone: "pink",
    rarity: "rare",
    targetMode: "opponent",
    art: "/assets/power-cards/coupe_circuit.webp",
    activationTitle: "COUPÉ !",
    activationText: "La cible jouera sa carte la plus faible à son prochain tour",
    description: "Force un adversaire à jouer sa carte légale la plus faible.",
    costCauris: 40,
    costNkap: 700,
    animTags: ["hand_target_restrict"],
  },
  script: {
    id: "coupe_circuit",
    target: { count: "one", chooser: "activator" },
    steps: [
      {
        ops: [
          {
            op: "restrictNextPlay",
            player: "target",
            mode: "forceSelector",
            select: { kind: "weakest" },
          },
        ],
        anim: [
          { cue: "toast", text: "{target} devra jouer sa plus faible carte", tone: "pink" },
        ],
      },
    ],
  },
};
