/* Test d'intégration des saisons contre un vrai Postgres : points crédités
   au règlement de vraies tables, réclamation des paliers, achat premium
   (fournisseur simulé), remboursement, statistiques.
   Usage : npm --prefix server run build && DATABASE_URL=… node server/scripts/smoke-seasons.cjs
   ⚠️ Écrit dans la base visée : utiliser une base JETABLE. */
const path = require("path");
const dist = path.join(__dirname, "..", "dist");
const { createPgFirestore } = require(path.join(dist, "server/src/firestoreCompat/pg.js"));
const core = require(path.join(dist, "functions/src/core.js"));
const admin = require(path.join(dist, "functions/src/eventAdminCommands.js"));
const seasons = require(path.join(dist, "functions/src/seasonCommands.js"));
const eco = require(path.join(dist, "functions/src/economyCommands.js"));
const match = require(path.join(dist, "functions/src/matchCommands.js"));
const { autoPlayExpiredMatchesImpl } = require(path.join(dist, "functions/src/matchTimeouts.js"));
const { blankEventVersion } = require(path.join(dist, "domain/index.js"));
const key = () => "k_" + Math.random().toString(36).slice(2) + Date.now();
const as = (uid, data, isAdmin = false) => ({ auth: { uid, token: isAdmin ? { admin: true } : {} }, data: { idempotencyKey: key(), ...data } });
const assert = (cond, msg) => { if (!cond) { console.error("ÉCHEC:", msg); process.exit(1); } console.log("ok -", msg); };
const refused = async (fn, message) => { try { await fn(); return false; } catch (e) { if (e.message !== message) console.error(e); return e.message === message; } };
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis (base jetable)"); process.exit(1); }
async function playToEnd(matchId) {
  for (let i = 0; i < 400; i += 1) {
    const snap = await core.db.doc(`matches/${matchId}`).get();
    if (snap.get("status") !== "playing") return;
    await core.db.doc(`matches/${matchId}`).set({ actionDeadlineAt: 0 }, { merge: true });
    await autoPlayExpiredMatchesImpl();
  }
}

