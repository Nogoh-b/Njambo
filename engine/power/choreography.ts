/* ═══════════════ Chorégraphies spatiales (cartes pouvoir, phase C) ═══════════════
   Une chorégraphie = une ligne de temps de PISTES, attachée à une étape de
   script (`PowerStep.choreo`). Si elle est présente, elle remplace les cues
   `anim` de l'étape pour la mise en scène (le moteur, lui, n'en tient aucun
   compte : les effets réels restent ceux des briques `ops`).

   - REPÈRES : points d'ancrage calculés à chaque lecture depuis les zones de
     la table (main, dépôt, minuteur/avatar d'un joueur, pioche, pot,
     révélation) ou l'écran (centre, bords, hors-écran), + décalage en % de
     l'écran.
   - PISTES : trajectoire de carte (points de passage), animation propre à un
     élément, effet d'écran, texte, son (phase D). Chacune a un départ et une
     durée en ms, et peut se superposer aux autres.
   Un client ancien qui ne connaît pas un effet l'ignore (lecture tolérante). */

import { motifTotalMs, validateMotif } from "../anim/motif";
import { getMotif, resolveMotif, type MotifOverrides } from "../anim/registry";
import type { Card } from "../../types/game";
import type { PlayerRef, PowerFxPreset, PowerFxTone } from "./types";

/* ─────────────── Repères ─────────────── */

export type ZoneAnchor =
  | { kind: "zone"; zone: "hand" | "deposit" | "timer"; player: PlayerRef }
  | { kind: "zone"; zone: "deck" | "pot" | "reveal" };

export type ScreenAnchor = {
  kind: "screen";
  at: "center" | "tableCenter" | "top" | "bottom" | "left" | "right" | "offTop" | "offBottom" | "offLeft" | "offRight";
};

/** Position courante de la carte animée (pour « rester sur place » ou partir d'où elle est). */
export type SelfAnchor = { kind: "card" };

export type Anchor = (ZoneAnchor | ScreenAnchor | SelfAnchor) & {
  /** Décalage en % de la largeur / hauteur de l'écran (−50 à 50). */
  dx?: number;
  dy?: number;
};

/* ─────────────── Effets propres à chaque élément ─────────────── */

export const ELEMENT_EFFECTS = {
  card: ["lift", "pulse", "glow", "shake", "flip", "crack", "dissolve", "burn", "freeze", "shrink", "grow"],
  /* read : une lumière parcourt la main, les cartes écartées s'éteignent une à une (lanceur) ;
     advise : la carte conseillée (resolved:highlight) reçoit aura, badge « Conseil » et fil du temps (lanceur) ;
     strike : la foudre tombe du haut de l'écran sur la main (éclair, flash, secousse, arcs sur les cartes) ;
     dye : un pagne aux motifs colorés glisse sur la main et la teinte (changement de couleur) ;
     cut : un arc électrique part de l'avatar du lanceur et frappe la main visée, qui grésille (carte imposée) ;
     net : un filet lancé depuis l'avatar du lanceur s'ouvre sur la main visée, puis se resserre (carte imposée) ;
     stamp : un sceau runique vole de l'avatar du lanceur et frappe la carte désignée (resolved:highlight) de la main. */
  hand: ["fanOpen", "tighten", "shake", "glow", "veil", "ripple", "read", "advise", "strike", "dye", "cut", "net", "stamp"],
  deposit: ["pulse", "suck", "eject", "glow", "seal"],
  deck: ["pulse", "shuffle", "spit", "shake", "glow"],
  /* drain : un sablier se retourne au-dessus de l'avatar, son sable coule dans l'anneau du minuteur (« −6 s » en `label`) ;
     shout : des ondes de cri partent de cet avatar et frappent le minuteur de chaque adversaire (`label` sur chacun) ;
     drum : un djembé bat trois coups près de l'avatar, chaque coup recharge l'anneau du minuteur (`label` à la fin). */
  timer: ["freeze", "speedUp", "rewind", "crack", "blink", "tint", "delta", "drain", "shout", "drum"],
  /* cowrie : un cauris tombe sur l'avatar, rebondit et se pose devant ; bulle d'assurance et aura « chance » (`label` dessous). */
  avatar: ["auraShield", "auraMask", "auraTotem", "auraLucky", "shake", "halo", "bounce", "cowrie"],
  /* bless : un halo doré part de l'avatar du lanceur et se pose sur le pot, qui enfle et rayonne. */
  pot: ["flash", "coinRain", "grow", "label", "bless"],
} as const;

