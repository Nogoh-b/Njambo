/* ═══════════════ Modèles d'animation (atelier, phase G) ═══════════════
   Un MODÈLE décrit le mouvement d'une ou plusieurs cartes d'une zone de la
   table vers une autre (ou sur place) : trajectoire, courbe de vitesse,
   propriétés dans le temps (échelle, retournement, rotation…), effets
   pendant le vol et réactions de la table. Il est réutilisable : par les
   chorégraphies des cartes de pouvoir et par les mouvements de base du jeu
   (donne, carte jouée, pli…).

   Le modèle ne fait qu'ANIMER : les cartes réellement déplacées restent
   décidées par le moteur. Les zones sont désignées par RÔLE (le joueur qui
   agit, la cible, le gagnant…), jamais par siège : le même modèle marche
   pour chaque joueur, en portrait comme en paysage.

   Prototype de référence : docs/prototypes/atelier-animations.html. */

import type { PowerFxTone } from "../power/types";

/* ─────────────── Zones ─────────────── */

/** self = le joueur qui agit (joue, pioche, lance le pouvoir) ; all / all_opponents = chacun à tour de rôle. */
export const MOTIF_PLAYERS = ["self", "target", "winner", "all", "all_opponents"] as const;
export type MotifPlayer = (typeof MOTIF_PLAYERS)[number];
export const MOTIF_PLAYER_ZONES = ["hand", "deposit", "avatar", "timer"] as const;
export const MOTIF_TABLE_ZONES = ["deck", "pot", "center", "reveal"] as const;
export const OFFSCREEN_SIDES = ["top", "bottom", "left", "right"] as const;

export type MotifAnchor =
  | { zone: (typeof MOTIF_PLAYER_ZONES)[number]; player: MotifPlayer }
  | { zone: (typeof MOTIF_TABLE_ZONES)[number] }
  | { zone: "offscreen"; side: (typeof OFFSCREEN_SIDES)[number] };

const MULTI_PLAYERS: readonly MotifPlayer[] = ["all", "all_opponents"];
/** Vrai si le repère désigne plusieurs joueurs (distribution, fin de pli). */
export const isMultiAnchor = (anchor: MotifAnchor) => "player" in anchor && MULTI_PLAYERS.includes(anchor.player);
export const sameAnchor = (a: MotifAnchor, b: MotifAnchor) => JSON.stringify(a) === JSON.stringify(b);

/* ─────────────── Courbes ─────────────── */

/** Courbe de Bézier cubique façon CSS : [x1, y1, x2, y2]. y peut sortir de 0–1 (rebond). */
export type Bezier = [number, number, number, number];

export const MOTIF_EASINGS = {
  linear: [0, 0, 1, 1],
  smooth: [0.45, 0, 0.25, 1],
  accelerate: [0.55, 0, 1, 0.45],
  decelerate: [0.1, 0.7, 0.3, 1],
  lightBounce: [0.25, 1.25, 0.5, 1],
  spring: [0.3, 1.7, 0.5, 0.85],
  suck: [0.75, 0, 0.9, 0.25],
  flash: [0.1, 0.9, 0.05, 1],
  /** Courbe du vol actuel d'une carte jouée (FlyingCard). */
  classic: [0.22, 0.88, 0.28, 1],
} as const satisfies Record<string, Bezier>;

/* ─────────────── Trajectoire ─────────────── */

interface WaypointBase {
  /** Instant de passage : fraction du vol, strictement entre 0 et 1 et croissante. */
  t: number;
  /** Soulèvement vers le haut de l'écran, en fraction de la distance (négatif = vers le bas). */
  rise?: number;
  /** Bornes du soulèvement en pixels (appliquées à sa valeur absolue). */
  riseMinPx?: number;
  riseMaxPx?: number;
}
/** Point de passage exprimé le long du trajet (repère de l'atelier, s'adapte à toute direction). */
export interface PathWaypoint extends WaypointBase { frame?: "path"; along: number; perp?: number }
/** Point de passage exprimé en fractions horizontale / verticale de l'écran (vol historique). */
export interface ScreenWaypoint extends WaypointBase { frame: "screen"; fx: number; fy: number }
export type MotifWaypoint = PathWaypoint | ScreenWaypoint;

