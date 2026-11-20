/* ═══════════════ Saisons (phase 6) ═══════════════
   seasons/{id} (fiche, lisible si published) · season_progress/{seasonId}_{uid}
   (points, paliers réclamés, premium). Les points sont crédités au règlement
   des tables (matchCommands.ts) ; le premium s'achète via createPaymentIntent
   (offerId "season_premium:{seasonId}") puis verifyStorePurchase. */

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import {
  canClaimTier,
  normalizeSeason,
  normalizeSeasonProgress,
  seasonPhase,
  validateReward,
  validateSeason,
  type SeasonTrack,
} from "../../domain";
import { applyReward, asObject, db, economyFrom, integer, ledger, requireAdmin, requireUid, requiredString, runIdempotent, stableId } from "./core";

export const SEASON_PREMIUM_PREFIX = "season_premium:";
const progressRef = (seasonId: string, uid: string) => db.doc(`season_progress/${seasonId}_${uid}`);

const CLAIM_ERRORS: Record<string, string> = {
  season_closed: "SEASON_CLOSED", tier_unknown: "TIER_UNKNOWN", tier_locked: "TIER_LOCKED",
  premium_required: "PREMIUM_REQUIRED", already_claimed: "ALREADY_CLAIMED", no_reward: "NO_REWARD",
};

/* ─────────────── Joueur ─────────────── */

/** Saisons en cours ou en délai de réclamation, avec ma progression. */
export async function getSeasonsHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const now = Date.now();
  const snap = await db.collection("seasons").where("published", "==", true).get();
  const seasons = snap.docs
    .map((doc) => normalizeSeason({ ...doc.data(), id: doc.id }))
    .filter((season) => ["live", "grace"].includes(seasonPhase(season, now)))
    .sort((a, b) => a.endsAt - b.endsAt);
  const progress = await Promise.all(seasons.map((season) => progressRef(season.id, uid).get()));
  return {
    now,
    seasons: seasons.map((season, index) => ({
      season,
      phase: seasonPhase(season, now),
      progress: normalizeSeasonProgress(progress[index].data(), season.id, uid),
    })),
  };
}

export async function claimSeasonTierHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const seasonId = requiredString(data, "seasonId", 64);
  const tierIndex = integer(data, "tierIndex", 0, 99);
  const track = requiredString(data, "track", 16) as SeasonTrack;
  if (track !== "free" && track !== "premium") throw new HttpsError("invalid-argument", "INVALID_TRACK");
  return runIdempotent(uid, "claimSeasonTier", data.idempotencyKey, async (transaction, now) => {
    const pRef = progressRef(seasonId, uid);
    const [seasonSnap, progressSnap, economySnap, inventorySnap] = await Promise.all([
      transaction.get(db.doc(`seasons/${seasonId}`)), transaction.get(pRef),
      transaction.get(db.doc(`economies/${uid}`)), transaction.get(db.doc(`inventories/${uid}`)),
    ]);
    if (!seasonSnap.exists || seasonSnap.get("published") !== true) throw new HttpsError("not-found", "SEASON_NOT_FOUND");
    if (!economySnap.exists) throw new HttpsError("failed-precondition", "PROFILE_NOT_INITIALIZED");
    const season = normalizeSeason({ ...seasonSnap.data(), id: seasonId });
    const progress = normalizeSeasonProgress(progressSnap.data(), seasonId, uid);
    const check = canClaimTier(season, progress, tierIndex, track, now);
    if (!check.ok) throw new HttpsError("failed-precondition", CLAIM_ERRORS[check.reason ?? "tier_unknown"]);
    const rewards = track === "free" ? season.tiers[tierIndex].freeReward : season.tiers[tierIndex].premiumReward;
    const before = economyFrom(economySnap.data(), now);
    let economy = before;
    let inventory = inventorySnap.data() ?? {};
    for (const reward of rewards) ({ economy, inventory } = applyReward(economy, inventory, reward, now));
    transaction.set(db.doc(`economies/${uid}`), economy, { merge: false });
    transaction.set(db.doc(`inventories/${uid}`), { ...inventory, updatedAt: now }, { merge: false });
    const claimedKey = track === "free" ? "claimedFree" : "claimedPremium";
    transaction.set(pRef, {
      seasonId, uid, points: progress.points, premium: progress.premium,
      claimedFree: progress.claimedFree, claimedPremium: progress.claimedPremium,
      [claimedKey]: [...progress[claimedKey], tierIndex], updatedAt: now,
    }, { merge: true });
    ledger(transaction, uid, stableId(uid, "season-claim", seasonId, track, String(tierIndex)), "claimSeasonTier", {
      nkap: economy.nkap - before.nkap, cauris: economy.cauris - before.cauris,
    }, economy, now, { seasonId, tierIndex, track, rewards });
    return { seasonId, tierIndex, track, rewards };
  });
}

/* ─────────────── Admin ─────────────── */

export async function listSeasonsHandler(request: CallableRequest<unknown>) {
  requireAdmin(request);
  const snap = await db.collection("seasons").get();
  return { seasons: snap.docs.map((doc) => normalizeSeason({ ...doc.data(), id: doc.id })).sort((a, b) => b.startsAt - a.startsAt), now: Date.now() };
}

export async function saveSeasonHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const season = normalizeSeason(data.season);
  const issues = validateSeason(season, validateReward);
  if (issues.length) throw new HttpsError("invalid-argument", "SEASON_INVALID", { issues });
  return runIdempotent(uid, "saveSeason", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`seasons/${season.id}`);
    const existing = await transaction.get(ref);
    transaction.set(ref, { ...season, createdAt: existing.get("createdAt") ?? now, updatedAt: now, updatedBy: uid }, { merge: false });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: existing.exists ? "season_update" : "season_create", seasonId: season.id, published: season.published, createdAt: now });
    return { season };
  });
}

export async function getSeasonStatsHandler(request: CallableRequest<unknown>) {
  requireAdmin(request);
  const seasonId = requiredString(asObject(request.data), "seasonId", 64);
  const [seasonSnap, progressSnap, ordersSnap] = await Promise.all([
    db.doc(`seasons/${seasonId}`).get(),
    db.collection("season_progress").where("seasonId", "==", seasonId).get(),
    db.collection("orders").where("seasonId", "==", seasonId).get(),
  ]);
  if (!seasonSnap.exists) throw new HttpsError("not-found", "SEASON_NOT_FOUND");
  const season = normalizeSeason({ ...seasonSnap.data(), id: seasonId });
  const progress = progressSnap.docs.map((doc) => normalizeSeasonProgress(doc.data(), seasonId, String(doc.get("uid"))));
  const paid = ordersSnap.docs.filter((doc) => doc.get("status") === "paid");
  return {
    seasonId,
    players: progress.length,
    premium: progress.filter((item) => item.premium).length,
    premiumRevenueXaf: paid.reduce((sum, doc) => sum + Number(doc.get("amountXaf") ?? 0), 0),
    averagePoints: progress.length ? Math.round(progress.reduce((sum, item) => sum + item.points, 0) / progress.length) : 0,
    tiers: season.tiers.map((tier, index) => ({
      points: tier.points,
      reached: progress.filter((item) => item.points >= tier.points).length,
      claimedFree: progress.filter((item) => item.claimedFree.includes(index)).length,
      claimedPremium: progress.filter((item) => item.claimedPremium.includes(index)).length,
    })),
  };
}