export type ElementKind = keyof typeof ELEMENT_EFFECTS;
export type ElementEffect<K extends ElementKind = ElementKind> = (typeof ELEMENT_EFFECTS)[K][number];

export type ElementTarget =
  | { element: "hand" | "deposit" | "timer" | "avatar"; player: PlayerRef }
  | { element: "deck" | "pot" }
  /** La (les) carte(s) animée(s) par une piste de trajectoire, désignée(s) par son id. */
  | { element: "card"; trackId: string };

export type Easing = "linear" | "smooth" | "accelerate" | "decelerate" | "bounce" | "elastic" | "back";

export interface Waypoint {
  at: Anchor;
  /** Pause sur ce point avant de repartir (ms). */
  holdMs?: number;
  /** Échelle de la carte à ce point (0.3 à 3). */
  scale?: number;
  /** Rotation à ce point (degrés, −720 à 720). */
  rotate?: number;
  /** Face de la carte à ce point (retournement animé entre deux points). */
  face?: "up" | "down";
}

interface TrackBase {
  /** Identifiant unique dans la chorégraphie (référencé par d'autres pistes). */
  id: string;
  startMs: number;
  durationMs: number;
}

export type ChoreoTrack =
  | (TrackBase & {
      kind: "cardPath";
      /** Cartes calculées par les briques de l'étape, ou une carte « fantôme » purement décorative. */
      cards: "resolved:outgoing" | "resolved:incoming" | "resolved:highlight" | "ghost";
      /** "move" accompagne un vrai déplacement (la carte disparaît de sa source pendant le vol). */
      mode: "move" | "display";
      /** Au moins 2 points : départ puis arrivée (points intermédiaires possibles). */
      waypoints: Waypoint[];
      easing: Easing;
      /** Bombé de la trajectoire entre deux points (−100 à 100, en % de la distance). */
      arc?: number;
      /** Décalage entre plusieurs cartes d'une même piste (ms). */
      staggerMs?: number;
      /** Traînée de particules pendant le vol. */
      trail?: PowerFxPreset;
    })
  | (TrackBase & {
      kind: "element";
      target: ElementTarget;
      effect: ElementEffect;
      /** 1 discret · 2 normal · 3 spectaculaire. */
      intensity?: 1 | 2 | 3;
      tone?: PowerFxTone;
      /** Texte pour `delta` (minuteur) et `label` (pot), ex. « −3 s », « ×2 ». */
      label?: string;
    })
  | (TrackBase & {
      kind: "screen";
      effect: "flash" | "shake" | "darken" | "particles";
      preset?: PowerFxPreset;
      tone?: PowerFxTone;
      intensity?: 1 | 2 | 3;
      /** Pour « particles » : où les émettre (centre de l'écran par défaut). */
      at?: Anchor;
    })
  | (TrackBase & {
      kind: "text";
      /** Repères remplacés à la lecture : {activator}, {target}, {outgoing}, {incoming}, {delta}, {cards} (voir `fillCardPlaceholders`). */
      text: string;
      at: Anchor;
      tone?: PowerFxTone;
      size?: "s" | "m" | "l";
      /** Qui voit ce texte : tout le monde (défaut), le lanceur seul, les autres joueurs, la cible seule,
       *  ou les joueurs ni lanceur ni cible. */
      audience?: TextAudience;
      /** Teinte selon le verdict de l'échange : vert si la carte reçue est plus forte, rose si plus faible. */
      verdictTone?: boolean;
    })
  | (TrackBase & {
      kind: "sound";
      /** Identifiant de son (phase D) : upload ou son du jeu. */
      sound: string;
      volume?: number;
    })
  | (TrackBase & {
      /** Vrai déplacement de cartes d'une zone à une autre, animé par un modèle V2 (zones intelligentes) :
       *  les zones donnent les poses (place exacte, inclinaison, taille), le modèle le mouvement.
       *  `durationMs` = place prévue sur la ligne de temps ; le vol réel suit le modèle. */
      kind: "v2";
      cards: "resolved:outgoing" | "resolved:incoming";
      from: V2ZoneAnchor;
      to: V2ZoneAnchor;
      /** Modèle V2 ; absent = celui de la carte (onglet Animation), sinon « Fluide ». */
      model?: string;
      /** Présentation avant le vol : la carte se lève au-dessus de sa zone de départ (décalage en % de l'écran),
       *  ou au centre de la table (`at: "tableCenter"`), se retourne si le joueur a le droit de la voir, et attend `holdMs`.
       *  Plusieurs cartes se rangent côte à côte. */
      present?: { holdMs: number; at?: "tableCenter"; dx?: number; dy?: number; scale?: number };
      /** Réorganiser les mains (défaut : oui). Non pour un échange : la nouvelle carte se pose dans la place laissée vide. */
      reflow?: boolean;
      /** Échange en place (mains → mains) : chaque carte prend la place de celle qu'elle remplace,
       *  les mains gardent leur nombre de cartes. */
      inPlace?: boolean;
    })
  | (TrackBase & {
      /** Modèle de l'atelier d'animations (phase G). `durationMs` = durée du vol d'UNE carte. */
      kind: "motif";
      motifId: string;
      cards: "resolved:outgoing" | "resolved:incoming" | "resolved:highlight" | "ghost";
      mode: "move" | "display";
      /** Réglages du modèle remplacés pour cette carte (départ, arrivée, pistes, réactions…). */
      overrides?: MotifOverrides;
    });

