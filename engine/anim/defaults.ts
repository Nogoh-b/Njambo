/* ═══════════════ Modèles d'animation par défaut ═══════════════
   Repris du prototype (docs/prototypes/atelier-animations.html), plus
   « play_classic » qui reproduit le vol actuel d'une carte jouée
   (components/table/FlyingCard.tsx). Ils servent de catalogue de départ :
   l'admin les modifie ou s'en inspire, et le jeu les utilise tant que
   rien n'est publié. */

import { GAME_CONFIG } from "../../config/gameConfig";
import { MOTIF_EASINGS, normalizeMotif, type AnimMotif, type Bezier, type MotifAnchor, type MotifReaction, type MotifReactionType } from "./motif";

const self = (zone: "hand" | "deposit" | "avatar"): MotifAnchor => ({ zone, player: "self" });
const DECK: MotifAnchor = { zone: "deck" };
const CENTER: MotifAnchor = { zone: "center" };
const ease = (name: keyof typeof MOTIF_EASINGS): Bezier => [...MOTIF_EASINGS[name]];
const R = (type: MotifReactionType, anchor: MotifReaction["anchor"] = "arrival", offsetMs = 0, extra: Partial<MotifReaction> = {}): MotifReaction => ({ type, anchor, offsetMs, ...extra });
const whole = (easing: Bezier, perp: number, along = 0.5) => ({ easing, timing: "whole" as const, arc: { along, perp }, via: [], smooth: true });

/** Vol actuel : courbe rejouée sur chaque segment (comme les images clés de Motion). */
const CLASSIC = ease("classic");

