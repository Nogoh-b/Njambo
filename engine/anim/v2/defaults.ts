/* Animation V2 — modèles par défaut (étape V2-2). Chacun sert pour tous les trajets. */

import { normalizeAnimV2, type AnimV2 } from "./model";

export const DEFAULT_ANIMS_V2: AnimV2[] = [
  normalizeAnimV2({
    id: "v2_fluide", name: "Fluide",
    description: "Vol régulier et légèrement bombé, lueur au départ et pulsation à l'arrivée.",
    motion: { durationMs: 750, curve: 0.25, easing: "smooth" }, effects: { onLeave: "glow", onEnter: "pulse" }, handReflowMs: 600,
  }),
  normalizeAnimV2({
    id: "v2_rapide", name: "Rapide",
    description: "Vol court et presque droit qui freine à l'arrivée ; tient sous le plafond de la carte jouée.",
    motion: { durationMs: 420, curve: 0.12, easing: "out" }, effects: { onLeave: "none", onEnter: "pulse" }, handReflowMs: 300,
  }),
  normalizeAnimV2({
    id: "v2_arc", name: "Arc ample",
    description: "Grand arc lent, lueur au départ comme à l'arrivée.",
    motion: { durationMs: 950, curve: 0.55, easing: "smooth" }, effects: { onLeave: "glow", onEnter: "glow" }, handReflowMs: 700,
  }),
];

export const DEFAULT_ANIMS_V2_BY_ID: Record<string, AnimV2> = Object.fromEntries(DEFAULT_ANIMS_V2.map((model) => [model.id, model]));
