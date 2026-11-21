/* ═══════════════ Modèles d'animation : commandes admin (phase G3) ═══════════════
   Même cycle que les cartes de pouvoir :
   - brouillon (même invalide) → publication validée → révision immuable →
     catalogue republié (anim_catalog/current) ;
   - un modèle par défaut (engine/anim/defaults) se modifie en publiant une
     fiche du même identifiant : le jeu entier prend alors la nouvelle mise
     en scène (ex. « Jouer une carte ») ;
   - aucun modèle n'est jamais supprimé (une chorégraphie peut s'en servir) :
     on l'archive (retiré de la bibliothèque, toujours jouable). */

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { DEFAULT_MOTIFS, DEFAULT_MOTIFS_BY_ID } from "../../engine/anim/defaults";
import { normalizeMotif, validateMotif, type AnimMotif } from "../../engine/anim/motif";
import { getMotif, momentMap, setMotifCatalog } from "../../engine/anim/registry";
import { momentIssuesForMotif, validateMoments, type MomentMap } from "../../engine/anim/moments";
import { asObject, db, requireAdmin, requiredString, runIdempotent } from "./core";
import { ensureMotifCatalogFresh } from "./animCatalog";

const MOTIF_ID = /^[a-z0-9_]{3,48}$/;

/** Modèle sérialisable et complété (champs facultatifs par défaut). */
function storableMotif(raw: unknown): AnimMotif {
  const source = asObject(raw) as unknown as AnimMotif;
  return JSON.parse(JSON.stringify(normalizeMotif(source))) as AnimMotif;
}

export async function rebuildAnimCatalog(updatedBy: string) {
  const snap = await db.collection("anim_motifs").where("published", "==", true).get();
  const rows = snap.docs.map((doc) => doc.data() ?? {});
  const motifs = rows
    .map((row) => row.motif as AnimMotif)
    .filter((motif) => motif && validateMotif(motif).length === 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  const archivedIds = rows.filter((row) => row.archived === true && row.motif?.id).map((row) => String(row.motif.id)).sort();
  const momentsSnap = await db.doc("anim_moments/current").get();
  const moments = (momentsSnap.exists ? momentsSnap.get("moments") ?? {} : {}) as MomentMap;
  const ref = db.doc("anim_catalog/current");
  const revision = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    const next = Number(current.get("revision") ?? 0) + 1;
    transaction.set(ref, { published: true, revision: next, motifs, archivedIds, moments, count: motifs.length, updatedAt: Date.now(), updatedBy }, { merge: false });
    return next;
  });
  setMotifCatalog(motifs, revision, archivedIds, moments);
  return { revision, count: motifs.length, skipped: rows.length - motifs.length };
}

export interface AdminMotifRow {
  id: string;
  /** Modèle en cours d'édition : brouillon, sinon publié, sinon modèle par défaut. */
  motif: AnimMotif;
  /** Publié depuis l'admin (sinon : modèle par défaut du jeu, ou brouillon jamais publié). */
  published: boolean;
  revision: number;
  hasDraft: boolean;
  isDefault: boolean;
  archived: boolean;
  updatedAt: number;
  issues: Array<{ path: string; message: string }>;
}

export async function listAdminAnimMotifsHandler(request: CallableRequest<unknown>) {
  requireAdmin(request);
  await ensureMotifCatalogFresh(true);
  const snap = await db.collection("anim_motifs").get();
  const rows = new Map(snap.docs.map((doc) => [doc.id, doc.data() ?? {}]));
  const ids = [...new Set([...DEFAULT_MOTIFS.map((motif) => motif.id), ...rows.keys()])];
  const motifs: AdminMotifRow[] = ids.map((id) => {
    const row = rows.get(id) ?? {};
    const motif = (row.draft ?? row.motif ?? DEFAULT_MOTIFS_BY_ID[id]) as AnimMotif;
    return {
      id, motif, published: row.published === true, revision: Number(row.revision ?? 0), hasDraft: Boolean(row.draft),
      isDefault: Boolean(DEFAULT_MOTIFS_BY_ID[id]), archived: row.archived === true, updatedAt: Number(row.updatedAt ?? 0),
      issues: validateMotif(motif),
    };
  });
  return { motifs, moments: momentMap() };
}

/** Enregistre le brouillon (même invalide) ; crée la fiche si besoin. */
export async function saveAnimMotifDraftHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const motif = storableMotif(data.motif);
  if (!MOTIF_ID.test(String(motif.id ?? ""))) throw new HttpsError("invalid-argument", "INVALID_MOTIFID");
  await runIdempotent(uid, "saveAnimMotifDraft", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`anim_motifs/${motif.id}`);
    const snap = await transaction.get(ref);
    if (!snap.exists) transaction.set(ref, { draft: motif, published: false, revision: 0, createdAt: now, updatedAt: now, updatedBy: uid }, { merge: false });
    else transaction.update(ref, { draft: motif, updatedAt: now, updatedBy: uid });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "anim_motif_save_draft", motifId: motif.id, createdAt: now });
    return { motifId: motif.id };
  });
  return { motifId: motif.id, issues: validateMotif(motif) };
}

