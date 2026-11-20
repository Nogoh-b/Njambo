/* Test d'intégration des campagnes de notifications contre un vrai Postgres
   (l'envoi push FCM est remplacé par un faux expéditeur).
   Usage : npm --prefix server run build && DATABASE_URL=… node server/scripts/smoke-campaigns.cjs
   ⚠️ Écrit dans la base visée : utiliser une base JETABLE. */
const path = require("path");
const dist = path.join(__dirname, "..", "dist");
const { createPgFirestore } = require(path.join(dist, "server/src/firestoreCompat/pg.js"));
const core = require(path.join(dist, "functions/src/core.js"));
const admin = require(path.join(dist, "functions/src/eventAdminCommands.js"));
const camp = require(path.join(dist, "functions/src/campaignCommands.js"));
const { blankEventVersion } = require(path.join(dist, "domain/index.js"));
const key = () => "k_" + Math.random().toString(36).slice(2) + Date.now();
const as = (uid, data, isAdmin = false) => ({ auth: { uid, token: isAdmin ? { admin: true } : {} }, data: { idempotencyKey: key(), ...data } });
const assert = (cond, msg) => { if (!cond) { console.error("ÉCHEC:", msg); process.exit(1); } console.log("ok -", msg); };
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis (base jetable)"); process.exit(1); }

