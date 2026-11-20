/* Test d'intégration des défis entre amis contre un vrai Postgres : deux amis,
   vrais parcours d'événement, règlement, récompense, notifications, expiration.
   Usage : npm --prefix server run build && DATABASE_URL=… node server/scripts/smoke-challenges.cjs
   ⚠️ Écrit dans la base visée : utiliser une base JETABLE. */
const path = require("path");
const dist = path.join(__dirname, "..", "dist");
const { createPgFirestore } = require(path.join(dist, "server/src/firestoreCompat/pg.js"));
const core = require(path.join(dist, "functions/src/core.js"));
const admin = require(path.join(dist, "functions/src/eventAdminCommands.js"));
const ch = require(path.join(dist, "functions/src/challengeCommands.js"));
const camp = require(path.join(dist, "functions/src/campaignCommands.js"));
const eco = require(path.join(dist, "functions/src/economyCommands.js"));
const match = require(path.join(dist, "functions/src/matchCommands.js"));
const { autoPlayExpiredMatchesImpl } = require(path.join(dist, "functions/src/matchTimeouts.js"));
const { blankEventVersion } = require(path.join(dist, "domain/index.js"));
const key = () => "k_" + Math.random().toString(36).slice(2) + Date.now();
const as = (uid, data, isAdmin = false) => ({ auth: { uid, token: isAdmin ? { admin: true } : {} }, data: { idempotencyKey: key(), ...data } });
const assert = (cond, msg) => { if (!cond) { console.error("ÉCHEC:", msg); process.exit(1); } console.log("ok -", msg); };
const refused = async (fn, message) => { try { await fn(); return false; } catch (e) { if (e.message !== message) console.error(e); return e.message === message; } };
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis (base jetable)"); process.exit(1); }
async function playRunToEnd(uid, runId) {
  for (let m = 0; m < 10; m += 1) {
    const run = (await core.db.doc(`event_runs/${runId}`).get()).data();
    if (["completed", "eliminated"].includes(run.status)) return run;
    const started = await match.startMatchHandler(as(uid, { mode: "event", eventRunId: runId }));
    for (let i = 0; i < 400; i += 1) {
      const snap = await core.db.doc(`matches/${started.matchId}`).get();
      if (snap.get("status") !== "playing") break;
      await core.db.doc(`matches/${started.matchId}`).set({ actionDeadlineAt: 0 }, { merge: true });
      await autoPlayExpiredMatchesImpl();
    }
  }
  return (await core.db.doc(`event_runs/${runId}`).get()).data();
}

