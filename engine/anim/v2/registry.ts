/* ═══════════════ Registre des modèles V2 ═══════════════
   Démarre avec les modèles par défaut (./defaults). Le catalogue publié depuis
   l'admin (anim_catalog/current, champ `animsV2`) les remplace (même
   identifiant) ou les complète via `setAnimV2Catalog`, sans jamais en
   retirer : un moment qui vise un modèle retiré reviendrait sinon en silence
   à l'animation d'origine. Un modèle archivé sort de la bibliothèque mais
   reste jouable. */

import { DEFAULT_ANIMS_V2 } from "./defaults";
import type { AnimV2 } from "./model";

let catalog = new Map<string, AnimV2>(DEFAULT_ANIMS_V2.map((model) => [model.id, model]));
let archived = new Set<string>();

export function getAnimV2(id: string): AnimV2 | null {
  return catalog.get(id) ?? null;
}

/** Modèles proposés dans les bibliothèques (archivés exclus, mais toujours jouables via `getAnimV2`). */
export function listAnimsV2({ includeArchived = false }: { includeArchived?: boolean } = {}): AnimV2[] {
  return [...catalog.values()].filter((model) => includeArchived || !archived.has(model.id));
}

export function isAnimV2Archived(id: string): boolean {
  return archived.has(id);
}

/** Remplace / complète les modèles par défaut par ceux du catalogue publié. À appeler AVANT
 *  `setMotifCatalog`, qui écarte les moments dont le modèle V2 est inconnu. */
export function setAnimV2Catalog(models: AnimV2[], archivedIds: string[] = []) {
  const next = new Map<string, AnimV2>(DEFAULT_ANIMS_V2.map((model) => [model.id, model]));
  for (const model of models) next.set(model.id, model);
  catalog = next;
  archived = new Set(archivedIds);
}
