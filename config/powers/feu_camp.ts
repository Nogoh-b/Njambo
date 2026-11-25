import type { PowerModule } from "../../engine/power/types";

/** Feu de Camp — +100 Nkap au pot si tu gagnes la manche (c'est toi qui le rafles) : la version commune de Pluie d'Étoiles.
 *  (Avant : « si tu remportes ce pli » — le bonus pouvait revenir à un adversaire.) */
export const feuCamp: PowerModule = {
  def: {
    id: "feu_camp",
    name: "Feu de Camp",
    category: "score",
    icon: "spark",
    tone: "gold",
    rarity: "common",
    targetMode: "none",
    art: "/assets/power-cards/v2/feu_camp.webp",
    activationTitle: "FEU DE CAMP",
    activationText: "+100 Nkap au pot si tu gagnes la manche",
    activationTextOthers: "{activator} allume un feu de camp",
    description: "+100 Nkap au pot si tu gagnes la manche.",
    costCauris: 24,
    costNkap: 380,
    animTags: ["pot_bonus"],
  },
  script: {
    id: "feu_camp",
    target: { count: "none" },
    steps: [
      {
        ops: [{ op: "potBonus", amount: 100, when: "winRound" }],
        anim: [{ cue: "potFlash", amountLabel: "+100" }],
        /* Le feu prend devant le pot :
           1. annonce (« {activator} allume un feu de camp » chez les autres) ;
           2. des bûches se posent, les flammes montent et dansent, étincelles ; le pot rougeoie, « +100 » ;
           3. textes pour le lanceur et les autres ;
           ensuite (PowerChargeLayer), pour tous : « 🔥 +100 pour X · 750 → 850 » près du pot jusqu'au dernier pli ;
           si X rafle le pot, éclat doré et montant final ; sinon « Bonus perdu ». */
        choreo: {
          tracks: [
            { id: "feu", kind: "element", startMs: 0, durationMs: 2000, target: { element: "pot" }, effect: "campfire", label: "+100", intensity: 2 },
            { id: "lanceur", kind: "text", startMs: 1000, durationMs: 1900, text: "Gagne la manche : +100 Nkap au pot", at: { kind: "screen", at: "tableCenter", dy: -14 }, size: "s", tone: "gold", audience: "activator" },
            { id: "temoin", kind: "text", startMs: 1000, durationMs: 1900, text: "Si {activator} gagne la manche, +100 Nkap au pot", at: { kind: "screen", at: "tableCenter", dy: -14 }, size: "s", tone: "gold", audience: "others" },
          ],
        },
      },
    ],
  },
};