export type MotifTrack = ChoreoTrack & { kind: "motif" };
export type V2Track = ChoreoTrack & { kind: "v2" };

/** Zones qu'une piste V2 sait relier (leurs poses viennent du registre de zones). */
export type V2ZoneAnchor =
  | { zone: "hand" | "deposit"; player: PlayerRef }
  | { zone: "deck" | "pot" };

/** Montée de la présentation d'une piste V2 (avant la pause au-dessus de la zone de départ). */
export const V2_PRESENT_RISE_MS = 420;
/** Modèle V2 utilisé quand ni la piste ni la carte n'en choisissent un. */
export const DEFAULT_V2_MODEL = "v2_fluide";

/** « others » = tous sauf le lanceur (cible comprise) ; « bystanders » = ni le lanceur ni la cible. */
export const TEXT_AUDIENCES = ["all", "activator", "others", "target", "bystanders"] as const;
export type TextAudience = (typeof TEXT_AUDIENCES)[number];
/** Qui regarde la chorégraphie. */
export type ChoreoViewer = "activator" | "target" | "bystander";

/** Ce spectateur voit-il un texte réservé à ce public ? */
export function audienceSees(audience: TextAudience, viewer: ChoreoViewer): boolean {
  switch (audience) {
    case "all": return true;
    case "activator": return viewer === "activator";
    case "others": return viewer !== "activator";
    case "target": return viewer === "target";
    case "bystanders": return viewer === "bystander";
  }
}

const cardLabel = (card: Card) => `${card.rank}${card.suit}`;

type SwapCards = Card | readonly Card[] | null | undefined;
const asList = (cards: SwapCards): readonly Card[] => (cards == null ? [] : Array.isArray(cards) ? cards : [cards as Card]);

/** Écart de valeur entre les cartes reçues et les cartes données (sommes ; null si l'un des côtés manque). */
export function swapDelta(outgoing?: SwapCards, incoming?: SwapCards): number | null {
  const out = asList(outgoing), inc = asList(incoming);
  if (out.length === 0 || inc.length === 0) return null;
  return inc.reduce((sum, card) => sum + card.value, 0) - out.reduce((sum, card) => sum + card.value, 0);
}

