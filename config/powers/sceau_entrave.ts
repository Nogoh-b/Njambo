import type { PowerModule } from "../../engine/power/types";

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
    art: "/assets/power-cards/sceau_entrave.webp",
    activationTitle: "SCEAU D'ENTRAVE",
    activationText: "Une carte de ta cible est scellée",
    activationTextOthers: "{activator} scelle une carte de {target}",
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
            delayMs: 1450,
            fx: { preset: "lock", tone: "pink", intensity: "spectacular" },
          },
          { cue: "toast", text: "Une carte de {target} est scellée", tone: "pink" },
        ],
        /* Le sceau frappe une carte :
           1. annonce (« {activator} scelle une carte de toi / de {target} ») ;
           2. (version C2 validée sur l'atelier) le sceau runique part de l'avatar du lanceur en tournoyant, se pose sur la carte
              scellée avec un rebond, quatre chaînes poussent vers ses coins, le sceau se fond en cadenas qui se ferme ;
              les autres voient où il tombe, la carte reste de dos ;
           3. textes pour le lanceur, la cible et les autres ;
           ensuite, jusqu'à sa carte (PowerChargeLayer) : chez la cible, la carte scellée reste éteinte, chaînes et cadenas
           posés dessus ; « 🔒 1 carte scellée » sous son avatar chez les autres. */
        choreo: {
          tracks: [
            { id: "sceau", kind: "element", startMs: 0, durationMs: 1900, target: { element: "hand", player: "target" }, effect: "stamp", intensity: 3 },
            { id: "lanceur", kind: "text", startMs: 1200, durationMs: 1800, text: "Une carte de {target} est scellée", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", tone: "pink", audience: "activator" },
            { id: "cible", kind: "text", startMs: 1200, durationMs: 2200, text: "Cette carte est scellée pour ton prochain tour", at: { kind: "zone", zone: "hand", player: "target", dy: -24 }, size: "s", tone: "pink", audience: "target" },
            { id: "temoin", kind: "text", startMs: 1200, durationMs: 1800, text: "Une carte de {target} est scellée", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", tone: "pink", audience: "bystanders" },
          ],
        },
      },
    ],
  },
};