export async function publishAnimMotifHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const motifId = requiredString(data, "motifId", 48);
  // Les moments du jeu qui utilisent ce modèle doivent rester valides avec la nouvelle version.
  await ensureMotifCatalogFresh(true);
  const result = await runIdempotent(uid, "publishAnimMotif", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`anim_motifs/${motifId}`);
    const snap = await transaction.get(ref);
    const draft = snap.exists ? snap.get("draft") as AnimMotif | undefined : undefined;
    if (!draft) throw new HttpsError("failed-precondition", "DRAFT_NOT_FOUND");
    const motif = storableMotif({ ...draft, id: motifId });
    const issues = validateMotif(motif);
    if (issues.length > 0) throw new HttpsError("failed-precondition", "ANIM_MOTIF_INVALID", { issues });
    const momentIssues = momentIssuesForMotif(momentMap(), motif, getMotif);
    if (momentIssues.length > 0) throw new HttpsError("failed-precondition", "ANIM_MOTIF_MOMENT_CONFLICT", { issues: momentIssues });
    const revision = Number(snap.get("revision") ?? 0) + 1;
    transaction.set(db.doc(`anim_motif_versions/${motifId}_v${revision}`), { motif, revision, publishedAt: now, publishedBy: uid }, { merge: false });
    transaction.update(ref, { motif, draft: null, published: true, revision, publishedAt: now, updatedAt: now, updatedBy: uid });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "anim_motif_publish", motifId, revision, createdAt: now });
    return { motifId, revision };
  });
  const catalog = await rebuildAnimCatalog(uid);
  return { ...result, catalogRevision: catalog.revision };
}

export async function discardAnimMotifDraftHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const motifId = requiredString(data, "motifId", 48);
  return runIdempotent(uid, "discardAnimMotifDraft", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`anim_motifs/${motifId}`);
    const snap = await transaction.get(ref);
    if (!snap.exists || !snap.get("draft")) throw new HttpsError("not-found", "DRAFT_NOT_FOUND");
    // Jamais publié : la fiche disparaît avec son brouillon (un modèle par défaut redevient celui du jeu).
    if (Number(snap.get("revision") ?? 0) === 0) transaction.delete(ref);
    else transaction.update(ref, { draft: null, updatedAt: now, updatedBy: uid });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "anim_motif_discard_draft", motifId, createdAt: now });
    return { motifId };
  });
}

/** Archive / désarchive un modèle publié (retiré de la bibliothèque, toujours jouable). */
export async function setAnimMotifArchivedHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const motifId = requiredString(data, "motifId", 48);
  if (typeof data.archived !== "boolean") throw new HttpsError("invalid-argument", "NOTHING_TO_CHANGE");
  const archived = data.archived;
  await runIdempotent(uid, "setAnimMotifArchived", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`anim_motifs/${motifId}`);
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "ANIM_MOTIF_NOT_FOUND");
    transaction.update(ref, { archived, updatedAt: now, updatedBy: uid });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "anim_motif_archive", motifId, archived, createdAt: now });
    return { motifId };
  });
  const catalog = await rebuildAnimCatalog(uid);
  return { motifId, archived, catalogRevision: catalog.revision };
}

/** Attribue un modèle à chaque moment du jeu (absent = animation actuelle du jeu) et republie le catalogue. */
export async function setGameMomentsHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  await ensureMotifCatalogFresh(true);
  const raw = asObject(data.moments);
  // Seuls les modèles publiés (ou ceux du jeu) sont attribuables : les joueurs doivent les avoir.
  const issues = validateMoments(raw, getMotif);
  if (issues.length > 0) throw new HttpsError("failed-precondition", "GAME_MOMENTS_INVALID", { issues });
  const moments = Object.fromEntries(Object.entries(raw).filter(([, id]) => typeof id === "string")) as MomentMap;
  await runIdempotent(uid, "setGameMoments", data.idempotencyKey, async (transaction, now) => {
    transaction.set(db.doc("anim_moments/current"), { moments, updatedAt: now, updatedBy: uid }, { merge: false });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "anim_moments_set", moments, createdAt: now });
    return { ok: true };
  });
  const catalog = await rebuildAnimCatalog(uid);
  return { moments: momentMap(), catalogRevision: catalog.revision };
}
