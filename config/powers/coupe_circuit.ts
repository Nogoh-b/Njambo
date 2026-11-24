import type { PowerModule } from "../../engine/power/types";

/** Coupe-Circuit — force un adversaire à jouer sa plus faible carte légale
 *  (Filet du Pêcheur, lui, impose la plus forte). */
export const coupeCircuit: PowerModule = {
  def: {
    id: "coupe_circuit",
    name: "Coupe-Circuit",
    category: "offensive",
    icon: "cut",
    tone: "pink",
    rarity: "rare",
    targetMode: "opponent",
    art: "/assets/power-cards/v2/coupe_circuit.webp",
    activationTitle: "COUPÉ !",
    activationText: "La cible jouera sa carte la plus faible à son prochain tour",
    activationTextOthers: "{activator} coupe le courant de {target}",
    description: "Force un adversaire à jouer sa carte légale la plus faible.",
    costCauris: 40,
    costNkap: 700,
    animTags: ["hand_target_restrict"],
  },
  script: {
    id: "coupe_circuit",
    target: { count: "one", chooser: "activator" },
    steps: [
      {
        ops: [
          {
            op: "restrictNextPlay",
            player: "target",
            mode: "forceSelector",
            select: { kind: "weakest" },
          },
        ],
        anim: [
          { cue: "toast", text: "{target} devra jouer sa plus faible carte", tone: "pink" },
        ],
        /* Le courant est coupé :
           1. annonce (« {activator} coupe le courant de toi / de {target} ») ;
           2. un arc électrique part de l'avatar du lanceur et frappe la main de la cible, qui grésille ;
           3. textes : la cible apprend que sa plus faible carte est imposée ;
           ensuite, jusqu'à sa carte (PowerChargeLayer) : chez la cible, ses autres cartes s'éteignent et la carte
           imposée porte « Imposée » ; chez les autres, « ⛓ Plus faible imposée » sous son avatar ; étincelle à la pose. */
        choreo: {
          tracks: [
            { id: "arc", kind: "element", startMs: 0, durationMs: 1300, target: { element: "hand", player: "target" }, effect: "cut", intensity: 3 },
            { id: "lanceur", kind: "text", startMs: 900, durationMs: 1800, text: "{target} jouera sa plus faible carte", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", tone: "pink", audience: "activator" },
            { id: "cible", kind: "text", startMs: 900, durationMs: 2000, text: "Courant coupé : ta plus faible carte est imposée", at: { kind: "zone", zone: "hand", player: "target", dy: -24 }, size: "s", tone: "pink", audience: "target" },
            { id: "temoin", kind: "text", startMs: 900, durationMs: 1800, text: "{target} jouera sa plus faible carte", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", tone: "pink", audience: "bystanders" },
          ],
        },
      },
    ],
  },
};
