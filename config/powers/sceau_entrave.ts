import type { PowerModule } from "@/engine/power/types";

/** Sceau d'Entrave — bloque une carte légale si une alternative reste disponible. */
export const sceauEntrave: PowerModule = {
  def: {
    id: "sceau_entrave",
    name: "Sceau d'Entrave",
    category: "offensive",
    icon: "shield",
    tone: "pink",
    rarity: "epic",
    targetMode: "opponent",
    art: "/assets/power-cards/filet_pecheur.webp",
    activationTitle: "SCEAU POSÉ",
    activationText: "Une carte jouable est interdite",
    description: "Bloque au hasard une carte légale d'un adversaire s'il dispose d'au moins deux choix.",
    costCauris: 60,
    costNkap: 950,
    animTags: ["hand_target_restrict"],
  },
  script: {
    id: "sceau_entrave",
    target: { count: "one", chooser: "activator" },
    steps: [
      {
        ops: [{
          op: "blockNextLegalCard",
          player: "target",
          select: { kind: "random" },
          minLegalChoices: 2,
        }],
        anim: [
          {
            cue: "highlightHandCard",
            player: "target",
            cards: "resolved:highlight",
            style: "locked",
            durationMs: 3200,
            fx: { preset: "lock", tone: "pink", intensity: "spectacular" },
          },
          { cue: "toast", text: "Une carte de {target} est scellée", tone: "pink" },
        ],
      },
    ],
  },
};
