/* Test d'intégration phase 4 contre un vrai Postgres : règles de table
   (mise ×2, pouvoirs interdits, minuteur, boss), élimination, rachat de vie,
   parcours parfait. Vraies parties jouées par le serveur.
   Usage : npm --prefix server run build && DATABASE_URL=… node server/scripts/smoke-event-rules.cjs
   ⚠️ Écrit dans la base visée : utiliser une base JETABLE. */
const path = require("path");
const dist = path.join(__dirname, "..", "dist");
const { createPgFirestore } = require(path.join(dist, "server/src/firestoreCompat/pg.js"));
const core = require(path.join(dist, "functions/src/core.js"));
const admin = require(path.join(dist, "functions/src/eventAdminCommands.js"));
const eco = require(path.join(dist, "functions/src/economyCommands.js"));
const runs = require(path.join(dist, "functions/src/eventRunCommands.js"));
const match = require(path.join(dist, "functions/src/matchCommands.js"));
const powers = require(path.join(dist, "functions/src/powerCommands.js"));
const { autoPlayExpiredMatchesImpl } = require(path.join(dist, "functions/src/matchTimeouts.js"));
const { blankEventVersion } = require(path.join(dist, "domain/index.js"));
const key = () => "k_" + Math.random().toString(36).slice(2) + Date.now();
const as = (uid, data, isAdmin = false) => ({ auth: { uid, token: isAdmin ? { admin: true } : {} }, data: { idempotencyKey: key(), ...data } });
const assert = (cond, msg) => { if (!cond) { console.error("ÉCHEC:", msg); process.exit(1); } console.log("ok -", msg); };
const refused = async (fn, message) => { try { await fn(); return null; } catch (e) { return e.message === message ? e : (console.error(e), null); } };
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
  const uid = "joueurRegles0000000001";
  await core.db.doc(`players/${uid}`).set({ uid, name: "Ewondo", emoji: "🎺" });
  await core.db.doc(`economies/${uid}`).set({ nkap: 100000, cauris: 100 });
  await core.db.doc(`inventories/${uid}`).set({ tickets: { bronze: 40 }, equippedCards: ["cauris_chanceux"] });

  const base = blankEventVersion("regles_test", now);
  const event = {
    ...base, startsAt: now - 1000, endsAt: now + 3_600_000, allowedLosses: 1,
    revive: { enabled: true, maxPerRun: 2, pricesCauris: [20, 40], windowMinutes: 10 },
    perfectRun: { reward: [{ type: "cauris", amount: 33 }] },
    stages: [{ ...base.stages[0], playerCount: 2, stakeNkap: 50, modifiers: ["double_stake", "no_powers", "turn_timer"], turnTimerSeconds: 8, boss: { name: "Le Patriarche", botLevel: 5 } }],
    finalReward: [],
  };
  await admin.saveEventDraftHandler(as("adm", { event }, true));
  await admin.publishEventDraftHandler(as("adm", { eventId: "regles_test" }, true));

  // Règles appliquées au lancement
  let runId = (await eco.joinEventHandler(as(uid, { eventId: "regles_test" }))).runId;
  const nkapBefore = (await core.db.doc(`economies/${uid}`).get()).get("nkap");
  const t0 = Date.now();
  const started = await match.startMatchHandler(as(uid, { mode: "event", eventRunId: runId }));
  const m = (await core.db.doc(`matches/${started.matchId}`).get()).data();
  assert((await core.db.doc(`economies/${uid}`).get()).get("nkap") === nkapBefore - 100, "mise ×2 : 100 Nkap débités au lieu de 50");
  assert(m.rules.powersDisabled && started.equippedPowers.length === 0, "pouvoirs interdits : aucun pouvoir équipé");
  assert(await refused(() => powers.usePowerCardHandler(as(uid, { matchId: started.matchId, cardId: "cauris_chanceux", turnId: m.turnId })), "POWERS_DISABLED"), "usage d'un pouvoir refusé");
  assert(m.rules.turnSeconds === 8 && m.actionDeadlineAt - t0 < 8_000 + 15_000, "minuteur de tour 8 s");
  const boss = m.participants.find((p) => p.boss);
  assert(boss && boss.name === "Le Patriarche" && m.rules.botDifficulty === "hard", "boss présent, IA difficile");

  // Jouer jusqu'à observer une élimination et un parcours parfait
  let sawElimination = false; let sawPerfect = false; let firstMatch = started.matchId; let tries = 0;
  while ((!sawElimination || !sawPerfect) && tries < 30) {
    tries += 1;
    const mid = firstMatch ?? (await match.startMatchHandler(as(uid, { mode: "event", eventRunId: runId }))).matchId;
    firstMatch = null;
    await playToEnd(mid);
    const run = (await core.db.doc(`event_runs/${runId}`).get()).data();
    if (run.status === "completed") {
      if (!sawPerfect && run.revivesUsed === undefined) {
        assert(run.perfect === true && run.claimedRewardKeys.includes("perfect"), "parcours parfait : bonus attribué");
        sawPerfect = true;
      }
      runId = (await eco.joinEventHandler(as(uid, { eventId: "regles_test" }))).runId;
    } else if (run.status === "eliminated") {
      if (!sawElimination) {
        sawElimination = true;
        assert(typeof run.eliminatedAt === "number", "élimination : début de la fenêtre de rachat enregistré");
        const cauris0 = (await core.db.doc(`economies/${uid}`).get()).get("cauris");
        const r1 = await runs.reviveEventRunHandler(as(uid, { runId }));
        assert(r1.price === 20 && r1.status === "active" && r1.losses === 0 && r1.cauris === cauris0 - 20, "1er rachat : 20 cauris, parcours relancé");
        assert(await refused(() => runs.reviveEventRunHandler(as(uid, { runId })), "RUN_NOT_ELIMINATED"), "pas de rachat sur un parcours en jeu");
        // 2e élimination simulée puis rachat à 40
        await core.db.doc(`event_runs/${runId}`).set({ status: "eliminated", losses: 1, eliminatedAt: Date.now() }, { merge: true });
        const r2 = await runs.reviveEventRunHandler(as(uid, { runId }));
        assert(r2.price === 40 && r2.revivesUsed === 2, "2e rachat : 40 cauris");
        await core.db.doc(`event_runs/${runId}`).set({ status: "eliminated", losses: 1, eliminatedAt: Date.now() }, { merge: true });
        assert(await refused(() => runs.reviveEventRunHandler(as(uid, { runId })), "REVIVE_LIMIT_REACHED"), "3e rachat refusé (maximum 2)");
        const other = (await eco.joinEventHandler(as(uid, { eventId: "regles_test" }))).runId;
        await core.db.doc(`event_runs/${other}`).set({ status: "eliminated", losses: 1, eliminatedAt: Date.now() - 11 * 60_000 }, { merge: true });
        assert(await refused(() => runs.reviveEventRunHandler(as(uid, { runId: other })), "REVIVE_WINDOW_EXPIRED"), "rachat refusé après 10 min");
        await core.db.doc(`economies/${uid}`).set({ cauris: 5 }, { merge: true });
        const poor = (await eco.joinEventHandler(as(uid, { eventId: "regles_test" }))).runId;
        await core.db.doc(`event_runs/${poor}`).set({ status: "eliminated", losses: 1, eliminatedAt: Date.now() }, { merge: true });
        assert(await refused(() => runs.reviveEventRunHandler(as(uid, { runId: poor })), "INSUFFICIENT_CAURIS"), "rachat refusé sans assez de cauris");
        await core.db.doc(`economies/${uid}`).set({ cauris: 100 }, { merge: true });
      }
      runId = (await eco.joinEventHandler(as(uid, { eventId: "regles_test" }))).runId;
    } else if (run.status === "active" && run.revivesUsed) {
      // parcours sauvé encore en jeu : on continue
    }
  }
  assert(sawElimination, `élimination observée (${tries} parties)`);
  assert(sawPerfect, `parcours parfait observé (${tries} parties)`);
  const stats = await admin.getAdminEventStatsHandler(as("adm", { eventId: "regles_test" }, true));
  assert(stats.revives === 2 && stats.reviveCauris === 60 && stats.perfect >= 1, "stats admin : 2 rachats, 60 cauris, parcours parfaits");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
