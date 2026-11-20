/* Test d'intégration du cycle de vie complet d'une carte créée en admin
   (phase F) : création → obtenue dans un livre → équipée → activée en vraie
   partie ; modification publiée PENDANT la partie (l'instantané de la partie
   est respecté) ; interrupteur d'urgence ; archivage (toujours jouable par
   son possesseur, retirée des livres). Usage : DATABASE_URL=… (base JETABLE). */
const path = require("path");
const dist = path.join(__dirname, "..", "dist");
const { createPgFirestore } = require(path.join(dist, "server/src/firestoreCompat/pg.js"));
const core = require(path.join(dist, "functions/src/core.js"));
const cards = require(path.join(dist, "functions/src/powerCardAdminCommands.js"));
const eco = require(path.join(dist, "functions/src/economyCommands.js"));
const match = require(path.join(dist, "functions/src/matchCommands.js"));
const powers = require(path.join(dist, "functions/src/powerCommands.js"));
const registry = require(path.join(dist, "config/powers/registry.js"));
const { GAME_CONFIG } = require(path.join(dist, "config/gameConfig.js"));
const key = () => "k_" + Math.random().toString(36).slice(2) + Date.now();
const as = (uid, data, isAdmin = false) => ({ auth: { uid, token: isAdmin ? { admin: true } : {} }, data: { idempotencyKey: key(), ...data } });
const assert = (cond, msg) => { if (!cond) { console.error("ÉCHEC:", msg); process.exit(1); } console.log("ok -", msg); };
const refused = async (fn, message) => { try { await fn(); return null; } catch (e) { if (e.message !== message) console.error(e); return e.message === message ? e : null; } };
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis (base jetable)"); process.exit(1); }

const id = "griffe_panthere";
const cardWith = (seconds) => ({
  def: { id, name: "Griffe de Panthère", category: "tactical", icon: "bolt", tone: "gold", rarity: "rare", targetMode: "self",
    art: "/uploads/power/panthere.webp", activationTitle: "GRIFFE", activationText: "La panthère prend son temps", description: `Gagne ${seconds} secondes.`,
    costCauris: 30, costNkap: 600, animTags: ["timer_self"], sound: { ref: "preset:tambour", volume: 0.8 } },
  script: { id, target: { count: "none" }, steps: [{
    ops: [{ op: "timerDelta", player: "self", seconds }],
    anim: [{ cue: "timerFx", player: "self", kind: "gain", seconds, fx: { preset: "time", intensity: "standard" } }],
  }] },
});

