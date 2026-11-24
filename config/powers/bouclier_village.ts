import type { PowerModule } from "../../engine/power/types";

/** Bouclier du Village — bloque la prochaine carte offensive ciblée contre toi, jusqu'à la fin de la manche. */
export const bouclierVillage: PowerModule = {
  def: {
    id: "bouclier_village",
    name: "Bouclier du Village",
    category: "defense",
    icon: "crown",
    tone: "teal",
    rarity: "epic",
    targetMode: "self",
    art: "/assets/power-cards/v2/bouclier_village.webp",
    activationTitle: "BOUCLIER DU VILLAGE",
    activationText: "La prochaine attaque qui te vise est bloquée",
    activationTextOthers: "{activator} lève le bouclier du village",
    description: "Bloque la prochaine carte offensive ciblée contre toi pendant cette manche.",
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
        /* Le village protège :
           1. annonce (« {activator} lève le bouclier du village » chez les autres) ;
           2. un bouclier de village se dresse devant l'avatar du lanceur en pivotant, puis s'ouvre en dôme ; aura bouclier,
              « Protégé » ;
           3. textes pour le lanceur et les autres ;
           ensuite (PowerChargeLayer), pour tous : « 🛡 Bouclier » sous son avatar jusqu'au blocage ou à la fin de la manche ;
           au blocage (PowerFxOrchestrator) : l'attaque s'écrase sur le dôme, qui se fissure et éclate,
           « Bloqué par le Bouclier du Village de X ». */
        choreo: {
          tracks: [
            { id: "bouclier", kind: "element", startMs: 0, durationMs: 1900, target: { element: "avatar", player: "self" }, effect: "villageShield", label: "Protégé", intensity: 2 },
            { id: "lanceur", kind: "text", startMs: 1100, durationMs: 1900, text: "La prochaine attaque qui te vise sera bloquée", at: { kind: "screen", at: "tableCenter", dy: -14 }, size: "s", tone: "teal", audience: "activator" },
            { id: "temoin", kind: "text", startMs: 1100, durationMs: 1900, text: "La prochaine attaque contre {activator} sera bloquée", at: { kind: "screen", at: "tableCenter", dy: -14 }, size: "s", tone: "teal", audience: "others" },
          ],
        },
      },
    ],
  },
};