export interface MotifPath {
  easing: Bezier;
  /** whole : une seule courbe de vitesse sur tout le vol ; perSegment : la courbe se rejoue entre chaque point de passage. */
  timing: "whole" | "perSegment";
  /** Sans point de passage : bombé de la courbe (sommet le long du trajet, écart perpendiculaire en fraction de la distance). */
  arc: { along: number; perp: number };
  /** Points de passage entre le départ et l'arrivée (0 à 4). */
  via: MotifWaypoint[];
  /** Avec points de passage : courbe lissée (Catmull-Rom) ou segments droits. */
  smooth: boolean;
}

/* ─────────────── Propriétés dans le temps ─────────────── */

/** [temps 0–1, valeur] ou [temps, valeur, courbe jusqu'au point suivant] (linéaire par défaut). */
export type LanePoint = [number, number] | [number, number, Bezier];

export const LANE_SPECS = {
  /** Multiplie la taille de base (fondue entre la zone de départ et celle d'arrivée). */
  scale: { min: 0, max: 3, rest: 1 },
  /** 0 = face visible, 180 = dos (utilisée quand face.mode = "lane"). */
  flip: { min: 0, max: 180, rest: 0 },
  /** Degrés ajoutés à la rotation de base. */
  rotate: { min: -720, max: 720, rest: 0 },
  opacity: { min: 0, max: 1, rest: 1 },
  glow: { min: 0, max: 1, rest: 0 },
  /** Élévation : ombre portée et léger soulèvement. */
  lift: { min: 0, max: 1, rest: 0 },
  /** Avancé : passage de la taille de départ (0) à celle d'arrivée (1). Absente = suit la trajectoire. */
  sizeBlend: { min: 0, max: 1, rest: 0 },
  /** Avancé : passage de la rotation de départ (0) à celle d'arrivée (1). Absente = suit la trajectoire. */
  turnBlend: { min: 0, max: 1, rest: 0 },
} as const;
export type LaneKey = keyof typeof LANE_SPECS;
export const REQUIRED_LANES = ["scale", "flip", "rotate", "opacity", "glow", "lift"] as const satisfies readonly LaneKey[];
export const OPTIONAL_LANES = ["sizeBlend", "turnBlend"] as const satisfies readonly LaneKey[];
export type MotifLanes = Record<(typeof REQUIRED_LANES)[number], LanePoint[]> & Partial<Record<(typeof OPTIONAL_LANES)[number], LanePoint[]>>;

/* ─────────────── Face, effets, réactions ─────────────── */

/** auto : la carte prend la face de sa destination pendant la fenêtre ; lane : piste « flip ». */
export type MotifFace = { mode: "auto"; window: [number, number]; easing: Bezier } | { mode: "lane" };

export const MOTIF_TRAILS = ["none", "light", "sparks", "blur"] as const;
export type MotifTrail = (typeof MOTIF_TRAILS)[number];

export const MOTIF_REACTIONS = {
  flash: { label: "Flash lumineux", durationMs: 380, placed: true },
  ring: { label: "Onde d'impact", durationMs: 520, placed: true },
  burst: { label: "Gerbe d'étincelles", durationMs: 620, placed: true },
  glow: { label: "Surbrillance de la zone", durationMs: 900, placed: true },
  crown: { label: "Couronne (carte gagnante)", durationMs: 420, placed: true },
  avatarPulse: { label: "Pulsation de l'avatar", durationMs: 650, placed: true },
  nkap: { label: "Les Nkap clignotent", durationMs: 900, placed: false },
  deckShake: { label: "La pioche tremble", durationMs: 420, placed: false },
  dim: { label: "Assombrir les autres cartes", durationMs: 900, placed: false },
  shake: { label: "Secousse de l'écran", durationMs: 320, placed: false },
} as const;
export type MotifReactionType = keyof typeof MOTIF_REACTIONS;

export interface MotifReaction {
  type: MotifReactionType;
  /** Calée sur le départ ou l'arrivée de la carte. */
  anchor: "start" | "arrival";
  offsetMs: number;
  durationMs?: number;
  /** Rejouée pour chaque carte (sinon : départ de la première, arrivée de la dernière). */
  each?: boolean;
  /** Où la jouer (réactions placées) : départ, arrivée ou une zone précise. */
  at?: "from" | "to" | MotifAnchor;
  tone?: PowerFxTone;
}

/* ─────────────── Modèle ─────────────── */

export const MOTIF_GROUPS = {
  trajets: "Les 7 trajets",
  card: "Carte",
  hand: "Main",
  deposit: "Dépôt",
  center: "Espace central",
  game: "Partie",
  custom: "Mes animations",
} as const;
export type MotifGroup = keyof typeof MOTIF_GROUPS;

