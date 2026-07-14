import type { PowerModule } from "@/engine/power/types";

/** Tambour d'Appel — ajoute 8 secondes à ton timer ce tour. */
export const tambourAppel: PowerModule = {
  def: {
    id: "tambour_appel",
    name: "Tambour d'Appel",
    category: "tactical",
    icon: "sound",
    tone: "gold",
    rarity: "common",
    targetMode: "self",
    art: "/assets/power-cards/tambour_appel.webp",
    activationTitle: "TAMBOUR",
    activationText: "+8 secondes",
    description: "Ajoute 8 secondes à ton timer ce tour.",
    costCauris: 22,
    costNkap: 350,
    animTags: ["timer_self"],
  },
  script: {
    id: "tambour_appel",
    target: { count: "none" },
    steps: [
      {
        ops: [{ op: "timerDelta", player: "self", seconds: 8 }],
        anim: [{ cue: "timerFx", player: "self", kind: "gain", seconds: 8 }],
      },
    ],
  },
};
