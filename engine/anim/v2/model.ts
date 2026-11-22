/* ═══════════════ Animation V2 — modèle (étape V2-2) ═══════════════
   Un modèle V2 ne décrit QUE le mouvement : durée, courbure, rythme, effets
   de sortie et d'entrée, durée de la réorganisation de la main. Le départ,
   l'arrivée, la rotation, la taille et la face viennent des zones (voir
   ./pose.ts). Un même modèle sert donc pour tous les trajets.

   Format repris du prototype (docs/prototypes/animation-v2-zones.html),
   avec un identifiant et un nom pour le registre. Un export du prototype
   (sans identifiant) se normalise tel quel. */

import type { Bezier, MotifIssue } from "../motif";

export const ANIM_V2_SCHEMA = "njambo.anim.v2";

/** Rythmes proposés (courbes façon CSS `cubic-bezier`). */
export const ANIM_V2_EASINGS = {
  smooth: { label: "Fluide", curve: [0.45, 0, 0.55, 1] as Bezier },
  out: { label: "Arrivée douce", curve: [0.22, 1, 0.36, 1] as Bezier },
  linear: { label: "Linéaire", curve: [0, 0, 1, 1] as Bezier },
} as const;
export type AnimV2Easing = keyof typeof ANIM_V2_EASINGS;

/** Effets joués sur la zone de départ ou d'arrivée. */
export const ANIM_V2_EFFECTS = {
  none: { label: "Aucun", durationMs: 0 },
  glow: { label: "Lueur", durationMs: 650 },
  pulse: { label: "Pulsation", durationMs: 440 },
} as const;
export type AnimV2Effect = keyof typeof ANIM_V2_EFFECTS;

export const ANIM_V2_LIMITS = {
  durationMs: { min: 80, max: 3_000 },
  curve: { min: -0.7, max: 0.7 },
  handReflowMs: { min: 150, max: 1_200 },
  name: 40,
  description: 160,
} as const;

/** La réorganisation de la main démarre à 14 % du vol (la carte a déjà quitté sa place). */
export const REFLOW_START = 0.14;
/** L'effet d'entrée part à 82 % du vol (juste avant le contact). */
export const ENTER_FX_AT = 0.82;

export interface AnimV2 {
  schema: typeof ANIM_V2_SCHEMA;
  version: 1;
  id: string;
  name: string;
  description?: string;
  motion: {
    durationMs: number;
    /** Courbure du trajet : 0 = ligne droite ; le signe choisit le côté. */
    curve: number;
    easing: AnimV2Easing;
  };
  effects: { onLeave: AnimV2Effect; onEnter: AnimV2Effect };
  /** Durée de la réorganisation de la main (départ ou arrivée). */
  handReflowMs: number;
  /** La face visible est décidée par le jeu (une carte adverse reste de dos), jamais par l'animation. */
  facePolicy: "game-visibility";
}

const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});
const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const pick = <T extends string>(list: Record<T, unknown>, value: unknown, fallback: T): T => (typeof value === "string" && value in list ? value as T : fallback);

/** Complète un modèle (ou un export du prototype) avec les valeurs par défaut. Ne corrige pas les valeurs hors bornes : `validateAnimV2` les signale. */
export function normalizeAnimV2(raw: unknown, identity: { id?: string; name?: string } = {}): AnimV2 {
  const source = obj(raw), motion = obj(source.motion), effects = obj(source.effects);
  const description = typeof source.description === "string" ? source.description : undefined;
  return {
    schema: ANIM_V2_SCHEMA,
    version: 1,
    id: typeof source.id === "string" ? source.id : identity.id ?? "",
    name: typeof source.name === "string" ? source.name : identity.name ?? "",
    ...(description ? { description } : {}),
    motion: {
      durationMs: num(motion.durationMs, 750),
      curve: num(motion.curve, 0.25),
      easing: pick(ANIM_V2_EASINGS, motion.easing, "smooth"),
    },
    effects: {
      onLeave: pick(ANIM_V2_EFFECTS, effects.onLeave, "glow"),
      onEnter: pick(ANIM_V2_EFFECTS, effects.onEnter, "pulse"),
    },
    handReflowMs: num(source.handReflowMs, 600),
    facePolicy: "game-visibility",
  };
}

const ID = /^[a-z0-9_]{3,48}$/;
/** Nombre à la française (virgule, vrai signe moins) pour les messages. */
const frNumber = (value: number) => String(value).replace(".", ",").replace("-", "−");
const within = (value: unknown, range: { min: number; max: number }) => typeof value === "number" && Number.isFinite(value) && value >= range.min && value <= range.max;

/** Erreurs d'un modèle V2, chemins relatifs à `base`. */
export function validateAnimV2(value: unknown, base = "anim"): MotifIssue[] {
  const issues: MotifIssue[] = [];
  const push = (path: string, message: string) => issues.push({ path: `${base}.${path}`, message });
  const model = obj(value), motion = obj(model.motion), effects = obj(model.effects);
  const L = ANIM_V2_LIMITS;
  if (model.schema !== ANIM_V2_SCHEMA) push("schema", `Format attendu : « ${ANIM_V2_SCHEMA} ».`);
  if (model.version !== 1) push("version", "Version 1 attendue.");
  if (typeof model.id !== "string" || !ID.test(model.id)) push("id", "Identifiant : 3 à 48 caractères a-z, 0-9 ou _.");
  if (typeof model.name !== "string" || model.name.trim().length < 2 || model.name.length > L.name) push("name", `Nom : 2 à ${L.name} caractères.`);
  if (model.description !== undefined && (typeof model.description !== "string" || model.description.length > L.description)) push("description", `Description : ${L.description} caractères maximum.`);
  if (!within(motion.durationMs, L.durationMs)) push("motion.durationMs", `Durée du vol : ${L.durationMs.min} à ${L.durationMs.max} ms.`);
  if (!within(motion.curve, L.curve)) push("motion.curve", `Courbure : ${frNumber(L.curve.min)} à +${frNumber(L.curve.max)}.`);
  if (typeof motion.easing !== "string" || !(motion.easing in ANIM_V2_EASINGS)) push("motion.easing", "Rythme inconnu.");
  for (const key of ["onLeave", "onEnter"] as const) {
    if (typeof effects[key] !== "string" || !((effects[key] as string) in ANIM_V2_EFFECTS)) push(`effects.${key}`, "Effet inconnu.");
  }
  if (!within(model.handReflowMs, L.handReflowMs)) push("handReflowMs", `Réorganisation de la main : ${L.handReflowMs.min} à ${L.handReflowMs.max} ms.`);
  if (model.facePolicy !== "game-visibility") push("facePolicy", "La face visible est décidée par le jeu.");
  return issues;
}

/** Calendrier d'un vol V2 (ms depuis le décollage). */
export interface AnimV2Timeline {
  leaveFxAt: number;
  reflowAt: number;
  enterFxAt: number;
  landAt: number;
  /** Fin du vol, de la réorganisation et des effets. */
  totalMs: number;
}

export function animV2Timeline(model: AnimV2): AnimV2Timeline {
  const d = model.motion.durationMs;
  const reflowAt = d * REFLOW_START, enterFxAt = d * ENTER_FX_AT;
  return {
    leaveFxAt: 0,
    reflowAt,
    enterFxAt,
    landAt: d,
    totalMs: Math.max(
      d,
      reflowAt + model.handReflowMs,
      ANIM_V2_EFFECTS[model.effects.onLeave].durationMs,
      enterFxAt + ANIM_V2_EFFECTS[model.effects.onEnter].durationMs,
    ),
  };
}