/** Données de la table de démonstration de l'atelier (sans effet en partie). */
export const PREVIEW_ZONES = ["hand:me", "hand:top", "hand:left", "hand:right", "deposit:me", "deposit:top", "deposit:left", "deposit:right", "center"] as const;
export interface MotifPreview {
  /** Index de la première carte prise dans la zone de départ. */
  pick?: number;
  /** Contenu de départ des zones : liste de cartes (« 7♦* » = face cachée) ou nombre de dos. */
  setup?: Partial<Record<(typeof PREVIEW_ZONES)[number], string[] | number>>;
  /** Cartes créées quand le départ n'est pas une zone de cartes (pioche, avatar…). */
  cards?: string[];
}

export interface AnimMotif {
  id: string;
  name: string;
  description?: string;
  group: MotifGroup;
  from: MotifAnchor;
  /** Identique à `from` : animation sur place. */
  to: MotifAnchor;
  /** Cartes animées quand le jeu ne les impose pas (aperçu, cartes décoratives) ; par joueur si un côté vaut « chacun ». */
  count: number;
  staggerMs: number;
  /** Durée du vol d'UNE carte. */
  durationMs: number;
  path: MotifPath;
  lanes: MotifLanes;
  face: MotifFace;
  trail: MotifTrail;
  trailIntensity?: 1 | 2 | 3;
  /** La carte s'aplatit puis rebondit à l'arrivée (SQUASH_MS). */
  squash: boolean;
  reactions: MotifReaction[];
  preview?: MotifPreview;
}

/* ─────────────── Bornes ─────────────── */

export const MOTIF_LIMITS = {
  count: 6,
  staggerMs: 1_000,
  durationMs: { min: 80, max: 3_000 },
  /** Fin de la dernière réaction ou du dernier vol (comme les chorégraphies). */
  totalMs: 8_000,
  via: 4,
  lanePoints: 8,
  reactions: 8,
  reactionOffsetMs: { min: -2_000, max: 3_000 },
  reactionDurationMs: { min: 50, max: 3_000 },
  risePx: 400,
  /** Joueurs à une table pleine (durée d'une distribution « à chacun »). */
  seats: 4,
  name: 40,
  description: 240,
} as const;
export const SQUASH_MS = 280;

/* ─────────────── Normalisation ─────────────── */

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const restLane = (key: LaneKey): LanePoint[] => [[0, LANE_SPECS[key].rest], [1, LANE_SPECS[key].rest]];

/** Complète les champs facultatifs absents (sans corriger les valeurs : la validation les signale). */
export function normalizeMotif(raw: Partial<AnimMotif> & Pick<AnimMotif, "id" | "name" | "from" | "to">): AnimMotif {
  const value = clone(raw);
  const path: Partial<MotifPath> = value.path ?? {};
  const lanes = (value.lanes ?? {}) as Partial<MotifLanes>;
  const motif: AnimMotif = {
    id: value.id,
    name: value.name,
    group: value.group ?? "custom",
    from: value.from,
    to: value.to,
    count: value.count ?? 1,
    staggerMs: value.staggerMs ?? 0,
    durationMs: value.durationMs ?? 600,
    path: {
      easing: path.easing ?? [...MOTIF_EASINGS.smooth],
      timing: path.timing ?? "whole",
      arc: path.arc ?? { along: 0.5, perp: 0 },
      via: path.via ?? [],
      smooth: path.smooth ?? true,
    },
    lanes: {
      ...Object.fromEntries(REQUIRED_LANES.map((key) => [key, lanes[key] ?? restLane(key)])),
      ...Object.fromEntries(OPTIONAL_LANES.filter((key) => lanes[key] !== undefined).map((key) => [key, lanes[key]])),
    } as MotifLanes,
    face: value.face ?? { mode: "lane" },
    trail: value.trail ?? "none",
    squash: value.squash ?? false,
    reactions: value.reactions ?? [],
  };
  if (value.description !== undefined) motif.description = value.description;
  if (value.trailIntensity !== undefined) motif.trailIntensity = value.trailIntensity;
  if (value.preview !== undefined) motif.preview = value.preview;
  return motif;
}

/* ─────────────── Validation ─────────────── */

export interface MotifIssue { path: string; message: string }

