/* Test d'intégration des commandes admin « Joueurs » contre un vrai Postgres.
   Usage : npm --prefix server run build && DATABASE_URL=… node server/scripts/smoke-player-admin.cjs
   ⚠️ Écrit dans la base visée : utiliser une base JETABLE. */
const path = require("path");
const dist = path.join(__dirname, "..", "dist");
const { createPgFirestore } = require(path.join(dist, "server/src/firestoreCompat/pg.js"));
const core = require(path.join(dist, "functions/src/core.js"));
const c = require(path.join(dist, "functions/src/playerAdminCommands.js"));
const admin = (data) => ({ auth: { uid: "admin1", token: { admin: true } }, data: { idempotencyKey: "k_" + Math.random(), ...data } });
const assert = (cond, msg) => { if (!cond) { console.error("ÉCHEC:", msg); process.exit(1); } console.log("ok -", msg); };
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis (base jetable)"); process.exit(1); }
(async () => {
  core.setDbBackend(await createPgFirestore(process.env.DATABASE_URL));
  const uid = "joueurTestUid0000000001";
  await core.db.doc(`players/${uid}`).set({ uid, name: "Mama Ngono", emoji: "🌶️", crowns: 1200 });
  await core.db.doc(`economies/${uid}`).set({ nkap: 4200, cauris: 31 });
  await core.db.doc(`inventories/${uid}`).set({ tickets: { bronze: 1, argent: 0, or: 0 } });
  await core.db.doc("event_runs/run_a").set({ uid, eventId: "defi_du_mboa", mode: "pve", status: "eliminated", stageIndex: 2, losses: 3, versionSnapshot: { title: "Défi du Mboa", stages: [1, 2, 3, 4], allowedLosses: 3 }, updatedAt: 2 });
  await core.db.doc("event_runs/run_b").set({ uid, eventId: "tournoi_du_ter", mode: "pvp", status: "matchmaking", stageIndex: 1, losses: 0, currentMatchId: "m1", updatedAt: 1 });

  try { await c.adminSearchPlayersHandler({ auth: { uid: "u", token: {} }, data: { query: "Mama" } }); assert(false, "non-admin"); } catch (e) { assert(e.code === "permission-denied", "non-admin refusé"); }
  let found = await c.adminSearchPlayersHandler(admin({ query: "Mama" }));
  assert(found.players.length === 1 && found.players[0].uid === uid, "recherche par début de nom");
  found = await c.adminSearchPlayersHandler(admin({ query: uid }));
  assert(found.players[0]?.uid === uid, "recherche par uid");
  const detail = await c.adminGetPlayerHandler(admin({ uid }));
  assert(detail.nkap === 4200 && detail.cauris === 31 && detail.tickets.bronze === 1, "soldes et tickets");
  assert(detail.runs.length === 2 && detail.runs[0].runId === "run_a" && detail.runs[1].inMatch, "parcours triés, partie en cours détectée");
  try { await c.adminGrantTicketHandler(admin({ uid, tier: "or", amount: 1 })); assert(false, "motif"); } catch (e) { assert(e.message === "INVALID_REASON", "motif obligatoire"); }
  const key = "grant_key_123";
  const g1 = await c.adminGrantTicketHandler({ ...admin({}), data: { uid, tier: "or", amount: 2, reason: "Bug de matchmaking", idempotencyKey: key } });
  const g2 = await c.adminGrantTicketHandler({ ...admin({}), data: { uid, tier: "or", amount: 2, reason: "Bug de matchmaking", idempotencyKey: key } });
  assert(g1.tickets.or === 2 && g2.tickets.or === 2, "ticket donné une seule fois (double clic)");
  try { await c.adminResetEventRunHandler(admin({ runId: "run_b", mode: "restart", reason: "test" })); assert(false, "en partie"); } catch (e) { assert(e.message === "RUN_IN_MATCH", "réinitialisation refusée pendant une partie"); }
  const reset = await c.adminResetEventRunHandler(admin({ runId: "run_a", mode: "restart", reason: "Élimination injuste (déconnexion serveur)" }));
  const run = (await core.db.doc("event_runs/run_a").get()).data();
  assert(reset.status === "active" && run.stageIndex === 0 && run.losses === 0, "parcours remis à la table 1 avec toutes ses vies");
  await core.db.doc("event_runs/run_b").set({ currentMatchId: null }, { merge: true });
  const closed = await c.adminResetEventRunHandler(admin({ runId: "run_b", mode: "close", reason: "Demande du joueur" }));
  assert(closed.status === "left", "parcours clôturé");
  // Offrir un cosmétique (même inactif) : motif obligatoire, une seule fois, jamais converti en cauris
  await core.db.doc("cosmetics/style_test").set({ type: "anim_style", name: "Style test", rarity: "rare", published: false, style: { trail: "sparks", tone: "pink" } });
  try { await c.adminGrantCosmeticHandler({ auth: { uid: "u", token: {} }, data: { uid, cosmeticId: "style_test", reason: "x" } }); assert(false, "non-admin"); } catch (e) { assert(e.code === "permission-denied", "offrir un cosmétique : réservé aux admins"); }
  try { await c.adminGrantCosmeticHandler(admin({ uid, cosmeticId: "style_test" })); assert(false, "motif"); } catch (e) { assert(e.message === "INVALID_REASON", "offrir un cosmétique : motif obligatoire"); }
  try { await c.adminGrantCosmeticHandler(admin({ uid, cosmeticId: "inexistant", reason: "test" })); assert(false, "inconnu"); } catch (e) { assert(e.message === "COSMETIC_NOT_FOUND", "cosmétique inconnu refusé"); }
  const giftKey = "gift_key_123";
  const c1 = await c.adminGrantCosmeticHandler({ ...admin({}), data: { uid, cosmeticId: "style_test", reason: "Test du style", idempotencyKey: giftKey } });
  const c2 = await c.adminGrantCosmeticHandler({ ...admin({}), data: { uid, cosmeticId: "style_test", reason: "Test du style", idempotencyKey: giftKey } });
  assert(c1.cosmetics.join() === "style_test" && c2.cosmetics.join() === "style_test", "cosmétique (inactif) offert une seule fois (double clic)");
  try { await c.adminGrantCosmeticHandler(admin({ uid, cosmeticId: "style_test", reason: "encore" })); assert(false, "déjà possédé"); } catch (e) { assert(e.message === "COSMETIC_ALREADY_OWNED", "déjà possédé : refusé, pas converti en cauris"); }
  const afterGift = await c.adminGetPlayerHandler(admin({ uid }));
  assert(afterGift.cosmetics.includes("style_test") && afterGift.tickets.or === 2 && afterGift.cauris === 31, "fiche joueur : cosmétique possédé, tickets et cauris intacts");

  const audit = (await core.db.collection("admin_audit").get()).docs.map((d) => d.data()).filter((a) => a.targetUid === uid);
  assert(audit.length === 4 && audit.every((a) => a.reason), `audit avec motif (${audit.length} entrées)`);
  assert(audit.some((a) => a.action === "player_grant_cosmetic" && a.cosmeticId === "style_test"), "cadeau de cosmétique consigné dans l'audit");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
