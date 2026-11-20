/* ═══════════════ Commandes admin : événements (phase 1) ═══════════════
   Modèle de données :
   - events/{eventId}            index public (published, activeRevision…) +
                                 champs admin (latestRevision, scheduled…).
   - event_versions/{id}_v{rev}  révisions PUBLIÉES, immuables.
   - event_drafts/{eventId}      brouillon en cours (un seul par événement),
                                 lisible par les admins uniquement.

   Toute commande : requireAdmin + runIdempotent + entrée admin_audit.
   La validation est celle du domaine (validateEventVersion), partagée avec
   l'éditeur. */

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  DEFAULT_EVENTS,
  eventLifecycle,
  normalizeEventVersion,
  validateEventVersion,
  type EventVersion,
} from "../../domain";
import { asObject, db, requireAdmin, requiredString, runIdempotent } from "./core";
import type { DocumentData, Transaction } from "./firestoreTypes";

const EVENT_ID = /^[a-z0-9_]{3,64}$/;

function eventIdFrom(data: Record<string, unknown>, key = "eventId") {
  const eventId = requiredString(data, key, 64);
  if (!EVENT_ID.test(eventId)) throw new HttpsError("invalid-argument", `INVALID_${key.toUpperCase()}`);
  return eventId;
}

function audit(transaction: Transaction, uid: string, action: string, details: Record<string, unknown>, now: number) {
  transaction.create(db.collection("admin_audit").doc(), { uid, action, ...details, createdAt: now });
}

/** Index public d'un événement (lu par les joueurs : rien de secret ici). */
function publicIndex(version: EventVersion) {
  return {
    id: version.eventId, title: version.title, mode: version.mode,
    startsAt: version.startsAt, endsAt: version.endsAt,
    imageUrl: version.imageUrl ?? null, theme: version.theme,
  };
}

async function loadVersion(eventId: string, revision: number): Promise<EventVersion | null> {
  const snap = await db.doc(`event_versions/${eventId}_v${revision}`).get();
  if (snap.exists) return normalizeEventVersion(snap.data());
  const fallback = DEFAULT_EVENTS.find((event) => event.eventId === eventId && event.revision === revision);
  return fallback ?? null;
}

function summary(index: DocumentData, draft: DocumentData | undefined, active: EventVersion | null, now: number) {
  const base = active ?? (draft ? normalizeEventVersion(draft.version) : null);
  const lifecycle = index.archived === true
    ? "archived"
    : index.published === true && active
      ? eventLifecycle(active, now)
      : index.scheduledRevision ? "scheduled" : "draft";
  return {
    eventId: String(index.id ?? base?.eventId ?? ""),
    title: String(base?.title ?? index.title ?? ""),
    mode: base?.mode ?? index.mode ?? "pve",
    imageUrl: base?.imageUrl ?? null,
    startsAt: Number(base?.startsAt ?? index.startsAt ?? 0),
    endsAt: Number(base?.endsAt ?? index.endsAt ?? 0),
    lifecycle,
    activeRevision: index.published === true ? Number(index.activeRevision ?? 0) || null : null,
    latestRevision: Number(index.latestRevision ?? index.activeRevision ?? 0),
    scheduledRevision: index.scheduledRevision ?? null,
    scheduledAt: index.scheduledAt ?? null,
    hasDraft: Boolean(draft),
    draftUpdatedAt: draft?.updatedAt ?? null,
    updatedAt: Number(index.updatedAt ?? 0),
  };
}

/* ─────────────── Lectures ─────────────── */

export async function listAdminEventsHandler(request: CallableRequest<unknown>) {
  requireAdmin(request);
  const now = Date.now();
  const [indexSnap, draftSnap] = await Promise.all([db.collection("events").get(), db.collection("event_drafts").get()]);
  const drafts = new Map(draftSnap.docs.map((doc) => [doc.id, doc.data() as DocumentData]));
  const indexes = new Map(indexSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() } as DocumentData]));
  for (const id of drafts.keys()) if (!indexes.has(id)) indexes.set(id, { id, published: false });
  const events = await Promise.all([...indexes.values()].map(async (index) => {
    const active = index.published === true || index.archived === true
      ? await loadVersion(String(index.id), Number(index.activeRevision ?? 1))
      : null;
    return summary(index, drafts.get(String(index.id)), active, now);
  }));
  events.sort((a, b) => b.updatedAt - a.updatedAt || a.eventId.localeCompare(b.eventId));
  return { events, now };
}