const ID = /^[a-z0-9_]{3,48}$/;
const CARD = /^(10|[2-9]|[AJQK?])[♠♥♦♣]\*?$/;
const has = <T extends readonly string[]>(list: T, value: unknown): value is T[number] => typeof value === "string" && (list as readonly string[]).includes(value);
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});
const isInt = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const isNum = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function validateMotifAnchor(value: unknown, path: string, issues: MotifIssue[]) {
  const anchor = obj(value);
  if (has(MOTIF_PLAYER_ZONES, anchor.zone)) {
    if (!has(MOTIF_PLAYERS, anchor.player)) issues.push({ path: `${path}.player`, message: "Joueur inconnu." });
  } else if (anchor.zone === "offscreen") {
    if (!has(OFFSCREEN_SIDES, anchor.side)) issues.push({ path: `${path}.side`, message: "Bord de l'écran inconnu." });
  } else if (!has(MOTIF_TABLE_ZONES, anchor.zone)) {
    issues.push({ path, message: "Zone inconnue." });
  }
}

export function validateBezier(value: unknown, path: string, issues: MotifIssue[]) {
  const ok = Array.isArray(value) && value.length === 4
    && isNum(value[0], 0, 1) && isNum(value[2], 0, 1) && isNum(value[1], -1, 2) && isNum(value[3], -1, 2);
  if (!ok) issues.push({ path, message: "Courbe : [x1, y1, x2, y2], x entre 0 et 1, y entre −1 et 2." });
}

function validateLane(value: unknown, key: LaneKey, path: string, issues: MotifIssue[]) {
  const spec = LANE_SPECS[key];
  if (!Array.isArray(value) || value.length < 2 || value.length > MOTIF_LIMITS.lanePoints) {
    issues.push({ path, message: `Piste : 2 à ${MOTIF_LIMITS.lanePoints} points.` });
    return;
  }
  let previous = -1;
  value.forEach((raw, index) => {
    const pointPath = `${path}.${index}`;
    if (!Array.isArray(raw) || raw.length < 2 || raw.length > 3) { issues.push({ path: pointPath, message: "Point : [temps, valeur] ou [temps, valeur, courbe]." }); return; }
    const [t, v, easing] = raw as unknown[];
    const isEdge = index === 0 || index === value.length - 1;
    if (!isNum(t, 0, 1) || (index === 0 && t !== 0) || (index === value.length - 1 && t !== 1) || (t as number) <= previous) {
      issues.push({ path: `${pointPath}.0`, message: isEdge ? "La piste commence à 0 et finit à 1." : "Temps croissants, entre 0 et 1." });
    }
    previous = typeof t === "number" ? t : previous;
    if (!isNum(v, spec.min, spec.max)) issues.push({ path: `${pointPath}.1`, message: `Valeur : ${spec.min} à ${spec.max}.` });
    if (easing !== undefined) validateBezier(easing, `${pointPath}.2`, issues);
  });
}

function validateWaypoint(value: unknown, path: string, issues: MotifIssue[], previousT: number): number {
  const point = obj(value);
  const t = point.t;
  if (!isNum(t, 0.01, 0.99) || (t as number) <= previousT) issues.push({ path: `${path}.t`, message: "Instant : entre 0 et 1, croissant." });
  if (point.frame === "screen") {
    if (!isNum(point.fx, -1, 2)) issues.push({ path: `${path}.fx`, message: "Fraction horizontale : −1 à 2." });
    if (!isNum(point.fy, -1, 2)) issues.push({ path: `${path}.fy`, message: "Fraction verticale : −1 à 2." });
  } else if (point.frame === undefined || point.frame === "path") {
    if (!isNum(point.along, -0.5, 1.5)) issues.push({ path: `${path}.along`, message: "Position le long du trajet : −0,5 à 1,5." });
    if (point.perp !== undefined && !isNum(point.perp, -1.5, 1.5)) issues.push({ path: `${path}.perp`, message: "Écart : −1,5 à 1,5." });
  } else {
    issues.push({ path: `${path}.frame`, message: "Repère du point : trajet ou écran." });
  }
  if (point.rise !== undefined && !isNum(point.rise, -1, 1)) issues.push({ path: `${path}.rise`, message: "Soulèvement : −1 à 1." });
  for (const key of ["riseMinPx", "riseMaxPx"] as const) {
    if (point[key] !== undefined && !isNum(point[key], 0, MOTIF_LIMITS.risePx)) issues.push({ path: `${path}.${key}`, message: `Borne : 0 à ${MOTIF_LIMITS.risePx} px.` });
  }
  if (typeof point.riseMinPx === "number" && typeof point.riseMaxPx === "number" && point.riseMinPx > point.riseMaxPx) {
    issues.push({ path: `${path}.riseMaxPx`, message: "La borne haute doit dépasser la borne basse." });
  }
  return typeof t === "number" ? t : previousT;
}

