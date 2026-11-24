import type { PowerModule } from "../../engine/power/types";

/** Éclair du Mfoundi — ta prochaine carte gagne +2 valeur virtuelle (max 10).
 *  Le badge « boosté » apparaît sur le dépôt au moment où la carte est jouée. */
export const eclairMfoundi: PowerModule = {
  def: {
    id: "eclair_mfoundi",
    name: "Éclair du Mfoundi",
    category: "offensive",
    icon: "spark",
    tone: "teal",
    rarity: "epic",
    targetMode: "self",
    art: "/assets/power-cards/eclair_mfoundi.webp",
    activationTitle: "ÉCLAIR DU MFOUNDI",
    activationText: "Ta prochaine carte frappe +2",
    activationTextOthers: "{activator} charge un éclair",
    description: "Ta prochaine carte gagne +2 valeur virtuelle, max 10.",
    costCauris: 58,
    costNkap: 950,
    animTags: ["hand_self_boost"],
  },
  script: {
    id: "eclair_mfoundi",
    target: { count: "none" },
    steps: [
      {
        ops: [{ op: "boostNextCard", player: "self", valueBonus: 2 }],
        /* La foudre charge ta main :
           1. annonce (« {activator} charge un éclair » chez les autres) ;
           2. le ciel s'assombrit, un éclair tombe sur la main du lanceur (flash, secousse, arcs sur les cartes) ;
           3. « Main chargée » chez le lanceur ; ensuite, jusqu'à la carte jouée, la main crépite et chaque carte
              montre sa valeur renforcée (« 7 → 9 »), un badge « ⚡ +2 » reste sur l'avatar chez les autres ;
           4. à la pose, la foudre frappe la carte sur le tapis (PowerChargeLayer). */
        choreo: {
          tracks: [
            { id: "orage", kind: "screen", startMs: 0, durationMs: 900, effect: "darken", intensity: 1 },
            { id: "foudre", kind: "element", startMs: 250, durationMs: 1000, target: { element: "hand", player: "self" }, effect: "strike", intensity: 3 },
            { id: "charge", kind: "text", startMs: 900, durationMs: 1600, text: "Main chargée : +2 sur ta prochaine carte", at: { kind: "zone", zone: "hand", player: "self", dy: -24 }, size: "s", tone: "teal", audience: "activator" },
            { id: "temoin", kind: "text", startMs: 900, durationMs: 1600, text: "{activator} charge un éclair", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", tone: "teal", audience: "others" },
          ],
        },
      },
    ],
  },
};
