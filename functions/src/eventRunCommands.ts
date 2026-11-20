/* ═══════════════ Parcours d'événement : sauver une vie (phase 4) ═══════════════
   Un parcours éliminé peut racheter une vie en cauris, dans la fenêtre et
   la limite fixées par la fiche (revive). Débit + ledger dans la même
   transaction que la remise en jeu du parcours. */

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { canRevive, normalizeEventVersion } from "../../domain";
import { asObject, db, economyFrom, ledger, requireUid, requiredString, runIdempotent, stableId } from "./core";

const REFUSALS: Record<string, string> = {
  disabled: "REVIVE_DISABLED",
  not_eliminated: "RUN_NOT_ELIMINATED",
  max_reached: "REVIVE_LIMIT_REACHED",
  window_expired: "REVIVE_WINDOW_EXPIRED",
};

export async function reviveEventRunHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const runId = requiredString(data, "runId", 96);
  return runIdempotent(uid, "reviveEventRun", data.idempotencyKey, async (transaction, now) => {
    const runRef = db.doc(`event_runs/${runId}`);
    const economyRef = db.doc(`economies/${uid}`);
    const [runSnap, economySnap] = await Promise.all([transaction.get(runRef), transaction.get(economyRef)]);
    if (!runSnap.exists || runSnap.get("uid") !== uid) throw new HttpsError("not-found", "EVENT_RUN_NOT_FOUND");
    if (!economySnap.exists) throw new HttpsError("failed-precondition", "PROFILE_NOT_INITIALIZED");
    const version = normalizeEventVersion(runSnap.get("versionSnapshot"));
    const revivesUsed = Number(runSnap.get("revivesUsed") ?? 0);
    const check = canRevive({ status: String(runSnap.get("status")), eliminatedAt: runSnap.get("eliminatedAt") ?? null, revivesUsed }, version.revive, now);
    if (!check.ok) throw new HttpsError("failed-precondition", REFUSALS[check.reason ?? "disabled"]);
    // L'événement doit être encore ouvert pour rejouer.
    if (version.endsAt <= now) throw new HttpsError("failed-precondition", "EVENT_ENDED");
    const economy = economyFrom(economySnap.data(), now);
    if (economy.spendingBlocked || economy.debtCauris > 0) throw new HttpsError("failed-precondition", "SPENDING_BLOCKED");
    if (economy.cauris < check.price) throw new HttpsError("resource-exhausted", "INSUFFICIENT_CAURIS");
    const next = { ...economy, cauris: economy.cauris - check.price };
    transaction.set(economyRef, next, { merge: false });
    ledger(transaction, uid, stableId(uid, "event-revive", runId, String(revivesUsed)), "reviveEventRun", { cauris: -check.price }, next, now, {
      eventId: version.eventId, runId, revive: revivesUsed + 1,
    });
    const losses = Math.max(0, Number(runSnap.get("losses") ?? 0) - 1);
    const status = version.mode === "pvp" ? "matchmaking" : "active";
    transaction.update(runRef, {
      status, losses, revivesUsed: revivesUsed + 1,
      reviveCaurisSpent: Number(runSnap.get("reviveCaurisSpent") ?? 0) + check.price,
      eliminatedAt: null, lastRevivedAt: now, currentMatchId: null, updatedAt: now,
    });
    return { runId, status, losses, revivesUsed: revivesUsed + 1, price: check.price, cauris: next.cauris };
  });
}