export const DEFAULT_MOTIFS: AnimMotif[] = [
  /* ── Les 7 trajets ── */
  normalizeMotif({
    id: "draw", group: "trajets", name: "Piocher", from: DECK, to: self("hand"), durationMs: 720,
    description: "La carte quitte la pioche par une courbe, se retourne en vol et s'insère dans l'éventail ; les autres cartes s'écartent. Léger rebond à l'arrivée.",
    path: whole(ease("lightBounce"), -0.28, 0.45),
    lanes: { flip: [[0, 180], [0.2, 180], [0.75, 0], [1, 0]], scale: [[0, 1], [0.55, 1.18], [1, 1]], rotate: [[0, 0], [0.5, -12], [1, 0]], opacity: [[0, 1], [1, 1]], glow: [[0, 0], [1, 0]], lift: [[0, 0.3], [0.5, 1], [1, 0.1]] },
    preview: { cards: ["Q♦"] },
  }),
  normalizeMotif({
    id: "play", group: "trajets", name: "Jouer une carte · avec impact", from: self("hand"), to: self("deposit"), durationMs: 560, squash: true,
    description: "La carte quitte l'éventail et se pose sur le dépôt : elle accélère puis freine, grossit en arrivant et son ombre retombe à la pose. Flash à l'impact, couronne si elle gagne.",
    path: whole([0.55, 0, 0.2, 1], 0.14),
    lanes: { flip: [[0, 0], [1, 0]], scale: [[0, 1], [0.75, 1.32], [1, 1]], rotate: [[0, 0], [1, -4]], opacity: [[0, 1], [1, 1]], glow: [[0, 0], [1, 0]], lift: [[0, 0.3], [0.6, 1], [0.9, 0.9], [1, 0]] },
    reactions: [R("flash"), R("ring"), R("crown", "arrival", 140)],
    preview: { pick: 2 },
  }),
  normalizeMotif({
    id: "reveal_on_table", group: "trajets", name: "Retourner sur la table", from: DECK, to: CENTER, durationMs: 640, trail: "blur",
    description: "Une carte vole de la pioche vers l'espace central et se retourne pendant le trajet, avec un léger flou de vitesse.",
    path: whole([0.15, 0.75, 0.25, 1], -0.4),
    lanes: { flip: [[0, 180], [0.2, 180], [0.8, 0], [1, 0]], scale: [[0, 1], [0.5, 1.45], [1, 1]], rotate: [[0, 0], [1, 0]], opacity: [[0, 1], [1, 1]], glow: [[0, 0], [1, 0]], lift: [[0, 0.2], [0.5, 1], [1, 0]] },
    reactions: [R("ring")],
    preview: { cards: ["7♦"] },
  }),
  normalizeMotif({
    id: "pickup", group: "trajets", name: "Ramasser", from: self("deposit"), to: self("hand"), durationMs: 700,
    description: "La carte quitte le dépôt et revient dans la main par un arc ; elle devient un peu transparente juste avant de rejoindre l'éventail.",
    path: whole([0.3, 0.1, 0.25, 1], 0.45),
    lanes: { flip: [[0, 0], [1, 0]], scale: [[0, 1.05], [0.4, 1.15], [0.85, 0.88], [1, 1]], rotate: [[0, 0], [0.5, 10], [1, 0]], opacity: [[0, 1], [0.7, 1], [0.88, 0.7], [1, 1]], glow: [[0, 0], [1, 0]], lift: [[0, 0.2], [0.4, 1], [1, 0]] },
    preview: { setup: { "deposit:me": ["6♣"] } },
  }),
  normalizeMotif({
    id: "discard", group: "trajets", name: "Défausser", from: self("hand"), to: DECK, durationMs: 520,
    description: "Effet « aspiré » : la carte accélère brusquement vers la pioche, se retourne face cachée et disparaît en fondu. La pioche tressaille.",
    path: whole(ease("suck"), -0.2),
    lanes: { flip: [[0, 0], [0.25, 0], [0.7, 180], [1, 180]], scale: [[0, 1], [0.6, 0.92], [1, 0.7]], rotate: [[0, 0], [1, -30]], opacity: [[0, 1], [0.82, 1], [1, 0]], glow: [[0, 0], [1, 0]], lift: [[0, 0.4], [0.4, 1], [1, 0.2]] },
    reactions: [R("deckShake")],
    preview: { pick: 4 },
  }),
  normalizeMotif({
    id: "to_player", group: "trajets", name: "Vers le joueur (bonus)", from: DECK, to: self("avatar"), durationMs: 820, trail: "sparks",
    description: "Une carte vole vers l'avatar dans un nuage d'étincelles et s'y résorbe ; l'avatar pulse et les Nkap clignotent.",
    path: whole([0.4, 0, 0.3, 1], 0.3, 0.45),
    lanes: { flip: [[0, 180], [0.35, 0], [1, 0]], scale: [[0, 1], [0.3, 1.3], [0.75, 0.9], [1, 0]], rotate: [[0, 0], [1, 0]], opacity: [[0, 1], [1, 1]], glow: [[0, 0], [0.3, 0.8], [1, 1]], lift: [[0, 0.3], [0.3, 1], [1, 0.5]] },
    reactions: [R("avatarPulse", "arrival", 0, { at: "to" }), R("nkap"), R("burst", "arrival", 0, { at: "to" })],
    preview: { cards: ["A♥"] },
  }),
  normalizeMotif({
    id: "launch_ability", group: "trajets", name: "Lancer une capacité", from: self("avatar"), to: CENTER, durationMs: 430, trail: "light",
    description: "Une carte naît de l'avatar (échelle 0 → 1) et file vers le centre comme un éclair, avec une traînée lumineuse.",
    path: whole(ease("flash"), -0.18),
    lanes: { flip: [[0, 0], [1, 0]], scale: [[0, 0], [0.35, 1.25], [1, 1]], rotate: [[0, 0], [1, 0]], opacity: [[0, 1], [1, 1]], glow: [[0, 1], [0.7, 0.6], [1, 0.15]], lift: [[0, 1], [0.8, 0.8], [1, 0]] },
    reactions: [R("avatarPulse", "start", 0, { at: "from" }), R("flash", "start", 0, { at: "from" }), R("flash"), R("ring")],
    preview: { cards: ["K♠"] },
  }),

  /* ── Carte ── */
  normalizeMotif({
    id: "card_flip_show", group: "card", name: "Retourner · afficher", from: CENTER, to: CENTER, durationMs: 560,
    description: "Sur place : la carte se soulève, pivote sur l'axe Y et révèle sa face.",
    lanes: { flip: [[0, 180], [0.25, 180], [0.75, 0], [1, 0]], scale: [[0, 1], [0.5, 1.18], [1, 1]], rotate: [[0, 0], [1, 0]], opacity: [[0, 1], [1, 1]], glow: [[0, 0], [1, 0]], lift: [[0, 0], [0.4, 1], [1, 0.1]] },
    preview: { setup: { center: ["7♦*"] } },
  }),
  normalizeMotif({
    id: "card_flip_hide", group: "card", name: "Retourner · cacher", from: CENTER, to: CENTER, durationMs: 560,
    description: "Sur place : la carte se soulève et se retourne face cachée.",
    lanes: { flip: [[0, 0], [0.25, 0], [0.75, 180], [1, 180]], scale: [[0, 1], [0.5, 1.18], [1, 1]], rotate: [[0, 0], [1, 0]], opacity: [[0, 1], [1, 1]], glow: [[0, 0], [1, 0]], lift: [[0, 0], [0.4, 1], [1, 0.1]] },
    preview: { setup: { center: ["7♦"] } },
  }),

  /* ── Main ── */
  normalizeMotif({
    id: "hand_focus", group: "hand", name: "Mise en évidence", from: self("hand"), to: self("hand"), durationMs: 900,
    description: "Sur place : une carte de la main se soulève et brille, les autres s'assombrissent.",
    path: whole(ease("lightBounce"), 0),
    lanes: { flip: [[0, 0], [1, 0]], scale: [[0, 1], [0.3, 1.12], [1, 1.12]], rotate: [[0, 0], [1, 0]], opacity: [[0, 1], [1, 1]], glow: [[0, 0], [0.3, 1], [0.65, 0.55], [1, 1]], lift: [[0, 0], [0.3, 1], [1, 1]] },
    reactions: [R("dim", "start", 0, { durationMs: 1000 })],
    preview: { pick: 1 },
  }),
  normalizeMotif({
    id: "hand_out", group: "hand", name: "Deux cartes sortent", from: self("hand"), to: CENTER, count: 2, staggerMs: 130, durationMs: 560,
    description: "Deux cartes quittent la main l'une après l'autre et se posent au centre ; l'éventail se resserre.",
    path: whole([0.5, 0, 0.2, 1], 0.15),
    lanes: { flip: [[0, 0], [1, 0]], scale: [[0, 1], [0.6, 1.15], [1, 1]], rotate: [[0, 0], [1, 0]], opacity: [[0, 1], [1, 1]], glow: [[0, 0], [1, 0]], lift: [[0, 0.3], [0.6, 1], [1, 0]] },
    reactions: [R("ring", "arrival", 0, { each: true })],
    preview: { pick: 1 },
  }),
  normalizeMotif({
    id: "hand_in", group: "hand", name: "Trois cartes entrent", from: DECK, to: self("hand"), count: 3, staggerMs: 150, durationMs: 640,
    description: "Trois cartes arrivent de la pioche en cascade ; l'éventail s'ouvre pour leur faire de la place.",
    path: whole([0.25, 1.2, 0.5, 1], -0.25, 0.45),
    lanes: { flip: [[0, 180], [0.25, 180], [0.75, 0], [1, 0]], scale: [[0, 1], [0.55, 1.12], [1, 1]], rotate: [[0, 0], [0.5, -10], [1, 0]], opacity: [[0, 1], [1, 1]], glow: [[0, 0], [1, 0]], lift: [[0, 0.3], [0.5, 1], [1, 0.1]] },
    preview: { cards: ["2♠", "J♥", "5♦"] },
  }),
  normalizeMotif({
    id: "hand_give", group: "hand", name: "Donner une carte", from: self("hand"), to: { zone: "hand", player: "target" }, durationMs: 760, trail: "light",
    description: "La carte part vers la main de la cible et se retourne face cachée en route.",
    path: whole(ease("smooth"), 0.3),
    lanes: { flip: [[0, 0], [0.3, 0], [0.7, 180], [1, 180]], scale: [[0, 1], [0.4, 1.15], [1, 1]], rotate: [[0, 0], [1, 0]], opacity: [[0, 1], [1, 1]], glow: [[0, 0], [1, 0]], lift: [[0, 0.3], [0.5, 1], [1, 0]] },
    preview: { pick: 0 },
  }),

  /* ── Dépôt ── */
  normalizeMotif({
    id: "deposit_glow", group: "deposit", name: "Surbrillance", from: self("deposit"), to: self("deposit"), durationMs: 1100,
    description: "Sur place : la carte du dépôt pulse et la zone s'illumine.",
    path: whole(ease("linear"), 0),
    lanes: { flip: [[0, 0], [1, 0]], scale: [[0, 1], [0.2, 1.08], [1, 1]], rotate: [[0, 0], [1, 0]], opacity: [[0, 1], [1, 1]], glow: [[0, 0], [0.2, 1], [0.45, 0.35], [0.7, 1], [1, 0]], lift: [[0, 0], [0.2, 0.6], [1, 0]] },
    reactions: [R("glow", "start", 0, { at: "from", durationMs: 1100 })],
    preview: { setup: { "deposit:me": ["6♥"] } },
  }),
  normalizeMotif({
    id: "deposit_in", group: "deposit", name: "Deux cartes entrent", from: DECK, to: self("deposit"), count: 2, staggerMs: 180, durationMs: 560, squash: true,
    description: "Deux cartes tombent sur le dépôt l'une sur l'autre, avec un flash à chaque impact.",
    path: whole([0.2, 0.8, 0.25, 1], -0.3),
    lanes: { flip: [[0, 180], [0.2, 180], [0.8, 0], [1, 0]], scale: [[0, 1], [0.5, 1.3], [1, 1]], rotate: [[0, 0], [1, 0]], opacity: [[0, 1], [1, 1]], glow: [[0, 0], [1, 0]], lift: [[0, 0.2], [0.5, 1], [1, 0]] },
    reactions: [R("flash", "arrival", 0, { each: true })],
    preview: { cards: ["9♦", "3♣"] },
  }),
  normalizeMotif({
    id: "deposit_eject", group: "deposit", name: "Deux cartes sont éjectées", from: self("deposit"), to: { zone: "offscreen", side: "right" }, count: 2, staggerMs: 110, durationMs: 620,
    description: "Les cartes du dépôt sont projetées hors de la table en tournoyant.",
    path: whole([0.6, 0, 0.9, 0.4], -0.25),
    lanes: { flip: [[0, 0], [1, 0]], scale: [[0, 1], [1, 1]], rotate: [[0, 0], [1, 45]], opacity: [[0, 1], [0.7, 1], [1, 0]], glow: [[0, 0], [1, 0]], lift: [[0, 0], [0.3, 1], [1, 1]] },
    reactions: [R("glow", "start", 0, { at: "from", durationMs: 500 })],
    preview: { setup: { "deposit:me": ["6♥", "Q♣"] } },
  }),

  /* ── Espace central ── */
  normalizeMotif({
    id: "center_add", group: "center", name: "Ajouter trois cartes", from: DECK, to: CENTER, count: 3, staggerMs: 170, durationMs: 600,
    description: "Trois cartes sont distribuées au centre et se retournent une à une.",
    path: whole([0.15, 0.75, 0.25, 1], -0.3),
    lanes: { flip: [[0, 180], [0.25, 180], [0.8, 0], [1, 0]], scale: [[0, 1], [0.5, 1.3], [1, 1]], rotate: [[0, 0], [1, 0]], opacity: [[0, 1], [1, 1]], glow: [[0, 0], [1, 0]], lift: [[0, 0.2], [0.5, 1], [1, 0]] },
    reactions: [R("ring", "arrival", 0, { each: true })],
    preview: { cards: ["A♠", "7♦", "Q♣"] },
  }),
  normalizeMotif({
    id: "center_remove", group: "center", name: "Retirer trois cartes", from: CENTER, to: { zone: "offscreen", side: "left" }, count: 3, staggerMs: 90, durationMs: 640,
    description: "Les cartes du centre sont balayées hors de la table.",
    path: whole([0.55, 0, 0.85, 0.35], 0.12),
    lanes: { flip: [[0, 0], [1, 0]], scale: [[0, 1], [0.3, 1.08], [1, 0.8]], rotate: [[0, 0], [1, -25]], opacity: [[0, 1], [0.75, 1], [1, 0]], glow: [[0, 0], [1, 0]], lift: [[0, 0], [0.3, 1], [1, 0.6]] },
    preview: { setup: { center: ["A♠", "7♦", "Q♣"] } },
  }),

  /* ── Partie ── */
  normalizeMotif({
    id: "deal", group: "game", name: "Distribution", from: DECK, to: { zone: "hand", player: "all" }, count: 2, staggerMs: 110, durationMs: 480,
    description: "La donne : la pioche distribue deux cartes à chaque joueur, à tour de rôle. Ses propres cartes se retournent en arrivant, celles des adversaires restent cachées.",
    path: whole([0.2, 0.75, 0.3, 1], -0.12),
    face: { mode: "auto", window: [0.25, 0.8], easing: [0.45, 0, 0.55, 1] },
    lanes: { flip: [[0, 0], [1, 0]], scale: [[0, 1], [0.5, 1.1], [1, 1]], rotate: [[0, 0], [1, 0]], opacity: [[0, 1], [1, 1]], glow: [[0, 0], [1, 0]], lift: [[0, 0.3], [0.5, 0.9], [1, 0]] },
    preview: { setup: { "hand:me": [], "hand:top": 0, "hand:left": 0, "hand:right": 0, "deposit:top": [], "deposit:left": [], "deposit:right": [] } },
  }),
  normalizeMotif({
    id: "trick_win_glow", group: "game", name: "Pli gagné · éclat", from: { zone: "deposit", player: "winner" }, to: { zone: "deposit", player: "winner" }, durationMs: 320,
    description: "Sur place : la carte gagnante se soulève et brille, le dépôt du gagnant s'illumine (la couronne du dépôt reste celle du jeu).",
    path: whole(ease("lightBounce"), 0),
    lanes: { flip: [[0, 0], [1, 0]], scale: [[0, 1], [0.4, 1.16], [1, 1.02]], rotate: [[0, 0], [1, 0]], opacity: [[0, 1], [1, 1]], glow: [[0, 0], [0.4, 1], [1, 0.3]], lift: [[0, 0], [0.4, 0.9], [1, 0.1]] },
    reactions: [R("glow", "start", 0, { at: "from", durationMs: 320 })],
    preview: { setup: { "deposit:right": ["K♥"] } },
  }),
  normalizeMotif({
    id: "trick_end_settle", group: "game", name: "Fin de pli · tassement", from: { zone: "deposit", player: "all" }, to: { zone: "deposit", player: "all" }, durationMs: 300, staggerMs: 40,
    description: "Sur place : la carte du dessus de chaque dépôt se soulève, puis se tasse sur sa pile, à tour de rôle. Les cartes restent sur les dépôts. Tient avec « Pli gagné · éclat » dans la pause de fin de pli.",
    path: whole(ease("smooth"), 0),
    lanes: { flip: [[0, 0], [1, 0]], scale: [[0, 1], [0.35, 1.06], [0.75, 0.97], [1, 1]], rotate: [[0, 0], [0.35, -3], [1, 0]], opacity: [[0, 1], [1, 1]], glow: [[0, 0], [0.35, 0.45], [1, 0]], lift: [[0, 0], [0.35, 0.6], [0.75, 0], [1, 0]] },
    count: 1,
    preview: { setup: { "deposit:me": ["6♥"], "deposit:top": ["K♠"], "deposit:left": ["4♣"], "deposit:right": ["J♦"] } },
  }),
  normalizeMotif({
    id: "play_classic", group: "game", name: "Jouer une carte · vol actuel", from: self("hand"), to: self("deposit"), durationMs: GAME_CONFIG.anim.dropFlight,
    trail: "light", trailIntensity: 1,
    description: "Le vol d'une carte jouée tel qu'il existe aujourd'hui : deux segments à la même courbe, sommet relevé de 16 % de la distance (28 à 76 px), taille du dépôt atteinte à mi-vol, retournement en vol pour les cartes adverses.",
    path: {
      easing: CLASSIC, timing: "perSegment", arc: { along: 0.5, perp: 0 }, smooth: false,
      via: [{ t: 0.46, frame: "screen", fx: 0.52, fy: 0.44, rise: 0.16, riseMinPx: 28, riseMaxPx: 76 }],
    },
    face: { mode: "auto", window: [0.14, 0.76], easing: [0.25, 0.85, 0.35, 1] },
    lanes: {
      flip: [[0, 0], [1, 0]],
      scale: [[0, 1.04, CLASSIC], [0.46, 1.08, CLASSIC], [1, 1]],
      rotate: [[0, -8, CLASSIC], [0.46, 0, CLASSIC], [1, 0]],
      opacity: [[0, 1], [1, 1]],
      glow: [[0, 0], [1, 0]],
      lift: [[0, 0.7], [1, 0.7]],
      sizeBlend: [[0, 0, CLASSIC], [0.46, 1, CLASSIC], [1, 1]],
      turnBlend: [[0, 0, CLASSIC], [0.46, 0.5, CLASSIC], [1, 1]],
    },
    preview: { pick: 2 },
  }),
];

export const DEFAULT_MOTIFS_BY_ID: Record<string, AnimMotif> = Object.fromEntries(DEFAULT_MOTIFS.map((motif) => [motif.id, motif]));
