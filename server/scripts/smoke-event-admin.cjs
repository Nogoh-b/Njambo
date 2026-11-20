/* Test d'intégration des commandes admin événements contre un vrai Postgres.
   Usage : npm --prefix server run build && DATABASE_URL=postgres://… node server/scripts/smoke-event-admin.cjs
   ⚠️ Écrit dans la base visée : utiliser une base JETABLE. */
const path = require("path");
const dist = path.join(__dirname, "..", "dist");

const { createPgFirestore } = require(path.join(dist, "server/src/firestoreCompat/pg.js"));
const core = require(path.join(dist, "functions/src/core.js"));
const c = require(path.join(dist, "functions/src/eventAdminCommands.js"));
const { blankEventVersion } = require(path.join(dist, "domain/index.js"));
const admin = (data) => ({ auth: { uid: "admin1", token: { admin: true } }, data: { idempotencyKey: "k_" + Math.random(), ...data } });
const assert = (cond, msg) => { if (!cond) { console.error("ÉCHEC:", msg); process.exit(1); } console.log("ok -", msg); };
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis (base jetable)"); process.exit(1); }
(async () => {
  core.setDbBackend(await createPgFirestore(process.env.DATABASE_URL));
  const now = Date.now();
  try { await c.listAdminEventsHandler({ auth: { uid: "u", token: {} }, data: {} }); assert(false, "non-admin refusé"); } catch (e) { assert(e.code === "permission-denied", "non-admin refusé"); }
  const ev = { ...blankEventVersion("fete_du_ndole", now), startsAt: now - 1000, endsAt: now + 86400000 };
  const saved = await c.saveEventDraftHandler(admin({ event: ev }));
  assert(saved.revision === 1 && saved.issues.length === 0, "brouillon enregistré rév. 1 sans erreur");
  let list = await c.listAdminEventsHandler(admin({}));
  assert(list.events.find((e) => e.eventId === "fete_du_ndole")?.lifecycle === "draft", "liste : statut draft");
  const bad = await c.saveEventDraftHandler(admin({ event: { ...ev, stages: [] } }));
  assert(bad.issues.some((i) => i.path === "stages"), "brouillon invalide enregistré avec erreurs");
  try { await c.publishEventDraftHandler(admin({ eventId: "fete_du_ndole" })); assert(false, "publication invalide refusée"); }
  catch (e) { assert(e.message === "EVENT_INVALID" && e.details.issues.length > 0, "publication invalide refusée avec détails"); }
  await c.saveEventDraftHandler(admin({ event: ev }));
  const pub = await c.publishEventDraftHandler(admin({ eventId: "fete_du_ndole" }));
  assert(pub.revision === 1 && !pub.scheduled, "publication immédiate rév. 1");
  let detail = await c.getAdminEventHandler(admin({ eventId: "fete_du_ndole" }));
  assert(detail.summary.lifecycle === "live" && detail.draft === null && detail.active.revision === 1, "détail : en ligne, sans brouillon");
  // Révision 2 programmée
  await c.saveEventDraftHandler(admin({ event: { ...ev, title: "Fête du Ndolè v2" } }));
  const sch = await c.publishEventDraftHandler(admin({ eventId: "fete_du_ndole", publishAt: now + 60_000 }));
  assert(sch.scheduled && sch.revision === 2, "rév. 2 programmée");
  let p = await c.promoteScheduledEventsImpl(now + 1000);
  assert(p.promoted === 0, "pas promue avant l'heure");
  p = await c.promoteScheduledEventsImpl(now + 120_000);
  assert(p.promoted === 1, "promue à l'heure");
  detail = await c.getAdminEventHandler(admin({ eventId: "fete_du_ndole" }));
  assert(detail.active.revision === 2 && detail.active.title === "Fête du Ndolè v2", "version active = rév. 2");
  const dup = await c.duplicateEventHandler(admin({ eventId: "fete_du_ndole", newEventId: "fete_du_ndole_2" }));
  detail = await c.getAdminEventHandler(admin({ eventId: dup.eventId }));
  assert(detail.summary.lifecycle === "draft" && detail.draft.title.includes("copie"), "duplication en brouillon");
  try { await c.duplicateEventHandler(admin({ eventId: "fete_du_ndole", newEventId: "fete_du_ndole_2" })); assert(false, "id déjà pris"); } catch (e) { assert(e.code === "already-exists", "duplication vers un id pris refusée"); }
  await c.discardEventDraftHandler(admin({ eventId: "fete_du_ndole_2" }));
  list = await c.listAdminEventsHandler(admin({}));
  assert(!list.events.some((e) => e.eventId === "fete_du_ndole_2"), "brouillon jamais publié supprimé");
  await c.archiveEventHandler(admin({ eventId: "fete_du_ndole" }));
  list = await c.listAdminEventsHandler(admin({}));
  assert(list.events.find((e) => e.eventId === "fete_du_ndole").lifecycle === "archived", "archivé");
  const pubIndex = await core.db.doc("events/fete_du_ndole").get();
  assert(pubIndex.get("published") === false, "archivé = invisible des joueurs");
  await c.archiveEventHandler(admin({ eventId: "fete_du_ndole", archived: false }));
  assert((await core.db.doc("events/fete_du_ndole").get()).get("published") === true, "désarchivé = de nouveau visible");
  // Idempotence : même clé = un seul effet
  const key = { idempotencyKey: "same_key_123" };
  await c.saveEventDraftHandler(admin({ event: ev, ...key }));
  const r1 = await c.publishEventDraftHandler({ ...admin({ eventId: "fete_du_ndole" }), data: { eventId: "fete_du_ndole", ...key } });
  const r2 = await c.publishEventDraftHandler({ ...admin({ eventId: "fete_du_ndole" }), data: { eventId: "fete_du_ndole", ...key } });
  assert(r1.revision === r2.revision && r1.revision === 3, "double clic publier = une seule révision");
  await core.db.doc("event_runs/r1").set({ uid: "a", eventId: "fete_du_ndole", status: "completed", stageIndex: 0 });
  await core.db.doc("event_runs/r2").set({ uid: "b", eventId: "fete_du_ndole", status: "eliminated", stageIndex: 0 });
  const stats = await c.getAdminEventStatsHandler(admin({ eventId: "fete_du_ndole" }));
  assert(stats.runs === 2 && stats.completed === 1 && stats.eliminated === 1 && stats.funnel.join() === "2,1", "statistiques et entonnoir");
  const audit = await core.db.collection("admin_audit").get();
  assert(audit.size >= 10, `audit consigné (${audit.size} entrées)`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
