/* ═══════════════ Classement des événements (phase 2) ═══════════════
   - event_leaderboards/{eventId}/entries/{uid} : meilleure ligne de chaque
     joueur, écrite au règlement de table (matchCommands.ts).
   - event_rank_rewards/{eventId}_{uid} : reçu de distribution (idempotence).
   - events/{eventId}.rankingSettledAt : l'événement a été réglé.
   Rang d'un joueur = 1 + nombre de lignes devant lui (requêtes de comptage). */

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  DEFAULT_EVENTS,
  compareLeaderboardEntries,
  lastRewardedRank,
  normalizeEventVersion,
  rankRewardsFor,
  type EventLeaderboardEntry,
  type EventVersion,
  type Reward,
} from "../../domain";
import { applyReward, asObject, db, economyFrom, ledger, requireUid, requiredString, stableId } from "./core";
import type { DocumentData } from "./firestoreTypes";

const TOP_SIZE = 50;

const entriesOf = (eventId: string) => db.collection(`event_leaderboards/${eventId}/entries`);

async function activeVersion(eventId: string): Promise<{ index: DocumentData; version: EventVersion | null }> {
  const indexSnap = await db.doc(`events/${eventId}`).get();
  const index = indexSnap.data() ?? {};
  const revision = Number(index.activeRevision ?? 1);
  const versionSnap = await db.doc(`event_versions/${eventId}_v${revision}`).get();
  const raw = versionSnap.exists ? versionSnap.data() : DEFAULT_EVENTS.find((event) => event.eventId === eventId);
  return { index, version: raw ? normalizeEventVersion(raw) : null };
}

/** Rang d'une ligne : 1 + lignes strictement devant (score, puis durée, puis arrivée). */
export async function rankOf(eventId: string, entry: Pick<EventLeaderboardEntry, "score" | "durationMs" | "reachedAt">): Promise<number> {
  const entries = entriesOf(eventId);
  const [better, faster, earlier] = await Promise.all([
    entries.where("score", ">", entry.score).count().get(),
    entries.where("score", "==", entry.score).where("durationMs", "<", entry.durationMs).count().get(),
    entries.where("score", "==", entry.score).where("durationMs", "==", entry.durationMs).where("reachedAt", "<", entry.reachedAt).count().get(),
  ]);
  return 1 + better.data().count + faster.data().count + earlier.data().count;
}

export function rewardText(reward: Reward): string {
  switch (reward.type) {
    case "nkap": return `${reward.amount} Nkap`;
    case "cauris": return `${reward.amount} cauris`;
    case "ticket": return `${reward.amount} ticket${reward.amount > 1 ? "s" : ""} ${reward.tier}`;
    case "energy_pass": return `énergie illimitée ${reward.durationMinutes} min`;
    case "booster_book": return `${reward.amount} livre${reward.amount > 1 ? "s" : ""} ${reward.boosterId}`;
    case "card": return "une carte de pouvoir";
  }
}

/* ─────────────── Lecture : top 50 + ma ligne ─────────────── */

export async function getEventLeaderboardHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const eventId = requiredString(asObject(request.data), "eventId", 96);
  const { index, version } = await activeVersion(eventId);
  if (!version) throw new HttpsError("not-found", "EVENT_NOT_FOUND");
  const board = version.leaderboard;
  const base = {
    eventId,
    enabled: board.enabled,
    endsAt: version.endsAt,
    settledAt: (index.rankingSettledAt as number | undefined) ?? null,
    scoring: { pointsPerStage: board.pointsPerStage, pointsPerLifeLeft: board.pointsPerLifeLeft, perfectBonus: board.perfectBonus },
    rankRewards: board.rankRewards,
    minParticipants: board.minParticipants,
  };
  if (!board.enabled) return { ...base, participants: 0, top: [], me: null };
  const entries = entriesOf(eventId);
  const [topSnap, mineSnap, total] = await Promise.all([
    entries.orderBy("score", "desc").orderBy("durationMs", "asc").orderBy("reachedAt", "asc").limit(TOP_SIZE).get(),
    db.doc(`event_leaderboards/${eventId}/entries/${uid}`).get(),
    entries.count().get(),
  ]);
  const top = topSnap.docs
    .map((doc) => doc.data() as EventLeaderboardEntry)
    .sort(compareLeaderboardEntries)
    .map((entry, position) => ({ ...entry, rank: position + 1 }));
  let me: (EventLeaderboardEntry & { rank: number }) | null = null;
  if (mineSnap.exists) {
    const mine = mineSnap.data() as EventLeaderboardEntry;
    me = top.find((entry) => entry.uid === uid) ?? { ...mine, rank: await rankOf(eventId, mine) };
  }
  return { ...base, participants: total.data().count, top, me };
}