/** Remplace {outgoing}, {incoming} et {delta} par les cartes de l'échange (« 3♥ », « 8♦ », « +5 » ;
 *  plusieurs cartes : « 3♠ 5♥ »), et {cards} par leur nombre (« 2 cartes »).
 *  Cartes inconnues (adversaire qui regarde) : repères effacés plutôt que trahis. */
export function fillCardPlaceholders(text: string, outgoing?: SwapCards, incoming?: SwapCards, count?: number): string {
  const delta = swapDelta(outgoing, incoming);
  const n = count ?? Math.max(asList(outgoing).length, asList(incoming).length);
  return text
    .replace(/\{outgoing\}/g, asList(outgoing).map(cardLabel).join(" "))
    .replace(/\{incoming\}/g, asList(incoming).map(cardLabel).join(" "))
    .replace(/\{cards\}/g, n > 0 ? `${n} carte${n > 1 ? "s" : ""}` : "")
    .replace(/\{delta\}/g,delta == null ? "" : delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : "=")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Modèle d'une piste « motif », surcharges et durée de la piste appliquées. */
export function motifOfTrack(track: MotifTrack) {
  return resolveMotif(track.motifId, { ...track.overrides, durationMs: track.durationMs });
}

export interface Choreography {
  tracks: ChoreoTrack[];
}

/* ─────────────── Bornes et validation ─────────────── */

export const CHOREO_LIMITS = { totalMs: 8_000, tracks: 20, waypoints: 6, textLength: 60, offset: 50 } as const;
export const SCREEN_ANCHORS: ScreenAnchor["at"][] = ["center", "tableCenter", "top", "bottom", "left", "right", "offTop", "offBottom", "offLeft", "offRight"];
export const EASINGS: Easing[] = ["linear", "smooth", "accelerate", "decelerate", "bounce", "elastic", "back"];
const PLAYER_REFS = ["self", "target", "each_target", "all_opponents", "all"];
const FX_PRESETS = ["mystic", "wind", "frost", "time", "goldRain", "shield", "revealMist", "lock", "boost"];
const TONES = ["gold", "teal", "pink", "cobalt"];

export interface ChoreoIssue { path: string; message: string }

const SOUND_REF = /^(preset:[a-z_]{2,24}|(\/[\w\-./]+|https?:\/\/[\w\-.]+(:\d+)?\/[\w\-./%]*)\.(mp3|ogg|m4a|wav))$/i;
const isSoundRefLike = (value: string) => value.length <= 300 && SOUND_REF.test(value);

const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});
const isInt = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const isNum = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function validateAnchor(value: unknown, path: string, issues: ChoreoIssue[]) {
  const anchor = obj(value);
  if (anchor.kind === "zone") {
    if (["hand", "deposit", "timer"].includes(String(anchor.zone))) {
      if (!PLAYER_REFS.includes(String(anchor.player))) issues.push({ path: `${path}.player`, message: "Joueur inconnu." });
    } else if (!["deck", "pot", "reveal"].includes(String(anchor.zone))) issues.push({ path: `${path}.zone`, message: "Zone inconnue." });
  } else if (anchor.kind === "screen") {
    if (!SCREEN_ANCHORS.includes(anchor.at as ScreenAnchor["at"])) issues.push({ path: `${path}.at`, message: "Repère d'écran inconnu." });
  } else if (anchor.kind !== "card") {
    issues.push({ path, message: "Repère inconnu." });
  }
  for (const key of ["dx", "dy"]) {
    if (anchor[key] !== undefined && !isNum(anchor[key], -CHOREO_LIMITS.offset, CHOREO_LIMITS.offset)) issues.push({ path: `${path}.${key}`, message: "Décalage : −50 à 50 %." });
  }
}

