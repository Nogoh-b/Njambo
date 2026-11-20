/* ═══════════════ Campagnes de notifications (phase 3) ═══════════════
   notification_campaigns/{id} :
     { source: "event" | "manual", eventId?, notificationId?, title, body,
       audience: "all" | "active_run" | "not_joined", link, sendAt,
       status: "scheduled" | "sending" | "sent" | "cancelled",
       progress: { lastUid }, stats: { targeted, inApp, pushSent, pushFailed, optedOut, tokensInvalidated } }

   - Campagnes d'événement : identifiant stable ev_{eventId}_{notificationId}
     (planEventCampaigns), synchronisées à l'activation d'une révision ;
     une campagne déjà envoyée n'est jamais renvoyée.
   - Envoi : job chaque minute ; les joueurs sont parcourus par pages
     (uid croissant) avec point de reprise ; notification in-app à id
     déterministe (camp_{campaignId}) → pas de doublon en cas de reprise.
   - Opt-out : players/{uid}.notificationPrefs.events === false → rien. */

import { getMessaging } from "firebase-admin/messaging";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { planEventCampaigns, type EventNotificationAudience, type EventVersion } from "../../domain";
import { asObject, db, requireAdmin, requireUid, requiredString, runIdempotent } from "./core";
import type { DocumentData, DocumentReference } from "./firestoreTypes";

const AUDIENCES: EventNotificationAudience[] = ["all", "active_run", "not_joined"];
const PAGE_SIZE = 300;
const STALE_SENDING_MS = 10 * 60_000;
const INVALID_TOKEN_CODES = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"];

/* ─────────────── Envoi push (injectable pour les tests) ─────────────── */

export interface PushMessage { title: string; body: string; link: string; tag: string; campaignId: string; eventId?: string }
export type PushSender = (tokens: string[], message: PushMessage) => Promise<Array<{ success: boolean; errorCode?: string }>>;

const fcmSender: PushSender = async (tokens, message) => {
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    // Message « data » : le service worker (public/sw.js) affiche lui-même la notification.
    data: { type: "campaign", title: message.title, body: message.body, link: message.link, tag: message.tag, campaignId: message.campaignId, eventId: message.eventId ?? "" },
    webpush: { headers: { Urgency: "high", TTL: "86400" } },
  });
  return response.responses.map((result) => ({ success: result.success, errorCode: result.error?.code }));
};

let pushSender: PushSender = fcmSender;
export function setPushSender(sender: PushSender | null) { pushSender = sender ?? fcmSender; }

export function eventLink(eventId: string | undefined) {
  return eventId ? `/?event=${encodeURIComponent(eventId)}` : "/";
}

/* ─────────────── Synchronisation avec la fiche d'événement ─────────────── */

/** À appeler quand une révision devient active (publication ou promotion). */
export async function syncEventCampaigns(version: EventVersion, activatedAt = Date.now()) {
  const planned = planEventCampaigns(version, activatedAt);
  const keep = new Set(planned.map((campaign) => campaign.campaignId));
  let scheduled = 0;
  for (const campaign of planned) {
    const ref = db.doc(`notification_campaigns/${campaign.campaignId}`);
    const existing = await ref.get();
    const status = existing.get("status");
    // Déjà envoyée (ou en cours), ou annulée à la main par un admin : on n'y touche plus.
    if (existing.exists && (status === "sent" || status === "sending" || existing.get("cancelledReason") === "admin")) continue;
    await ref.set({
      source: "event", eventId: version.eventId, eventTitle: version.title, notificationId: campaign.notificationId,
      revision: version.revision, title: campaign.title, body: campaign.body, audience: campaign.audience,
      link: eventLink(version.eventId), sendAt: campaign.sendAt, status: "scheduled",
      progress: { lastUid: "" }, stats: emptyStats(),
      createdAt: existing.get("createdAt") ?? activatedAt, updatedAt: activatedAt,
    }, { merge: false });
    scheduled += 1;
  }
  // Notifications retirées de la fiche : leurs campagnes programmées sont annulées.
  const pending = await db.collection("notification_campaigns").where("eventId", "==", version.eventId).where("status", "==", "scheduled").get();
  let cancelled = 0;
  for (const doc of pending.docs) {
    if (keep.has(doc.id)) continue;
    await doc.ref.set({ status: "cancelled", cancelledReason: "removed_from_event", updatedAt: activatedAt }, { merge: true });
    cancelled += 1;
  }
  return { scheduled, cancelled };
}

