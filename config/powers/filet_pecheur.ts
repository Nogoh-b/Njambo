import type { PowerModule } from "@/engine/power/types";

/** Filet du Pêcheur — force la cible à jouer sa plus basse carte légale. */
export const filetPecheur: PowerModule = {
  def: {
    id: "filet_pecheur",
    name: "Filet du Pêcheur",
    category: "offensive",
    icon: "wind",
    tone: "teal",
    rarity: "rare",
    targetMode: "opponent",
    art: "/assets/power-cards/filet_pecheur.webp",
    activationTitle: "FILET",
    activationText: "La cible jouera sa carte la plus faible à son prochain tour",
    description: "Force la cible à jouer sa plus basse carte légale.",
    costCauris: 42,
    costFcfa: 720,
    animTags: ["hand_target_restrict"],
  },
  script: {
    id: "filet_pecheur",
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
          { cue: "toast", text: "{target} devra jouer sa plus faible carte", tone: "teal" },
        ],
      },
    ],
  },
};
