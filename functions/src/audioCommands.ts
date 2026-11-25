import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import {
  AUDIO_CATALOG_DOC,
  normalizeAudioCatalogConfig,
  validateAudioCatalogConfig,
} from "../../domain/audioCatalog";
import { asObject, db, requireAdmin, runIdempotent } from "./core";

export async function saveAudioConfigHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  if (!validateAudioCatalogConfig(data.config)) {
    throw new HttpsError("invalid-argument", "INVALID_AUDIO_CONFIG");
  }
  const normalized = normalizeAudioCatalogConfig(data.config);
  return runIdempotent(uid, "saveAudioConfig", data.idempotencyKey, async (transaction, now) => {
    const config = { slots: normalized.slots, updatedAt: now, updatedBy: uid };
    transaction.set(db.doc(`runtime_config/${AUDIO_CATALOG_DOC}`), config);
    transaction.create(db.collection("admin_audit").doc(), {
      uid,
      action: "saveAudioConfig",
      customizedCount: Object.keys(normalized.slots).length,
      createdAt: now,
    });
    return { config };
  });
}
