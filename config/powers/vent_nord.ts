import type { PowerModule } from "../../engine/power/types";

/** Vent du Nord — échange ta plus faible carte contre le dessus de la pioche. */
export const ventNord: PowerModule = {
  def: {
    id: "vent_nord",
    name: "Vent du Nord",
    category: "perturbation",
    icon: "wind",
    tone: "teal",
    rarity: "common",
    targetMode: "none",
    art: "/assets/power-cards/vent_nord.webp",
    activationTitle: "VENT LEVÉ",
    activationText: "Ta plus faible carte part au vent… la pioche décide",
    activationTextOthers: "{activator} lève le vent",
    description: "Échange une carte faible de ta main contre une carte de la pioche.",
    costCauris: 25,
    costNkap: 400,
    animTags: ["hand_self_mutate"],
  },
  script: {
    id: "vent_nord",
    target: { count: "none" },
    conditions: [{ kind: "deckNotEmpty" }],
    steps: [
      {
        ops: [
          {
            op: "moveCards",
            from: { zone: "hand", player: "self" },
            select: { kind: "weakest" },
            to: { zone: "deck" },
            swap: { incoming: { kind: "topOfDeck" } },
          },
        ],
        anim: [
          {
            cue: "flyCards",
            from: { zone: "hand", player: "self" },
            to: { zone: "deck" },
            cards: "resolved:outgoing",
            mode: "move",
          },
          {
            cue: "flyCards",
            from: { zone: "deck" },
            to: { zone: "hand", player: "self" },
            cards: "resolved:incoming",
            mode: "move",
          },
          {
            cue: "highlightHandCard",
            player: "self",
            cards: "resolved:incoming",
            style: "swapped",
            durationMs: 2600,
          },
        ],
        /* Mise en scène en 4 temps (les cues ci-dessus restent pour les anciens clients ;
           seul highlightHandCard, fonctionnel, est encore joué à côté) :
           1. l'annonce (overlay d'activation, texte selon qui regarde) ;
           2. le départ : le vent emporte la carte vers la pioche, qui l'avale ;
           3. le tirage : la carte du dessus se retourne au-dessus de la pioche, puis rejoint la main ;
           4. le verdict : « 3♥ → 8♦ +5 » chez le lanceur, « X a échangé une carte » chez les autres. */
        choreo: {
          tracks: [
            { id: "souffle", kind: "screen", startMs: 0, durationMs: 700, effect: "particles", preset: "wind", intensity: 2, at: { kind: "zone", zone: "hand", player: "self" } },
            {
              id: "depart", kind: "cardPath", startMs: 120, durationMs: 750, cards: "resolved:outgoing", mode: "move",
              waypoints: [
                { at: { kind: "zone", zone: "hand", player: "self" }, face: "up" },
                { at: { kind: "zone", zone: "deck" }, scale: 0.85, rotate: 200 },
              ],
              easing: "accelerate", arc: 40, trail: "wind",
            },
            { id: "avale", kind: "element", startMs: 820, durationMs: 420, target: { element: "deck" }, effect: "pulse", intensity: 3 },
            {
              id: "tirage", kind: "cardPath", startMs: 1150, durationMs: 1000, cards: "resolved:incoming", mode: "move",
              waypoints: [
                { at: { kind: "zone", zone: "deck" }, face: "down" },
                { at: { kind: "zone", zone: "deck", dy: -14 }, face: "up", scale: 1.5, holdMs: 650 },
                { at: { kind: "zone", zone: "hand", player: "self" }, scale: 1 },
              ],
              easing: "smooth", arc: 20, trail: "wind",
            },
            { id: "verdict", kind: "text", startMs: 2750, durationMs: 2000, text: "{outgoing} → {incoming} {delta}", at: { kind: "zone", zone: "hand", player: "self", dy: -16 }, size: "m", audience: "activator", verdictTone: true },
            { id: "temoin", kind: "text", startMs: 2700, durationMs: 1800, text: "{activator} a échangé une carte", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", audience: "others" },
          ],
        },
      },
    ],
  },
};
