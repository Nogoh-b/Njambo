/* ═══════════════ Commandes admin : joueurs (support) ═══════════════
   Recherche d'un joueur, consultation de ses parcours d'événement, gestes
   commerciaux (donner un ticket) et réparation d'un parcours bloqué.
   Toute écriture exige un motif et laisse une trace dans admin_audit. */

import { getAuth } from "firebase-admin/auth";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { asObject, db, integer, requireAdmin, requiredString, runIdempotent } from "./core";

const TIERS = ["bronze", "argent", "or"] as const;

async function emailOf(uid: string): Promise<string | null> {
  try { return (await getAuth().getUser(uid)).email ?? null; } catch { return null; }
}

export async function adminSearchPlayersHandler(request: CallableRequest<unknown>) {
  requireAdmin(request);
  const q = requiredString(asObject(request.data), "query", 128);
  const found = new Map<string, { uid: string; name: string; emoji: string; email: string | null }>();
  const add = (uid: string, data: Record<string, unknown> | undefined, email: string | null = null) => {
    if (!found.has(uid)) found.set(uid, { uid, name: String(data?.name ?? "—"), emoji: String(data?.emoji ?? "🎴"), email });
  };
  if (q.includes("@")) {
    try {
      const user = await getAuth().getUserByEmail(q);
      add(user.uid, (await db.doc(`players/${user.uid}`).get()).data(), user.email ?? null);
    } catch { /* email inconnu */ }
  }
  if (/^[A-Za-z0-9_-]{16,128}$/.test(q)) {
    const snap = await db.doc(`players/${q}`).get();
    if (snap.exists) add(q, snap.data());
  }
  const byName = await db.collection("players").where("name", ">=", q).where("name", "<=", `${q}`).limit(20).get();
  byName.docs.forEach((doc) => add(doc.id, doc.data()));
  return { players: [...found.values()].slice(0, 20) };
}

export async function adminGetPlayerHandler(request: CallableRequest<unknown>) {
  requireAdmin(request);
  const uid = requiredString(asObject(request.data), "uid", 128);
  const [player, economy, inventory, runs, email] = await Promise.all([
    db.doc(`players/${uid}`).get(),
    db.doc(`economies/${uid}`).get(),
    db.doc(`inventories/${uid}`).get(),
    db.collection("event_runs").where("uid", "==", uid).get(),
    emailOf(uid),
  ]);
  if (!player.exists && !economy.exists) throw new HttpsError("not-found", "PLAYER_NOT_FOUND");
  return {
    uid,
    email,
    name: String(player.get("name") ?? "—"),
    emoji: String(player.get("emoji") ?? "🎴"),
    crowns: Number(player.get("crowns") ?? 0),
    nkap: Number(economy.get("nkap") ?? 0),
    cauris: Number(economy.get("cauris") ?? 0),
    tickets: { bronze: 0, argent: 0, or: 0, ...(inventory.get("tickets") ?? {}) },
    runs: runs.docs
      .map((doc) => {
        const run = doc.data() ?? {};
        return {
          runId: doc.id,
          eventId: String(run.eventId),
          eventTitle: String(run.versionSnapshot?.title ?? run.eventId),
          revision: Number(run.eventRevision ?? 1),
          status: String(run.status),
          stageIndex: Number(run.stageIndex ?? 0),
          stageCount: Array.isArray(run.versionSnapshot?.stages) ? run.versionSnapshot.stages.length : 0,
          losses: Number(run.losses ?? 0),
          allowedLosses: Number(run.versionSnapshot?.allowedLosses ?? 3),
          inMatch: typeof run.currentMatchId === "string",
          ticketTier: String(run.ticketTier ?? ""),
          createdAt: Number(run.createdAt ?? 0),
          updatedAt: Number(run.updatedAt ?? 0),
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50),
  };
}

/** Geste commercial / réparation : crédite des tickets. */
export async function adminGrantTicketHandler(request: CallableRequest<unknown>) {
  const adminUid = requireAdmin(request);
  const data = asObject(request.data);
  const uid = requiredString(data, "uid", 128);
  const tier = requiredString(data, "tier", 16) as typeof TIERS[number];
  if (!TIERS.includes(tier)) throw new HttpsError("invalid-argument", "INVALID_TIER");
  const amount = integer(data, "amount", 1, 10);
  const reason = requiredString(data, "reason", 200);
  return runIdempotent(adminUid, "adminGrantTicket", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`inventories/${uid}`);
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "PLAYER_NOT_FOUND");
    const tickets = { bronze: 0, argent: 0, or: 0, ...(snap.get("tickets") ?? {}) } as Record<string, number>;
    tickets[tier] = Number(tickets[tier] ?? 0) + amount;
    transaction.set(ref, { tickets, updatedAt: now }, { merge: true });
    transaction.create(db.collection("admin_audit").doc(), { uid: adminUid, action: "player_grant_ticket", targetUid: uid, tier, amount, reason, createdAt: now });
    return { uid, tickets };
  });
}

/**
 * Répare un parcours : `restart` le remet à la table 1 avec toutes ses vies
 * (sans nouveau ticket), `close` le termine (le joueur pourra en racheter un).
 * Refusé pendant une partie en cours.
 */
export async function adminResetEventRunHandler(request: CallableRequest<unknown>) {
  const adminUid = requireAdmin(request);
  const data = asObject(request.data);
  const runId = requiredString(data, "runId", 96);
  const mode = requiredString(data, "mode", 16);
  if (mode !== "restart" && mode !== "close") throw new HttpsError("invalid-argument", "INVALID_MODE");
  const reason = requiredString(data, "reason", 200);
  return runIdempotent(adminUid, "adminResetEventRun", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`event_runs/${runId}`);
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "EVENT_RUN_NOT_FOUND");
    if (typeof snap.get("currentMatchId") === "string") throw new HttpsError("failed-precondition", "RUN_IN_MATCH");
    const before = { status: snap.get("status"), stageIndex: snap.get("stageIndex"), losses: snap.get("losses") };
    const update = mode === "restart"
      ? { status: snap.get("mode") === "pvp" ? "matchmaking" : "active", stageIndex: 0, losses: 0, currentMatchId: null, resetAt: now, resetBy: adminUid, updatedAt: now }
      : { status: "left", currentMatchId: null, leftAt: now, closedBy: adminUid, updatedAt: now };
    transaction.update(ref, update);
    transaction.create(db.collection("admin_audit").doc(), {
      uid: adminUid, action: mode === "restart" ? "event_run_restart" : "event_run_close",
      runId, targetUid: snap.get("uid"), eventId: snap.get("eventId"), before, reason, createdAt: now,
    });
    return { runId, status: update.status };
  });
}
