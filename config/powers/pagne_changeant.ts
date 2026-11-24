import type { PowerModule } from "../../engine/power/types";

/** Pagne Changeant — ta prochaine carte hors tendance compte comme tendance
 *  si tu n'as pas la couleur demandée. */
export const pagneChangeant: PowerModule = {
  def: {
    id: "pagne_changeant",
    name: "Pagne Changeant",
    category: "tactical",
    icon: "cards",
    tone: "cobalt",
    rarity: "legendary",
    targetMode: "self",
    art: "/assets/power-cards/v2/pagne_changeant.webp",
    activationTitle: "PAGNE CHANGEANT",
    activationText: "Ta prochaine carte prend la couleur demandée",
    activationTextOthers: "{activator} change de pagne",
    description: "Ta prochaine carte hors tendance compte comme tendance si tu n'as pas la couleur.",
    costCauris: 72,
    costNkap: 1250,
    animTags: ["hand_self_boost"],
  },
  script: {
    id: "pagne_changeant",
    target: { count: "none" },
    conditions: [{ kind: "ledSuitKnown" }, { kind: "activatorLacksLedSuit" }],
    steps: [
      {
        ops: [{ op: "boostNextCard", player: "self", suitOverride: "led" }],
        /* Ta main se drape dans la couleur demandée :
           1. annonce (« {activator} change de pagne » chez les autres) ;
           2. un pagne aux motifs colorés glisse sur la main du lanceur, la couleur demandée s'élève au-dessus ;
           3. « Ta prochaine carte devient {suit} » ; ensuite, jusqu'à la carte jouée, chaque carte montre sa
              nouvelle couleur (« 7♣ → 7♥ »), « ⇄ ♥ » sous l'avatar chez les autres (PowerChargeLayer) ;
           4. à la pose, une vague de pagne entoure la carte sur le tapis, badge « ♣→♥ ». */
        choreo: {
          tracks: [
            { id: "drape", kind: "element", startMs: 0, durationMs: 1300, target: { element: "hand", player: "self" }, effect: "dye", intensity: 2 },
            { id: "couleur", kind: "text", startMs: 350, durationMs: 1200, text: "{suit}", at: { kind: "zone", zone: "hand", player: "self", dy: -26 }, size: "l", tone: "cobalt" },
            { id: "annonce", kind: "text", startMs: 1200, durationMs: 1700, text: "Ta prochaine carte devient {suit}", at: { kind: "zone", zone: "hand", player: "self", dy: -24 }, size: "s", tone: "cobalt", audience: "activator" },
            { id: "temoin", kind: "text", startMs: 1200, durationMs: 1700, text: "{activator} se drape en {suit}", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", tone: "cobalt", audience: "others" },
          ],
        },
      },
    ],
  },
};
