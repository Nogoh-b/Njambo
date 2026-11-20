/* Test d'intégration du classement d'événement contre un vrai Postgres :
   vraies parties d'événement (le serveur joue chaque tour à l'expiration),
   ligne de classement écrite au règlement, rang, distribution finale.
   Usage : npm --prefix server run build && DATABASE_URL=… node server/scripts/smoke-event-leaderboard.cjs
   ⚠️ Écrit dans la base visée : utiliser une base JETABLE. */
const path = require("path");
const dist = path.join(__dirname, "..", "dist");
const { createPgFirestore } = require(path.join(dist, "server/src/firestoreCompat/pg.js"));
const core = require(path.join(dist, "functions/src/core.js"));
const admin = require(path.join(dist, "functions/src/eventAdminCommands.js"));
const lb = require(path.join(dist, "functions/src/eventLeaderboardCommands.js"));
const eco = require(path.join(dist, "functions/src/economyCommands.js"));
const match = require(path.join(dist, "functions/src/matchCommands.js"));
const { autoPlayExpiredMatchesImpl } = require(path.join(dist, "functions/src/matchTimeouts.js"));
const { blankEventVersion } = require(path.join(dist, "domain/index.js"));
const key = () => "k_" + Math.random().toString(36).slice(2) + Date.now();
const as = (uid, data, isAdmin = false) => ({ auth: { uid, token: isAdmin ? { admin: true } : {} }, data: { idempotencyKey: key(), ...data } });
const assert = (cond, msg) => { if (!cond) { console.error("ÉCHEC:", msg); process.exit(1); } console.log("ok -", msg); };
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis (base jetable)"); process.exit(1); }

async function playToEnd(matchId) {
  for (let i = 0; i < 400; i += 1) {
    const snap = await core.db.doc(`matches/${matchId}`).get();
    if (snap.get("status") !== "playing") return snap.data();
    await core.db.doc(`matches/${matchId}`).set({ actionDeadlineAt: 0 }, { merge: true });
    await autoPlayExpiredMatchesImpl();
  }
  throw new Error("partie interminable");
}

(async () => {
  core.setDbBackend(await createPgFirestore(process.env.DATABASE_URL));
  const now = Date.now();
  const uid = "joueurClassement000001";
  await core.db.doc(`players/${uid}`).set({ uid, name: "Ndomè", emoji: "🥁" });
  await core.db.doc(`economies/${uid}`).set({ nkap: 5000, cauris: 20 });
  await core.db.doc(`inventories/${uid}`).set({ tickets: { bronze: 30, argent: 0, or: 0 } });
  await core.db.doc("runtime_config/features").set({ economy: true, authoritativeMatches: true, events: true }, { merge: true });

  const base = blankEventVersion("classement_test", now);
  const event = {
    ...base, startsAt: now - 1000, endsAt: now + 3_600_000, allowedLosses: 3,
    stages: [{ ...base.stages[0], playerCount: 2 }, { ...base.stages[0], id: "table_2", order: 2, title: "Deuxième table", playerCount: 2 }],
    leaderboard: { ...base.leaderboard, enabled: true, minParticipants: 1, rankRewards: [{ fromRank: 1, toRank: 1, reward: [{ type: "cauris", amount: 77 }] }] },
  };
  await admin.saveEventDraftHandler(as("adm", { event }, true));
  await admin.publishEventDraftHandler(as("adm", { eventId: "classement_test" }, true));

  let won = null; let matches = 0; let runId = null;
  while (!won && matches < 40) {
    const runSnap = runId ? await core.db.doc(`event_runs/${runId}`).get() : null;
    if (!runSnap || ["eliminated", "completed"].includes(runSnap.get("status"))) {
      runId = (await eco.joinEventHandler(as(uid, { eventId: "classement_test" }))).runId;
    }
    const started = await match.startMatchHandler(as(uid, { mode: "event", eventRunId: runId }));
    matches += 1;
    const ended = await playToEnd(started.matchId);
    const winner = ended.participants[ended.winnerIndex ?? ended.finalWinnerIndex ?? -1];
    const run = (await core.db.doc(`event_runs/${runId}`).get()).data();
    if (run.score > 0) won = run;
    void winner;
  }
  assert(won, `table d'événement gagnée après ${matches} partie(s)`);
  assert(won.score === 100 && won.scoreBreakdown.stages === 100, "score du parcours = 100 (1 table)");
  const entry = (await core.db.doc(`event_leaderboards/classement_test/entries/${uid}`).get()).data();
  assert(entry && entry.score === 100 && entry.runId === runId && entry.name === "Ndomè", "ligne de classement écrite au règlement");

  // Concurrents fictifs pour vérifier rang et départage
  const fake = (id, score, durationMs) => core.db.doc(`event_leaderboards/classement_test/entries/${id}`).set({ uid: id, eventId: "classement_test", runId: "r_" + id, score, durationMs, reachedAt: 1, stagesWon: 1, livesLeft: 3, perfect: false, completed: false, name: id, emoji: "🙂", updatedAt: 1 });
  await fake("rival_rapide", 100, 1);
  await fake("rival_fort", 540, 999_999_999);
  await fake("rival_lent", 100, 999_999_999);
  const board = await lb.getEventLeaderboardHandler(as(uid, { eventId: "classement_test" }));
  assert(board.enabled && board.participants === 4, "4 participants");
  assert(board.top.map((e) => e.uid).join() === `rival_fort,rival_rapide,${uid},rival_lent`, "ordre : score puis rapidité");
  assert(board.me.rank === 3, "mon rang = 3");
  const { rankOf } = lb;
  assert(await rankOf("classement_test", entry) === 3, "rang par comptage = 3");

  // Fin de l'événement → distribution
  const later = now + 7_200_000;
  const before = (await core.db.doc("economies/rival_fort").get()).data();
  await core.db.doc("economies/rival_fort").set({ nkap: 1000, cauris: 5 });
  await core.db.doc("inventories/rival_fort").set({ tickets: { bronze: 0 } });
  let settled = await lb.settleEventRankingsImpl(now);
  assert(settled.length === 0, "rien n'est réglé avant la fin");
  settled = await lb.settleEventRankingsImpl(later);
  const mine = settled.find((s) => s.eventId === "classement_test");
  assert(mine && mine.rewarded === 1, "1er récompensé à la fin");
  const rivalEco = (await core.db.doc("economies/rival_fort").get()).data();
  assert(rivalEco.cauris === 82, "77 cauris crédités au 1er");
  const notifs = await core.db.collection("users/rival_fort/notifications").get();
  assert(notifs.size === 1 && notifs.docs[0].get("type") === "event", "notification de fin envoyée");
  const again = await lb.settleEventRankingsImpl(later + 1);
  assert(!again.some((s) => s.eventId === "classement_test"), "réglé une seule fois");
  assert((await core.db.doc("economies/rival_fort").get()).get("cauris") === 82, "pas de double paiement");
  void before;
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
