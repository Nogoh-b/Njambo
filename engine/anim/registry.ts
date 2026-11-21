/* ═══════════════ Registre des modèles d'animation ═══════════════
   Démarre avec les modèles par défaut (engine/anim/defaults.ts). Le
   catalogue publié depuis l'admin (phase G3) les remplace ou les complète
   via `setMotifCatalog`, sans jamais en retirer : un modèle inconnu d'une
   chorégraphie serait sinon ignoré en silence. */

import { DEFAULT_MOTIFS } from "./defaults";
import { normalizeMotif, type AnimMotif } from "./motif";
import { GAME_MOMENTS, MOMENT_STYLE_FALLBACK, MOMENT_STYLE_OWNER, momentMotif, motifFitsMoment, styleMomentMotif, validateMoments, type GameMoment, type MomentMap } from "./moments";
import type { AnimStyle } from "./style";

/** Réglages d'un modèle qu'une chorégraphie peut surcharger (tout sauf l'identité et l'aperçu). */
export type MotifOverrides = Partial<Omit<AnimMotif, "id" | "name" | "description" | "group" | "preview">>;

let catalog = new Map<string, AnimMotif>(DEFAULT_MOTIFS.map((motif) => [motif.id, motif]));
let archived = new Set<string>();
let moments: MomentMap = {};
/** Attribution essayée par l'admin sur ce seul appareil (« Essayer dans une partie ») : remplace celle du catalogue. */
let momentPreview: MomentMap | null = null;
/** Style essayé sur ce seul appareil, pour les mouvements du joueur local : remplace celui qu'il a équipé. */
let stylePreview: AnimStyle | null = null;
let revision = 0;
/** Change à chaque mise à jour (catalogue ou aperçu) : sert aux composants pour se re-rendre. */
let version = 0;
const listeners = new Set<() => void>();
const notify = () => { version += 1; listeners.forEach((listener) => listener()); };

export function getMotif(id: string): AnimMotif | null {
  return catalog.get(id) ?? null;
}

/** Modèles proposés dans les bibliothèques (archivés exclus, mais toujours jouables via `getMotif`). */
export function listMotifs({ includeArchived = false }: { includeArchived?: boolean } = {}): AnimMotif[] {
  return [...catalog.values()].filter((motif) => includeArchived || !archived.has(motif.id));
}

export function isMotifArchived(id: string): boolean {
  return archived.has(id);
}

export function motifCatalogRevision(): number {
  return revision;
}

export function motifRegistryVersion(): number {
  return version;
}

/** Remplace / complète les modèles par défaut par ceux du catalogue publié. */
export function setMotifCatalog(motifs: AnimMotif[], nextRevision: number, archivedIds: string[] = [], momentMap: MomentMap = {}) {
  const next = new Map<string, AnimMotif>(DEFAULT_MOTIFS.map((motif) => [motif.id, motif]));
  for (const motif of motifs) next.set(motif.id, motif);
  catalog = next;
  archived = new Set(archivedIds);
  // Un moment n'est gardé que si son modèle existe et lui convient (sinon : animation actuelle du jeu).
  moments = Object.fromEntries(Object.entries(momentMap).filter(([moment, id]) => {
    const motif = typeof id === "string" ? next.get(id) : undefined;
    return moment in GAME_MOMENTS && motif && motifFitsMoment(moment as GameMoment, motif);
  })) as MomentMap;
  revision = nextRevision;
  notify();
}

/** Attribution publiée des moments du jeu (l'aperçu local n'en fait pas partie). */
export function momentMap(): MomentMap {
  return { ...moments };
}

/** Essaie une attribution sur cet appareil seulement (null : retour à celle du catalogue).
 *  Les entrées invalides sont ignorées, comme le ferait le serveur. Renvoie l'attribution retenue. */
export function setMomentPreview(map: MomentMap | null): MomentMap | null {
  if (!map) momentPreview = null;
  else {
    const rejected = new Set(validateMoments(map, getMotif).map((issue) => issue.path.split(".")[1]));
    momentPreview = Object.fromEntries(Object.entries(map).filter(([moment, id]) => typeof id === "string" && moment in GAME_MOMENTS && !rejected.has(moment))) as MomentMap;
  }
  notify();
  return momentPreview && { ...momentPreview };
}

export function momentPreviewMap(): MomentMap | null {
  return momentPreview && { ...momentPreview };
}

/** Modèle à jouer pour un moment (rythme du jeu appliqué), ou null : animation actuelle du jeu. */
export function getMomentMotif(moment: GameMoment): AnimMotif | null {
  const id = (momentPreview ?? moments)[moment];
  const motif = id ? catalog.get(id) : undefined;
  return motif ? momentMotif(moment, motif) : null;
}

/** Modèle d'un moment aux couleurs du style de son propriétaire (G5), ou null : animation actuelle du jeu.
 *  Un moment qui ne porte pas de style ignore `style`. */
export function getStyledMomentMotif(moment: GameMoment, style?: AnimStyle | null): AnimMotif | null {
  const assigned = getMomentMotif(moment);
  if (!style || !MOMENT_STYLE_OWNER[moment]) return assigned;
  const fallbackId = MOMENT_STYLE_FALLBACK[moment];
  const fallback = fallbackId ? catalog.get(fallbackId) : undefined;
  const base = assigned ?? (fallback && motifFitsMoment(moment, fallback) ? momentMotif(moment, fallback) : null);
  return base ? styleMomentMotif(moment, base, style) : null;
}

/** Essaie un style sur cet appareil pour le joueur local (null : retour au style équipé). */
export function setStylePreview(style: AnimStyle | null) {
  stylePreview = style;
  notify();
}

export function stylePreviewOf(): AnimStyle | null {
  return stylePreview;
}

export function subscribeMotifCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Modèle prêt à jouer : modèle du registre + surcharges d'une chorégraphie. */
export function resolveMotif(id: string, overrides?: MotifOverrides): AnimMotif | null {
  const base = getMotif(id);
  if (!base) return null;
  if (!overrides) return base;
  const { path, lanes, ...rest } = overrides;
  return normalizeMotif({
    ...base,
    ...rest,
    path: path ? { ...base.path, ...path } : base.path,
    lanes: lanes ? { ...base.lanes, ...lanes } : base.lanes,
  });
}