(async () => {
  core.setDbBackend(await createPgFirestore(process.env.DATABASE_URL));
  const now = Date.now();
  const uid = "joueurSaison0000000001";
  await core.db.doc(`users/${uid}`).set({ ageBand: "18_plus" });
  await core.db.doc(`players/${uid}`).set({ uid, name: "Sawa", emoji: "🌊" });
  await core.db.doc(`economies/${uid}`).set({ nkap: 5000, cauris: 0 });
  await core.db.doc(`inventories/${uid}`).set({ tickets: { bronze: 30 } });

  assert(await refused(() => seasons.saveSeasonHandler(as("adm", { season: { id: "s1", title: "Saison", startsAt: now, endsAt: now - 1, tiers: [] } }, true)), "SEASON_INVALID"), "saison invalide refusée");
  await seasons.saveSeasonHandler(as("adm", { season: {
    id: "saison_ndop", title: "Saison du Ndop", startsAt: now - 1000, endsAt: now + 30 * 86_400_000, premiumPriceXaf: 1500, published: true,
    tiers: [
      { points: 20, freeReward: [{ type: "nkap", amount: 300 }], premiumReward: [{ type: "cauris", amount: 40 }] },
      { points: 1000, freeReward: [{ type: "nkap", amount: 900 }], premiumReward: [] },
    ],
  } }, true));
  const base = blankEventVersion("event_saison", now);
  await admin.saveEventDraftHandler(as("adm", { event: { ...base, startsAt: now - 1000, endsAt: now + 3_600_000, seasonId: "saison_ndop",
    stages: [{ ...base.stages[0], playerCount: 2, seasonPoints: 25, difficulty: "facile" }, { ...base.stages[0], id: "table_2", order: 2, title: "Table 2", playerCount: 2, seasonPoints: 25, difficulty: "facile" }] } }, true));
  await admin.publishEventDraftHandler(as("adm", { eventId: "event_saison" }, true));

  let runId = null; let won = 0; let tries = 0;
  while (!won && tries < 30) {
    tries += 1;
    const run = runId ? (await core.db.doc(`event_runs/${runId}`).get()).data() : null;
    if (!run || ["eliminated", "completed"].includes(run.status)) runId = (await eco.joinEventHandler(as(uid, { eventId: "event_saison" }))).runId;
    const started = await match.startMatchHandler(as(uid, { mode: "event", eventRunId: runId }));
    await playToEnd(started.matchId);
    won = Number((await core.db.doc(`event_runs/${runId}`).get()).get("seasonPointsEarned") ?? 0);
  }
  assert(won === 25, `25 points de saison gagnés en validant une table (${tries} partie(s))`);
  let mine = (await seasons.getSeasonsHandler(as(uid, {}))).seasons[0];
  assert(mine && mine.progress.points === 25 && mine.phase === "live", "progression visible par le joueur");

  assert(await refused(() => seasons.claimSeasonTierHandler(as(uid, { seasonId: "saison_ndop", tierIndex: 1, track: "free" })), "TIER_LOCKED"), "palier non atteint refusé");
  assert(await refused(() => seasons.claimSeasonTierHandler(as(uid, { seasonId: "saison_ndop", tierIndex: 0, track: "premium" })), "PREMIUM_REQUIRED"), "palier premium refusé sans passe");
  const nkap0 = (await core.db.doc(`economies/${uid}`).get()).get("nkap");
  await seasons.claimSeasonTierHandler(as(uid, { seasonId: "saison_ndop", tierIndex: 0, track: "free" }));
  assert((await core.db.doc(`economies/${uid}`).get()).get("nkap") === nkap0 + 300, "palier gratuit réclamé : +300 Nkap");
  assert(await refused(() => seasons.claimSeasonTierHandler(as(uid, { seasonId: "saison_ndop", tierIndex: 0, track: "free" })), "ALREADY_CLAIMED"), "pas de double réclamation");

  const intent = await eco.createPaymentIntentHandler(as(uid, { offerId: "season_premium:saison_ndop", provider: "simulated" }));
  assert(intent.amountXaf === 1500, "commande premium à 1 500 XAF");
  await eco.verifyStorePurchaseHandler(as(uid, { orderId: intent.orderId, simulationOutcome: "success" }));
  mine = (await seasons.getSeasonsHandler(as(uid, {}))).seasons[0];
  assert(mine.progress.premium === true && mine.progress.claimedFree.includes(0), "premium activé après paiement (paliers gratuits conservés)");
  assert(await refused(() => eco.createPaymentIntentHandler(as(uid, { offerId: "season_premium:saison_ndop", provider: "simulated" })), "SEASON_PREMIUM_OWNED"), "pas de second achat du premium");
  await seasons.claimSeasonTierHandler(as(uid, { seasonId: "saison_ndop", tierIndex: 0, track: "premium" }));
  assert((await core.db.doc(`economies/${uid}`).get()).get("cauris") === 40, "palier premium déjà atteint réclamable : +40 cauris");

  const stats = await seasons.getSeasonStatsHandler(as("adm", { seasonId: "saison_ndop" }, true));
  assert(stats.players === 1 && stats.premium === 1 && stats.premiumRevenueXaf === 1500 && stats.tiers[0].claimedPremium === 1, "statistiques admin de la saison");

  await eco.verifyStorePurchaseHandler(as(uid, { orderId: intent.orderId, simulationOutcome: "refunded" }));
  mine = (await seasons.getSeasonsHandler(as(uid, {}))).seasons[0];
  assert(mine.progress.premium === false, "remboursement : premium retiré");

  // Saison terminée : plus de points
  await core.db.doc("seasons/saison_ndop").set({ endsAt: Date.now() - 1000 }, { merge: true });
  const before = (await core.db.doc(`season_progress/saison_ndop_${uid}`).get()).get("points");
  let extra = 0; let n = 0;
  while (n < 6) {
    n += 1;
    const run = (await core.db.doc(`event_runs/${runId}`).get()).data();
    if (["eliminated", "completed"].includes(run.status)) runId = (await eco.joinEventHandler(as(uid, { eventId: "event_saison" }))).runId;
    const started = await match.startMatchHandler(as(uid, { mode: "event", eventRunId: runId }));
    await playToEnd(started.matchId);
    extra = (await core.db.doc(`season_progress/saison_ndop_${uid}`).get()).get("points") - before;
  }
  assert(extra === 0, "aucun point après la fin de la saison");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
