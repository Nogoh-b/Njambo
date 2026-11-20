/* ═══════════════ Défis entre amis (phase 7) ═══════════════
   event_challenges/{id} : { eventId, revision, eventTitle, fromUid, toUid,
     fromName, toName, fromEmoji, toEmoji, status, fromRunId?, toRunId?,
     winnerReward, scores?, winnerUid?, expiresAt, createdAt, updatedAt }
   - Défi possible entre amis, sur un événement en ligne dont la fiche active
     `friendChallenges.enabled`.
   - Le PROCHAIN parcours de chacun (joinEvent après acceptation) est lié.
   - Job : défis terminés (deux parcours finis, ou événement terminé) →
     comparaison des scores → récompense du gagnant + notifications. */

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  CHALLENGE_PENDING_TTL_MS,
  DEFAULT_EVENTS,
  challengeRunScore,
  decideChallenge,
  normalizeEventVersion,
  type EventVersion,
  type Reward,
} from "../../domain";
import { applyReward, asObject, db, economyFrom, ledger, requireUid, requiredString, runIdempotent, stableId } from "./core";
import { notifyPlayer } from "./campaignCommands";
import { rewardText } from "./eventLeaderboardCommands";
import type { DocumentData } from "./firestoreTypes";

async function activeEvent(eventId: string): Promise<{ index: DocumentData; version: EventVersion | null }> {
  const indexSnap = await db.doc(`events/${eventId}`).get();
  const index = indexSnap.data() ?? {};
  const revision = Number(index.activeRevision ?? 1);
  const versionSnap = await db.doc(`event_versions/${eventId}_v${revision}`).get();
  const raw = versionSnap.exists ? versionSnap.data() : DEFAULT_EVENTS.find((event) => event.eventId === eventId);
  return { index, version: raw ? normalizeEventVersion(raw) : null };
}

const OPEN = ["pending", "accepted"];

export async function createEventChallengeHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const eventId = requiredString(data, "eventId", 96);
  const toUid = requiredString(data, "toUid", 128);
  if (toUid === uid) throw new HttpsError("invalid-argument", "CANNOT_CHALLENGE_SELF");
  const { index, version } = await activeEvent(eventId);
  const now = Date.now();
  if (!version || index.published !== true || version.startsAt > now || version.endsAt <= now) throw new HttpsError("failed-precondition", "EVENT_UNAVAILABLE");
  if (!version.friendChallenges.enabled) throw new HttpsError("failed-precondition", "CHALLENGES_DISABLED");
  const [friendSnap, fromSnap, toSnap, existingFrom, existingTo] = await Promise.all([
    db.doc(`users/${uid}/friends/${toUid}`).get(),
    db.doc(`players/${uid}`).get(),
    db.doc(`players/${toUid}`).get(),
    db.collection("event_challenges").where("fromUid", "==", uid).where("eventId", "==", eventId).get(),
    db.collection("event_challenges").where("toUid", "==", uid).where("eventId", "==", eventId).get(),
  ]);
  if (!friendSnap.exists) throw new HttpsError("permission-denied", "NOT_FRIENDS");
  const already = [...existingFrom.docs, ...existingTo.docs].some((doc) => OPEN.includes(String(doc.get("status")))
    && [doc.get("fromUid"), doc.get("toUid")].includes(toUid));
  if (already) throw new HttpsError("already-exists", "CHALLENGE_ALREADY_OPEN");
  const result = await runIdempotent(uid, "createEventChallenge", data.idempotencyKey, async (transaction, at) => {
    const ref = db.collection("event_challenges").doc();
    transaction.create(ref, {
      eventId, revision: version.revision, eventTitle: version.title,
      fromUid: uid, toUid,
      fromName: String(fromSnap.get("name") ?? "Joueur"), fromEmoji: String(fromSnap.get("emoji") ?? "🎴"),
      toName: String(toSnap.get("name") ?? "Joueur"), toEmoji: String(toSnap.get("emoji") ?? "🎴"),
      status: "pending", winnerReward: version.friendChallenges.winnerReward,
      expiresAt: Math.min(at + CHALLENGE_PENDING_TTL_MS, version.endsAt), createdAt: at, updatedAt: at,
    });
    return { challengeId: ref.id };
  });
  await notifyPlayer(toUid, {
    id: `challenge_${result.challengeId}`, eventId,
    title: `${String(fromSnap.get("name") ?? "Un ami")} te défie !`,
    body: `Duel sur « ${version.title} » : le meilleur parcours gagne ${version.friendChallenges.winnerReward.map(rewardText).join(", ")}. Accepte dans l’événement.`,
    actorName: String(fromSnap.get("name") ?? "Un ami"), actorEmoji: "⚔️",
  });
  return result;
}

