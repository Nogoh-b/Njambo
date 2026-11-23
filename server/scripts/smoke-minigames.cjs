/* Test d'intégration des mini-jeux contre un vrai Postgres : parties gratuites
   puis payantes (Nkap, cauris, ticket), lots crédités, limites du jour, Plus
   haut / plus bas (devinettes, encaissement, perte), jeux d'adresse plafonnés.
   Usage : npm --prefix server run build && DATABASE_URL=… node server/scripts/smoke-minigames.cjs
   ⚠️ Écrit dans la base visée : utiliser une base JETABLE. */
const path = require("path");
const dist = path.join(__dirname, "..", "dist");
const { createPgFirestore } = require(path.join(dist, "server/src/firestoreCompat/pg.js"));
const core = require(path.join(dist, "functions/src/core.js"));
const mg = require(path.join(dist, "functions/src/minigameCommands.js"));
const key = () => "k_" + Math.random().toString(36).slice(2) + Date.now();
const as = (uid, data) => ({ auth: { uid, token: {} }, data: { idempotencyKey: key(), ...data } });
const assert = (cond, msg) => { if (!cond) { console.error("ÉCHEC:", msg); process.exit(1); } console.log("ok -", msg); };
const refused = async (fn, message) => { try { await fn(); return false; } catch (e) { if (e.message !== message) console.error(e); return e.message === message; } };
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis (base jetable)"); process.exit(1); }

const economy = async (uid) => (await core.db.doc(`economies/${uid}`).get()).data();
const inventory = async (uid) => (await core.db.doc(`inventories/${uid}`).get()).data();

