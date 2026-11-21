/* ═══════════════ Catalogue des modèles d'animation côté serveur (phase G3) ═══════════════
   anim_motifs/{id}             fiche courante (modèle publié + brouillon + statut)
   anim_motif_versions/{id}_v{rev}  révisions publiées, immuables
   anim_catalog/current         modèles publiés, lus en UNE lecture par les
                                clients et par le serveur
   Le registre en mémoire (engine/anim/registry) part des modèles par défaut ;
   le catalogue publié les remplace (même identifiant) ou les complète. Il
   doit être chargé AVANT de valider une carte de pouvoir qui s'en sert. */

import { motifCatalogRevision, setMotifCatalog } from "../../engine/anim/registry";
import { validateMotif, type AnimMotif } from "../../engine/anim/motif";
import { db } from "./core";

const REFRESH_MS = 30_000;
let lastCheck = 0;
let inflight: Promise<void> | null = null;

/** Modèles valides d'un document de catalogue (les autres sont ignorés). */
export function catalogMotifs(raw: unknown): AnimMotif[] {
  const motifs = raw && typeof raw === "object" ? (raw as { motifs?: unknown }).motifs : null;
  return Array.isArray(motifs) ? motifs.filter((motif): motif is AnimMotif => validateMotif(motif).length === 0) : [];
}

/** Recharge le registre si le catalogue publié a changé (au plus toutes les 30 s). */
export async function ensureMotifCatalogFresh(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastCheck < REFRESH_MS) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const snap = await db.doc("anim_catalog/current").get();
      lastCheck = Date.now();
      if (!snap.exists) return;
      const revision = Number(snap.get("revision") ?? 0);
      if (revision === motifCatalogRevision()) return;
      const archivedIds = snap.get("archivedIds");
      const moments = snap.get("moments");
      setMotifCatalog(catalogMotifs(snap.data()), revision, Array.isArray(archivedIds) ? archivedIds.map(String) : [], moments && typeof moments === "object" ? moments : {});
    } catch (error) {
      console.error("ensureMotifCatalogFresh", error);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
