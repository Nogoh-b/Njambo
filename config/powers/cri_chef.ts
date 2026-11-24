import type { PowerModule } from "../../engine/power/types";

/** Cri du Chef — si tu ouvres le pli, retire 3 secondes aux adversaires (à leur prochain tour). */
export const criChef: PowerModule = {
  def: {
    id: "cri_chef",
    name: "Cri du Chef",
    category: "perturbation",
    icon: "sound",
    tone: "pink",
    rarity: "rare",
    targetMode: "none",
    art: "/assets/power-cards/cri_chef.webp",
    activationTitle: "CRI DU CHEF",
    activationText: "Tous tes adversaires perdent 3 secondes",
    activationTextOthers: "{activator} pousse le cri du chef",
    description: "Si tu es leader du pli, retire 3 secondes aux adversaires.",
    costCauris: 36,
    costNkap: 580,
    animTags: ["timer_all_opponents"],
  },
  script: {
    id: "cri_chef",
    target: { count: "none" },
    conditions: [{ kind: "isTrickLeader", beforeAnyPlay: true }],
    steps: [
      {
        ops: [{ op: "timerDelta", player: "all_opponents", seconds: -3 }],
        anim: [{ cue: "timerFx", player: "all_opponents", kind: "loss", seconds: 3 }],
        /* Le chef crie :
           1. annonce (« {activator} pousse le cri du chef » chez les autres) ;
           2. l'avatar du lanceur enfle, trois ondes sonores partent sur la table ; chaque minuteur adverse touché
              tremble, flashe et « −3 s » s'en envole ;
           3. textes : « Tous perdent 3 secondes » (lanceur), « Le chef t'a crié dessus : −3 s » (adversaires) ;
           ensuite (PowerChargeLayer), pour tous : « ⏳ −3 s » sous chaque adversaire jusqu'à sa carte. */
        choreo: {
          tracks: [
            { id: "cri", kind: "element", startMs: 0, durationMs: 1400, target: { element: "timer", player: "self" }, effect: "shout", label: "−3 s", intensity: 3 },
            { id: "lanceur", kind: "text", startMs: 800, durationMs: 1800, text: "Tous tes adversaires perdent 3 secondes", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", tone: "pink", audience: "activator" },
            { id: "adversaires", kind: "text", startMs: 800, durationMs: 2000, text: "{activator} t'a crié dessus : −3 s à ton tour", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", tone: "pink", audience: "others" },
          ],
        },
      },
    ],
  },
};