/** Erreurs d'une chorégraphie, chemins relatifs à `base` (ex. script.steps.0.choreo). */
export function validateChoreography(value: unknown, base: string): ChoreoIssue[] {
  const issues: ChoreoIssue[] = [];
  const choreo = obj(value);
  const tracks = Array.isArray(choreo.tracks) ? choreo.tracks : [];
  if (tracks.length === 0) issues.push({ path: `${base}.tracks`, message: "Au moins une piste." });
  if (tracks.length > CHOREO_LIMITS.tracks) issues.push({ path: `${base}.tracks`, message: `${CHOREO_LIMITS.tracks} pistes maximum.` });
  const ids = new Set<string>();
  const pathIds = new Set<string>();
  tracks.forEach((raw) => { const t = obj(raw); if ((t.kind === "cardPath" || t.kind === "motif") && typeof t.id === "string") pathIds.add(t.id); });
  tracks.forEach((raw, index) => {
    const path = `${base}.tracks.${index}`;
    const track = obj(raw);
    if (typeof track.id !== "string" || !/^[a-z0-9_]{1,24}$/i.test(track.id)) issues.push({ path: `${path}.id`, message: "Identifiant de piste invalide." });
    else if (ids.has(track.id)) issues.push({ path: `${path}.id`, message: "Identifiant de piste en double." });
    else ids.add(track.id);
    if (!isInt(track.startMs, 0, CHOREO_LIMITS.totalMs)) issues.push({ path: `${path}.startMs`, message: "Départ : 0 à 8 s." });
    if (!isInt(track.durationMs, track.kind === "sound" ? 0 : 50, CHOREO_LIMITS.totalMs)) issues.push({ path: `${path}.durationMs`, message: "Durée : 0,05 à 8 s." });
    else if (Number(track.startMs) + Number(track.durationMs) > CHOREO_LIMITS.totalMs) issues.push({ path: `${path}.durationMs`, message: "La piste dépasse 8 s au total." });
    const tone = track.tone;
    if (tone !== undefined && !TONES.includes(String(tone))) issues.push({ path: `${path}.tone`, message: "Teinte inconnue." });
    const intensity = track.intensity;
    if (intensity !== undefined && ![1, 2, 3].includes(Number(intensity))) issues.push({ path: `${path}.intensity`, message: "Intensité : 1, 2 ou 3." });
    switch (track.kind) {
      case "cardPath": {
        if (!["resolved:outgoing", "resolved:incoming", "resolved:highlight", "ghost"].includes(String(track.cards))) issues.push({ path: `${path}.cards`, message: "Cartes animées inconnues." });
        if (track.mode !== "move" && track.mode !== "display") issues.push({ path: `${path}.mode`, message: "Nature : déplacement réel ou visuel." });
        if (track.cards === "ghost" && track.mode === "move") issues.push({ path: `${path}.mode`, message: "Une carte fantôme est purement visuelle." });
        const waypoints = Array.isArray(track.waypoints) ? track.waypoints : [];
        if (waypoints.length < 2) issues.push({ path: `${path}.waypoints`, message: "Au moins un départ et une arrivée." });
        if (waypoints.length > CHOREO_LIMITS.waypoints) issues.push({ path: `${path}.waypoints`, message: `${CHOREO_LIMITS.waypoints} points maximum.` });
        waypoints.forEach((rawPoint, pointIndex) => {
          const point = obj(rawPoint);
          const pointPath = `${path}.waypoints.${pointIndex}`;
          validateAnchor(point.at, `${pointPath}.at`, issues);
          if (point.holdMs !== undefined && !isInt(point.holdMs, 0, 3000)) issues.push({ path: `${pointPath}.holdMs`, message: "Pause : 0 à 3 s." });
          if (point.scale !== undefined && !isNum(point.scale, 0.3, 3)) issues.push({ path: `${pointPath}.scale`, message: "Échelle : 0,3 à 3." });
          if (point.rotate !== undefined && !isNum(point.rotate, -720, 720)) issues.push({ path: `${pointPath}.rotate`, message: "Rotation : −720° à 720°." });
          if (point.face !== undefined && point.face !== "up" && point.face !== "down") issues.push({ path: `${pointPath}.face`, message: "Face : visible ou cachée." });
        });
        if (!EASINGS.includes(track.easing as Easing)) issues.push({ path: `${path}.easing`, message: "Courbe inconnue." });
        if (track.arc !== undefined && !isNum(track.arc, -100, 100)) issues.push({ path: `${path}.arc`, message: "Bombé : −100 à 100." });
        if (track.staggerMs !== undefined && !isInt(track.staggerMs, 0, 1000)) issues.push({ path: `${path}.staggerMs`, message: "Décalage : 0 à 1 s." });
        if (track.trail !== undefined && !FX_PRESETS.includes(String(track.trail))) issues.push({ path: `${path}.trail`, message: "Traînée inconnue." });
        break;
      }
      case "element": {
        const target = obj(track.target);
        const element = String(target.element);
        if (!(element in ELEMENT_EFFECTS)) { issues.push({ path: `${path}.target`, message: "Élément inconnu." }); break; }
        if (["hand", "deposit", "timer", "avatar"].includes(element) && !PLAYER_REFS.includes(String(target.player))) issues.push({ path: `${path}.target.player`, message: "Joueur inconnu." });
        if (element === "card" && !pathIds.has(String(target.trackId))) issues.push({ path: `${path}.target.trackId`, message: "Choisir une piste de trajectoire existante." });
        if (!(ELEMENT_EFFECTS[element as ElementKind] as readonly string[]).includes(String(track.effect))) issues.push({ path: `${path}.effect`, message: "Effet inconnu pour cet élément." });
        if (track.label !== undefined && (typeof track.label !== "string" || track.label.length > 12)) issues.push({ path: `${path}.label`, message: "Texte : 12 caractères maximum." });
        break;
      }
      case "screen":
        if (!["flash", "shake", "darken", "particles"].includes(String(track.effect))) issues.push({ path: `${path}.effect`, message: "Effet d'écran inconnu." });
        if (track.preset !== undefined && !FX_PRESETS.includes(String(track.preset))) issues.push({ path: `${path}.preset`, message: "Effet de particules inconnu." });
        if (track.at !== undefined) validateAnchor(track.at, `${path}.at`, issues);
        break;
      case "text":
        if (typeof track.text !== "string" || track.text.trim().length === 0 || track.text.length > CHOREO_LIMITS.textLength) issues.push({ path: `${path}.text`, message: "Texte : 1 à 60 caractères." });
        validateAnchor(track.at, `${path}.at`, issues);
        if (track.size !== undefined && !["s", "m", "l"].includes(String(track.size))) issues.push({ path: `${path}.size`, message: "Taille inconnue." });
        if (track.audience !== undefined && !(TEXT_AUDIENCES as readonly string[]).includes(String(track.audience))) issues.push({ path: `${path}.audience`, message: "Public inconnu." });
        if (track.verdictTone !== undefined && typeof track.verdictTone !== "boolean") issues.push({ path: `${path}.verdictTone`, message: "Teinte du verdict : oui ou non." });
        break;
      case "sound":
        if (typeof track.sound !== "string" || !isSoundRefLike(track.sound)) issues.push({ path: `${path}.sound`, message: "Son : préréglage ou fichier uploadé." });
        if (track.volume !== undefined && !isNum(track.volume, 0, 1)) issues.push({ path: `${path}.volume`, message: "Volume : 0 à 100 %." });
        break;
      case "v2": {
        if (!["resolved:outgoing", "resolved:incoming"].includes(String(track.cards))) issues.push({ path: `${path}.cards`, message: "Cartes : celles qui partent ou celles qui arrivent." });
        for (const key of ["from", "to"] as const) {
          const zone = obj(track[key]);
          if (["hand", "deposit"].includes(String(zone.zone))) {
            if (!PLAYER_REFS.includes(String(zone.player))) issues.push({ path: `${path}.${key}.player`, message: "Joueur inconnu." });
          } else if (!["deck", "pot"].includes(String(zone.zone))) issues.push({ path: `${path}.${key}.zone`, message: "Zone : main, dépôt, pioche ou pot." });
        }
        if (track.model !== undefined && (typeof track.model !== "string" || !/^[a-z0-9_]{3,48}$/.test(track.model))) issues.push({ path: `${path}.model`, message: "Modèle V2 : identifiant de 3 à 48 caractères a-z, 0-9 ou _." });
        if (track.present !== undefined) {
          const present = obj(track.present);
          if (!isInt(present.holdMs, 0, 3000)) issues.push({ path: `${path}.present.holdMs`, message: "Pause : 0 à 3 s." });
          if (present.at !== undefined && present.at !== "tableCenter") issues.push({ path: `${path}.present.at`, message: "Présentation : au-dessus du départ ou au centre de la table." });
          for (const key of ["dx", "dy"]) if (present[key] !== undefined && !isNum(present[key], -CHOREO_LIMITS.offset, CHOREO_LIMITS.offset)) issues.push({ path: `${path}.present.${key}`, message: "Décalage : −50 à 50 %." });
          if (present.scale !== undefined && !isNum(present.scale, 0.5, 3)) issues.push({ path: `${path}.present.scale`, message: "Échelle : 0,5 à 3." });
        }
        if (track.reflow !== undefined && typeof track.reflow !== "boolean") issues.push({ path: `${path}.reflow`, message: "Réorganiser les mains : oui ou non." });
        if (track.inPlace !== undefined && typeof track.inPlace !== "boolean") issues.push({ path: `${path}.inPlace`, message: "Échange en place : oui ou non." });
        break;
      }
      case "motif": {
        if (!["resolved:outgoing", "resolved:incoming", "resolved:highlight", "ghost"].includes(String(track.cards))) issues.push({ path: `${path}.cards`, message: "Cartes animées inconnues." });
        if (track.mode !== "move" && track.mode !== "display") issues.push({ path: `${path}.mode`, message: "Nature : déplacement réel ou visuel." });
        if (track.cards === "ghost" && track.mode === "move") issues.push({ path: `${path}.mode`, message: "Une carte fantôme est purement visuelle." });
        if (typeof track.motifId !== "string" || !getMotif(track.motifId)) { issues.push({ path: `${path}.motifId`, message: "Modèle d'animation inconnu." }); break; }
        if (track.overrides !== undefined && (typeof track.overrides !== "object" || Array.isArray(track.overrides))) { issues.push({ path: `${path}.overrides`, message: "Surcharges invalides." }); break; }
        const motif = isInt(track.durationMs, 50, CHOREO_LIMITS.totalMs) ? motifOfTrack(track as unknown as MotifTrack) : null;
        if (!motif) break;
        // Le modèle surchargé doit rester valide ; ses erreurs sont rattachées aux surcharges.
        for (const issue of validateMotif(motif, "m")) issues.push({ path: `${path}.overrides${issue.path.slice(1)}`, message: issue.message });
        // Le vol seul est déjà borné plus haut ; ici : décalage entre cartes et réactions compris.
        const start = Number(track.startMs);
        if (start + Number(track.durationMs) <= CHOREO_LIMITS.totalMs && start + motifTotalMs(motif) > CHOREO_LIMITS.totalMs) issues.push({ path: `${path}.durationMs`, message: "Le modèle dépasse 8 s au total (décalages et réactions compris)." });
        break;
      }
      default:
        issues.push({ path: `${path}.kind`, message: "Type de piste inconnu." });
    }
  });
  return issues;
}

