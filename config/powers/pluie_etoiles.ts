import type { PowerModule } from "../../engine/power/types";

/** Pluie d'Étoiles — +200 Nkap au pot si tu gagnes la manche (c'est toi qui le rafles).
 *  (Avant : « si tu remportes ce pli » — le bonus pouvait revenir à un adversaire.) */
export const pluieEtoiles: PowerModule = {
  def: {
    id: "pluie_etoiles",
    name: "Pluie d'Étoiles",
    category: "score",
    icon: "sparkle",
    tone: "gold",
    rarity: "rare",
    targetMode: "none",
    art: "/assets/power-cards/v2/pluie_etoiles.webp",
    activationTitle: "PLUIE D'ÉTOILES",
    activationText: "+200 Nkap au pot si tu gagnes la manche",
    activationTextOthers: "{activator} fait pleuvoir des étoiles",
    description: "+200 Nkap au pot si tu gagnes la manche.",
    costCauris: 50,
    costNkap: 800,
    animTags: ["pot_bonus"],
  },
  script: {
    id: "pluie_etoiles",
    target: { count: "none" },
    steps: [
      {
        ops: [{ op: "potBonus", amount: 200, when: "winRound" }],
        anim: [{ cue: "potFlash", amountLabel: "+200" }],
        /* Les étoiles tombent sur le pot :
           1. annonce (« {activator} fait pleuvoir des étoiles » chez les autres) ;
           2. pluie d'or sur le pot, qui enfle et affiche « +200 » ;
           3. textes pour le lanceur et les autres ;
           ensuite (PowerChargeLayer), pour tous : « ⭐ +200 pour X · 750 → 950 » près du pot jusqu'au dernier pli ;
           si X rafle le pot, éclat doré et montant final ; sinon « Bonus perdu ». */
        choreo: {
          tracks: [
            { id: "pluie", kind: "screen", startMs: 0, durationMs: 1300, effect: "particles", preset: "goldRain", intensity: 3, at: { kind: "zone", zone: "pot" } },
            { id: "etoiles", kind: "screen", startMs: 250, durationMs: 1100, effect: "particles", preset: "goldRain", intensity: 2, at: { kind: "zone", zone: "pot", dy: -10 } },
            { id: "pot", kind: "element", startMs: 600, durationMs: 800, target: { element: "pot" }, effect: "label", label: "+200", intensity: 3 },
            { id: "gonfle", kind: "element", startMs: 600, durationMs: 700, target: { element: "pot" }, effect: "grow", intensity: 2 },
            { id: "lanceur", kind: "text", startMs: 1000, durationMs: 1900, text: "Gagne la manche : +200 Nkap au pot", at: { kind: "screen", at: "tableCenter", dy: -14 }, size: "s", tone: "gold", audience: "activator" },
            { id: "temoin", kind: "text", startMs: 1000, durationMs: 1900, text: "Si {activator} gagne la manche, +200 Nkap au pot", at: { kind: "screen", at: "tableCenter", dy: -14 }, size: "s", tone: "gold", audience: "others" },
          ],
        },
      },
    ],
  },
};
