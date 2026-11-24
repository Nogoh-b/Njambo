import type { PowerModule } from "../../engine/power/types";

/** Cauris Chanceux — récupère 50 % de ta mise si tu perds la manche.
 *  Activable seulement avant le dernier pli : on s'assure sans connaître l'issue
 *  (avant : activable au dernier pli, défaite déjà sûre = remboursement garanti). */
export const caurisChanceux: PowerModule = {
  def: {
    id: "cauris_chanceux",
    name: "Cauris Chanceux",
    category: "economy",
    icon: "coin",
    tone: "gold",
    rarity: "common",
    targetMode: "self",
    art: "/assets/power-cards/v2/cauris_chanceux.webp",
    activationTitle: "CAURIS CHANCEUX",
    activationText: "50 % de ta mise remboursés si tu perds",
    activationTextOthers: "{activator} s'assure avec un cauris",
    description: "Récupère 50 % de ta mise si tu perds la manche. Se joue avant le dernier pli.",
    costCauris: 28,
    costNkap: 450,
    animTags: ["result_economy"],
  },
  script: {
    id: "cauris_chanceux",
    target: { count: "none" },
    conditions: [{ kind: "notLastTrick" }],
    steps: [
      {
        ops: [{ op: "refundOnLoss", player: "self", ratio: 0.5 }],
        anim: [{ cue: "avatarAura", player: "self", style: "lucky" }],
        /* Le cauris porte-bonheur :
           1. annonce (« {activator} s'assure avec un cauris » chez les autres) ;
           2. un cauris tombe en tournoyant sur l'avatar du lanceur, rebondit et se pose ; bulle d'assurance, « Assuré » ;
           3. textes pour le lanceur et les autres ;
           ensuite (PowerChargeLayer), pour tous : « 🐚 Assuré · 50 % si défaite » sous son avatar jusqu'au dernier pli ;
           à l'écran de résultat, s'il a perdu : « Remboursement Cauris : + X » (aussi en ligne). */
        choreo: {
          tracks: [
            { id: "cauris", kind: "element", startMs: 0, durationMs: 1800, target: { element: "avatar", player: "self" }, effect: "cowrie", label: "Assuré", intensity: 2 },
            { id: "lanceur", kind: "text", startMs: 1000, durationMs: 1900, text: "Si tu perds la manche : 50 % de ta mise remboursés", at: { kind: "screen", at: "tableCenter", dy: -14 }, size: "s", tone: "gold", audience: "activator" },
            { id: "temoin", kind: "text", startMs: 1000, durationMs: 1900, text: "{activator} récupère la moitié de sa mise en cas de défaite", at: { kind: "screen", at: "tableCenter", dy: -14 }, size: "s", tone: "gold", audience: "others" },
          ],
        },
      },
    ],
  },
};
