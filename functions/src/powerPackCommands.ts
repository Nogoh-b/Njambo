/* ═══════════════ Packs de cartes Pouvoir importés depuis l'admin ═══════════════
   runtime_config/power_packs liste les packs créés dans l'admin et l'URL de
   chaque illustration importée (voir domain/assetPacks.ts). Les images sont
   envoyées à part (server/src/powerPackUploads.ts, POST /admin/power-pack-art),
   qui enregistre leurs URL avec `recordPowerPackArt`. */

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import {
  ASSET_PACK_DOC,
  ASSET_PACK_FIELD,
  BUILTIN_POWER_ART_IDS,
  IMPORTED_POWER_PACK_LIMITS,
  POWER_PACKS_DOC,
  importedPowerPackIdFor,
  isImportedPowerPackId,
  readImportedPowerPacks,
  type ImportedPowerArt,
  type ImportedPowerPack,
} from "../../domain/assetPacks";
import { asObject, db, requireAdmin, runIdempotent } from "./core";

const packsRef = () => db.doc(`runtime_config/${POWER_PACKS_DOC}`);

/** Packs importés tels qu'enregistrés (lecture hors transaction). */
export async function loadImportedPowerPacks(): Promise<ImportedPowerPack[]> {
  const snapshot = await packsRef().get();
  return readImportedPowerPacks(snapshot.exists ? snapshot.data() : undefined);
}

/** Crée un pack (sans id) ou modifie son nom, sa description ou son format. */
export async function savePowerPackHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const input = asObject(data.pack);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (name.length < 2 || name.length > IMPORTED_POWER_PACK_LIMITS.name) throw new HttpsError("invalid-argument", "POWER_PACK_NAME_INVALID");
  if (description.length > IMPORTED_POWER_PACK_LIMITS.description) throw new HttpsError("invalid-argument", "POWER_PACK_DESCRIPTION_TOO_LONG");
  if (input.id !== undefined && !isImportedPowerPackId(input.id)) throw new HttpsError("invalid-argument", "POWER_PACK_UNKNOWN");
  const portrait = input.portrait === true;

  return runIdempotent(uid, "savePowerPack", data.idempotencyKey, async (transaction, now) => {
    const snapshot = await transaction.get(packsRef());
    const packs = readImportedPowerPacks(snapshot.exists ? snapshot.data() : undefined);
    let saved: ImportedPowerPack;
    if (input.id === undefined) {
      if (packs.length >= IMPORTED_POWER_PACK_LIMITS.packs) throw new HttpsError("failed-precondition", "POWER_PACK_LIMIT_REACHED");
      saved = { id: importedPowerPackIdFor(name, packs.map((pack) => pack.id)), name, description, scopes: ["powers"], portrait, art: {}, createdAt: now, updatedAt: now };
      packs.push(saved);
    } else {
      const index = packs.findIndex((pack) => pack.id === input.id);
      if (index < 0) throw new HttpsError("not-found", "POWER_PACK_UNKNOWN");
      const current = packs[index];
      // Les images déjà importées sont recadrées pour un format : on ne le change plus ensuite.
      if (current.portrait !== portrait && Object.keys(current.art).length > 0) throw new HttpsError("failed-precondition", "POWER_PACK_FORMAT_LOCKED");
      saved = { ...current, name, description, portrait, updatedAt: now };
      packs[index] = saved;
    }
    transaction.set(packsRef(), { packs, updatedAt: now, updatedBy: uid });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: input.id === undefined ? "power_pack_create" : "power_pack_update", pack: saved.id, createdAt: now });
    return { pack: saved };
  });
}

/** Supprime un pack importé (refusé tant qu'il est utilisé). Ses fichiers restent sur le disque. */
export async function deletePowerPackHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  if (!isImportedPowerPackId(data.packId)) throw new HttpsError("invalid-argument", "POWER_PACK_UNKNOWN");
  const packId = data.packId;
  return runIdempotent(uid, "deletePowerPack", data.idempotencyKey, async (transaction, now) => {
    const [packsSnap, activeSnap] = await Promise.all([transaction.get(packsRef()), transaction.get(db.doc(`runtime_config/${ASSET_PACK_DOC}`))]);
    if (activeSnap.exists && activeSnap.get(ASSET_PACK_FIELD.powers) === packId) throw new HttpsError("failed-precondition", "POWER_PACK_ACTIVE");
    const packs = readImportedPowerPacks(packsSnap.exists ? packsSnap.data() : undefined);
    if (!packs.some((pack) => pack.id === packId)) throw new HttpsError("not-found", "POWER_PACK_UNKNOWN");
    transaction.set(packsRef(), { packs: packs.filter((pack) => pack.id !== packId), updatedAt: now, updatedBy: uid });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "power_pack_delete", pack: packId, createdAt: now });
    return { packId };
  });
}

/** Enregistre l'illustration importée d'une carte (appelé après l'écriture des fichiers). */
export async function recordPowerPackArt(uid: string, packId: string, card: string, art: ImportedPowerArt): Promise<ImportedPowerPack> {
  if (!BUILTIN_POWER_ART_IDS.some((id) => id === card)) throw new HttpsError("invalid-argument", "POWER_PACK_CARD_UNKNOWN");
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(packsRef());
    const packs = readImportedPowerPacks(snapshot.exists ? snapshot.data() : undefined);
    const index = packs.findIndex((pack) => pack.id === packId);
    if (index < 0) throw new HttpsError("not-found", "POWER_PACK_UNKNOWN");
    const updated: ImportedPowerPack = { ...packs[index], art: { ...packs[index].art, [card]: art }, updatedAt: art.updatedAt };
    packs[index] = updated;
    transaction.set(packsRef(), { packs, updatedAt: art.updatedAt, updatedBy: uid });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "power_pack_art", pack: packId, card, createdAt: art.updatedAt });
    return updated;
  });
}
