/* Régressions des règles de table, sans accès réseau ni base réelle.
   Usage : npm --prefix server run build && node server/scripts/smoke-gameplay-config.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const dist = path.join(__dirname, "../dist");
const core = require(path.join(dist, "functions/src/core.js"));
const { DEFAULT_GAMEPLAY_CONFIG, UNLIMITED_DEADLINE_AT } = require(path.join(dist, "domain/gameplayConfig.js"));
const { DEFAULT_EVENTS, DEFAULT_ECONOMY } = require(path.join(dist, "domain/index.js"));
const data = new Map();
let serial = 0;
const clone = (value) => value === undefined ? undefined : structuredClone(value);
const merge = (a, b) => {
  const result = { ...a };
  for (const [key, value] of Object.entries(b)) result[key] = value && typeof value === "object" && !Array.isArray(value) ? merge(result[key], value) : clone(value);
  return result;
};
const snapshot = (ref) => ({ id: ref.id, ref, exists: data.has(ref.path), data: () => clone(data.get(ref.path)), get: (field) => clone(field.split(".").reduce((value, key) => value?.[key], data.get(ref.path))) });
const doc = (refPath) => ({ path: refPath, id: refPath.split("/").at(-1), get: async () => snapshot(doc(refPath)), set: async (value, options) => data.set(refPath, options?.merge ? merge(data.get(refPath), value) : clone(value)) });
const collection = (refPath, predicates = [], max = Infinity) => ({
  doc: (id = `generated_${++serial}`) => doc(`${refPath}/${id}`),
  where: (field, op, expected) => collection(refPath, [...predicates, (row) => {
    const actual = field.split(".").reduce((value, key) => value?.[key], row);
    return op === "==" ? actual === expected : op === "<=" ? actual <= expected : op === "array-contains" ? actual?.includes(expected) : false;
  }], max),
  limit: (count) => collection(refPath, predicates, count),
  get: async () => {
    const docs = [...data.keys()].filter((key) => key.slice(0, key.lastIndexOf("/")) === refPath && predicates.every((predicate) => predicate(data.get(key)))).slice(0, max).map((key) => snapshot(doc(key)));
    return { docs, empty: docs.length === 0, size: docs.length };
  },
});
const store = {
  doc, collection,
  runTransaction: async (fn) => {
    const writes = [];
    const result = await fn({
      get: async (ref) => { assert.equal(writes.length, 0, "toutes les lectures doivent précéder les écritures"); return snapshot(ref); },
      create: (ref, value) => writes.push(() => { assert.ok(!data.has(ref.path), `doublon ${ref.path}`); data.set(ref.path, clone(value)); }),
      set: (ref, value, options) => writes.push(() => data.set(ref.path, options?.merge ? merge(data.get(ref.path), value) : clone(value))),
      update: (ref, value) => writes.push(() => { assert.ok(data.has(ref.path)); data.set(ref.path, { ...data.get(ref.path), ...clone(value) }); }),
      delete: (ref) => writes.push(() => data.delete(ref.path)),
    });
    writes.forEach((write) => write());
    return result;
  },
};
core.setDbBackend(store);
const { saveGameplayConfigHandler } = require(path.join(dist, "functions/src/gameplayCommands.js"));
const { startMatchHandler, submitGameActionHandler, advanceMatchRoundHandler, abandonMatchHandler } = require(path.join(dist, "functions/src/matchCommands.js"));
const { equipPowerCardsHandler, leaveEventHandler } = require(path.join(dist, "functions/src/economyCommands.js"));
const { usePowerCardHandler } = require(path.join(dist, "functions/src/powerCommands.js"));
const { autoPlayExpiredMatchesImpl } = require(path.join(dist, "functions/src/matchTimeouts.js"));
const request = (uid, payload, admin = false) => ({ auth: { uid, token: { admin } }, data: { idempotencyKey: `test_key_${++serial}`, ...payload } });
const card = (value) => ({ id: `${value}♠`, value, rank: String(value), suit: "♠", color: "black" });
const seedPlayer = (uid) => {
  data.set(`players/${uid}`, { name: uid, emoji: "🎴", crowns: 1000 });
  data.set(`economies/${uid}`, clone(DEFAULT_ECONOMY));
  data.set(`inventories/${uid}`, { cards: { feu_camp: 1, coupe_circuit: 1, filet_pecheur: 1 }, equippedCards: ["feu_camp", "coupe_circuit", "filet_pecheur"] });
};

async function main() {
  delete process.env.POWERS_DEV_BYPASS;
  const config = clone(DEFAULT_GAMEPLAY_CONFIG);
  config.maxEquippedPowers = 2; config.turnSeconds = 31;
  config.dealShuffleMs = 3600; config.dealRotateMs = 320;
  config.dealPerCardMs = 150; config.dealFlightMs = 700;
  config.matchesByMode.bot = { 2: 3, 3: 5, 4: 7 };
  config.matchesByMode.online[2] = config.matchesByMode.friends[2] = 3;
  await assert.rejects(() => saveGameplayConfigHandler(request("user", { config })), /ADMIN_REQUIRED/);
  await assert.rejects(() => saveGameplayConfigHandler(request("admin", { config: { ...config, maxEquippedPowers: 9 } }, true)), /INVALID_GAMEPLAY_CONFIG/);
  await assert.rejects(() => saveGameplayConfigHandler(request("admin", { config: { ...config, dealFlightMs: 5000 } }, true)), /INVALID_GAMEPLAY_CONFIG/);
  await assert.rejects(() => saveGameplayConfigHandler(request("admin", { config: { ...config, dealShuffleMs: 500 } }, true)), /INVALID_GAMEPLAY_CONFIG/);
  await assert.rejects(() => saveGameplayConfigHandler(request("admin", { config: { ...config, dealRotateMs: 2500 } }, true)), /INVALID_GAMEPLAY_CONFIG/);
  await saveGameplayConfigHandler(request("admin", { config }, true));
  assert.equal(data.get("runtime_config/gameplay").turnSeconds, 31);
  seedPlayer("equip");
  await assert.rejects(() => equipPowerCardsHandler(request("equip", { cardIds: ["feu_camp", "coupe_circuit", "filet_pecheur"] })), /INVALID_EQUIPPED_CARDS/);
  console.log("ok - droits admin, validation et limite de pouvoirs");

  for (const mode of ["bot", "friends", "online", "event"]) {
    const uid = `${mode}_a`; const opponent = `${mode}_b`;
    seedPlayer(uid); seedPlayer(opponent);
    const roomId = `room_${mode}`;
    const runId = `run_${mode}`;
    if (mode === "friends" || mode === "online") {
      data.set(`rooms/${roomId}`, { hostId: uid, status: "playing", stake: 100, players: [{ uid, name: uid, emoji: "a", ready: true }, { uid: opponent, name: opponent, emoji: "b", ready: true }], playerUids: [uid, opponent] });
      data.set(`room_consents/${roomId}_${opponent}`, { roomId, uid: opponent, ready: true });
    }
    if (mode === "event") {
      const event = clone(DEFAULT_EVENTS[0]);
      event.stages[0] = { ...event.stages[0], playerCount: 2, matchCount: 3, stakeNkap: 100, modifiers: ["turn_timer"], turnTimerSeconds: 9 };
      data.set(`event_runs/${runId}`, { uid, eventId: event.eventId, versionSnapshot: event, status: "active", stageIndex: 0, losses: 0, ticketStatus: "consumed", createdAt: Date.now() });
    }
    const started = await startMatchHandler(request(uid, { mode, stake: mode === "friends" ? 0 : 100, botCount: 1, roomId: mode === "friends" || mode === "online" ? roomId : undefined, eventRunId: mode === "event" ? runId : undefined }));
    const id = started.matchId;
    assert.equal(started.match.series.total, 3, `${mode}: trois manches`);
    assert.equal(started.match.rules.turnSeconds, mode === "event" ? 9 : 31);
    // Rythme de la donne copié dans les règles ; le minuteur du 1er tour l'attend (mélange + rotations + vols).
    assert.equal(started.match.rules.dealShuffleMs, 3600, `${mode}: durée du mélange copiée`);
    assert.equal(started.match.rules.dealRotateMs, 320, `${mode}: durée de rotation copiée`);
    assert.equal(started.match.rules.dealPerCardMs, 150, `${mode}: délai entre deux cartes copié`);
    assert.equal(started.match.rules.dealFlightMs, 700, `${mode}: vol copié`);
    assert.equal(started.equippedPowers.length, 2, "ancien équipement tronqué à la limite");
    const paid = clone(data.get(`economies/${uid}`));
    // L'inventaire ne peut pas ajouter un pouvoir à une partie déjà commencée.
    await assert.rejects(() => usePowerCardHandler(request(uid, { matchId: id, cardId: "filet_pecheur" })), /POWER_NOT_EQUIPPED/);
    const ids = started.match.participants.map((participant) => participant.uid);
    for (let round = 1; round <= 3; round++) {
      const current = data.get(`matches/${id}`);
      const actorWins = round < 3;
      const mine = card(actorWins ? 10 : 3); const theirs = card(actorWins ? 3 : 10);
      // Ramène chaque vraie manche à son dernier pli, puis joue les vraies commandes.
      Object.assign(current, { turnIndex: 0, leaderIndex: 0, trickNumber: 4, trickPlays: [], handCounts: { [ids[0]]: 1, [ids[1]]: 1 } });
      data.get(`matches/${id}/private/${ids[0]}`).hand = [mine];
      data.get(`matches/${id}/private/${ids[1]}`).hand = [theirs];
      await submitGameActionHandler(request(uid, { matchId: id, turnId: current.turnId, cardId: mine.id }));
      if (!started.match.participants[1].bot) {
        const next = data.get(`matches/${id}`);
        await submitGameActionHandler(request(opponent, { matchId: id, turnId: next.turnId, cardId: theirs.id }));
      }
      const ended = data.get(`matches/${id}`);
      if (round < 3) {
        assert.equal(ended.status, "between_rounds");
        assert.deepEqual(data.get(`economies/${uid}`), paid, "aucun règlement avant la fin de série");
        if (mode === "event") assert.equal(data.get(`event_runs/${runId}`).stageIndex, 0);
        if (round === 1) await advanceMatchRoundHandler(request(uid, { matchId: id, round }));
        else { ended.actionDeadlineAt = 0; await autoPlayExpiredMatchesImpl(); }
        const dealt = data.get(`matches/${id}`);
        assert.equal(dealt.series.round, round + 1);
        assert.ok(ids.every((player) => data.get(`matches/${id}/private/${player}`).hand.length === 5));
        // Un second client ne peut pas sauter une distribution.
        await advanceMatchRoundHandler(request(uid, { matchId: id, round }));
        assert.equal(data.get(`matches/${id}`).series.round, round + 1);
      } else {
        assert.equal(ended.status, "settled");
        assert.equal(ended.result.winnerUid, uid, "deux victoires battent la victoire de la dernière manche");
        assert.equal(data.get(`economies/${uid}`).nkap, paid.nkap + ended.potNkap + (mode === "event" ? 150 : 0));
        assert.deepEqual(data.get(`economies/${uid}`).energy, paid.energy, "énergie facturée une seule fois");
        if (mode === "event") assert.equal(data.get(`event_runs/${runId}`).stageIndex, 1);
      }
    }
    console.log(`ok - ${mode} : série, redistribution, score, règlement et passage automatique`);
  }
  seedPlayer("abandon");
  const started = await startMatchHandler(request("abandon", { mode: "bot", stake: 100, botCount: 1 }));
  data.get(`matches/${started.matchId}`).status = "between_rounds";
  await abandonMatchHandler(request("abandon", { matchId: started.matchId }));
  assert.equal(data.get(`matches/${started.matchId}`).status, "forfeit");
  console.log("ok - abandon entre deux manches");
  for (const botCount of [2, 3]) {
    const uid = `players_${botCount + 1}`; seedPlayer(uid);
    const result = await startMatchHandler(request(uid, { mode: "bot", stake: 100, botCount }));
    assert.equal(result.match.series.total, botCount === 2 ? 5 : 7);
  }
  console.log("ok - nombre de manches pour trois et quatre joueurs");
  config.maxEquippedPowers = 0;
  await saveGameplayConfigHandler(request("admin", { config }, true));
  seedPlayer("no_powers");
  const disabled = await startMatchHandler(request("no_powers", { mode: "bot", stake: 100, botCount: 1 }));
  assert.deepEqual(disabled.equippedPowers, []);
  await assert.rejects(() => usePowerCardHandler(request("no_powers", { matchId: disabled.matchId, cardId: "feu_camp" })), /POWER_NOT_EQUIPPED/);
  console.log("ok - désactivation des pouvoirs pour les prochaines parties");

  // Temps illimité contre l'IA : aucune échéance, le worker d'auto-play ne joue jamais ; les autres modes gardent leur minuteur.
  config.unlimitedTurnsBot = true;
  await saveGameplayConfigHandler(request("admin", { config }, true));
  seedPlayer("no_clock");
  const unlimited = await startMatchHandler(request("no_clock", { mode: "bot", stake: 100, botCount: 1 }));
  const uMatch = data.get(`matches/${unlimited.matchId}`);
  assert.equal(uMatch.rules.unlimitedTurns, true, "règle copiée dans la partie IA");
  assert.equal(uMatch.actionDeadlineAt, UNLIMITED_DEADLINE_AT, "aucune échéance au 1er tour");
  const uTurn = uMatch.turnId;
  await autoPlayExpiredMatchesImpl();
  assert.equal(data.get(`matches/${unlimited.matchId}`).turnId, uTurn, "le worker ne joue pas à la place du joueur");
  // Un coup du joueur, la réponse du bot : le tour suivant reste sans échéance.
  const uIds = uMatch.participants.map((participant) => participant.uid);
  Object.assign(uMatch, { turnIndex: 0, leaderIndex: 0, trickNumber: 0, trickPlays: [] });
  data.get(`matches/${unlimited.matchId}/private/${uIds[0]}`).hand = [card(9), card(8), card(7), card(6), card(5)];
  await submitGameActionHandler(request("no_clock", { matchId: unlimited.matchId, turnId: uTurn, cardId: card(9).id }));
  const uNext = data.get(`matches/${unlimited.matchId}`);
  assert.equal(uNext.status, "playing");
  assert.notEqual(uNext.turnId, uTurn, "le coup a été joué");
  assert.equal(uNext.actionDeadlineAt, UNLIMITED_DEADLINE_AT, "tour suivant sans échéance");
  for (const mode of ["friends", "online"]) {
    const host = `clock_${mode}_a`, guest = `clock_${mode}_b`; seedPlayer(host); seedPlayer(guest);
    const roomId = `room_clock_${mode}`;
    data.set(`rooms/${roomId}`, { hostId: host, status: "playing", stake: 100, players: [{ uid: host, name: host, emoji: "a", ready: true }, { uid: guest, name: guest, emoji: "b", ready: true }], playerUids: [host, guest] });
    data.set(`room_consents/${roomId}_${guest}`, { roomId, uid: guest, ready: true });
    const timed = await startMatchHandler(request(host, { mode, stake: mode === "friends" ? 0 : 100, roomId }));
    assert.equal(timed.match.rules.unlimitedTurns, false, `${mode} : minuteur gardé`);
    assert.ok(data.get(`matches/${timed.matchId}`).actionDeadlineAt < UNLIMITED_DEADLINE_AT, `${mode} : échéance réelle`);
  }
  config.unlimitedTurnsBot = false;
  await saveGameplayConfigHandler(request("admin", { config }, true));
  console.log("ok - temps illimité contre l'IA seulement (aucune échéance, aucun coup automatique)");
  seedPlayer("quit_race");
  data.set("event_runs/quit_race", { uid: "quit_race", eventId: DEFAULT_EVENTS[0].eventId, versionSnapshot: clone(DEFAULT_EVENTS[0]), status: "active", stageIndex: 0, losses: 0, ticketStatus: "consumed" });
  const racing = await startMatchHandler(request("quit_race", { mode: "event", stake: 0, eventRunId: "quit_race" }));
  const leaving = await leaveEventHandler(request("quit_race", { runId: "quit_race" }));
  assert.equal(leaving.matchId, racing.matchId);
  assert.equal(data.get("event_runs/quit_race").status, "active");
  console.log("ok - quitter pendant le démarrage ne corrompt pas la participation");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
