/* Test d'intégration de l'éditeur de cartes pouvoir (phase B) : création
   d'une carte inédite en admin, brouillon invalide, publication versionnée,
   puis activation en vraie partie. Usage : DATABASE_URL=… (base JETABLE). */
const path = require("path");
const dist = path.join(__dirname, "..", "dist");
const { createPgFirestore } = require(path.join(dist, "server/src/firestoreCompat/pg.js"));
const core = require(path.join(dist, "functions/src/core.js"));
const cards = require(path.join(dist, "functions/src/powerCardAdminCommands.js"));
const eco = require(path.join(dist, "functions/src/economyCommands.js"));
const match = require(path.join(dist, "functions/src/matchCommands.js"));
const powers = require(path.join(dist, "functions/src/powerCommands.js"));
const registry = require(path.join(dist, "config/powers/registry.js"));
const key = () => "k_" + Math.random().toString(36).slice(2) + Date.now();
const as = (uid, data, isAdmin = false) => ({ auth: { uid, token: isAdmin ? { admin: true } : {} }, data: { idempotencyKey: key(), ...data } });
const assert = (cond, msg) => { if (!cond) { console.error("ÉCHEC:", msg); process.exit(1); } console.log("ok -", msg); };
const refused = async (fn, message) => { try { await fn(); return null; } catch (e) { if (e.message !== message) console.error(e); return e.message === message ? e : null; } };
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis (base jetable)"); process.exit(1); }

(async () => {
  core.setDbBackend(await createPgFirestore(process.env.DATABASE_URL));
  await cards.seedPowerCardsHandler(as("adm", {}, true));
  const id = "souffle_du_baobab";
  const card = {
    def: { id, name: "Souffle du Baobab", category: "tactical", icon: "wind", tone: "teal", rarity: "epic", targetMode: "self",
      art: "/uploads/power/baobab.webp", activationTitle: "SOUFFLE", activationText: "Le temps s'étire", description: "Gagne 8 secondes et vois la meilleure carte à jouer.",
      costCauris: 45, costNkap: 900, animTags: ["timer_self", "hand_self_recommend"], boosterTier: "chef" },
    script: { id, target: { count: "none" }, steps: [{
      ops: [{ op: "timerDelta", player: "self", seconds: 8 }, { op: "highlightCard", player: "self", select: { kind: "bestLegal" }, durationMs: 3000 }],
      anim: [{ cue: "timerFx", player: "self", kind: "gain", seconds: 8, fx: { preset: "time", intensity: "spectacular" } }, { cue: "toast", text: "{activator} ralentit le temps !" }],
    }] },
  };
  // Brouillon invalide : enregistré, mais publication refusée
  const bad = JSON.parse(JSON.stringify(card));
  bad.script.steps[0].ops[0].seconds = 120;
  const saved = await cards.savePowerCardDraftHandler(as("adm", { card: bad }, true));
  assert(saved.issues.some((issue) => issue.path === "script.steps.0.ops.0.seconds"), "brouillon invalide enregistré avec ses erreurs");
  const err = await refused(() => cards.publishPowerCardHandler(as("adm", { cardId: id }, true)), "POWER_CARD_INVALID");
  assert(err && err.details.issues.length > 0, "publication refusée tant que la carte est invalide");
  assert(!registry.getPowerModule(id), "carte absente du jeu avant publication");

  await cards.savePowerCardDraftHandler(as("adm", { card }, true));
  const pub = await cards.publishPowerCardHandler(as("adm", { cardId: id }, true));
  assert(pub.revision === 1, "carte inédite publiée (révision 1)");
  assert(registry.getPowerModule(id).def.name === "Souffle du Baobab" && eco.boosterCardPool("chef").includes(id), "présente au catalogue et dans les livres « Chef »");
  const catalog = (await core.db.doc("power_catalog/current").get()).data();
  assert(catalog.cards.some((c) => c.def.id === id) && catalog.cards.length === 22, "catalogue publié : 22 cartes");
  assert((await core.db.doc(`power_card_versions/${id}_v1`).get()).exists, "révision immuable conservée");

  // Archivage puis republication : le statut n'est pas écrasé
  await cards.setPowerCardStatusHandler(as("adm", { cardId: id, archived: true }, true));
  const v2 = JSON.parse(JSON.stringify(card)); v2.def.costCauris = 60;
  await cards.savePowerCardDraftHandler(as("adm", { card: v2 }, true));
  const pub2 = await cards.publishPowerCardHandler(as("adm", { cardId: id }, true));
  assert(pub2.revision === 2 && registry.getPowerModule(id).def.archived === true && registry.getPowerModule(id).def.costCauris === 60, "révision 2 publiée, statut « archivée » conservé");
  await cards.setPowerCardStatusHandler(as("adm", { cardId: id, archived: false }, true));

  // En vraie partie
  const uid = "joueurBaobab0000000001";
  await core.db.doc(`players/${uid}`).set({ uid, name: "Ewane", emoji: "🎴" });
  await core.db.doc(`economies/${uid}`).set({ nkap: 50000, cauris: 0 });
  await core.db.doc(`inventories/${uid}`).set({ cards: { [id]: { rarity: "chef" } }, equippedCards: [], tickets: {} });
  await eco.equipPowerCardsHandler(as(uid, { cardIds: [id] }));
  const started = await match.startMatchHandler(as(uid, { mode: "bot", botCount: 1, stake: 100 }));
  assert(started.equippedPowers.includes(id), "carte équipée à la table");
  const deadlineBefore = (await core.db.doc(`matches/${started.matchId}`).get()).get("actionDeadlineAt");
  const used = await powers.usePowerCardHandler(as(uid, { matchId: started.matchId, cardId: id }));
  const after = (await core.db.doc(`matches/${started.matchId}`).get()).data();
  assert(after.actionDeadlineAt > deadlineBefore + 7000, "effet appliqué en partie : +8 s au minuteur");
  void used;
  const engine = (await core.db.doc(`matches/${started.matchId}/private/__engine`).get()).data();
  assert((engine.usedPowers[uid] ?? []).includes(id), "carte consommée pour cette partie");

  // Duplication et abandon de brouillon
  await cards.duplicatePowerCardHandler(as("adm", { cardId: id, newCardId: "souffle_copie" }, true));
  assert(await refused(() => cards.duplicatePowerCardHandler(as("adm", { cardId: id, newCardId: "souffle_copie" }, true)), "POWER_CARD_ID_TAKEN"), "duplication vers un identifiant pris refusée");
  await cards.discardPowerCardDraftHandler(as("adm", { cardId: "souffle_copie" }, true));
  assert(!(await core.db.doc("power_cards/souffle_copie").get()).exists, "brouillon jamais publié supprimé");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