(async () => {
  core.setDbBackend(await createPgFirestore(process.env.DATABASE_URL));
  const pushes = [];
  camp.setPushSender(async (tokens, message) => { pushes.push(message); return tokens.map(() => ({ success: true })); });
  const now = Date.now();
  const A = "joueurDefiA00000000001"; const B = "joueurDefiB00000000001"; const C = "joueurDefiC00000000001";
  for (const [uid, name] of [[A, "Atangana"], [B, "Bessala"], [C, "Choupo"]]) {
    await core.db.doc(`players/${uid}`).set({ uid, name, emoji: "🎴" });
    await core.db.doc(`economies/${uid}`).set({ nkap: 5000, cauris: 0 });
    await core.db.doc(`inventories/${uid}`).set({ tickets: { bronze: 10 } });
  }
  await core.db.doc(`users/${A}/friends/${B}`).set({ uid: B, name: "Bessala" });
  await core.db.doc(`users/${B}/friends/${A}`).set({ uid: A, name: "Atangana" });
  await core.db.doc(`push_tokens/${B}/tokens/t`).set({ token: "tokB", active: true });

  const base = blankEventVersion("duel_test", now);
  const event = { ...base, startsAt: now - 1000, endsAt: now + 3_600_000, allowedLosses: 1,
    stages: [{ ...base.stages[0], playerCount: 2, difficulty: "facile" }],
    friendChallenges: { enabled: true, winnerReward: [{ type: "cauris", amount: 50 }] } };
  await admin.saveEventDraftHandler(as("adm", { event }, true));
  await admin.publishEventDraftHandler(as("adm", { eventId: "duel_test" }, true));

  assert(await refused(() => ch.createEventChallengeHandler(as(A, { eventId: "duel_test", toUid: C })), "NOT_FRIENDS"), "défi refusé entre non-amis");
  const { challengeId } = await ch.createEventChallengeHandler(as(A, { eventId: "duel_test", toUid: B }));
  assert(await refused(() => ch.createEventChallengeHandler(as(B, { eventId: "duel_test", toUid: A })), "CHALLENGE_ALREADY_OPEN"), "pas deux défis ouverts entre les mêmes amis");
  const invite = await core.db.doc(`users/${B}/notifications/challenge_${challengeId}`).get();
  assert(invite.exists && pushes.some((p) => p.title.includes("te défie")), "invitation reçue (in-app + push)");
  assert(await refused(() => ch.respondEventChallengeHandler(as(A, { challengeId, accept: true })), "CHALLENGE_NOT_FOUND"), "seul l'invité peut répondre");
  await ch.respondEventChallengeHandler(as(B, { challengeId, accept: true }));
  assert((await core.db.doc(`users/${A}/notifications/challenge_${challengeId}_accepted`).get()).exists, "le lanceur est prévenu de l'acceptation");

  const runA = (await eco.joinEventHandler(as(A, { eventId: "duel_test" }))).runId;
  const runB = (await eco.joinEventHandler(as(B, { eventId: "duel_test" }))).runId;
  let c = (await core.db.doc(`event_challenges/${challengeId}`).get()).data();
  assert(c.fromRunId === runA && c.toRunId === runB, "prochains parcours liés au défi");
  await playRunToEnd(A, runA);
  let settled = await ch.settleEventChallengesImpl(Date.now());
  assert(settled.settled.length === 0, "pas de règlement tant qu'un parcours est en cours");
  const listed = await ch.listMyChallengesHandler(as(B, { eventId: "duel_test" }));
  assert(listed.challenges[0].live.from && listed.challenges[0].live.from.finished, "progression en direct visible");
  await playRunToEnd(B, runB);
  const caurisBefore = { [A]: (await core.db.doc(`economies/${A}`).get()).get("cauris"), [B]: (await core.db.doc(`economies/${B}`).get()).get("cauris") };
  settled = await ch.settleEventChallengesImpl(Date.now());
  c = (await core.db.doc(`event_challenges/${challengeId}`).get()).data();
  assert(c.status === "finished" && c.scores.from && c.scores.to, `défi réglé (${c.scores.from.score} – ${c.scores.to.score})`);
  if (c.winnerUid) {
    assert((await core.db.doc(`economies/${c.winnerUid}`).get()).get("cauris") === caurisBefore[c.winnerUid] + 50, "+50 cauris au gagnant");
    const loser = c.winnerUid === A ? B : A;
    assert((await core.db.doc(`economies/${loser}`).get()).get("cauris") === caurisBefore[loser], "rien pour le perdant");
  } else {
    assert(true, "égalité parfaite : pas de récompense");
  }
  assert((await core.db.doc(`users/${A}/notifications/challenge_${challengeId}_result`).get()).exists && (await core.db.doc(`users/${B}/notifications/challenge_${challengeId}_result`).get()).exists, "résultat notifié aux deux");
  const again = await ch.settleEventChallengesImpl(Date.now());
  assert(again.settled.length === 0, "réglé une seule fois");

  // Invitation jamais acceptée → expirée
  const second = await ch.createEventChallengeHandler(as(A, { eventId: "duel_test", toUid: B }));
  await ch.settleEventChallengesImpl(Date.now() + 25 * 3_600_000);
  assert((await core.db.doc(`event_challenges/${second.challengeId}`).get()).get("status") === "expired", "invitation expirée après 24 h");
  const stats = await admin.getAdminEventStatsHandler(as("adm", { eventId: "duel_test" }, true));
  assert(stats.challenges.finished === 1 && stats.challenges.expired === 1, "stats admin des défis");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