export async function respondEventChallengeHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const challengeId = requiredString(data, "challengeId", 96);
  const accept = data.accept === true;
  const result = await runIdempotent(uid, "respondEventChallenge", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`event_challenges/${challengeId}`);
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.get("toUid") !== uid) throw new HttpsError("not-found", "CHALLENGE_NOT_FOUND");
    if (snap.get("status") !== "pending") throw new HttpsError("failed-precondition", "CHALLENGE_NOT_PENDING");
    if (Number(snap.get("expiresAt")) <= now) throw new HttpsError("failed-precondition", "CHALLENGE_EXPIRED");
    transaction.update(ref, accept
      ? { status: "accepted", acceptedAt: now, updatedAt: now }
      : { status: "declined", updatedAt: now });
    return { challengeId, status: accept ? "accepted" : "declined", fromUid: String(snap.get("fromUid")), toName: String(snap.get("toName")), eventId: String(snap.get("eventId")), eventTitle: String(snap.get("eventTitle")) };
  });
  await notifyPlayer(result.fromUid, {
    id: `challenge_${challengeId}_${result.status}`, eventId: result.eventId,
    title: result.status === "accepted" ? `${result.toName} relève ton défi !` : `${result.toName} décline ton défi`,
    body: result.status === "accepted" ? `Lance ton prochain parcours sur « ${result.eventTitle} » : il compte pour le duel.` : `Le duel sur « ${result.eventTitle} » n’aura pas lieu.`,
    actorName: result.toName, actorEmoji: "⚔️",
  });
  return { challengeId, status: result.status };
}

export async function listMyChallengesHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data ?? {});
  const eventId = typeof data.eventId === "string" ? data.eventId : null;
  const [mine, theirs] = await Promise.all([
    db.collection("event_challenges").where("fromUid", "==", uid).get(),
    db.collection("event_challenges").where("toUid", "==", uid).get(),
  ]);
  const challenges = [...mine.docs, ...theirs.docs]
    .map((doc) => ({ id: doc.id, ...doc.data() }) as DocumentData & { id: string })
    .filter((item) => !eventId || item.eventId === eventId)
    .sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))
    .slice(0, 30);
  // Progression en direct des parcours liés (lecture des deux runs).
  const withLive = await Promise.all(challenges.map(async (item) => {
    if (item.status !== "accepted") return item;
    const version = await activeEventVersionOfChallenge(item);
    const live = await Promise.all([item.fromRunId, item.toRunId].map(async (runId) => {
      if (!runId || !version) return null;
      const run = await db.doc(`event_runs/${runId}`).get();
      return run.exists ? challengeRunScore(run.data() as never, normalizeEventVersion(run.get("versionSnapshot") ?? version)) : null;
    }));
    return { ...item, live: { from: live[0], to: live[1] } };
  }));
  return { challenges: withLive };
}

async function activeEventVersionOfChallenge(challenge: DocumentData) {
  return (await activeEvent(String(challenge.eventId))).version;
}

/** Après joinEvent : lie ce nouveau parcours aux défis acceptés qui n'en ont pas encore. */
export async function bindChallengeRuns(uid: string, eventId: string, runId: string) {
  const [asFrom, asTo] = await Promise.all([
    db.collection("event_challenges").where("fromUid", "==", uid).where("status", "==", "accepted").get(),
    db.collection("event_challenges").where("toUid", "==", uid).where("status", "==", "accepted").get(),
  ]);
  let bound = 0;
  for (const doc of [...asFrom.docs, ...asTo.docs]) {
    if (doc.get("eventId") !== eventId) continue;
    const field = doc.get("fromUid") === uid ? "fromRunId" : "toRunId";
    const done = await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(doc.ref);
      if (fresh.get("status") !== "accepted" || fresh.get(field)) return false;
      transaction.update(doc.ref, { [field]: runId, updatedAt: Date.now() });
      return true;
    });
    if (done) bound += 1;
  }
  return bound;
}

/* ─────────────── Règlement des défis ─────────────── */

