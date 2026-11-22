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
import { validateAnimV2, type AnimV2 } from "../../engine/anim/v2/model";
import { setAnimV2Catalog } from "../../engine/anim/v2/registry";
import { db } from "./core";

/* anim_v2_models/{id}            fiche d'un modèle V2 (publié + brouillon + statut)
   anim_v2_versions/{id}_v{rev}   révisions publiées, immuables
   Les modèles V2 publiés voyagent dans le même catalogue (champs `animsV2`, `archivedV2Ids`). */

/** Modèles V2 valides d'un document de catalogue (les autres sont ignorés). */
export function catalogAnimsV2(raw: unknown): AnimV2[] {
  const models = raw && typeof raw === "object" ? (raw as { animsV2?: unknown }).animsV2 : null;
  return Array.isArray(models) ? models.filter((model): model is AnimV2 => validateAnimV2(model).length === 0) : [];
}

/** Modèles V2 publiés (valides) et identifiants archivés, pour reconstruire le catalogue. */
export async function publishedAnimsV2(): Promise<{ animsV2: AnimV2[]; archivedV2Ids: string[] }> {
  const snap = await db.collection("anim_v2_models").where("published", "==", true).get();
  const rows = snap.docs.map((doc) => doc.data() ?? {});
  const animsV2 = rows
    .map((row) => row.model as AnimV2)
    .filter((model) => model && validateAnimV2(model).length === 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  const archivedV2Ids = rows.filter((row) => row.archived === true && row.model?.id).map((row) => String(row.model.id)).sort();
  return { animsV2, archivedV2Ids };
}

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
      const archivedV2Ids = snap.get("archivedV2Ids");
      setAnimV2Catalog(catalogAnimsV2(snap.data()), Array.isArray(archivedV2Ids) ? archivedV2Ids.map(String) : []);
      setMotifCatalog(catalogMotifs(snap.data()), revision, Array.isArray(archivedIds) ? archivedIds.map(String) : [], moments && typeof moments === "object" ? moments : {});
    } catch (error) {
      console.error("ensureMotifCatalogFresh", error);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