(async () => {
  core.setDbBackend(await createPgFirestore(process.env.DATABASE_URL));
  const uid = "joueurMiniJeux" + Date.now().toString(36);
  await core.db.doc(`economies/${uid}`).set({ nkap: 1000, cauris: 30, daily: { lastClaimDay: null, loyaltyPoints: 0, availableSpins: 0 } });
  await core.db.doc(`inventories/${uid}`).set({ tickets: { bronze: 1, argent: 0, or: 0 } });

  /* ── Ticket à gratter : 1 gratuit, puis 1 ticket, puis plus rien ── */
  const free = await mg.playMiniGameHandler(as(uid, { gameId: "scratch" }));
  assert(free.free === true && free.script.game === "scratch", "ticket à gratter : 1re partie gratuite");
  assert((await inventory(uid)).tickets.bronze === 1, "partie gratuite : aucun ticket consommé");
  const paid = await mg.playMiniGameHandler(as(uid, { gameId: "scratch" }));
  assert(paid.free === false && (await inventory(uid)).tickets.bronze === 0, "2e partie : 1 ticket Bronze consommé");
  assert(await refused(() => mg.playMiniGameHandler(as(uid, { gameId: "scratch" })), "INSUFFICIENT_TICKETS"), "sans ticket : partie refusée");

  /* ── Lot crédité : les Nkap du gain apparaissent dans le solde ── */
  const before = await economy(uid);
  const dice = await mg.playMiniGameHandler(as(uid, { gameId: "dice" })); // gratuit
  const after = await economy(uid);
  assert(after.nkap === before.nkap + dice.reward.amount, `dés gratuits : +${dice.reward.amount} Nkap crédités`);
  const dice2 = await mg.playMiniGameHandler(as(uid, { gameId: "dice" }));
  const after2 = await economy(uid);
  assert(after2.nkap === after.nkap - 100 + dice2.reward.amount, "dés payants : 100 Nkap retirés puis le gain ajouté");

  /* ── Idempotence : rejouer la même requête ne fait pas payer deux fois ── */
  const req = as(uid, { gameId: "cauris" });
  const c1 = await mg.playMiniGameHandler(req);
  const c2 = await mg.playMiniGameHandler(req);
  assert(JSON.stringify(c1.reward) === JSON.stringify(c2.reward), "même requête renvoyée : même résultat, pas de double débit");

  /* ── Tire ta carte : le lot est sous la carte choisie ── */
  const pick = await mg.playMiniGameHandler(as(uid, { gameId: "pick", choice: 2 }));
  assert(JSON.stringify(pick.script.items[2]) === JSON.stringify(pick.reward), "tire ta carte : lot sous la carte n°3 choisie");
  assert((await economy(uid)).cauris <= 30 - 3 - 10 + 30, "cauris débités pour cauris et carte");

  /* ── Plus haut / plus bas ── */
  await core.db.doc(`economies/${uid}`).set({ nkap: 1000 }, { merge: true });
  const start = await mg.startHiLoHandler(as(uid, {}));
  const sid = start.session.sessionId;
  assert(start.session.current >= 3 && start.session.current <= 10, `plus haut/plus bas : 1re carte ${start.session.current}`);
  assert((await economy(uid)).nkap === 900, "mise de 100 Nkap retirée");
  const resumed = await mg.startHiLoHandler(as(uid, {}));
  assert(resumed.resumed === true && resumed.session.sessionId === sid && (await economy(uid)).nkap === 900, "relancer reprend la partie sans repayer");
  assert(await refused(() => mg.cashOutHiLoHandler(as(uid, { sessionId: sid })), "NOTHING_TO_CASH_OUT"), "encaisser sans bonne réponse : refusé");
  assert(await refused(() => mg.startSkillGameHandler(as(uid, { gameId: "memory" })), "SESSION_IN_PROGRESS"), "jeu d'adresse refusé tant que la partie de cartes est en cours");
  let current = start.session.current;
  let wins = 0;
  let finished = false;
  let lastPayout = 0;
  for (let i = 0; i < 5 && !finished; i++) {
    const guess = current <= 6 ? "higher" : "lower"; // stratégie raisonnable
    const g = await mg.guessHiLoHandler(as(uid, { sessionId: sid, guess }));
    assert(g.next >= 3 && g.next <= 10, `devinette ${i + 1} : ${current} → ${g.next}, ${g.won ? "gagné" : "perdu"}`);
    finished = g.finished;
    if (g.won) { wins = g.wins; current = g.next; }
    if (g.reward) lastPayout = g.reward.amount;
    if (g.won && !finished && wins >= 2) {
      const nkapBefore = (await economy(uid)).nkap;
      const cash = await mg.cashOutHiLoHandler(as(uid, { sessionId: sid }));
      assert((await economy(uid)).nkap === nkapBefore + cash.reward.amount, `encaissé après ${wins} bonnes réponses : +${cash.reward.amount} Nkap`);
      finished = true;
    }
  }
  assert((await economy(uid)).minigameSession === null, "partie terminée : plus de session en cours" + (lastPayout ? ` (gain ${lastPayout})` : ""));
  assert(await refused(() => mg.guessHiLoHandler(as(uid, { sessionId: sid, guess: "higher" })), "NO_ACTIVE_SESSION"), "deviner après la fin : refusé");

  /* ── Jeux d'adresse : comptés au départ, score triché plafonné ── */
  const pr = await mg.startSkillGameHandler(as(uid, { gameId: "coinrain" }));
  const nkapRain = (await economy(uid)).nkap;
  const rain = await mg.finishSkillGameHandler(as(uid, { sessionId: pr.session.sessionId, score: 9999 }));
  assert(rain.reward.amount === 10 && (await economy(uid)).nkap === nkapRain + 10, "pluie de Nkap terminée trop vite avec un score triché : gain minimum");
  assert(await refused(() => mg.startSkillGameHandler(as(uid, { gameId: "coinrain" })), "MINIGAME_DAILY_LIMIT"), "pluie de Nkap : 1 seule partie par jour");
  const mem = await mg.startSkillGameHandler(as(uid, { gameId: "memory" }));
  const memEnd = await mg.finishSkillGameHandler(as(uid, { sessionId: mem.session.sessionId, score: 6, timeLeftMs: 25_000 }));
  assert(memEnd.reward.amount <= 100, `paires : gain plafonné (${memEnd.reward.amount} Nkap)`);

  /* ── Jeu inconnu et dépense bloquée ── */
  assert(await refused(() => mg.playMiniGameHandler(as(uid, { gameId: "casino" })), "UNKNOWN_MINIGAME"), "jeu inconnu refusé");
  await core.db.doc(`economies/${uid}`).set({ spendingBlocked: true }, { merge: true });
  assert(await refused(() => mg.playMiniGameHandler(as(uid, { gameId: "chests", choice: 0 })), "SPENDING_BLOCKED"), "compte bloqué : partie payante refusée");

  const ledger = await core.db.collection(`economies/${uid}/ledger`).get();
  assert(ledger.size >= 10, `journal des opérations : ${ledger.size} écritures « miniGame »`);
  console.log("\nMini-jeux : tous les contrôles sont passés.");
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
