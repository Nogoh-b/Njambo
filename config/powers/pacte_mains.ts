import type { PowerModule } from "../../engine/power/types";

/** Pacte des Mains — échange 1 à 3 cartes choisies contre autant de cartes adverses. */
export const pacteMains: PowerModule = {
  def: {
    id: "pacte_mains",
    name: "Pacte des Mains",
    category: "tactical",
    icon: "cards",
    tone: "cobalt",
    rarity: "legendary",
    targetMode: "opponent",
    art: "/assets/power-cards/marche_nuit.webp",
    activationTitle: "PACTE SCELLÉ",
    activationText: "Tes cartes contre autant des siennes, à l'aveugle",
    activationTextOthers: "{activator} scelle un pacte avec {target}",
    description: "Choisis jusqu'à 3 cartes et échange-les contre autant de cartes aléatoires d'un adversaire.",
    costCauris: 85,
    costNkap: 1400,
    animTags: ["hand_swap_players"],
  },
  script: {
    id: "pacte_mains",
    target: { count: "one", chooser: "activator" },
    steps: [
      {
        choice: {
          id: "give",
          surface: "hand-self",
          count: { min: 1, max: 3 },
          onTimeout: "cancel",
        },
        ops: [{
          op: "exchangeCards",
          left: "self",
          leftSelect: { kind: "chosen", choiceId: "give" },
          right: "target",
          rightSelect: { kind: "random" },
        }],
        anim: [
          {
            cue: "flyCards",
            from: { zone: "hand", player: "self" },
            to: { zone: "hand", player: "target" },
            cards: "resolved:outgoing",
            mode: "move",
            afterMs: 180,
            fx: { preset: "mystic", intensity: "spectacular" },
          },
          {
            cue: "flyCards",
            from: { zone: "hand", player: "target" },
            to: { zone: "hand", player: "self" },
            cards: "resolved:incoming",
            mode: "move",
            fx: { preset: "mystic", intensity: "spectacular" },
          },
        ],
        /* Le pacte : chacun donne autant de cartes, au centre de la table.
           1. annonce (« {activator} scelle un pacte avec {target} » chez les autres, « … avec toi » chez la cible) ;
           2. tes cartes choisies se lèvent au centre, les siennes juste au-dessus : chacun voit ses propres cartes
              de face, celles de l'autre de dos ; les autres joueurs voient tout de dos ;
           3. les deux rangées se croisent (éclat au centre) et chaque carte prend la place de celle qu'elle remplace ;
           4. verdict « 3♠ 5♥ → 9♦ 10♣ +11 » chez le lanceur, « X t'a pris 2 cartes » chez la cible. */
        choreo: {
          tracks: [
            { id: "sceau", kind: "screen", startMs: 0, durationMs: 800, effect: "particles", preset: "mystic", intensity: 2, at: { kind: "screen", at: "tableCenter" } },
            { id: "offrande", kind: "v2", startMs: 100, durationMs: 690, cards: "resolved:outgoing", from: { zone: "hand", player: "self" }, to: { zone: "hand", player: "target" }, present: { at: "tableCenter", dy: 8, scale: 1.2, holdMs: 1300 }, reflow: false, inPlace: true },
            { id: "tribut", kind: "v2", startMs: 250, durationMs: 690, cards: "resolved:incoming", from: { zone: "hand", player: "target" }, to: { zone: "hand", player: "self" }, present: { at: "tableCenter", dy: -9, scale: 1.2, holdMs: 1150 }, reflow: false, inPlace: true },
            { id: "pacte_moi", kind: "text", startMs: 800, durationMs: 1000, text: "Le pacte est scellé", at: { kind: "screen", at: "tableCenter", dy: -22 }, size: "s", tone: "cobalt", audience: "activator" },
            { id: "pacte_cible", kind: "text", startMs: 800, durationMs: 1000, text: "{activator} prend {cards}", at: { kind: "screen", at: "tableCenter", dy: -22 }, size: "s", tone: "pink", audience: "target" },
            { id: "croisement", kind: "screen", startMs: 1850, durationMs: 700, effect: "particles", preset: "mystic", intensity: 3, at: { kind: "screen", at: "tableCenter" } },
            { id: "verdict", kind: "text", startMs: 2700, durationMs: 2000, text: "{outgoing} → {incoming} {delta}", at: { kind: "zone", zone: "hand", player: "self", dy: -16 }, size: "m", audience: "activator", verdictTone: true },
            { id: "pris", kind: "text", startMs: 2700, durationMs: 2000, text: "{activator} t'a pris {cards}", at: { kind: "zone", zone: "hand", player: "target", dy: -16 }, size: "m", tone: "pink", audience: "target" },
            { id: "temoin", kind: "text", startMs: 2650, durationMs: 1800, text: "{activator} et {target} ont échangé {cards}", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "s", audience: "bystanders" },
          ],
        },
      },
    ],
  },
};