export async function getAdminEventHandler(request: CallableRequest<unknown>) {
  requireAdmin(request);
  const eventId = eventIdFrom(asObject(request.data));
  const [indexSnap, draftSnap] = await Promise.all([db.doc(`events/${eventId}`).get(), db.doc(`event_drafts/${eventId}`).get()]);
  if (!indexSnap.exists && !draftSnap.exists) throw new HttpsError("not-found", "EVENT_NOT_FOUND");
  const index = { id: eventId, ...(indexSnap.data() ?? {}) } as DocumentData;
  const active = indexSnap.exists ? await loadVersion(eventId, Number(index.activeRevision ?? 1)) : null;
  const draft = draftSnap.exists ? normalizeEventVersion(draftSnap.get("version")) : null;
  const working = draft ?? active;
  return {
    summary: summary(index, draftSnap.data(), active, Date.now()),
    active,
    draft,
    /** Ce que l'éditeur doit afficher : le brouillon, sinon la version en ligne. */
    working,
    issues: working ? validateEventVersion(working) : [],
  };
}

/* ─────────────── Écritures ─────────────── */

/** Enregistre le brouillon, même incomplet ; renvoie les erreurs de validation. */
export async function saveEventDraftHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const version = normalizeEventVersion(asObject(data.event));
  if (!EVENT_ID.test(version.eventId)) throw new HttpsError("invalid-argument", "INVALID_EVENTID");
  return runIdempotent(uid, "saveEventDraft", data.idempotencyKey, async (transaction, now) => {
    const indexRef = db.doc(`events/${version.eventId}`);
    const draftRef = db.doc(`event_drafts/${version.eventId}`);
    const indexSnap = await transaction.get(indexRef);
    const latestRevision = Number(indexSnap.get("latestRevision") ?? indexSnap.get("activeRevision") ?? 0);
    const draft = { ...version, revision: latestRevision + 1, published: false };
    transaction.set(draftRef, { eventId: version.eventId, version: draft, baseRevision: latestRevision, updatedAt: now, updatedBy: uid }, { merge: false });
    if (!indexSnap.exists) {
      transaction.set(indexRef, { ...publicIndex(draft), published: false, latestRevision: 0, createdAt: now, updatedAt: now }, { merge: false });
    } else {
      transaction.set(indexRef, { updatedAt: now }, { merge: true });
    }
    audit(transaction, uid, "event_save_draft", { eventId: version.eventId }, now);
    return { eventId: version.eventId, revision: draft.revision, issues: validateEventVersion(draft) };
  });
}

/**
 * Publie le brouillon comme nouvelle révision immuable. Sans `publishAt`
 * (ou passé), la révision devient active tout de suite ; sinon elle est
 * programmée et activée par le job promoteScheduledEventsImpl.
 */
export async function publishEventDraftHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const eventId = eventIdFrom(data);
  const publishAt = data.publishAt === undefined || data.publishAt === null ? null : Number(data.publishAt);
  if (publishAt !== null && !Number.isFinite(publishAt)) throw new HttpsError("invalid-argument", "INVALID_PUBLISHAT");
  return runIdempotent(uid, "publishEventDraft", data.idempotencyKey, async (transaction, now) => {
    const indexRef = db.doc(`events/${eventId}`);
    const draftRef = db.doc(`event_drafts/${eventId}`);
    const [indexSnap, draftSnap] = await Promise.all([transaction.get(indexRef), transaction.get(draftRef)]);
    if (!draftSnap.exists) throw new HttpsError("not-found", "DRAFT_NOT_FOUND");
    const revision = Number(indexSnap.get("latestRevision") ?? indexSnap.get("activeRevision") ?? 0) + 1;
    const version: EventVersion = { ...normalizeEventVersion(draftSnap.get("version")), eventId, revision, published: true };
    delete version.archived;
    const issues = validateEventVersion(version);
    if (issues.length > 0) throw new HttpsError("failed-precondition", "EVENT_INVALID", { issues });
    if (version.endsAt <= now) throw new HttpsError("failed-precondition", "EVENT_ALREADY_ENDED");
    const scheduled = publishAt !== null && publishAt > now;
    transaction.create(db.doc(`event_versions/${eventId}_v${revision}`), { ...version, publishedAt: now, publishedBy: uid });
    transaction.delete(draftRef);
    transaction.set(indexRef, scheduled
      ? { latestRevision: revision, scheduledRevision: revision, scheduledAt: publishAt, archived: false, updatedAt: now }
      : { ...publicIndex(version), latestRevision: revision, activeRevision: revision, published: true, archived: false, scheduledRevision: null, scheduledAt: null, updatedAt: now },
    { merge: true });
    audit(transaction, uid, scheduled ? "event_schedule" : "event_publish", { eventId, revision, publishAt }, now);
    return { eventId, revision, scheduled, publishAt: scheduled ? publishAt : now };
  });
}

