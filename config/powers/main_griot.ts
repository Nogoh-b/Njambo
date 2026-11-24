import type { PowerModule } from "../../engine/power/types";

/** Main du Griot — suggère ta meilleure carte légale pendant 6 secondes. */
export const mainGriot: PowerModule = {
  def: {
    id: "main_griot",
    name: "Main du Griot",
    category: "tactical",
    icon: "profile",
    tone: "teal",
    rarity: "rare",
    targetMode: "self",
    art: "/assets/power-cards/main_griot.webp",
    activationTitle: "LE GRIOT CONSEILLE",
    activationText: "Écoute la sagesse des anciens",
    activationTextOthers: "{activator} consulte le griot",
    description: "Suggère ta meilleure carte légale pendant 6 secondes.",
    costCauris: 32,
    costNkap: 520,
    animTags: ["hand_self_recommend"],
  },
  script: {
    id: "main_griot",
    target: { count: "none" },
    steps: [
      {
        ops: [
          {
            op: "highlightCard",
            player: "self",
            select: { kind: "bestLegal" },
            durationMs: 6000,
          },
        ],
        anim: [
          {
            cue: "highlightHandCard",
            player: "self",
            cards: "resolved:highlight",
            style: "recommend",
            durationMs: 6000,
            delayMs: 1400,
          },
        ],
        /* Le griot lit ta main, puis parle :
           1. annonce (« {activator} consulte le griot » chez les autres) ;
           2. une lumière parcourt ta main, les cartes écartées s'éteignent une à une ;
           3. la carte conseillée s'allume : aura, badge « ✦ Conseil », contour qui se vide en 6 s,
              et la raison (« Bats le 7♣ au plus juste ») ;
           les autres ne voient que la lumière sur ta main, jamais la carte. */
        choreo: {
          tracks: [
            { id: "lecture", kind: "element", startMs: 0, durationMs: 1400, target: { element: "hand", player: "self" }, effect: "read", intensity: 2 },
            { id: "ecoute", kind: "text", startMs: 100, durationMs: 1700, text: "{activator} écoute le griot", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", audience: "others" },
            { id: "conseil", kind: "element", startMs: 1400, durationMs: 6000, target: { element: "hand", player: "self" }, effect: "advise", intensity: 2 },
            { id: "raison", kind: "text", startMs: 1550, durationMs: 2800, text: "{reason}", at: { kind: "zone", zone: "hand", player: "self", dy: -24 }, size: "s", tone: "teal", audience: "activator" },
          ],
        },
      },
    ],
  },
};