/** Archivage d'un événement : ses campagnes en attente sont annulées. */
export async function cancelEventCampaigns(eventId: string, reason: string, now = Date.now()) {
  const pending = await db.collection("notification_campaigns").where("eventId", "==", eventId).where("status", "==", "scheduled").get();
  for (const doc of pending.docs) await doc.ref.set({ status: "cancelled", cancelledReason: reason, updatedAt: now }, { merge: true });
  return pending.size;
}

function emptyStats() {
  return { targeted: 0, inApp: 0, pushSent: 0, pushFailed: 0, optedOut: 0, tokensInvalidated: 0 };
}

/* ─────────────── Envoi ─────────────── */

async function audienceFilter(campaign: DocumentData): Promise<(uid: string) => boolean> {
  const audience = campaign.audience as EventNotificationAudience;
  if (audience === "all" || !campaign.eventId) return () => true;
  const runs = await db.collection("event_runs").where("eventId", "==", campaign.eventId).get();
  if (audience === "active_run") {
    const active = new Set(runs.docs.filter((doc) => ["active", "matchmaking"].includes(String(doc.get("status")))).map((doc) => String(doc.get("uid"))));
    return (uid) => active.has(uid);
  }
  const joined = new Set(runs.docs.map((doc) => String(doc.get("uid"))));
  return (uid) => !joined.has(uid);
}

/** Envoie une campagne jusqu'au bout (reprend au dernier uid traité). */
export async function deliverCampaign(campaignId: string, now = Date.now()) {
  const ref = db.doc(`notification_campaigns/${campaignId}`);
  const claimed = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const status = snap.get("status");
    const staleSending = status === "sending" && now - Number(snap.get("claimedAt") ?? 0) > STALE_SENDING_MS;
    if (!snap.exists || (status !== "scheduled" && !staleSending) || Number(snap.get("sendAt")) > now) return null;
    transaction.set(ref, { status: "sending", claimedAt: now, updatedAt: now }, { merge: true });
    return snap.data() ?? null;
  });
  if (!claimed) return null;

  // Événement retiré ou terminé entre-temps : on n'envoie pas.
  if (claimed.eventId) {
    const index = await db.doc(`events/${claimed.eventId}`).get();
    if (index.get("published") !== true || Number(index.get("endsAt") ?? Infinity) <= now) {
      await ref.set({ status: "cancelled", cancelledReason: "event_unavailable", updatedAt: now }, { merge: true });
      return { campaignId, cancelled: true };
    }
  }

  const matches = await audienceFilter(claimed);
  const stats = { ...emptyStats(), ...(claimed.stats ?? {}) };
  let lastUid = String(claimed.progress?.lastUid ?? "");
  const link = String(claimed.link ?? eventLink(claimed.eventId));
  for (;;) {
    let query = db.collection("players").orderBy("uid", "asc").limit(PAGE_SIZE);
    if (lastUid) query = db.collection("players").where("uid", ">", lastUid).orderBy("uid", "asc").limit(PAGE_SIZE);
    const page = await query.get();
    if (page.empty) break;
    const batch = db.batch();
    const tokens: Array<{ token: string; ref: DocumentReference }> = [];
    for (const player of page.docs) {
      const uid = String(player.get("uid") ?? player.id);
      if (!matches(uid)) continue;
      stats.targeted += 1;
      if (player.get("notificationPrefs.events") === false) { stats.optedOut += 1; continue; }
      batch.set(db.doc(`users/${uid}/notifications/camp_${campaignId}`), {
        type: "event", eventId: claimed.eventId ?? "", campaignId,
        actorUid: "", actorName: String(claimed.eventTitle ?? "Njambo"), actorEmoji: "📣",
        title: String(claimed.title).slice(0, 80), body: String(claimed.body).slice(0, 240), read: false, createdAt: now,
      }, { merge: false });
      stats.inApp += 1;
      const userTokens = await db.collection(`push_tokens/${uid}/tokens`).where("active", "==", true).limit(10).get();
      userTokens.docs.forEach((doc) => tokens.push({ token: String(doc.get("token")), ref: doc.ref }));
    }
    for (let start = 0; start < tokens.length; start += 500) {
      const chunk = tokens.slice(start, start + 500);
      try {
        const results = await pushSender(chunk.map((entry) => entry.token), {
          title: String(claimed.title), body: String(claimed.body), link, tag: campaignId, campaignId, eventId: claimed.eventId,
        });
        results.forEach((result, index) => {
          if (result.success) { stats.pushSent += 1; return; }
          stats.pushFailed += 1;
          if (INVALID_TOKEN_CODES.includes(result.errorCode ?? "")) {
            batch.update(chunk[index].ref, { active: false, invalidatedAt: now });
            stats.tokensInvalidated += 1;
          }
        });
      } catch (error) {
        console.error(`deliverCampaign ${campaignId}: échec push`, error);
        stats.pushFailed += chunk.length;
      }
    }
    lastUid = String(page.docs[page.docs.length - 1].get("uid") ?? page.docs[page.docs.length - 1].id);
    batch.set(ref, { progress: { lastUid }, stats, claimedAt: Date.now(), updatedAt: Date.now() }, { merge: true });
    await batch.commit();
    if (page.size < PAGE_SIZE) break;
  }
  await ref.set({ status: "sent", sentAt: Date.now(), stats, updatedAt: Date.now() }, { merge: true });
  return { campaignId, stats };
}