(async () => {
  core.setDbBackend(await createPgFirestore(process.env.DATABASE_URL));
  const sent = [];
  camp.setPushSender(async (tokens, message) => { sent.push({ tokens, message }); return tokens.map((t) => (t === "tok_mort" ? { success: false, errorCode: "messaging/registration-token-not-registered" } : { success: true })); });
  const now = Date.now();
  const players = ["p_actif", "p_inscrit_fini", "p_jamais", "p_optout"];
  for (const uid of players) await core.db.doc(`players/${uid}`).set({ uid, name: uid });
  await core.db.doc("players/p_optout").set({ notificationPrefs: { events: false } }, { merge: true });
  await core.db.doc("push_tokens/p_actif/tokens/a").set({ token: "tok_actif", active: true });
  await core.db.doc("push_tokens/p_jamais/tokens/a").set({ token: "tok_mort", active: true });
  await core.db.doc("push_tokens/p_optout/tokens/a").set({ token: "tok_optout", active: true });

  const base = blankEventVersion("fete_notifs", now);
  const event = { ...base, startsAt: now - 60_000, endsAt: now + 10 * 3_600_000, notifications: [
    { id: "ouverture", trigger: "opening", title: "C'est ouvert", body: "La fête commence", audience: "all" },
    { id: "fin", trigger: "before_end", offsetMinutes: 120, title: "Dernières heures", body: "Termine ton parcours", audience: "active_run" },
    { id: "relance", trigger: "at", at: now + 3_600_000, title: "Tu viens ?", body: "Rejoins la fête", audience: "not_joined" },
  ] };
  await admin.saveEventDraftHandler(as("adm", { event }, true));
  await admin.publishEventDraftHandler(as("adm", { eventId: "fete_notifs" }, true));
  let list = (await camp.listCampaignsHandler(as("adm", {}, true))).campaigns;
  assert(list.filter((c) => c.eventId === "fete_notifs" && c.status === "scheduled").length === 3, "3 campagnes programmées à la publication");
  await core.db.doc("event_runs/r1").set({ uid: "p_actif", eventId: "fete_notifs", status: "active" });
  await core.db.doc("event_runs/r2").set({ uid: "p_inscrit_fini", eventId: "fete_notifs", status: "eliminated" });

  // Ouverture : tout le monde (sauf opt-out)
  await camp.sendDueCampaignsImpl(now + 1000);
  const opening = (await core.db.doc("notification_campaigns/ev_fete_notifs_ouverture").get()).data();
  assert(opening.status === "sent" && opening.stats.targeted === 4 && opening.stats.inApp === 3 && opening.stats.optedOut === 1, "ouverture : 3 joueurs notifiés, opt-out respecté");
  assert(!sent.some((s) => s.tokens.includes("tok_optout")), "aucun push vers le joueur qui a refusé");
  assert(opening.stats.tokensInvalidated === 1 && (await core.db.doc("push_tokens/p_jamais/tokens/a").get()).get("active") === false, "jeton invalide désactivé");
  const inApp = await core.db.doc("users/p_jamais/notifications/camp_ev_fete_notifs_ouverture").get();
  assert(inApp.exists && inApp.get("type") === "event" && inApp.get("eventId") === "fete_notifs", "notification in-app vers le détail de l'événement");
  assert(sent[0].message.link === "/?event=fete_notifs", "lien push vers l'événement");

  // Relance « pas encore inscrits » à +1 h
  const before = sent.length;
  await camp.sendDueCampaignsImpl(now + 3_600_000 + 1000);
  const relance = (await core.db.doc("notification_campaigns/ev_fete_notifs_relance").get()).data();
  assert(relance.status === "sent" && relance.stats.targeted === 2 && relance.stats.inApp === 1, "relance : seulement les non-inscrits (opt-out exclu)");
  assert(!(await core.db.doc("users/p_actif/notifications/camp_ev_fete_notifs_relance").get()).exists, "un inscrit ne reçoit pas la relance");
  void before;

  // Avant la fin : seulement les parcours en cours
  await camp.sendDueCampaignsImpl(now + 8 * 3_600_000 + 1000);
  const fin = (await core.db.doc("notification_campaigns/ev_fete_notifs_fin").get()).data();
  assert(fin.status === "sent" && fin.stats.targeted === 1 && fin.stats.pushSent === 1, "fin : seulement le joueur en cours de parcours");

  // Une seule fois, même si on republie
  const pushes = sent.length;
  await admin.saveEventDraftHandler(as("adm", { event: { ...event, title: "Fête v2" } }, true));
  await admin.publishEventDraftHandler(as("adm", { eventId: "fete_notifs" }, true));
  await camp.sendDueCampaignsImpl(now + 9 * 3_600_000);
  assert(sent.length === pushes, "republier ne renvoie pas les campagnes déjà parties");

  // Campagne libre programmée puis annulée ; campagne immédiate
  const manual = await camp.createCampaignHandler(as("adm", { title: "Maintenance", body: "Pause ce soir 22 h", audience: "all", sendAt: now + 7_200_000 }, true));
  await camp.cancelCampaignHandler(as("adm", { campaignId: manual.campaignId }, true));
  await camp.sendDueCampaignsImpl(now + 7_300_000);
  assert((await core.db.doc(`notification_campaigns/${manual.campaignId}`).get()).get("status") === "cancelled", "campagne annulée jamais envoyée");
  try { await camp.createCampaignHandler(as("adm", { title: "x", body: "yy", audience: "active_run" }, true)); assert(false, "audience"); }
  catch (e) { assert(e.message === "EVENT_REQUIRED_FOR_AUDIENCE", "audience ciblée sans événement refusée"); }
  const now2 = await camp.createCampaignHandler(as("adm", { title: "Bonus du soir", body: "Double Nkap", audience: "all" }, true));
  await camp.sendDueCampaignsImpl(Date.now() + 10);
  assert((await core.db.doc(`notification_campaigns/${now2.campaignId}`).get()).get("status") === "sent", "campagne immédiate envoyée");

  // Archivage : campagnes en attente annulées
  const ev2 = { ...blankEventVersion("fete_archivee", now), startsAt: now - 1000, endsAt: now + 3_600_000, notifications: [{ id: "n", trigger: "at", at: now + 1_800_000, title: "Hey", body: "Viens", audience: "all" }] };
  await admin.saveEventDraftHandler(as("adm", { event: ev2 }, true));
  await admin.publishEventDraftHandler(as("adm", { eventId: "fete_archivee" }, true));
  await admin.archiveEventHandler(as("adm", { eventId: "fete_archivee" }, true));
  assert((await core.db.doc("notification_campaigns/ev_fete_archivee_n").get()).get("status") === "cancelled", "archiver annule les campagnes en attente");

  // Préférence joueur
  await camp.setNotificationPrefsHandler(as("p_actif", { events: false }));
  assert((await core.db.doc("players/p_actif").get()).get("notificationPrefs.events") === false, "préférence « alertes d'événements » enregistrée");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
