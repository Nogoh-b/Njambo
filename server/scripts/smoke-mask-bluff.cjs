/* Test d'intégration du Masque du Bluffeur : activation secrète (rien n'est diffusé),
   puis Œil du Sorcier contre un joueur masqué → fausse main pour l'attaquant, bluff annoncé aux autres.
   Usage : DATABASE_URL=… (base JETABLE). */
const path = require("path");
const dist = path.join(__dirname, "..", "dist");
const { createPgFirestore } = require(path.join(dist, "server/src/firestoreCompat/pg.js"));
const core = require(path.join(dist, "functions/src/core.js"));
const cards = require(path.join(dist, "functions/src/powerCardAdminCommands.js"));
const match = require(path.join(dist, "functions/src/matchCommands.js"));
const powers = require(path.join(dist, "functions/src/powerCommands.js"));
const key = () => "k_" + Math.random().toString(36).slice(2) + Date.now();
const as = (uid, data) => ({ auth: { uid, token: {} }, data: { idempotencyKey: key(), ...data } });
const assert = (cond, msg) => { if (!cond) { console.error("ÉCHEC:", msg); process.exit(1); } console.log("ok -", msg); };
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis (base jetable)"); process.exit(1); }

async function startAgainstBot(uid, equipped) {
  await core.db.doc(`players/${uid}`).set({ uid, name: "Essomba", emoji: "🎴" });
  await core.db.doc(`economies/${uid}`).set({ nkap: 5000, cauris: 100 });
  await core.db.doc(`inventories/${uid}`).set({ cards: Object.fromEntries(equipped.map((id) => [id, { count: 1 }])), equippedCards: equipped, tickets: {} });
  const started = await match.startMatchHandler(as(uid, { mode: "bot", botCount: 1, stake: 100 }));
  const ref = core.db.doc(`matches/${started.matchId}`);
  const doc = (await ref.get()).data();
  const me = doc.participants.findIndex((participant) => participant.uid === uid);
  const bot = doc.participants.findIndex((participant) => participant.bot);
  await ref.set({ status: "playing", turnIndex: me, trickPlays: [] }, { merge: true });
  return { matchId: started.matchId, ref, me, bot, botUid: doc.participants[bot].uid };
}

(async () => {
  core.setDbBackend(await createPgFirestore(process.env.DATABASE_URL));
  await cards.seedPowerCardsHandler({ auth: { uid: "adm", token: { admin: true } }, data: { idempotencyKey: key() } });

  // 1. Activation secrète : le masque est posé, rien n'est diffusé aux autres joueurs.
  const masked = await startAgainstBot("masqueSecret0000000001", ["masque_bluffeur"]);
  const before = (await masked.ref.get()).get("recentPowerActivations") ?? [];
  const own = await powers.usePowerCardHandler(as("masqueSecret0000000001", { matchId: masked.matchId, cardId: "masque_bluffeur" }));
  assert(own.activation.used === true, "masque posé (carte consommée)");
  const after = (await masked.ref.get()).get("recentPowerActivations") ?? [];
  assert(JSON.stringify(after) === JSON.stringify(before), "activation secrète : aucune diffusion aux autres joueurs");
  const engine = (await core.db.doc(`matches/${masked.matchId}/private/__engine`).get()).data();
  assert(engine.effects.some((effect) => effect.cardId === "masque_bluffeur" && effect.blocks?.includes("reveal")), "effet masque actif côté serveur");

  // 2. Œil du Sorcier contre un bot masqué : fausse main pour l'attaquant, bluff diffusé aux autres.
  const game = await startAgainstBot("oeilTrompe000000000001", ["oeil_sorcier"]);
  const engineRef = core.db.doc(`matches/${game.matchId}/private/__engine`);
  const engineDoc = (await engineRef.get()).data();
  await engineRef.set({ ...engineDoc, effects: [{ cardId: "masque_bluffeur", activatedBy: game.bot, scopeTrickNo: 1, blocks: ["reveal"] }] });
  const realHand = (await core.db.doc(`matches/${game.matchId}/private/${game.botUid}`).get()).get("hand");
  const response = await powers.usePowerCardHandler(as("oeilTrompe000000000001", { matchId: game.matchId, cardId: "oeil_sorcier", targetUid: game.botUid }));
  const fake = response.activation.revealedHand ?? [];
  assert(fake.length === realHand.length, `fausse main de la même taille (${fake.length} cartes)`);
  assert(fake.every((card) => !realHand.some((real) => real.id === card.id)), "aucune vraie carte de la cible dans la fausse main");
  assert(response.activation.bluffedByCardId === undefined && !response.activation.blockedByCardId, "l'attaquant ne sait pas qu'il a été trompé");
  const broadcast = ((await game.ref.get()).get("recentPowerActivations") ?? [])[0];
  assert(broadcast?.bluffedByCardId === "masque_bluffeur", "les autres apprennent le bluff");
  assert(!broadcast.revealedHand, "la fausse main n'est pas diffusée");
  const effectsAfter = (await engineRef.get()).data().effects;
  assert(!effectsAfter.some((effect) => effect.cardId === "masque_bluffeur"), "masque consommé par le bluff");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