/** Annule une publication programmée (la révision reste dans l'historique). */
export async function cancelScheduledEventHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const eventId = eventIdFrom(data);
  return runIdempotent(uid, "cancelScheduledEvent", data.idempotencyKey, async (transaction, now) => {
    const indexRef = db.doc(`events/${eventId}`);
    const indexSnap = await transaction.get(indexRef);
    if (!indexSnap.get("scheduledRevision")) throw new HttpsError("failed-precondition", "NOTHING_SCHEDULED");
    transaction.set(indexRef, { scheduledRevision: null, scheduledAt: null, updatedAt: now }, { merge: true });
    audit(transaction, uid, "event_cancel_schedule", { eventId, revision: indexSnap.get("scheduledRevision") }, now);
    return { eventId, cancelled: true };
  });
}

/** Copie un événement (brouillon ou version en ligne) sous un nouvel identifiant. */
export async function duplicateEventHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const sourceId = eventIdFrom(data);
  const newEventId = eventIdFrom(data, "newEventId");
  return runIdempotent(uid, "duplicateEvent", data.idempotencyKey, async (transaction, now) => {
    const [sourceIndex, sourceDraft, targetIndex, targetDraft] = await Promise.all([
      transaction.get(db.doc(`events/${sourceId}`)), transaction.get(db.doc(`event_drafts/${sourceId}`)),
      transaction.get(db.doc(`events/${newEventId}`)), transaction.get(db.doc(`event_drafts/${newEventId}`)),
    ]);
    if (targetIndex.exists || targetDraft.exists) throw new HttpsError("already-exists", "EVENT_ID_TAKEN");
    let source: EventVersion | null = sourceDraft.exists ? normalizeEventVersion(sourceDraft.get("version")) : null;
    if (!source && sourceIndex.exists) {
      const versionSnap = await transaction.get(db.doc(`event_versions/${sourceId}_v${Number(sourceIndex.get("activeRevision") ?? 1)}`));
      source = versionSnap.exists ? normalizeEventVersion(versionSnap.data()) : DEFAULT_EVENTS.find((event) => event.eventId === sourceId) ?? null;
    }
    if (!source) throw new HttpsError("not-found", "EVENT_NOT_FOUND");
    const copy: EventVersion = { ...source, eventId: newEventId, revision: 1, published: false, title: `${source.title} (copie)`.slice(0, 60) };
    delete copy.archived;
    transaction.set(db.doc(`event_drafts/${newEventId}`), { eventId: newEventId, version: copy, baseRevision: 0, updatedAt: now, updatedBy: uid }, { merge: false });
    transaction.set(db.doc(`events/${newEventId}`), { ...publicIndex(copy), published: false, latestRevision: 0, createdAt: now, updatedAt: now }, { merge: false });
    audit(transaction, uid, "event_duplicate", { eventId: sourceId, newEventId }, now);
    return { eventId: newEventId };
  });
}

/** Archive (retire des joueurs) ou désarchive un événement. */
export async function archiveEventHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const eventId = eventIdFrom(data);
  const archived = data.archived !== false;
  return runIdempotent(uid, "archiveEvent", data.idempotencyKey, async (transaction, now) => {
    const indexRef = db.doc(`events/${eventId}`);
    const indexSnap = await transaction.get(indexRef);
    if (!indexSnap.exists) throw new HttpsError("not-found", "EVENT_NOT_FOUND");
    const hasActive = Number(indexSnap.get("activeRevision") ?? 0) > 0;
    transaction.set(indexRef, archived
      ? { archived: true, published: false, scheduledRevision: null, scheduledAt: null, updatedAt: now }
      : { archived: false, published: hasActive, updatedAt: now },
    { merge: true });
    audit(transaction, uid, archived ? "event_archive" : "event_unarchive", { eventId }, now);
    return { eventId, archived };
  });
}

