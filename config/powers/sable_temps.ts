import type { PowerModule } from "../../engine/power/types";

/** Sable du Temps — le sablier de la cible se vide : elle perd 6 secondes au début de son prochain tour.
 *  (Avant : « gèle le timer » — ce qui DONNAIT du temps à la cible, et n'avait aucun effet en ligne.) */
export const sableTemps: PowerModule = {
  def: {
    id: "sable_temps",
    name: "Sable du Temps",
    category: "perturbation",
    icon: "hourglass",
    tone: "teal",
    rarity: "rare",
    targetMode: "opponent",
    art: "/assets/power-cards/v2/sable_temps.webp",
    activationTitle: "SABLE DU TEMPS",
    activationText: "Ta cible perd 6 secondes à son prochain tour",
    activationTextOthers: "{activator} vide le sablier de {target}",
    description: "Ta cible perd 6 secondes au début de son prochain tour.",
    costCauris: 30,
    costNkap: 500,
    animTags: ["timer_target"],
  },
  script: {
    id: "sable_temps",
    target: { count: "one", chooser: "activator" },
    steps: [
      {
        ops: [{ op: "timerDelta", player: "target", seconds: -6 }],
        anim: [{ cue: "timerFx", player: "target", kind: "loss", seconds: 6 }],
        /* Le sablier se vide :
           1. annonce (« {activator} vide le sablier de toi / de {target} ») ;
           2. un sablier apparaît au-dessus de l'avatar de la cible, se retourne, et son sable coule dans l'anneau
              de son minuteur, qui pâlit ; « −6 s » s'envole de l'avatar ;
           3. textes pour le lanceur, la cible et les autres ;
           ensuite (PowerChargeLayer), pour tous : « ⏳ −6 s » sous l'avatar de la cible jusqu'à sa carte. */
        choreo: {
          tracks: [
            { id: "sablier", kind: "element", startMs: 0, durationMs: 1800, target: { element: "timer", player: "target" }, effect: "drain", label: "−6 s", intensity: 3 },
            { id: "lanceur", kind: "text", startMs: 1100, durationMs: 1800, text: "{target} perd 6 secondes à son prochain tour", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", tone: "teal", audience: "activator" },
            { id: "cible", kind: "text", startMs: 1100, durationMs: 2200, text: "Ton sablier se vide : −6 s à ton prochain tour", at: { kind: "zone", zone: "hand", player: "target", dy: -24 }, size: "s", tone: "teal", audience: "target" },
            { id: "temoin", kind: "text", startMs: 1100, durationMs: 1800, text: "{target} perd 6 secondes à son prochain tour", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", tone: "teal", audience: "bystanders" },
          ],
        },
      },
    ],
  },
};
