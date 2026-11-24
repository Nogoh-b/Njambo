import type { PowerModule } from "../../engine/power/types";

/** Filet du Pêcheur — le filet attrape le gros poisson : la cible doit jouer sa plus FORTE carte légale
 *  (Coupe-Circuit, lui, impose la plus faible). */
export const filetPecheur: PowerModule = {
  def: {
    id: "filet_pecheur",
    name: "Filet du Pêcheur",
    category: "offensive",
    icon: "wind",
    tone: "teal",
    rarity: "rare",
    targetMode: "opponent",
    art: "/assets/power-cards/filet_pecheur.webp",
    activationTitle: "FILET DU PÊCHEUR",
    activationText: "La cible jouera sa carte la plus forte à son prochain tour",
    activationTextOthers: "{activator} jette son filet sur {target}",
    description: "Force la cible à jouer sa plus forte carte légale.",
    costCauris: 42,
    costNkap: 720,
    animTags: ["hand_target_restrict"],
  },
  script: {
    id: "filet_pecheur",
    target: { count: "one", chooser: "activator" },
    steps: [
      {
        ops: [
          {
            op: "restrictNextPlay",
            player: "target",
            mode: "forceSelector",
            select: { kind: "strongest" },
          },
        ],
        anim: [
          { cue: "toast", text: "{target} devra jouer sa plus forte carte", tone: "teal" },
        ],
        /* Le gros poisson est pris :
           1. annonce (« {activator} jette son filet sur toi / sur {target} ») ;
           2. le filet part de l'avatar du lanceur, s'ouvre en vol, tombe sur la main de la cible et se resserre ;
           3. textes : la cible apprend que sa plus forte carte est imposée ;
           ensuite, jusqu'à sa carte (PowerChargeLayer) : chez la cible, ses autres cartes s'éteignent et la plus forte
           porte « Imposée » ; « ⛓ Plus forte imposée » sous son avatar chez les autres ; étincelle à la pose. */
        choreo: {
          tracks: [
            { id: "filet", kind: "element", startMs: 0, durationMs: 1500, target: { element: "hand", player: "target" }, effect: "net", intensity: 3 },
            { id: "lanceur", kind: "text", startMs: 1000, durationMs: 1800, text: "{target} jouera sa plus forte carte", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", tone: "teal", audience: "activator" },
            { id: "cible", kind: "text", startMs: 1000, durationMs: 2000, text: "Pris au filet : ta plus forte carte est imposée", at: { kind: "zone", zone: "hand", player: "target", dy: -24 }, size: "s", tone: "teal", audience: "target" },
            { id: "temoin", kind: "text", startMs: 1000, durationMs: 1800, text: "{target} jouera sa plus forte carte", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", tone: "teal", audience: "bystanders" },
          ],
        },
      },
    ],
  },
};
