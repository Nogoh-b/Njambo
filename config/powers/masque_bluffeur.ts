import type { PowerModule } from "../../engine/power/types";

/** Masque du Bluffeur — la prochaine révélation de ta main (Œil du Sorcier) montre une FAUSSE main.
 *  L'activation est secrète : l'attaquant ne sait pas qu'il bluffe, la cible et les autres l'apprennent au moment du bluff.
 *  (Avant : annulait la révélation, ce que le Bouclier du Village faisait déjà.) */
export const masqueBluffeur: PowerModule = {
  def: {
    id: "masque_bluffeur",
    name: "Masque du Bluffeur",
    category: "defense",
    icon: "eye",
    tone: "pink",
    rarity: "rare",
    targetMode: "self",
    art: "/assets/power-cards/v2/masque_bluffeur.webp",
    activationTitle: "MASQUE DU BLUFFEUR",
    activationText: "Si on lit ta main, on verra une fausse main",
    description: "En secret : la prochaine lecture de ta main montre une fausse main à l'adversaire.",
    costCauris: 38,
    costNkap: 640,
    animTags: ["future_block"],
  },
  script: {
    id: "masque_bluffeur",
    target: { count: "none" },
    secret: true,
    steps: [
      {
        ops: [{ op: "grantShield", player: "self", blocks: ["reveal"] }],
        anim: [{ cue: "avatarAura", player: "self", style: "mask" }],
        /* Le masque se pose (vu par le lanceur seul, activation secrète) :
           1. un masque sculpté descend sur son avatar, ses yeux s'allument ; aura masque, « Masqué » ;
           2. texte pour lui ;
           ensuite (PowerChargeLayer), pour lui seul : « 🎭 Masque » sous son avatar jusqu'au bluff ou à la fin de la manche ;
           au bluff (PowerFxOrchestrator), chez la cible et les autres : le masque réapparaît et rit,
           « Le Masque de X a trompé Y » ; l'attaquant, lui, croit voir la vraie main. */
        choreo: {
          tracks: [
            { id: "masque", kind: "element", startMs: 0, durationMs: 1800, target: { element: "avatar", player: "self" }, effect: "bluffMask", label: "Masqué", intensity: 2 },
            { id: "lanceur", kind: "text", startMs: 1000, durationMs: 2000, text: "En secret : si on lit ta main, on verra une fausse main", at: { kind: "screen", at: "tableCenter", dy: -14 }, size: "s", tone: "pink", audience: "activator" },
          ],
        },
      },
    ],
  },
};