async function settleChallenge(id: string, now: number) {
  const ref = db.doc(`event_challenges/${id}`);
  const outcome = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const challenge = snap.data() ?? {};
    if (challenge.status !== "accepted") return null;
    const runRefs = [challenge.fromRunId, challenge.toRunId].map((runId) => (runId ? db.doc(`event_runs/${runId}`) : null));
    const runSnaps = await Promise.all(runRefs.map((runRef) => (runRef ? transaction.get(runRef) : Promise.resolve(null))));
    const eventIndex = await transaction.get(db.doc(`events/${challenge.eventId}`));
    const eventEnded = Number(eventIndex.get("endsAt") ?? Infinity) <= now || eventIndex.get("published") !== true;
    const sides = runSnaps.map((runSnap) => (runSnap?.exists ? challengeRunScore(runSnap.data() as never, normalizeEventVersion(runSnap.get("versionSnapshot"))) : null));
    const bothFinished = sides.every((side) => side?.finished);
    if (!bothFinished && !eventEnded) return null;
    if (!sides[0] && !sides[1]) {
      transaction.update(ref, { status: "expired", expiredReason: "no_run", updatedAt: now });
      return { status: "expired" as const, challenge };
    }
    const winnerUid = decideChallenge(
      sides[0] ? { ...sides[0], uid: challenge.fromUid } : null,
      sides[1] ? { ...sides[1], uid: challenge.toUid } : null,
    );
    const rewards = (challenge.winnerReward ?? []) as Reward[];
    if (winnerUid && rewards.length > 0) {
      const economyRef = db.doc(`economies/${winnerUid}`);
      const inventoryRef = db.doc(`inventories/${winnerUid}`);
      const [economySnap, inventorySnap] = await Promise.all([transaction.get(economyRef), transaction.get(inventoryRef)]);
      const before = economyFrom(economySnap.data(), now);
      let economy = before;
      let inventory: DocumentData = inventorySnap.data() ?? {};
      for (const reward of rewards) ({ economy, inventory } = applyReward(economy, inventory, reward, now));
      transaction.set(economyRef, economy, { merge: false });
      transaction.set(inventoryRef, { ...inventory, updatedAt: now }, { merge: false });
      ledger(transaction, winnerUid, stableId(winnerUid, "challenge", id), "settleEventChallenge", { nkap: economy.nkap - before.nkap, cauris: economy.cauris - before.cauris }, economy, now, { challengeId: id, rewards });
    }
    transaction.update(ref, {
      status: "finished", winnerUid: winnerUid ?? null, finishedAt: now, updatedAt: now,
      scores: { from: sides[0], to: sides[1] }, settledBy: bothFinished ? "both_finished" : "event_ended",
    });
    return { status: "finished" as const, challenge, winnerUid, sides, rewards };
  });
  if (!outcome) return null;
  const c = outcome.challenge;
  if (outcome.status === "finished") {
    const score = (side: { score: number } | null | undefined) => (side ? side.score : 0);
    const line = `${c.fromName} ${score(outcome.sides[0])} – ${score(outcome.sides[1])} ${c.toName}`;
    for (const [uid, other] of [[c.fromUid, c.toName], [c.toUid, c.fromName]] as const) {
      const won = outcome.winnerUid === uid;
      await notifyPlayer(String(uid), {
        id: `challenge_${id}_result`, eventId: String(c.eventId),
        title: outcome.winnerUid === null ? `Égalité contre ${other} !` : won ? `Tu as battu ${other} !` : `${other} remporte le duel`,
        body: `${line} sur « ${c.eventTitle} ».${won && outcome.rewards.length ? ` Tu gagnes ${outcome.rewards.map(rewardText).join(", ")}.` : ""}`,
        actorName: String(other), actorEmoji: won ? "🏆" : "⚔️",
      });
    }
  }
  return { id, ...outcome, challenge: undefined };
}

export async function settleEventChallengesImpl(now = Date.now()) {
  const [pending, accepted] = await Promise.all([
    db.collection("event_challenges").where("status", "==", "pending").where("expiresAt", "<=", now).limit(100).get(),
    db.collection("event_challenges").where("status", "==", "accepted").limit(200).get(),
  ]);
  for (const doc of pending.docs) await doc.ref.set({ status: "expired", expiredReason: "not_accepted", updatedAt: now }, { merge: true });
  const results = [];
  for (const doc of accepted.docs) {
    try {
      const result = await settleChallenge(doc.id, now);
      if (result) results.push(result);
    } catch (error) {
      console.error(`settleEventChallenges ${doc.id}`, error);
    }
  }
  return { expired: pending.size, settled: results };
}

export const settleEventChallenges = onSchedule({ schedule: "every 2 minutes", timeZone: "Africa/Douala", region: "africa-south1" }, async () => {
  await settleEventChallengesImpl();
});
