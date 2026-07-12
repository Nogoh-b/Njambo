import type { PowerModule } from "@/engine/power/types";

/** Cauris Chanceux — récupère 50 % de ta mise si tu perds la manche. */
export const caurisChanceux: PowerModule = {
  def: {
    id: "cauris_chanceux",
    name: "Cauris Chanceux",
    category: "economy",
    icon: "coin",
    tone: "gold",
    rarity: "common",
    targetMode: "self",
    art: "/assets/power-cards/cauris_chanceux.webp",
    activationTitle: "CHANCE",
    activationText: "Remboursement si tu perds",
    description: "Récupère 50% de ta mise si tu perds la manche.",
    costCauris: 28,
    costFcfa: 450,
    animTags: ["result_economy"],
  },
  script: {
    id: "cauris_chanceux",
    target: { count: "none" },
    steps: [
      {
        ops: [{ op: "refundOnLoss", player: "self", ratio: 0.5 }],
        anim: [{ cue: "avatarAura", player: "self", style: "lucky" }],
      },
    ],
  },
};
