import type { PowerModule } from "@/engine/power/types";

/** Bouclier du Village — bloque la prochaine carte offensive ciblée contre toi. */
export const bouclierVillage: PowerModule = {
  def: {
    id: "bouclier_village",
    name: "Bouclier du Village",
    category: "defense",
    icon: "crown",
    tone: "teal",
    rarity: "epic",
    targetMode: "self",
    art: "/assets/power-cards/bouclier_village.webp",
    activationTitle: "BOUCLIER",
    activationText: "La prochaine attaque ciblée est bloquée",
    description: "Bloque la prochaine carte offensive ciblée contre toi.",
    costCauris: 55,
    costNkap: 900,
    animTags: ["future_block"],
  },
  script: {
    id: "bouclier_village",
    target: { count: "none" },
    steps: [
      {
        ops: [{ op: "grantShield", player: "self", blocks: ["targeted"] }],
        anim: [{ cue: "avatarAura", player: "self", style: "shield" }],
      },
    ],
  },
};