/** Fin du dernier vol et de la dernière réaction, pour `flights` cartes (ms). */
export function motifTotalMs(motif: AnimMotif, flights = motif.count): number {
  const n = Math.max(1, flights);
  const lastStart = (n - 1) * motif.staggerMs;
  let total = lastStart + motif.durationMs + (motif.squash && !sameAnchor(motif.from, motif.to) ? SQUASH_MS : 0);
  for (const reaction of motif.reactions) {
    const def = MOTIF_REACTIONS[reaction.type];
    if (!def) continue;
    const anchorAt = reaction.anchor === "start" ? (reaction.each ? lastStart : 0) : lastStart + motif.durationMs;
    total = Math.max(total, anchorAt + reaction.offsetMs + (reaction.durationMs ?? def.durationMs));
  }
  return total;
}

/** Erreurs d'un modèle, chemins relatifs à `base` (ex. « motif »). */
export function validateMotif(value: unknown, base = "motif"): MotifIssue[] {
  const issues: MotifIssue[] = [];
  const push = (path: string, message: string) => issues.push({ path: `${base}.${path}`, message });
  const motif = obj(value);
  if (typeof motif.id !== "string" || !ID.test(motif.id)) push("id", "Identifiant : 3 à 48 caractères a-z, 0-9 ou _.");
  if (typeof motif.name !== "string" || motif.name.trim().length < 2 || motif.name.length > MOTIF_LIMITS.name) push("name", `Nom : 2 à ${MOTIF_LIMITS.name} caractères.`);
  if (motif.description !== undefined && (typeof motif.description !== "string" || motif.description.length > MOTIF_LIMITS.description)) push("description", `Description : ${MOTIF_LIMITS.description} caractères maximum.`);
  if (!has(Object.keys(MOTIF_GROUPS) as MotifGroup[], motif.group)) push("group", "Famille inconnue.");

  validateMotifAnchor(motif.from, `${base}.from`, issues);
  validateMotifAnchor(motif.to, `${base}.to`, issues);
  const multiFrom = MULTI_PLAYERS.includes(obj(motif.from).player as MotifPlayer);
  const multiTo = MULTI_PLAYERS.includes(obj(motif.to).player as MotifPlayer);
  // Sauf sur place (même repère des deux côtés) : chaque carte s'anime sur sa propre zone (fin de pli).
  if (multiFrom && multiTo && JSON.stringify(motif.from) !== JSON.stringify(motif.to)) push("to", "Un seul côté peut concerner chaque joueur, sauf sur place.");

  if (!isInt(motif.count, 1, MOTIF_LIMITS.count)) push("count", `Cartes : 1 à ${MOTIF_LIMITS.count}.`);
  if (!isInt(motif.staggerMs, 0, MOTIF_LIMITS.staggerMs)) push("staggerMs", "Décalage entre cartes : 0 à 1 s.");
  if (!isInt(motif.durationMs, MOTIF_LIMITS.durationMs.min, MOTIF_LIMITS.durationMs.max)) push("durationMs", "Durée du vol : 0,08 à 3 s.");

  const path = obj(motif.path);
  validateBezier(path.easing, `${base}.path.easing`, issues);
  if (path.timing !== "whole" && path.timing !== "perSegment") push("path.timing", "Rythme : sur tout le vol ou par segment.");
  const arc = obj(path.arc);
  if (!isNum(arc.along, 0.05, 0.95)) push("path.arc.along", "Sommet : 5 à 95 % du trajet.");
  if (!isNum(arc.perp, -1, 1)) push("path.arc.perp", "Bombé : −100 à 100 %.");
  if (typeof path.smooth !== "boolean") push("path.smooth", "Lissage : oui ou non.");
  if (!Array.isArray(path.via) || path.via.length > MOTIF_LIMITS.via) push("path.via", `Points de passage : ${MOTIF_LIMITS.via} au plus.`);
  else path.via.reduce<number>((previous, point, index) => validateWaypoint(point, `${base}.path.via.${index}`, issues, previous), 0);

  const lanes = obj(motif.lanes);
  for (const key of REQUIRED_LANES) validateLane(lanes[key], key, `${base}.lanes.${key}`, issues);
  for (const key of OPTIONAL_LANES) if (lanes[key] !== undefined) validateLane(lanes[key], key, `${base}.lanes.${key}`, issues);
  for (const key of Object.keys(lanes)) if (!(key in LANE_SPECS)) push(`lanes.${key}`, "Piste inconnue.");

  const face = obj(motif.face);
  if (face.mode === "auto") {
    const window = face.window;
    if (!Array.isArray(window) || window.length !== 2 || !isNum(window[0], 0, 1) || !isNum(window[1], 0, 1) || window[0] >= window[1]) push("face.window", "Fenêtre du retournement : début < fin, entre 0 et 1.");
    validateBezier(face.easing, `${base}.face.easing`, issues);
  } else if (face.mode !== "lane") push("face.mode", "Face : automatique ou piste.");

  if (!has(MOTIF_TRAILS, motif.trail)) push("trail", "Traînée inconnue.");
  if (motif.trailIntensity !== undefined && !isInt(motif.trailIntensity, 1, 3)) push("trailIntensity", "Intensité : 1, 2 ou 3.");
  if (typeof motif.squash !== "boolean") push("squash", "Atterrissage écrasé : oui ou non.");

  const reactions = Array.isArray(motif.reactions) ? motif.reactions : null;
  if (!reactions || reactions.length > MOTIF_LIMITS.reactions) push("reactions", `Réactions : ${MOTIF_LIMITS.reactions} au plus.`);
  reactions?.forEach((raw, index) => {
    const reaction = obj(raw);
    const path = `reactions.${index}`;
    const def = MOTIF_REACTIONS[reaction.type as MotifReactionType];
    if (!def) { push(`${path}.type`, "Réaction inconnue."); return; }
    if (reaction.anchor !== "start" && reaction.anchor !== "arrival") push(`${path}.anchor`, "Moment : au départ ou à l'arrivée.");
    if (!isInt(reaction.offsetMs, MOTIF_LIMITS.reactionOffsetMs.min, MOTIF_LIMITS.reactionOffsetMs.max)) push(`${path}.offsetMs`, "Décalage : −2 à 3 s.");
    if (reaction.durationMs !== undefined && !isInt(reaction.durationMs, MOTIF_LIMITS.reactionDurationMs.min, MOTIF_LIMITS.reactionDurationMs.max)) push(`${path}.durationMs`, "Durée : 0,05 à 3 s.");
    if (reaction.each !== undefined && typeof reaction.each !== "boolean") push(`${path}.each`, "Pour chaque carte : oui ou non.");
    if (reaction.at !== undefined) {
      if (!def.placed) push(`${path}.at`, "Cette réaction ne se place pas sur la table.");
      else if (reaction.at !== "from" && reaction.at !== "to") validateMotifAnchor(reaction.at, `${base}.${path}.at`, issues);
    }
    if (reaction.tone !== undefined && !has(["gold", "teal", "pink", "cobalt"] as const, reaction.tone)) push(`${path}.tone`, "Teinte inconnue.");
  });

  const preview = motif.preview;
  if (preview !== undefined) {
    const data = obj(preview);
    if (data.pick !== undefined && !isInt(data.pick, 0, 11)) push("preview.pick", "Carte de départ : 0 à 11.");
    for (const [zone, content] of Object.entries(obj(data.setup))) {
      if (!has(PREVIEW_ZONES, zone)) push(`preview.setup.${zone}`, "Zone de démonstration inconnue.");
      else if (typeof content === "number" ? !isInt(content, 0, 12) : !Array.isArray(content) || content.length > 12 || content.some((card) => typeof card !== "string" || !CARD.test(card))) {
        push(`preview.setup.${zone}`, "Contenu : 0 à 12 cartes (« 7♦ », « 7♦* » cachée) ou un nombre de dos.");
      }
    }
    if (data.cards !== undefined && (!Array.isArray(data.cards) || data.cards.length > 12 || data.cards.some((card) => typeof card !== "string" || !CARD.test(card)))) push("preview.cards", "Cartes : 12 au plus (« 7♦ »…).");
  }

  if (issues.length === 0 && motifTotalMs(motif as unknown as AnimMotif, (motif.count as number) * (multiFrom || multiTo ? MOTIF_LIMITS.seats : 1)) > MOTIF_LIMITS.totalMs) {
    push("durationMs", "L'animation dépasse 8 s au total.");
  }
  return issues;
}
