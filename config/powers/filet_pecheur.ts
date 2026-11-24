import type { PowerModule } from "../../engine/power/types";

/** Filet du Pêcheur — le filet attrape le gros poisson : la cible doit jouer sa plus FORTE carte légale
 *  (Coupe-Circuit, lui, impose la plus faible). */
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
    activationText: "La cible jouera sa carte la plus forte à son prochain tour",
    description: "Force la cible à jouer sa plus forte carte légale.",
    costCauris: 42,
    costNkap: 720,
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
            select: { kind: "strongest" },
          },
        ],
        anim: [
          { cue: "toast", text: "{target} devra jouer sa plus forte carte", tone: "teal" },
        ],
      },
    ],
  },
};
