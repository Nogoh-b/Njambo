import type { PowerModule } from "../../engine/power/types";

/** Marché de Nuit — remplace ta plus faible carte par une MEILLEURE carte de
 *  la pioche. Peut no-op (aucune carte plus forte) → la carte n'est pas consommée. */
export const marcheNuit: PowerModule = {
  def: {
    id: "marche_nuit",
    name: "Marché de Nuit",
    category: "tactical",
    icon: "coin",
    tone: "cobalt",
    rarity: "epic",
    targetMode: "self",
    art: "/assets/power-cards/v2/marche_nuit.webp",
    activationTitle: "MARCHÉ DE NUIT",
    activationText: "Ta plus faible carte contre le meilleur de l'étal",
    activationTextOthers: "{activator} fait son marché",
    description: "Remplace ta plus faible carte par une meilleure carte si la pioche le permet.",
    costCauris: 60,
    costNkap: 1000,
    animTags: ["hand_self_mutate"],
  },
  script: {
    id: "marche_nuit",
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
            swap: { incoming: { kind: "firstBetterThanWeakest" } },
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
        /* L'échange SÛR (face au pari de Vent du Nord) : la pioche ouvre un étal, une seule carte s'allume.
           1. annonce ; 2. ta carte faible part dans la pioche (V2) ;
           3. l'étal : quatre cartes de dos s'ouvrent en éventail au-dessus de la pioche, la meilleure se lève
              au milieu et se retourne (V2, présentation), les autres retournent dans la pioche ;
           4. la carte choisie rejoint la place vide de ta main ; verdict toujours positif.
           Sans meilleure carte, la carte n'est pas consommée (annonce « SANS EFFET »). */
        choreo: {
          tracks: [
            { id: "lanterne", kind: "screen", startMs: 0, durationMs: 700, effect: "particles", preset: "mystic", intensity: 2, at: { kind: "zone", zone: "deck" } },
            { id: "depart", kind: "v2", startMs: 120, durationMs: 750, cards: "resolved:outgoing", from: { zone: "hand", player: "self" }, to: { zone: "deck" }, reflow: false },
            { id: "avale", kind: "element", startMs: 880, durationMs: 600, target: { element: "deck" }, effect: "pulse", intensity: 2 },
            ...[-21, -11, 11, 21].map((dx, index) => ({
              id: `etal${index + 1}`, kind: "cardPath" as const, startMs: 1000 + index * 40, durationMs: 900, cards: "ghost" as const, mode: "display" as const,
              waypoints: [
                { at: { kind: "zone" as const, zone: "deck" as const } },
                { at: { kind: "zone" as const, zone: "deck" as const, dx, dy: Math.abs(dx) > 15 ? -11 : -13 }, rotate: dx * 0.75, scale: 0.85, holdMs: 900 },
                { at: { kind: "zone" as const, zone: "deck" as const }, scale: 0.6 },
              ],
              easing: "smooth" as const, arc: 0,
            })),
            { id: "choix", kind: "v2", startMs: 1150, durationMs: 750, cards: "resolved:incoming", from: { zone: "deck" }, to: { zone: "hand", player: "self" }, present: { holdMs: 1100, dy: -15, scale: 1.4 }, reflow: false },
            { id: "eclat", kind: "screen", startMs: 1700, durationMs: 800, effect: "particles", preset: "goldRain", intensity: 3, at: { kind: "zone", zone: "deck", dy: -15 } },
            { id: "etal_moi", kind: "text", startMs: 1650, durationMs: 1100, text: "Le meilleur de l'étal", at: { kind: "zone", zone: "deck", dy: -29 }, size: "s", tone: "gold", audience: "activator" },
            { id: "etal_eux", kind: "text", startMs: 1650, durationMs: 1100, text: "{activator} choisit sa carte", at: { kind: "zone", zone: "deck", dy: -29 }, size: "s", audience: "others" },
            { id: "verdict", kind: "text", startMs: 3450, durationMs: 2000, text: "{outgoing} → {incoming} {delta}", at: { kind: "zone", zone: "hand", player: "self", dy: -16 }, size: "m", audience: "activator", verdictTone: true },
            { id: "temoin", kind: "text", startMs: 3400, durationMs: 1800, text: "{activator} a amélioré sa main", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", audience: "others" },
          ],
        },
      },
    ],
  },
};