export async function sendDueCampaignsImpl(now = Date.now()) {
  const [due, stale] = await Promise.all([
    db.collection("notification_campaigns").where("status", "==", "scheduled").where("sendAt", "<=", now).limit(10).get(),
    db.collection("notification_campaigns").where("status", "==", "sending").where("claimedAt", "<=", now - STALE_SENDING_MS).limit(5).get(),
  ]);
  const results = [];
  for (const doc of [...due.docs, ...stale.docs]) {
    try {
      results.push(await deliverCampaign(doc.id, now));
    } catch (error) {
      console.error(`sendDueCampaigns: échec ${doc.id}`, error);
    }
  }
  return results.filter(Boolean);
}

export const sendDueCampaigns = onSchedule({ schedule: "every 1 minutes", timeZone: "Africa/Douala", region: "africa-south1" }, async () => {
  await sendDueCampaignsImpl();
});

/* ─────────────── Commandes admin ─────────────── */

export async function listCampaignsHandler(request: CallableRequest<unknown>) {
  requireAdmin(request);
  const snap = await db.collection("notification_campaigns").orderBy("sendAt", "desc").limit(100).get();
  return { campaigns: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
}

/** Campagne libre : immédiate (sendAt absent) ou programmée. */
export async function createCampaignHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const title = requiredString(data, "title", 60);
  const body = requiredString(data, "body", 160);
  const audience = String(data.audience ?? "all") as EventNotificationAudience;
  if (!AUDIENCES.includes(audience)) throw new HttpsError("invalid-argument", "INVALID_AUDIENCE");
  const eventId = typeof data.eventId === "string" && data.eventId ? data.eventId.slice(0, 96) : undefined;
  if (audience !== "all" && !eventId) throw new HttpsError("invalid-argument", "EVENT_REQUIRED_FOR_AUDIENCE");
  const sendAtRaw = data.sendAt === undefined || data.sendAt === null ? null : Number(data.sendAt);
  if (sendAtRaw !== null && !Number.isFinite(sendAtRaw)) throw new HttpsError("invalid-argument", "INVALID_SENDAT");
  return runIdempotent(uid, "createCampaign", data.idempotencyKey, async (transaction, now) => {
    let eventTitle = "Njambo";
    if (eventId) {
      const index = await transaction.get(db.doc(`events/${eventId}`));
      if (!index.exists) throw new HttpsError("not-found", "EVENT_NOT_FOUND");
      eventTitle = String(index.get("title") ?? eventId);
    }
    const ref = db.collection("notification_campaigns").doc();
    const sendAt = sendAtRaw !== null && sendAtRaw > now ? sendAtRaw : now;
    transaction.create(ref, {
      source: "manual", ...(eventId ? { eventId } : {}), eventTitle, title, body, audience, link: eventLink(eventId),
      sendAt, status: "scheduled", progress: { lastUid: "" }, stats: emptyStats(), createdBy: uid, createdAt: now, updatedAt: now,
    });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "campaign_create", campaignId: ref.id, audience, eventId: eventId ?? null, sendAt, createdAt: now });
    return { campaignId: ref.id, sendAt };
  });
}

export async function cancelCampaignHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const campaignId = requiredString(data, "campaignId", 160);
  return runIdempotent(uid, "cancelCampaign", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`notification_campaigns/${campaignId}`);
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "CAMPAIGN_NOT_FOUND");
    if (snap.get("status") !== "scheduled") throw new HttpsError("failed-precondition", "CAMPAIGN_NOT_SCHEDULED");
    transaction.set(ref, { status: "cancelled", cancelledReason: "admin", updatedAt: now }, { merge: true });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "campaign_cancel", campaignId, createdAt: now });
    return { campaignId, cancelled: true };
  });
}

/* ─────────────── Préférence joueur ─────────────── */

export async function setNotificationPrefsHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  if (typeof data.events !== "boolean") throw new HttpsError("invalid-argument", "INVALID_EVENTS");
  const now = Date.now();
  await db.doc(`players/${uid}`).set({ notificationPrefs: { events: data.events, updatedAt: now } }, { merge: true });
  return { events: data.events };
}
