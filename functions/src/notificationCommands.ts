import { createHash } from "node:crypto";
import { getMessaging } from "firebase-admin/messaging";
import { onSchedule } from "firebase-functions/v2/scheduler";
import type { CallableRequest } from "firebase-functions/v2/https";
import { asObject, db, economyFrom, requireUid, requiredString, runIdempotent } from "./core";
import { calculateEnergy } from "../../domain";

export async function registerPushTokenHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const token = requiredString(data, "token", 4096);
  const platform = typeof data.platform === "string" ? data.platform.slice(0, 24) : "web";
  return runIdempotent(uid, "registerPushToken", data.idempotencyKey, async (transaction, now) => {
    const tokenId = createHash("sha256").update(token).digest("hex");
    transaction.set(db.doc(`push_tokens/${uid}/tokens/${tokenId}`), { uid, token, platform, active: true, updatedAt: now, createdAt: now }, { merge: true });
    return { registered: true, tokenId };
  });
}

export async function notifyFullEnergyImpl() {
  const now = Date.now();
  const economies = await db.collection("economies").limit(500).get();
  for (const snapshot of economies.docs) {
    const economy = economyFrom(snapshot.data(), now);
    const energy = calculateEnergy(economy.energy, now);
    const marker = snapshot.get("notificationState.energyFullAnchor");
    if (energy.available < economy.energy.max || marker === economy.energy.anchorAt) continue;
    const tokens = await db.collection(`push_tokens/${snapshot.id}/tokens`).where("active", "==", true).limit(500).get();
    if (tokens.empty) continue;
    const values = tokens.docs.map((item) => String(item.get("token")));
    const response = await getMessaging().sendEachForMulticast({
      tokens: values,
      notification: { title: "Ta barre est pleine", body: "Les tables du Mboa t’attendent : 100 énergie disponible." },
      webpush: { fcmOptions: { link: "/" }, notification: { icon: "/assets/njambo/card-back.webp", tag: "energy-full" } },
      data: { type: "energy_full" },
    });
    const batch = db.batch();
    batch.set(snapshot.ref, { notificationState: { energyFullAnchor: economy.energy.anchorAt, sentAt: now } }, { merge: true });
    response.responses.forEach((result, index) => {
      if (!result.success && ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(result.error?.code ?? "")) {
        batch.update(tokens.docs[index].ref, { active: false, invalidatedAt: now });
      }
    });
    await batch.commit();
  }
}

export const notifyFullEnergy = onSchedule({ schedule: "every 15 minutes", timeZone: "Africa/Douala", region: "africa-south1" }, notifyFullEnergyImpl);