(async () => {
  core.setDbBackend(await createPgFirestore(process.env.DATABASE_URL));
  await cards.seedPowerCardsHandler(as("adm", {}, true));

  // 1. Création et publication (révision 1 : +6 s)
  await cards.savePowerCardDraftHandler(as("adm", { card: cardWith(6) }, true));
  assert((await cards.publishPowerCardHandler(as("adm", { cardId: id }, true))).revision === 1, "carte créée et publiée (révision 1 : +6 s)");

  // 2. Obtenue dans un livre : les 21 autres cartes coupées le temps du tirage → tirage certain
  const others = registry.listPowerModules().map((entry) => entry.def.id).filter((cardId) => cardId !== id);
  for (const cardId of others) await cards.setPowerCardStatusHandler(as("adm", { cardId, disabled: true }, true));
  const uid = "joueurPanthere00000001";
  await core.db.doc(`players/${uid}`).set({ uid, name: "Ngo Bassa", emoji: "🎴" });
  await core.db.doc(`economies/${uid}`).set({ nkap: 50000, cauris: 500 });
  await core.db.doc(`inventories/${uid}`).set({ cards: {}, equippedCards: [], tickets: {} });
  const opening = await eco.openBoosterBookHandler(as(uid, { boosterId: "normal" }));
  const slots = (await core.db.doc(`booster_openings/${opening.openingId}`).get()).get("slots");
  assert(slots.length === 9 && slots.every((slot) => slot.cardId === id), "livre ouvert : la carte de l'admin peut tomber (seule éligible ici)");
  const chosen = await eco.chooseBoosterCardHandler(as(uid, { openingId: opening.openingId, position: 4 }));
  assert(chosen.reward.cardId === id, "carte choisie dans le livre");
  const economy = (await core.db.doc(`economies/${uid}`).get()).data();
  assert(economy.cauris === 480, "livre payé 20 cauris");
  assert(Boolean((await core.db.doc(`inventories/${uid}`).get()).get("cards")[id]), "carte dans l'inventaire du joueur");
  for (const cardId of others) await cards.setPowerCardStatusHandler(as("adm", { cardId, disabled: false }, true));
  assert(registry.listPowerModules().every((entry) => !entry.def.disabled), "autres cartes réactivées");

  // 3. Équipée, partie lancée : le script de la révision 1 est figé dans la partie
  await eco.equipPowerCardsHandler(as(uid, { cardIds: [id] }));
  const started = await match.startMatchHandler(as(uid, { mode: "bot", botCount: 1, stake: 100 }));
  assert(started.equippedPowers.includes(id), "carte équipée à la table");
  const engineRef = core.db.doc(`matches/${started.matchId}/private/__engine`);
  assert((await engineRef.get()).data().powerScripts[id].steps[0].ops[0].seconds === 6, "instantané de la partie : révision 1 (+6 s)");

  // 4. Modification publiée pendant la partie (révision 2 : +12 s)
  await cards.savePowerCardDraftHandler(as("adm", { card: cardWith(12) }, true));
  assert((await cards.publishPowerCardHandler(as("adm", { cardId: id }, true))).revision === 2, "révision 2 publiée pendant la partie (+12 s)");
  assert(registry.getPowerModule(id).script.steps[0].ops[0].seconds === 12, "le catalogue sert désormais la révision 2");

  // 5. Interrupteur d'urgence : activation refusée, puis rétablie
  await cards.setPowerCardStatusHandler(as("adm", { cardId: id, disabled: true }, true));
  assert(await refused(() => powers.usePowerCardHandler(as(uid, { matchId: started.matchId, cardId: id })), "POWER_CARD_DISABLED"), "carte coupée : activation refusée en pleine partie");
  assert(!eco.boosterCardPool("notable").includes(id) && !eco.boosterCardPool("village").includes(id), "carte coupée : absente des livres");
  await cards.setPowerCardStatusHandler(as("adm", { cardId: id, disabled: false }, true));

  // 6. Activation : la partie en cours applique SON instantané (+6 s), pas la révision 2
  const deadlineBefore = (await core.db.doc(`matches/${started.matchId}`).get()).get("actionDeadlineAt");
  await powers.usePowerCardHandler(as(uid, { matchId: started.matchId, cardId: id }));
  const deadlineAfter = (await core.db.doc(`matches/${started.matchId}`).get()).get("actionDeadlineAt");
  // Le serveur ajoute aussi le temps de l'animation d'activation (budget fixe).
  const gained = deadlineAfter - deadlineBefore - GAME_CONFIG.anim.powerMax;
  assert(gained === 6000, `instantané respecté : +${gained / 1000} s au minuteur (et non +12 s)`);
  assert(((await engineRef.get()).data().usedPowers[uid] ?? []).includes(id), "carte consommée pour cette partie");

  // 7. Archivage : retirée des livres, toujours équipable par son possesseur
  await cards.setPowerCardStatusHandler(as("adm", { cardId: id, archived: true }, true));
  assert(registry.getPowerModule(id)?.def.archived === true, "carte archivée (toujours connue du jeu)");
  assert(["village", "notable", "chef", "ancetre"].every((tier) => !eco.boosterCardPool(tier).includes(id)), "archivée : absente de tous les livres");
  await eco.equipPowerCardsHandler(as(uid, { cardIds: [id] }));
  assert((await core.db.doc(`inventories/${uid}`).get()).get("equippedCards").includes(id), "archivée : son possesseur peut toujours l'équiper");
  const catalog = (await core.db.doc("power_catalog/current").get()).data();
  assert(catalog.cards.find((entry) => entry.def.id === id).def.archived === true, "catalogue publié : statut « archivée » diffusé aux clients");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
