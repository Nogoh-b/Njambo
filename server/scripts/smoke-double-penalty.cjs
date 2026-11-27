/* Test d'intégration de la mise double (dernier pli gagné avec un 3, GAME_CONFIG.lastCardThreeDoubles)
   et du Totem des Ancêtres, sur une partie contre un bot dont on fixe le dernier pli.
   Usage : DATABASE_URL=… (base JETABLE). */
const path = require("path");
const dist = path.join(__dirname, "..", "dist");
const { createPgFirestore } = require(path.join(dist, "server/src/firestoreCompat/pg.js"));
const core = require(path.join(dist, "functions/src/core.js"));
const cards = require(path.join(dist, "functions/src/powerCardAdminCommands.js"));
const match = require(path.join(dist, "functions/src/matchCommands.js"));
const { GAME_CONFIG } = require(path.join(dist, "config/gameConfig.js"));
const key = () => "k_" + Math.random().toString(36).slice(2) + Date.now();
const as = (uid, data) => ({ auth: { uid, token: {} }, data: { idempotencyKey: key(), ...data } });
const assert = (cond, msg) => { if (!cond) { console.error("ÉCHEC:", msg); process.exit(1); } console.log("ok -", msg); };
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis (base jetable)"); process.exit(1); }

const card = (rank, value, suit) => ({ id: `${rank}${suit}`, rank, value, suit, color: suit === "♥" || suit === "♦" ? "#c0392b" : "#1e1e1e" });
const STAKE = 100;

/* Lance une partie contre un bot et prépare le dernier pli :
   - `iWin` : je mène avec 3♠, le bot n'a pas de pique → je gagne avec un 3 ;
   - sinon : le bot a déjà posé 3♠, je n'ai pas de pique → il gagne avec un 3.
   `totem` : effet Totem des Ancêtres actif pour moi.
   `eclair` : Éclair du Mfoundi actif pour moi (mon 3 joue comme un 5). */
async function lastTrick(uid, { iWin, totem, eclair = false }) {
  await core.db.doc(`players/${uid}`).set({ uid, name: "Mbarga", emoji: "🎴" });
  await core.db.doc(`economies/${uid}`).set({ nkap: 5000, cauris: 100 });
  await core.db.doc(`inventories/${uid}`).set({ cards: {}, equippedCards: [], tickets: {} });
  const started = await match.startMatchHandler(as(uid, { mode: "bot", botCount: 1, stake: STAKE }));
  const ref = core.db.doc(`matches/${started.matchId}`);
  const doc = (await ref.get()).data();
  const me = doc.participants.findIndex((participant) => participant.uid === uid);
  const bot = doc.participants.findIndex((participant) => participant.bot);
  const botUid = doc.participants[bot].uid;
  await core.db.doc(`matches/${started.matchId}/private/${uid}`).set({ uid, hand: [iWin ? card("3", 3, "♠") : card("10", 10, "♥")] }, { merge: true });
  await core.db.doc(`matches/${started.matchId}/private/${botUid}`).set({ uid: botUid, hand: iWin ? [card("10", 10, "♥")] : [] }, { merge: true });
  await ref.set({
    status: "playing",
    turnIndex: me,
    leaderIndex: iWin ? me : bot,
    trickNumber: GAME_CONFIG.cardsPerPlayer - 1,
    trickPlays: iWin ? [] : [{ uid: botUid, card: card("3", 3, "♠"), turnId: doc.turnId }],
  }, { merge: true });
  if (totem || eclair) {
    const engineRef = core.db.doc(`matches/${started.matchId}/private/__engine`);
    const engine = (await engineRef.get()).data();
    await engineRef.set({ ...engine, effects: [totem
      ? { cardId: "totem_ancetres", activatedBy: me, scopeTrickNo: 1, preventDoublePenalty: true }
      : { cardId: "eclair_mfoundi", activatedBy: me, scopeTrickNo: GAME_CONFIG.cardsPerPlayer, valueBonus: 2 }] });
  }
  const before = (await core.db.doc(`economies/${uid}`).get()).data().nkap;
  const pot = Number((await ref.get()).get("potNkap"));
  await match.submitGameActionHandler(as(uid, { matchId: started.matchId, cardId: iWin ? "3♠" : "10♥", turnId: doc.turnId }));
  const after = (await core.db.doc(`economies/${uid}`).get()).data().nkap;
  const result = (await ref.get()).get("result");
  return { before, after, pot, result, mine: result?.settlement?.find((entry) => entry.uid === uid) };
}

(async () => {
  core.setDbBackend(await createPgFirestore(process.env.DATABASE_URL));
  await cards.seedPowerCardsHandler({ auth: { uid: "adm", token: { admin: true } }, data: { idempotencyKey: key() } });
  assert(GAME_CONFIG.lastCardThreeDoubles === true, "règle du 3 qui double active");

  // 1. Je gagne le dernier pli avec un 3 : je rafle le pot + la mise double du bot (financée par la maison en mode bot).
  const win = await lastTrick("doubleGagnant000000001", { iWin: true, totem: false });
  assert(win.result?.doubled === true, "partie réglée en « doublé »");
  assert(win.after - win.before === win.pot + STAKE, `gain : pot ${win.pot} + mise double ${STAKE} (reçu ${win.after - win.before})`);
  assert(win.mine?.doubleGain === STAKE, "règlement : doubleGain au vainqueur");

  // 2. Le bot gagne le dernier pli avec un 3 : je paie une mise de plus.
  const loss = await lastTrick("doublePerdant000000001", { iWin: false, totem: false });
  assert(loss.result?.doubled === true, "défaite « doublée »");
  assert(loss.before - loss.after === STAKE, `mise double payée : −${loss.before - loss.after}`);
  assert(loss.mine?.doublePenalty === STAKE && loss.mine.nkapDelta === -2 * STAKE, "règlement : mise + mise double");

  // 3. Même défaite avec le Totem des Ancêtres : la mise double est évitée.
  const totem = await lastTrick("doubleTotem00000000001", { iWin: false, totem: true });
  assert(totem.after === totem.before, "Totem : aucune mise double prélevée");
  assert(totem.mine?.doubleBlocked === true && totem.mine.nkapDelta === -STAKE, "règlement : Totem signalé, seule la mise est perdue");

  // 4. Je gagne le dernier pli avec un 3 boosté par l'Éclair : il gagne comme un 5 mais ne double pas.
  const boosted = await lastTrick("doubleEclair0000000001", { iWin: true, totem: false, eclair: true });
  assert(boosted.result?.winnerUid === "doubleEclair0000000001", "le 3 boosté gagne le dernier pli");
  assert(boosted.result?.doubled === false, "3 boosté : partie non doublée");
  assert(boosted.after - boosted.before === boosted.pot, `gain : pot ${boosted.pot} seul (reçu ${boosted.after - boosted.before})`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
