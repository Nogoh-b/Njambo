import type { PowerModule } from "../../engine/power/types";

/** Sable du Temps — gèle le timer d'un adversaire pendant 10 secondes. */
export const sableTemps: PowerModule = {
  def: {
    id: "sable_temps",
    name: "Sable du Temps",
    category: "perturbation",
    icon: "hourglass",
    tone: "teal",
    rarity: "rare",
    targetMode: "opponent",
    art: "/assets/power-cards/sable_temps.webp",
    activationTitle: "TEMPS FIGÉ",
    activationText: "Timer adverse gelé",
    description: "Gèle le timer d'un adversaire pendant 10 secondes.",
    costCauris: 30,
    costNkap: 500,
    animTags: ["timer_target"],
  },
  script: {
    id: "sable_temps",
    target: { count: "one", chooser: "activator" },
    steps: [
      {
        ops: [{ op: "timerFreeze", player: "target", durationMs: 10000 }],
        anim: [{ cue: "timerFx", player: "target", kind: "freeze", durationMs: 10000 }],
      },
    ],
  },
};
