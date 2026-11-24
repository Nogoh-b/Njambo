import type { PowerModule } from "../../engine/power/types";

/** Bénédiction du Chef — double le pot si tu gagnes la manche (c'est toi qui le rafles).
 *  (Avant : « si tu remportes ce pli » — le pot doublé pouvait revenir à un adversaire.) */
export const benedictionChef: PowerModule = {
  def: {
    id: "benediction_chef",
    name: "Bénédiction du Chef",
    category: "score",
    icon: "star",
    tone: "gold",
    rarity: "epic",
    targetMode: "none",
    art: "/assets/power-cards/v2/benediction_chef.webp",
    activationTitle: "BÉNÉDICTION DU CHEF",
    activationText: "Pot ×2 si tu gagnes la manche",
    activationTextOthers: "{activator} bénit le pot",
    description: "Double le pot si tu gagnes la manche.",
    costCauris: 35,
    costNkap: 600,
    animTags: ["pot_bonus"],
  },
  script: {
    id: "benediction_chef",
    target: { count: "none" },
    steps: [
      {
        ops: [{ op: "potMultiplier", factor: 2, when: "winRound" }],
        anim: [{ cue: "potFlash", amountLabel: "×2" }],
        /* Le chef bénit le pot :
           1. annonce (« {activator} bénit le pot » chez les autres) ;
           2. un halo doré se forme au-dessus de l'avatar du lanceur, vole jusqu'au pot en tournant et s'y pose ;
              le pot enfle et rayonne, « ×2 » ;
           3. textes pour le lanceur et les autres ;
           ensuite (PowerChargeLayer), pour tous : « ⭐ ×2 pour X · 750 → 1 500 » près du pot jusqu'au dernier pli ;
           si X rafle le pot, éclat doré et montant final ; sinon « Bonus perdu ». */
        choreo: {
          tracks: [
            { id: "halo", kind: "element", startMs: 0, durationMs: 1600, target: { element: "pot" }, effect: "bless", label: "×2", intensity: 3 },
            { id: "lanceur", kind: "text", startMs: 1000, durationMs: 1900, text: "Gagne la manche : le pot double", at: { kind: "screen", at: "tableCenter", dy: -14 }, size: "s", tone: "gold", audience: "activator" },
            { id: "temoin", kind: "text", startMs: 1000, durationMs: 1900, text: "Si {activator} gagne la manche, le pot double", at: { kind: "screen", at: "tableCenter", dy: -14 }, size: "s", tone: "gold", audience: "others" },
          ],
        },
      },
    ],
  },
};