/* ─────────────── Job : distribution des récompenses par rang ─────────────── */

async function settleOne(eventId: string, now: number) {
  const indexRef = db.doc(`events/${eventId}`);
  const { version } = await activeVersion(eventId);
  if (!version || !version.leaderboard.enabled) {
    await indexRef.set({ rankingSettledAt: now, rankingSummary: { skipped: "disabled" } }, { merge: true });
    return { eventId, skipped: "disabled" };
  }
  if (version.endsAt > now) return { eventId, skipped: "not_ended" };
  const board = version.leaderboard;
  const participants = (await entriesOf(eventId).count().get()).data().count;
  if (participants < board.minParticipants) {
    await indexRef.set({ rankingSettledAt: now, rankingSummary: { participants, rewarded: 0, skipped: "min_participants" } }, { merge: true });
    return { eventId, skipped: "min_participants" };
  }
  const lastRank = lastRewardedRank(board);
  let rewarded = 0;
  if (lastRank > 0) {
    // Marge de lecture : les ex æquo parfaits sont départagés par uid côté domaine.
    const snap = await entriesOf(eventId).orderBy("score", "desc").orderBy("durationMs", "asc").orderBy("reachedAt", "asc").limit(lastRank + 20).get();
    const ranked = snap.docs.map((doc) => doc.data() as EventLeaderboardEntry).sort(compareLeaderboardEntries).slice(0, lastRank);
    for (const [position, entry] of ranked.entries()) {
      const rank = position + 1;
      const rewards = rankRewardsFor(rank, board);
      if (rewards.length === 0) continue;
      const paid = await db.runTransaction(async (transaction) => {
        const receiptRef = db.doc(`event_rank_rewards/${eventId}_${entry.uid}`);
        const economyRef = db.doc(`economies/${entry.uid}`);
        const inventoryRef = db.doc(`inventories/${entry.uid}`);
        const [receipt, economySnap, inventorySnap] = await Promise.all([transaction.get(receiptRef), transaction.get(economyRef), transaction.get(inventoryRef)]);
        if (receipt.exists) return false;
        const before = economyFrom(economySnap.data(), now);
        let economy = before;
        let inventory: DocumentData = inventorySnap.data() ?? {};
        for (const reward of rewards) ({ economy, inventory } = applyReward(economy, inventory, reward, now));
        transaction.set(economyRef, economy, { merge: false });
        transaction.set(inventoryRef, { ...inventory, updatedAt: now }, { merge: false });
        ledger(transaction, entry.uid, stableId(entry.uid, "event-rank", eventId), "settleEventRanking", {
          nkap: economy.nkap - before.nkap, cauris: economy.cauris - before.cauris,
        }, economy, now, { eventId, rank, rewards });
        transaction.create(receiptRef, { eventId, uid: entry.uid, rank, score: entry.score, rewards, createdAt: now });
        transaction.create(db.collection(`users/${entry.uid}/notifications`).doc(), {
          type: "event", eventId, actorUid: "", actorName: version.title, actorEmoji: "🏆",
          title: `${rank === 1 ? "1er" : `${rank}e`} du classement !`.slice(0, 80),
          body: `« ${version.title} » est terminé. Tu reçois : ${rewards.map(rewardText).join(", ")}.`.slice(0, 240),
          read: false, createdAt: now,
        });
        return true;
      });
      if (paid) rewarded += 1;
    }
  }
  await indexRef.set({ rankingSettledAt: now, rankingSummary: { participants, rewarded } }, { merge: true });
  await db.collection("admin_audit").doc().set({ uid: "system", action: "event_settle_ranking", eventId, participants, rewarded, createdAt: now });
  return { eventId, participants, rewarded };
}

export async function settleEventRankingsImpl(now = Date.now()) {
  const ended = await db.collection("events").where("endsAt", "<=", now).get();
  const results = [];
  for (const doc of ended.docs) {
    const data = doc.data() ?? {};
    if (data.rankingSettledAt || data.published !== true) continue;
    results.push(await settleOne(doc.id, now));
  }
  return results;
}

export const settleEventRankings = onSchedule({ schedule: "every 5 minutes", timeZone: "Africa/Douala", region: "africa-south1" }, async () => {
  await settleEventRankingsImpl();
});
