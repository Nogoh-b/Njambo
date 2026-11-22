/* ═══════════════ Animation V2 : commandes admin (étape V2-4) ═══════════════
   Même cycle que les modèles V1 (animMotifAdminCommands) :
   - brouillon (même invalide) → publication validée → révision immuable →
     catalogue republié (anim_catalog/current, champ `animsV2`) ;
   - un modèle par défaut (engine/anim/v2/defaults) se modifie en publiant une
     fiche du même identifiant ;
   - aucun modèle n'est supprimé (un moment peut s'en servir) : on l'archive ;
   - une version trop longue pour un moment qui l'utilise est refusée. */

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { DEFAULT_ANIMS_V2, DEFAULT_ANIMS_V2_BY_ID } from "../../engine/anim/v2/defaults";
import { normalizeAnimV2, validateAnimV2, type AnimV2 } from "../../engine/anim/v2/model";
import { getAnimV2 } from "../../engine/anim/v2/registry";
import { momentMap } from "../../engine/anim/registry";
import { momentIssuesForAnimV2 } from "../../engine/anim/moments";
import { asObject, db, requireAdmin, requiredString, runIdempotent } from "./core";
import { ensureMotifCatalogFresh } from "./animCatalog";
import { rebuildAnimCatalog } from "./animMotifAdminCommands";

const MODEL_ID = /^[a-z0-9_]{3,48}$/;

/** Modèle sérialisable et complété (valeurs manquantes par défaut ; les valeurs hors bornes restent, la validation les signale). */
function storableAnimV2(raw: unknown): AnimV2 {
  return JSON.parse(JSON.stringify(normalizeAnimV2(asObject(raw)))) as AnimV2;
}

export interface AdminAnimV2Row {
  id: string;
  /** Modèle en cours d'édition : brouillon, sinon publié, sinon modèle par défaut. */
  model: AnimV2;
  published: boolean;
  revision: number;
  hasDraft: boolean;
  isDefault: boolean;
  archived: boolean;
  updatedAt: number;
  issues: Array<{ path: string; message: string }>;
}

export async function listAdminAnimsV2Handler(request: CallableRequest<unknown>) {
  requireAdmin(request);
  await ensureMotifCatalogFresh(true);
  const snap = await db.collection("anim_v2_models").get();
  const rows = new Map(snap.docs.map((doc) => [doc.id, doc.data() ?? {}]));
  const ids = [...new Set([...DEFAULT_ANIMS_V2.map((model) => model.id), ...rows.keys()])];
  const models: AdminAnimV2Row[] = ids.map((id) => {
    const row = rows.get(id) ?? {};
    const model = (row.draft ?? row.model ?? DEFAULT_ANIMS_V2_BY_ID[id]) as AnimV2;
    return {
      id, model, published: row.published === true, revision: Number(row.revision ?? 0), hasDraft: Boolean(row.draft),
      isDefault: Boolean(DEFAULT_ANIMS_V2_BY_ID[id]), archived: row.archived === true, updatedAt: Number(row.updatedAt ?? 0),
      issues: validateAnimV2(model),
    };
  });
  return { models, moments: momentMap() };
}

/** Enregistre le brouillon (même invalide) ; crée la fiche si besoin. */
export async function saveAnimV2DraftHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const model = storableAnimV2(data.model);
  if (!MODEL_ID.test(model.id)) throw new HttpsError("invalid-argument", "INVALID_ANIM_V2_ID");
  await runIdempotent(uid, "saveAnimV2Draft", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`anim_v2_models/${model.id}`);
    const snap = await transaction.get(ref);
    if (!snap.exists) transaction.set(ref, { draft: model, published: false, revision: 0, createdAt: now, updatedAt: now, updatedBy: uid }, { merge: false });
    else transaction.update(ref, { draft: model, updatedAt: now, updatedBy: uid });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "anim_v2_save_draft", modelId: model.id, createdAt: now });
    return { modelId: model.id };
  });
  return { modelId: model.id, issues: validateAnimV2(model) };
}

export async function publishAnimV2Handler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const modelId = requiredString(data, "modelId", 48);
  // Les moments du jeu qui utilisent ce modèle doivent rester valides avec la nouvelle version.
  await ensureMotifCatalogFresh(true);
  const result = await runIdempotent(uid, "publishAnimV2", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`anim_v2_models/${modelId}`);
    const snap = await transaction.get(ref);
    const draft = snap.exists ? snap.get("draft") as AnimV2 | undefined : undefined;
    if (!draft) throw new HttpsError("failed-precondition", "DRAFT_NOT_FOUND");
    const model = storableAnimV2({ ...draft, id: modelId });
    const issues = validateAnimV2(model);
    if (issues.length > 0) throw new HttpsError("failed-precondition", "ANIM_V2_INVALID", { issues });
    const momentIssues = momentIssuesForAnimV2(momentMap(), model, getAnimV2);
    if (momentIssues.length > 0) throw new HttpsError("failed-precondition", "ANIM_V2_MOMENT_CONFLICT", { issues: momentIssues });
    const revision = Number(snap.get("revision") ?? 0) + 1;
    transaction.set(db.doc(`anim_v2_versions/${modelId}_v${revision}`), { model, revision, publishedAt: now, publishedBy: uid }, { merge: false });
    transaction.update(ref, { model, draft: null, published: true, revision, publishedAt: now, updatedAt: now, updatedBy: uid });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "anim_v2_publish", modelId, revision, createdAt: now });
    return { modelId, revision };
  });
  const catalog = await rebuildAnimCatalog(uid);
  return { ...result, catalogRevision: catalog.revision };
}

export async function discardAnimV2DraftHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const modelId = requiredString(data, "modelId", 48);
  return runIdempotent(uid, "discardAnimV2Draft", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`anim_v2_models/${modelId}`);
    const snap = await transaction.get(ref);
    if (!snap.exists || !snap.get("draft")) throw new HttpsError("not-found", "DRAFT_NOT_FOUND");
    // Jamais publié : la fiche disparaît avec son brouillon (un modèle par défaut redevient celui du jeu).
    if (Number(snap.get("revision") ?? 0) === 0) transaction.delete(ref);
    else transaction.update(ref, { draft: null, updatedAt: now, updatedBy: uid });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "anim_v2_discard_draft", modelId, createdAt: now });
    return { modelId };
  });
}

/** Archive / désarchive un modèle publié (retiré de la bibliothèque, toujours jouable). */
export async function setAnimV2ArchivedHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const modelId = requiredString(data, "modelId", 48);
  if (typeof data.archived !== "boolean") throw new HttpsError("invalid-argument", "NOTHING_TO_CHANGE");
  const archived = data.archived;
  await runIdempotent(uid, "setAnimV2Archived", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`anim_v2_models/${modelId}`);
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "ANIM_V2_NOT_FOUND");
    transaction.update(ref, { archived, updatedAt: now, updatedBy: uid });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "anim_v2_archive", modelId, archived, createdAt: now });
    return { modelId };
  });
  const catalog = await rebuildAnimCatalog(uid);
  return { modelId, archived, catalogRevision: catalog.revision };
}
