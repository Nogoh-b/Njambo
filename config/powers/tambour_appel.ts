import type { PowerModule } from "../../engine/power/types";

/** Tambour d'Appel — ajoute 8 secondes à ton timer ce tour. */
export const tambourAppel: PowerModule = {
  def: {
    id: "tambour_appel",
    name: "Tambour d'Appel",
    category: "tactical",
    icon: "sound",
    tone: "gold",
    rarity: "common",
    targetMode: "self",
    art: "/assets/power-cards/tambour_appel.webp",
    activationTitle: "TAMBOUR D'APPEL",
    activationText: "+8 secondes pour ce tour",
    activationTextOthers: "{activator} bat le tambour",
    description: "Ajoute 8 secondes à ton timer ce tour.",
    costCauris: 22,
    costNkap: 350,
    animTags: ["timer_self"],
  },
  script: {
    id: "tambour_appel",
    target: { count: "none" },
    steps: [
      {
        ops: [{ op: "timerDelta", player: "self", seconds: 8 }],
        anim: [{ cue: "timerFx", player: "self", kind: "gain", seconds: 8 }],
        /* Le tambour appelle du temps :
           1. annonce (« {activator} bat le tambour » chez les autres) ;
           2. un djembé apparaît à côté de l'avatar du lanceur et bat trois coups ; à chaque coup un anneau doré part
              de l'avatar et le minuteur s'illumine un peu plus ; « +8 s » s'envole ;
           3. textes pour le lanceur et les autres. */
        choreo: {
          tracks: [
            { id: "tambour", kind: "element", startMs: 0, durationMs: 1600, target: { element: "timer", player: "self" }, effect: "drum", label: "+8 s", intensity: 2 },
            { id: "lanceur", kind: "text", startMs: 1100, durationMs: 1600, text: "+8 secondes pour ce tour", at: { kind: "zone", zone: "hand", player: "self", dy: -24 }, size: "s", tone: "gold", audience: "activator" },
            { id: "temoin", kind: "text", startMs: 1100, durationMs: 1600, text: "{activator} gagne 8 secondes", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", tone: "gold", audience: "others" },
          ],
        },
      },
    ],
  },
};