/** Supprime le brouillon en cours (la version en ligne n'est pas touchée). */
export async function discardEventDraftHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const eventId = eventIdFrom(data);
  return runIdempotent(uid, "discardEventDraft", data.idempotencyKey, async (transaction, now) => {
    const indexRef = db.doc(`events/${eventId}`);
    const [indexSnap, draftSnap] = await Promise.all([transaction.get(indexRef), transaction.get(db.doc(`event_drafts/${eventId}`))]);
    if (!draftSnap.exists) throw new HttpsError("not-found", "DRAFT_NOT_FOUND");
    transaction.delete(db.doc(`event_drafts/${eventId}`));
    // Un événement jamais publié n'a plus de raison d'exister.
    if (indexSnap.exists && Number(indexSnap.get("latestRevision") ?? 0) === 0) transaction.delete(indexRef);
    audit(transaction, uid, "event_discard_draft", { eventId }, now);
    return { eventId, discarded: true };
  });
}

/* ─────────────── Bibliothèque d'images (uploads) ─────────────── */

export async function listAdminUploadsHandler(request: CallableRequest<unknown>) {
  requireAdmin(request);
  const data = asObject(request.data ?? {});
  const kind = typeof data.kind === "string" ? data.kind : null;
  let query = db.collection("admin_uploads").orderBy("createdAt", "desc").limit(60);
  if (kind) query = db.collection("admin_uploads").where("kind", "==", kind).orderBy("createdAt", "desc").limit(60);
  const snap = await query.get();
  return { uploads: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
}

/* ─────────────── Statistiques ─────────────── */

export async function getAdminEventStatsHandler(request: CallableRequest<unknown>) {
  requireAdmin(request);
  const eventId = eventIdFrom(asObject(request.data));
  const runs = await db.collection("event_runs").where("eventId", "==", eventId).get();
  const byStatus: Record<string, number> = {};
  const reachedStage: number[] = [];
  const players = new Set<string>();
  for (const doc of runs.docs) {
    const run = doc.data() ?? {};
    const status = String(run.status ?? "active");
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    players.add(String(run.uid));
    const stageIndex = Math.max(0, Number(run.stageIndex ?? 0));
    // Un parcours complété a franchi toutes les tables jusqu'à stageIndex inclus.
    const reached = status === "completed" ? stageIndex + 1 : stageIndex;
    for (let index = 0; index <= reached; index += 1) reachedStage[index] = (reachedStage[index] ?? 0) + 1;
  }
  return {
    eventId,
    runs: runs.size,
    players: players.size,
    active: (byStatus.active ?? 0) + (byStatus.matchmaking ?? 0),
    eliminated: byStatus.eliminated ?? 0,
    completed: byStatus.completed ?? 0,
    abandoned: byStatus.abandoned ?? 0,
    byStatus,
    /** funnel[i] = parcours ayant atteint la table i (funnel[n] = complétés). */
    funnel: Array.from({ length: reachedStage.length }, (_, index) => reachedStage[index] ?? 0),
  };
}

/* ─────────────── Job : publication programmée ─────────────── */

export async function promoteScheduledEventsImpl(now = Date.now()) {
  const due = await db.collection("events").where("scheduledAt", "<=", now).get();
  let promoted = 0;
  for (const doc of due.docs) {
    const revision = Number(doc.get("scheduledRevision") ?? 0);
    if (!revision) continue;
    await db.runTransaction(async (transaction) => {
      const indexRef = db.doc(`events/${doc.id}`);
      const fresh = await transaction.get(indexRef);
      if (Number(fresh.get("scheduledRevision") ?? 0) !== revision) return;
      const versionSnap = await transaction.get(db.doc(`event_versions/${doc.id}_v${revision}`));
      if (!versionSnap.exists) {
        transaction.set(indexRef, { scheduledRevision: null, scheduledAt: null }, { merge: true });
        return;
      }
      const version = normalizeEventVersion(versionSnap.data());
      const at = Date.now();
      transaction.set(indexRef, {
        ...publicIndex(version), activeRevision: revision, published: true, archived: false,
        scheduledRevision: null, scheduledAt: null, updatedAt: at,
      }, { merge: true });
      transaction.create(db.collection("admin_audit").doc(), { uid: "system", action: "event_promote", eventId: doc.id, revision, createdAt: at });
      promoted += 1;
    });
  }
  return { promoted };
}

export const promoteScheduledEvents = onSchedule({ schedule: "every 1 minutes", timeZone: "Africa/Douala", region: "africa-south1" }, async () => {
  await promoteScheduledEventsImpl();
});
