import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { DEFAULT_BOOSTERS, DEFAULT_EVENTS, DEFAULT_OFFERS } from "../../domain";
import { asObject, db, economyFrom, integer, requireAdmin, requiredString, runIdempotent } from "./core";

/* Brouillon de régie (admin_drafts) : remplace l'addDoc direct du client
   (components/admin/AdminConsole.tsx), validation portée de validDraft
   dans firestore.rules. */
const DRAFT_TYPES = ["event", "offer", "booster_definition", "reward_table", "runtime_config"];

export async function saveAdminDraftHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const type = requiredString(data, "type", 32);
  if (!DRAFT_TYPES.includes(type)) throw new HttpsError("invalid-argument", "INVALID_DRAFT_TYPE");
  const contentId = requiredString(data, "contentId", 96);
  const revision = integer(data, "revision", 1, 1_000_000);
  const payload = data.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new HttpsError("invalid-argument", "INVALID_PAYLOAD");
  return runIdempotent(uid, "saveAdminDraft", data.idempotencyKey, async (transaction, now) => {
    const draftRef = db.collection("admin_drafts").doc();
    transaction.create(draftRef, { type, contentId, revision, payload, status: "draft", createdBy: uid, createdAt: now, updatedAt: now });
    return { draftId: draftRef.id };
  });
}

export async function seedLiveOpsHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  return runIdempotent(uid, "seedLiveOps", data.idempotencyKey, async (transaction, now) => {
    for (const offer of DEFAULT_OFFERS) transaction.set(db.doc(`offers/${offer.id}`), { ...offer, seededAt: now }, { merge: false });
    for (const booster of DEFAULT_BOOSTERS) transaction.set(db.doc(`booster_definitions/${booster.id}`), { ...booster, seededAt: now }, { merge: false });
    for (const event of DEFAULT_EVENTS) {
      transaction.set(db.doc(`events/${event.eventId}`), {
        id: event.eventId, title: event.title, mode: event.mode, startsAt: event.startsAt, endsAt: event.endsAt,
        activeRevision: event.revision, published: true, updatedAt: now,
      }, { merge: false });
      transaction.set(db.doc(`event_versions/${event.eventId}_v${event.revision}`), { ...event, seededAt: now }, { merge: false });
    }
    transaction.set(db.doc("reward_tables/loyalty_wheel_v1"), {
      id: "loyalty_wheel_v1", revision: 1, published: true,
      entries: [
        { reward: { type: "nkap", amount: 100 }, weight: 35 },
        { reward: { type: "nkap", amount: 250 }, weight: 25 },
        { reward: { type: "cauris", amount: 5 }, weight: 20 },
        { reward: { type: "ticket", tier: "bronze", amount: 1 }, weight: 10 },
        { reward: { type: "energy_pass", durationMinutes: 60 }, weight: 7 },
        { reward: { type: "booster_book", boosterId: "normal", amount: 1 }, weight: 3 },
      ],
      seededAt: now,
    }, { merge: false });
    transaction.set(db.doc("runtime_config/features"), {
      economy: false, authoritativeMatches: false, shop: false, events: false,
      simulatedPayments: false, admin: false, notifications: false,
      updatedAt: now,
    }, { merge: true });
    transaction.set(db.doc("runtime_config/economy"), {
      energyMax: 100,
      energyRegenMs: 60_000,
      matchEnergyCosts: { bot: 5, online: 10, friends: 10, event: 0 },
      startingNkap: 5_000,
      startingCauris: 20,
      startingCrowns: 1_000,
      updatedAt: now,
    }, { merge: true });
    transaction.set(db.doc("runtime_config/live_ops"), {
      timeZone: "Africa/Douala",
      dailyRewardNkap: 100,
      loyaltyThreshold: 7,
      eventMatchmakingTimeoutMinutes: 3,
      updatedAt: now,
    }, { merge: true });
    return { offers: DEFAULT_OFFERS.length, boosters: DEFAULT_BOOSTERS.length, events: DEFAULT_EVENTS.length };
  });
}

export async function migrateLegacyPlayerHandler(request: CallableRequest<unknown>) {
  const adminUid = requireAdmin(request);
  const data = asObject(request.data);
  const targetUid = requiredString(data, "uid", 128);
  return runIdempotent(adminUid, "migrateLegacyPlayer", data.idempotencyKey, async (transaction, now) => {
    const refs = {
      user: db.doc(`users/${targetUid}`), player: db.doc(`players/${targetUid}`),
      economy: db.doc(`economies/${targetUid}`), inventory: db.doc(`inventories/${targetUid}`),
    };
    const [userSnap, playerSnap, economySnap, inventorySnap] = await Promise.all([
      transaction.get(refs.user), transaction.get(refs.player), transaction.get(refs.economy), transaction.get(refs.inventory),
    ]);
    if (!userSnap.exists && !playerSnap.exists) throw new HttpsError("not-found", "LEGACY_PLAYER_NOT_FOUND");
    if (economySnap.exists) return { uid: targetUid, migrated: false, reason: "already_migrated" };
    const legacy = userSnap.data() ?? playerSnap.data() ?? {};
    const economy = economyFrom({
      nkap: Number.isFinite(legacy.balance) ? legacy.balance : 5_000,
      cauris: Number.isFinite(legacy.cauris) ? legacy.cauris : 20,
      energy: { stored: 100, anchorAt: now, unlimitedUntil: 0, max: 100, regenMs: 60_000 },
      daily: { lastClaimDay: null, loyaltyPoints: 0, availableSpins: 0 },
      pity: {}, debtCauris: 0, spendingBlocked: false,
    }, now);
    transaction.create(refs.economy, economy);
    if (!inventorySnap.exists) transaction.create(refs.inventory, {
      cards: legacy.powerInventory ?? {}, equippedCards: legacy.equippedPowers ?? [],
      tickets: { bronze: 0, argent: 0, or: 0 }, boosterBooks: {}, updatedAt: now,
    });
    transaction.set(refs.player, {
      uid: targetUid, name: legacy.name ?? "Joueur du Mboa", emoji: legacy.emoji ?? "🎴",
      crowns: 1_000, placementMatchesRemaining: 5,
      stats: legacy.stats ?? { played: 0, won: 0, bestWin: 0 }, updatedAt: now,
    }, { merge: true });
    transaction.create(db.collection("admin_audit").doc(), { uid: adminUid, action: "migrate_player", targetUid, createdAt: now });
    return { uid: targetUid, migrated: true, economy };
  });
}

const FEATURE_KEYS = ["economy", "authoritativeMatches", "shop", "events", "simulatedPayments", "admin", "notifications"] as const;

export async function updateFeatureFlagsHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const rawFlags = data.flags;
  if (!rawFlags || typeof rawFlags !== "object" || Array.isArray(rawFlags)) throw new HttpsError("invalid-argument", "INVALID_FLAGS");
  const flags = Object.fromEntries(FEATURE_KEYS.map((key) => [key, (rawFlags as Record<string, unknown>)[key] === true]));
  return runIdempotent(uid, "updateFeatureFlags", data.idempotencyKey, async (transaction, now) => {
    transaction.set(db.doc("runtime_config/features"), { ...flags, updatedAt: now, updatedBy: uid }, { merge: true });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "update_feature_flags", flags, createdAt: now });
    return { flags };
  });
}
