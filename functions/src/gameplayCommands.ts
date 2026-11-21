import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { normalizeGameplayConfig, validateGameplayConfig } from "../../domain/gameplayConfig";
import { asObject, db, requireAdmin, runIdempotent } from "./core";

export async function saveGameplayConfigHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  if (!validateGameplayConfig(data.config)) throw new HttpsError("invalid-argument", "INVALID_GAMEPLAY_CONFIG");
  const config = normalizeGameplayConfig(data.config);
  return runIdempotent(uid, "saveGameplayConfig", data.idempotencyKey, async (transaction, now) => {
    transaction.set(db.doc("runtime_config/gameplay"), { ...config, updatedAt: now, updatedBy: uid });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "saveGameplayConfig", config, createdAt: now });
    return { config };
  });
}
