/* ═══════════════ Styles d'animation des joueurs (atelier, phase G5) ═══════════════
   Un cosmétique « Style d'animation » change l'APPARENCE des mouvements de
   son propriétaire, jamais leur RYTHME : seule une liste blanche de
   réglages visuels est surchargeable (traînée, teinte, lueur, impact à
   l'arrivée). Durées, trajectoires et nombre de cartes restent ceux du
   modèle : la synchro et les enchaînements sont les mêmes pour tous. */

import type { PowerFxTone } from "../power/types";
import { MOTIF_LIMITS, MOTIF_REACTIONS, MOTIF_TRAILS, motifTotalMs, type AnimMotif, type LanePoint, type MotifIssue, type MotifReaction, type MotifTrail } from "./motif";

export const STYLE_TONES = ["gold", "pink", "teal", "cobalt"] as const satisfies readonly PowerFxTone[];
export const STYLE_IMPACTS = ["flash", "ring", "burst"] as const;
export type StyleImpact = (typeof STYLE_IMPACTS)[number];

export interface AnimStyle {
  /** Traînée pendant le vol (remplace celle du modèle). */
  trail?: MotifTrail;
  /** Densité de la traînée. */
  trailIntensity?: 1 | 2 | 3;
  /** Teinte : traînée, lueur et réactions. */
  tone?: PowerFxTone;
  /** Lueur de la carte pendant le vol, de 0 à 1 (sommet de la piste « lueur »). */
  glow?: number;
  /** Impact ajouté à l'arrivée de la carte. */
  impact?: StyleImpact;
}

/** Les seuls réglages qu'un style peut changer : rien qui touche au temps. */
export const STYLE_KEYS = ["trail", "trailIntensity", "tone", "glow", "impact"] as const satisfies readonly (keyof AnimStyle)[];

/** En dessous, un impact raccourci pour tenir dans la durée du modèle est retiré. */
const MIN_IMPACT_MS = 120;

const obj = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null);
const has = <T extends readonly unknown[]>(list: T, value: unknown): value is T[number] => (list as readonly unknown[]).includes(value);

/** Erreurs d'un style, chemins relatifs à `base` (ex. « style »). */
export function validateAnimStyle(value: unknown, base = "style"): MotifIssue[] {
  const style = obj(value);
  if (!style) return [{ path: base, message: "Style invalide." }];
  const issues: MotifIssue[] = [];
  const push = (key: string, message: string) => issues.push({ path: `${base}.${key}`, message });
  for (const key of Object.keys(style)) {
    if (!has(STYLE_KEYS, key)) push(key, "Réglage non modifiable par un style : seuls la traînée, sa densité, la teinte, la lueur et l'impact le sont.");
  }
  if (style.trail !== undefined && !has(MOTIF_TRAILS, style.trail)) push("trail", "Traînée inconnue.");
  if (style.trailIntensity !== undefined && !has([1, 2, 3] as const, style.trailIntensity)) push("trailIntensity", "Densité : 1, 2 ou 3.");
  if (style.tone !== undefined && !has(STYLE_TONES, style.tone)) push("tone", "Teinte inconnue.");
  if (style.glow !== undefined && (typeof style.glow !== "number" || !(style.glow >= 0 && style.glow <= 1))) push("glow", "Lueur : de 0 à 1.");
  if (style.impact !== undefined && !has(STYLE_IMPACTS, style.impact)) push("impact", "Impact inconnu.");
  if (!STYLE_KEYS.some((key) => style[key] !== undefined)) issues.push({ path: base, message: "Le style doit changer au moins un réglage." });
  return issues;
}

/** Lecture tolérante (copie équipée, aperçu) : ne garde que les réglages valides, null s'il n'en reste aucun. */
export function readAnimStyle(raw: unknown): AnimStyle | null {
  const source = obj(raw);
  if (!source) return null;
  const style: AnimStyle = {};
  if (has(MOTIF_TRAILS, source.trail)) style.trail = source.trail;
  if (has([1, 2, 3] as const, source.trailIntensity)) style.trailIntensity = source.trailIntensity;
  if (has(STYLE_TONES, source.tone)) style.tone = source.tone;
  if (typeof source.glow === "number" && source.glow >= 0 && source.glow <= 1) style.glow = source.glow;
  if (has(STYLE_IMPACTS, source.impact)) style.impact = source.impact;
  return Object.keys(style).length ? style : null;
}

/** Paramètre d'URL de « Essayer dans une partie » : `?apercuStyle=trail:sparks,tone:pink,glow:0.6`. */
export const STYLE_PREVIEW_PARAM = "apercuStyle";

export function encodeAnimStyle(style: AnimStyle): string {
  return STYLE_KEYS.filter((key) => style[key] !== undefined).map((key) => `${key}:${style[key]}`).join(",");
}

export function parseAnimStyle(text: string): AnimStyle | null {
  const raw: Record<string, unknown> = {};
  for (const pair of text.split(",")) {
    const [key, value = ""] = pair.split(":");
    raw[key] = /^\d+(\.\d+)?$/.test(value) ? Number(value) : value;
  }
  return readAnimStyle(raw);
}

/** Piste « lueur » dont le sommet vaut `peak` (même forme si la piste brille déjà, sinon un éclat à mi-vol). */
function glowLane(lane: LanePoint[], peak: number): LanePoint[] {
  const max = Math.max(...lane.map((point) => point[1]));
  if (max <= 0.001) return [[0, 0], [0.5, peak], [1, 0]];
  return lane.map((point) => {
    const value = Math.min(1, (point[1] * peak) / max);
    return point.length === 3 ? [point[0], value, point[2]] : [point[0], value];
  });
}

/** Modèle aux couleurs d'un style. `measure` donne la durée qui compte (par défaut : l'animation entière) :
 *  elle ne s'allonge jamais, l'impact ajouté est raccourci (ou retiré) pour tenir dedans. */
export function applyAnimStyle(motif: AnimMotif, style: AnimStyle | null | undefined, measure: (motif: AnimMotif) => number = (item) => motifTotalMs(item)): AnimMotif {
  if (!style) return motif;
  const next: AnimMotif = { ...motif, lanes: { ...motif.lanes }, reactions: motif.reactions.map((reaction) => ({ ...reaction, ...(style.tone ? { tone: style.tone } : {}) })) };
  if (style.trail) next.trail = style.trail;
  if (style.trailIntensity) next.trailIntensity = style.trailIntensity;
  if (style.glow !== undefined) next.lanes.glow = glowLane(motif.lanes.glow, style.glow);
  if (style.impact && next.reactions.length < MOTIF_LIMITS.reactions) {
    const limit = measure(motif);
    const impact = (durationMs: number): MotifReaction => ({ type: style.impact!, anchor: "arrival", offsetMs: 0, at: "to", durationMs, ...(style.tone ? { tone: style.tone } : {}) });
    const full = MOTIF_REACTIONS[style.impact].durationMs;
    const overflow = measure({ ...next, reactions: [...next.reactions, impact(full)] }) - limit;
    const durationMs = overflow > 0 ? full - overflow : full;
    if (durationMs >= MIN_IMPACT_MS) next.reactions = [...next.reactions, impact(durationMs)];
  }
  return next;
}
