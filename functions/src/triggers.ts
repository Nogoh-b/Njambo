import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { boundedNumber, economyFrom, db, ledger, stableId } from "./core";
import { refundEnergy } from "../../domain";

export async function refundCancelledMatchImpl(matchId: string, after: FirebaseFirestore.DocumentData) {
  if (after.refundId) return;
  const participants = (after.participants ?? []) as Array<{ uid: string; bot: boolean }>;
  const real = participants.filter((participant) => !participant.bot);
  await db.runTransaction(async (transaction) => {
    const matchRef = db.doc(`matches/${matchId}`);
    const fresh = await transaction.get(matchRef);
    if (fresh.get("refundId")) return;
    const economyRefs = real.map((participant) => db.doc(`economies/${participant.uid}`));
    const economySnaps = await Promise.all(economyRefs.map((ref) => transaction.get(ref)));
    const runIdsByUid = (after.eventRunIds ?? (after.eventRunId && real[0] ? { [real[0].uid]: after.eventRunId } : {})) as Record<string, string>;
    const eventParticipants = real.filter((participant) => typeof runIdsByUid[participant.uid] === "string");
    const runRefs = eventParticipants.map((participant) => db.doc(`event_runs/${runIdsByUid[participant.uid]}`));
    const inventoryRefs = eventParticipants.map((participant) => db.doc(`inventories/${participant.uid}`));
    const [runSnaps, inventorySnaps] = await Promise.all([
      Promise.all(runRefs.map((ref) => transaction.get(ref))),
      Promise.all(inventoryRefs.map((ref) => transaction.get(ref))),
    ]);
    const now = Date.now();
    real.forEach((participant, index) => {
      const economy = economyFrom(economySnaps[index].data(), now);
      const next = {
        ...economy,
        nkap: economy.nkap + Number(after.stakeNkap ?? 0),
        energy: refundEnergy(economy.energy, Number(after.energyCost ?? 0), now),
      };
      transaction.set(economyRefs[index], next, { merge: false });
      ledger(transaction, participant.uid, stableId(participant.uid, "match-refund", matchId), "refundCancelledMatch", {
        nkap: Number(after.stakeNkap ?? 0), energy: Number(after.energyCost ?? 0),
      }, next, now, { matchId });
    });
    eventParticipants.forEach((participant, index) => {
      const runSnap = runSnaps[index];
      const inventorySnap = inventorySnaps[index];
      if (!runSnap.exists || runSnap.get("ticketStatus") === "returned") return;
      const tier = String(runSnap.get("ticketTier"));
      const inventory = inventorySnap.data() ?? {};
      const tickets = { bronze: 0, argent: 0, or: 0, ...(inventory.tickets ?? {}) } as Record<string, number>;
      tickets[tier] = Number(tickets[tier] ?? 0) + 1;
      const eventMode = runSnap.get("versionSnapshot.mode");
      transaction.set(inventoryRefs[index], { ...inventory, tickets, updatedAt: now }, { merge: false });
      transaction.update(runRefs[index], { ticketStatus: "returned", status: eventMode === "pvp" ? "matchmaking" : "active", currentMatchId: null, updatedAt: now });
    });
    transaction.update(matchRef, { refundId: stableId("refund", matchId), refundedAt: now, updatedAt: now });
  });
}

export const refundCancelledMatch = onDocumentUpdated({ document: "matches/{matchId}", region: "africa-south1" }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  const matchId = event.params.matchId;
  if (!before || !after || before.status === "cancelled" || after.status !== "cancelled") return;
  await refundCancelledMatchImpl(matchId, after);
});

export async function refundExpiredEventQueuesImpl() {
  const now = Date.now();
  const configSnap = await db.doc("runtime_config/live_ops").get();
  const timeoutMinutes = boundedNumber(configSnap.get("eventMatchmakingTimeoutMinutes"), 3, 1, 30);
  const cutoff = now - timeoutMinutes * 60_000;
  const candidates = await db.collection("event_runs")
    .where("status", "==", "matchmaking")
    .where("ticketStatus", "==", "reserved")
    .limit(100)
    .get();
  await Promise.all(candidates.docs.filter((snapshot) => Number(snapshot.get("updatedAt") ?? 0) <= cutoff).map((snapshot) => db.runTransaction(async (transaction) => {
    const runRef = snapshot.ref;
    const freshRun = await transaction.get(runRef);
    if (!freshRun.exists
      || freshRun.get("status") !== "matchmaking"
      || freshRun.get("ticketStatus") !== "reserved"
      || Number(freshRun.get("updatedAt") ?? 0) > cutoff) return;
    const uid = String(freshRun.get("uid"));
    const inventoryRef = db.doc(`inventories/${uid}`);
    const inventorySnap = await transaction.get(inventoryRef);
    const inventory = inventorySnap.data() ?? {};
    const tier = String(freshRun.get("ticketTier"));
    const tickets = { bronze: 0, argent: 0, or: 0, ...(inventory.tickets ?? {}) } as Record<string, number>;
    tickets[tier] = Number(tickets[tier] ?? 0) + 1;
    transaction.set(inventoryRef, { ...inventory, tickets, updatedAt: now }, { merge: false });
    transaction.update(runRef, { status: "no_match", ticketStatus: "returned", currentMatchId: null, noMatchAt: now, updatedAt: now });
  })));
}

export const refundExpiredEventQueues = onSchedule({ schedule: "every 5 minutes", region: "africa-south1", timeZone: "Africa/Douala" }, refundExpiredEventQueuesImpl);
