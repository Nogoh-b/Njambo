/* Test d'intégration du catalogue dynamique des cartes pouvoir (phase A).
   Usage : npm --prefix server run build && DATABASE_URL=… node server/scripts/smoke-power-catalog.cjs
   ⚠️ Écrit dans la base visée : utiliser une base JETABLE. */
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
const refused = async (fn, message) => { try { await fn(); return false; } catch (e) { if (e.message !== message) console.error(e); return e.message === message; } };
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis (base jetable)"); process.exit(1); }

(async () => {
  core.setDbBackend(await createPgFirestore(process.env.DATABASE_URL));
  assert(registry.powerCatalogSource() === "code" && registry.listPowerModules().length === 21, "base vide : repli sur les 21 cartes du code");
  assert(await refused(() => cards.seedPowerCardsHandler(as("u", {})), "ADMIN_REQUIRED"), "migration réservée aux admins");
  const seed = await cards.seedPowerCardsHandler(as("adm", {}, true));
  assert(seed.created === 21 && seed.published === 21, "21 cartes migrées et publiées");
  const again = await cards.seedPowerCardsHandler(as("adm", {}, true));
  assert(again.created === 0, "migration idempotente (rien n'est écrasé)");
  const catalog = (await core.db.doc("power_catalog/current").get()).data();
  assert(catalog.published && catalog.cards.length === 21 && catalog.revision === 2, "catalogue publié (révision 2)");
  assert(registry.powerCatalogSource() === "catalog", "registre du serveur alimenté par la base");
  const OLD_POOLS = {
    village: "oeil_sorcier,pluie_etoiles,vent_nord,bouclier_village,tambour_appel",
    notable: "benediction_chef,coupe_circuit,sable_temps,main_griot,feu_camp",
    chef: "eclair_mfoundi,masque_bluffeur,filet_pecheur,pagne_changeant",
    ancetre: "totem_ancetres,marche_nuit,cri_chef,pacte_mains",
  };
  const sorted = (list) => [...list].sort().join();
  assert(Object.entries(OLD_POOLS).every(([tier, ids]) => sorted(eco.boosterCardPool(tier)) === sorted(ids.split(","))), "livres : les 4 paliers identiques à l'ancienne table");

  // Joueur qui possède et équipe l'Œil du Sorcier
  const uid = "joueurPouvoirs00000001";
  await core.db.doc(`players/${uid}`).set({ uid, name: "Mbarga", emoji: "🎴" });
  await core.db.doc(`economies/${uid}`).set({ nkap: 50000, cauris: 100 });
  await core.db.doc(`inventories/${uid}`).set({ cards: { oeil_sorcier: { rarity: "village" }, vent_nord: { rarity: "village" } }, equippedCards: [], tickets: {} });
  await eco.equipPowerCardsHandler(as(uid, { cardIds: ["oeil_sorcier", "vent_nord"] }));
  const started = await match.startMatchHandler(as(uid, { mode: "bot", botCount: 1, stake: 100 }));
  const engine = (await core.db.doc(`matches/${started.matchId}/private/__engine`).get()).data();
  assert(engine.powerScripts && engine.powerScripts.oeil_sorcier.steps[0].ops[0].durationMs === 5000, "scripts des cartes équipées figés dans la partie");

  // L'admin modifie la carte pendant la partie : la partie garde l'ancienne version
  const row = (await core.db.doc("power_cards/oeil_sorcier").get()).data();
  row.script.steps[0].ops[0].durationMs = 2000;
  await core.db.doc("power_cards/oeil_sorcier").set(row);
  await cards.setPowerCardStatusHandler(as("adm", { cardId: "pluie_etoiles", archived: true }, true));
  assert(registry.getPowerModule("oeil_sorcier").script.steps[0].ops[0].durationMs === 2000, "catalogue mis à jour pour les nouvelles parties");
  const engineAfter = (await core.db.doc(`matches/${started.matchId}/private/__engine`).get()).data();
  assert(engineAfter.powerScripts.oeil_sorcier.steps[0].ops[0].durationMs === 5000, "la partie en cours garde la version du lancement");

  // Archivage : hors livres, toujours connue et jouable
  assert(!eco.boosterCardPool("village").includes("pluie_etoiles") && registry.getPowerModule("pluie_etoiles").def.archived === true, "carte archivée : retirée des livres, toujours connue");
  await core.db.doc(`inventories/${uid}`).set({ cards: { oeil_sorcier: {}, pluie_etoiles: {} } }, { merge: true });
  await eco.equipPowerCardsHandler(as(uid, { cardIds: ["pluie_etoiles"] }));
  assert(true, "une carte archivée reste équipable par son possesseur");

  // Interrupteur d'urgence
  await cards.setPowerCardStatusHandler(as("adm", { cardId: "oeil_sorcier", disabled: true }, true));
  assert(await refused(() => powers.usePowerCardHandler(as(uid, { matchId: started.matchId, cardId: "oeil_sorcier" })), "POWER_CARD_DISABLED"), "carte coupée : activation refusée pour tous");
  await cards.setPowerCardStatusHandler(as("adm", { cardId: "oeil_sorcier", disabled: false }, true));
  assert(!registry.getPowerModule("oeil_sorcier").def.disabled, "carte réactivée");

  // Carte inconnue
  assert(await refused(() => eco.equipPowerCardsHandler(as(uid, { cardIds: ["carte_fantome"] })), "CARD_NOT_OWNED"), "carte non possédée refusée");
  await core.db.doc(`inventories/${uid}`).set({ cards: { carte_fantome: {} } }, { merge: true });
  assert(await refused(() => eco.equipPowerCardsHandler(as(uid, { cardIds: ["carte_fantome"] })), "UNKNOWN_POWER_CARD"), "carte absente du catalogue refusée");

  const list = await cards.listAdminPowerCardsHandler(as("adm", {}, true));
  assert(list.cards.length === 21 && list.cards.every((card) => card.issues.length === 0), "liste admin : 21 cartes valides");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