/** Durée totale d'une chorégraphie (fin de la dernière piste). */
export function choreographyDuration(choreo: Choreography): number {
  return choreo.tracks.reduce((max, track) => {
    if (track.kind === "motif") {
      const motif = motifOfTrack(track);
      return Math.max(max, track.startMs + (motif ? motifTotalMs(motif) : track.durationMs));
    }
    if (track.kind === "v2") return Math.max(max, track.startMs + track.durationMs + (track.present ? V2_PRESENT_RISE_MS + track.present.holdMs : 0));
    return Math.max(max, track.startMs + track.durationMs + (track.kind === "cardPath" ? (track.waypoints ?? []).reduce((sum, point) => sum + (point.holdMs ?? 0), 0) : 0));
  }, 0);
}

/* ─────────────── Lien avec les cues existants ─────────────── */

/** Cues FONCTIONNELS : toujours joués, même si l'étape a une chorégraphie
 *  (ils donnent une vraie information de jeu : main révélée, carte conseillée,
 *  protection active). Les autres cues ne sont que de la mise en scène. */
export const FUNCTIONAL_CUES = ["revealOverlay", "highlightHandCard", "avatarAura"] as const;

type CueLike = { cue: string; [key: string]: unknown };

const zoneAnchorOf = (zone: Record<string, unknown>): Anchor => {
  if (zone.zone === "hand" || zone.zone === "deposit") return { kind: "zone", zone: zone.zone, player: zone.player as PlayerRef };
  if (zone.zone === "deck") return { kind: "zone", zone: "deck" };
  return { kind: "screen", at: "center" };
};

/** Chorégraphie de départ équivalente aux cues visuels d'une étape (éditeur : « Convertir »). */
export function choreographyFromCues(anim: CueLike[]): Choreography {
  const tracks: ChoreoTrack[] = [];
  let at = 0;
  anim.forEach((cue, index) => {
    const id = `t${index + 1}`;
    const fx = obj(cue.fx);
    const tone = (fx.tone as PowerFxTone | undefined);
    switch (cue.cue) {
      case "flyCards": {
        const cards = typeof cue.cards === "string" && ["resolved:outgoing", "resolved:incoming", "resolved:highlight"].includes(cue.cards)
          ? cue.cards as "resolved:outgoing" : "resolved:outgoing";
        tracks.push({
          id, kind: "cardPath", startMs: at, durationMs: 650, cards, mode: cue.mode === "display" ? "display" : "move",
          waypoints: [{ at: zoneAnchorOf(obj(cue.from)), ...(cue.hidden ? { face: "down" as const } : {}) }, { at: zoneAnchorOf(obj(cue.to)) }],
          easing: "smooth", arc: 30, ...(fx.preset ? { trail: fx.preset as PowerFxPreset } : { trail: "wind" as const }),
        });
        at += 650;
        break;
      }
      case "timerFx":
        tracks.push({
          id, kind: "element", startMs: at, durationMs: cue.kind === "freeze" ? Math.min(6_000, Number(cue.durationMs ?? 1500)) : 900,
          target: { element: "timer", player: cue.player as PlayerRef }, effect: cue.kind === "freeze" ? "freeze" : "delta",
          ...(cue.kind !== "freeze" ? { label: `${cue.kind === "gain" ? "+" : "−"}${Number(cue.seconds ?? 0)} s` } : {}),
          intensity: 3, ...(tone ? { tone } : {}),
        });
        at += 600;
        break;
      case "deckPulse":
        tracks.push({ id, kind: "element", startMs: at, durationMs: 900, target: { element: "deck" }, effect: "pulse", intensity: 2 });
        at += 400;
        break;
      case "potFlash":
        tracks.push({ id, kind: "element", startMs: at, durationMs: 1200, target: { element: "pot" }, effect: "flash", ...(cue.amountLabel ? { label: String(cue.amountLabel).slice(0, 12) } : {}), intensity: 3 });
        at += 600;
        break;
      case "toast":
        tracks.push({ id, kind: "text", startMs: at, durationMs: 1800, text: String(cue.text ?? "").slice(0, 60) || "!", at: { kind: "screen", at: "tableCenter", dy: -12 }, size: "m", ...(cue.tone ? { tone: cue.tone as PowerFxTone } : {}) });
        at += 300;
        break;
      default:
        break; // cues fonctionnels : restent joués tels quels
    }
    at += Math.max(0, Number(cue.afterMs ?? 0));
  });
  if (tracks.length === 0) tracks.push({ id: "t1", kind: "screen", startMs: 0, durationMs: 500, effect: "flash", intensity: 2 });
  return { tracks: tracks.map((track) => ({ ...track, startMs: Math.min(track.startMs, CHOREO_LIMITS.totalMs - track.durationMs) })) };
}
