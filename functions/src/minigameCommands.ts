/* ═══════════════════════ Mini-jeux : commandes serveur ═══════════════════════
   Le serveur décide de TOUT : coût, parties gratuites, tirage et lot. L'appli
   reçoit un « script » (symboles, dés, cauris…) qu'elle se contente d'animer.

   - playMiniGame        : jeux instantanés (ticket, cauris, dés, carte, coffres)
   - startHiLo / guessHiLo / cashOutHiLo : Plus haut ou plus bas (plusieurs étapes ;
     la carte suivante est dérivée d'un HMAC secret, jamais stockée côté client)
   - startSkillGame / finishSkillGame    : jeux d'adresse gratuits, gains plafonnés */

import { createHmac, randomUUID } from "node:crypto";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import {
  COINRAIN_DURATION_MS,
  HILO_MAX_STEPS,
  HILO_MULTIPLIERS,
  MEMORY_DURATION_MS,
  MEMORY_PAIRS,
  MINI_GAMES_BY_ID,
  coinRainReward,
  doualaDayKey,
  freePlaysLeft,
  hiloGuessWins,
  hiloPayout,
  hiloRankFromRoll,
  isMiniGameId,
  memoryReward,
  playInstantGame,
  playsLeft,
  recordPlay,
  type MiniGameDef,
  type MiniGameId,
  type MiniGameSession,
  type PlayerEconomy,
  type Reward,
  type TicketTier,
} from "../../domain";
import { applyReward, asObject, db, economyFrom, ledger, publicEconomy, randomRoll, requireUid, requiredString, runIdempotent, stableId } from "./core";
import type { DocumentData, Transaction } from "./firestoreTypes";

type Inventory = DocumentData;

async function loadState(transaction: Transaction, uid: string, now: number) {
  const economyRef = db.doc(`economies/${uid}`);
  const inventoryRef = db.doc(`inventories/${uid}`);
  const [economySnap, inventorySnap] = await Promise.all([transaction.get(economyRef), transaction.get(inventoryRef)]);
  if (!economySnap.exists) throw new HttpsError("failed-precondition", "PROFILE_NOT_INITIALIZED");
  return {
    economyRef,
    inventoryRef,
    economy: economyFrom(economySnap.data(), now),
    inventory: (inventorySnap.data() ?? { tickets: { bronze: 0, argent: 0, or: 0 } }) as Inventory,
  };
}

function gameOf(raw: unknown): MiniGameDef {
  if (!isMiniGameId(raw)) throw new HttpsError("invalid-argument", "UNKNOWN_MINIGAME");
  return MINI_GAMES_BY_ID[raw];
}

/** Retire le coût d'une partie (ou consomme une partie gratuite) et compte la partie du jour. */
function chargePlay(economy: PlayerEconomy, inventory: Inventory, game: MiniGameDef, now: number) {
  const day = doualaDayKey(now);
  if (playsLeft(economy.minigames, game.id, day) < 1) throw new HttpsError("resource-exhausted", "MINIGAME_DAILY_LIMIT");
  const free = freePlaysLeft(economy.minigames, game.id, day) > 0;
  let nextEconomy: PlayerEconomy = { ...economy, minigames: recordPlay(economy.minigames, game.id, day) };
  let nextInventory = inventory;
  if (!free) {
    const cost = game.cost;
    if (cost.type === "free") throw new HttpsError("resource-exhausted", "MINIGAME_DAILY_LIMIT");
    if (economy.spendingBlocked) throw new HttpsError("failed-precondition", "SPENDING_BLOCKED");
    if (cost.type === "nkap") {
      if (economy.nkap < cost.amount) throw new HttpsError("resource-exhausted", "INSUFFICIENT_NKAP");
      nextEconomy = { ...nextEconomy, nkap: economy.nkap - cost.amount };
    } else if (cost.type === "cauris") {
      if (economy.cauris < cost.amount) throw new HttpsError("resource-exhausted", "INSUFFICIENT_CAURIS");
      nextEconomy = { ...nextEconomy, cauris: economy.cauris - cost.amount };
    } else {
      const tickets = { bronze: 0, argent: 0, or: 0, ...(inventory.tickets ?? {}) } as Record<TicketTier, number>;
      if ((tickets[cost.tier] ?? 0) < cost.amount) throw new HttpsError("resource-exhausted", "INSUFFICIENT_TICKETS");
      nextInventory = { ...inventory, tickets: { ...tickets, [cost.tier]: tickets[cost.tier] - cost.amount } };
    }
  }
  return { economy: nextEconomy, inventory: nextInventory, free };
}

function commit(
  transaction: Transaction,
  uid: string,
  refs: { economyRef: ReturnType<typeof db.doc>; inventoryRef: ReturnType<typeof db.doc> },
  before: PlayerEconomy,
  after: PlayerEconomy,
  inventory: Inventory,
  now: number,
  ledgerKey: string,
  metadata: Record<string, unknown>,
) {
  transaction.set(refs.economyRef, after, { merge: false });
  transaction.set(refs.inventoryRef, { ...inventory, updatedAt: now }, { merge: false });
  ledger(transaction, uid, stableId(uid, "minigame", ledgerKey), "miniGame", { nkap: after.nkap - before.nkap, cauris: after.cauris - before.cauris }, after, now, metadata);
}

function grant(economy: PlayerEconomy, inventory: Inventory, reward: Reward | null, now: number) {
  if (!reward) return { economy, inventory };
  return applyReward(economy, inventory, reward, now);
}

/* ═══ Jeux instantanés ═══ */

export async function playMiniGameHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const game = gameOf(data.gameId);
  if (game.kind !== "instant") throw new HttpsError("invalid-argument", "NOT_AN_INSTANT_GAME");
  const choice = Number.isInteger(data.choice) ? Number(data.choice) : 0;
  return runIdempotent(uid, `playMiniGame:${game.id}`, data.idempotencyKey, async (transaction, now) => {
    const state = await loadState(transaction, uid, now);
    const charged = chargePlay(state.economy, state.inventory, game, now);
    const outcome = playInstantGame(game.id, randomRoll, choice);
    const applied = grant(charged.economy, charged.inventory, outcome.reward, now);
    commit(transaction, uid, state, state.economy, applied.economy, applied.inventory, now, String(data.idempotencyKey), { gameId: game.id, free: charged.free, reward: outcome.reward });
    return {
      gameId: game.id,
      free: charged.free,
      reward: outcome.reward,
      script: outcome.script,
      economy: publicEconomy(applied.economy, now),
      inventory: applied.inventory,
    };
  });
}

/* ═══ Plus haut ou plus bas ═══ */

function hiloSecret(): string {
  return process.env.NJAMBO_MINIGAME_SECRET || process.env.NJAMBO_GRID_SECRET || process.env.GCLOUD_PROJECT || "emulator-only-secret";
}

/** Carte n° `draw` de la partie : déterministe pour le serveur, imprévisible pour le joueur. */
export function hiloCard(sessionId: string, draw: number): number {
  const hex = createHmac("sha256", hiloSecret()).update(`hilo:${sessionId}:${draw}`).digest("hex").slice(0, 12);
  return hiloRankFromRoll(parseInt(hex, 16) / 2 ** 48);
}

function activeHiLo(economy: PlayerEconomy, sessionId: string): MiniGameSession {
  const session = economy.minigameSession;
  if (!session || session.game !== "hilo" || session.sessionId !== sessionId) throw new HttpsError("failed-precondition", "NO_ACTIVE_SESSION");
  return session;
}

export async function startHiLoHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const game = MINI_GAMES_BY_ID.hilo;
  return runIdempotent(uid, "startHiLo", data.idempotencyKey, async (transaction, now) => {
    const state = await loadState(transaction, uid, now);
    const existing = state.economy.minigameSession;
    // Une partie déjà en cours reprend là où elle s'était arrêtée.
    if (existing?.game === "hilo") {
      return { session: existing, resumed: true, economy: publicEconomy(state.economy, now) };
    }
    const charged = chargePlay(state.economy, state.inventory, game, now);
    const sessionId = randomUUID();
    const session: MiniGameSession = {
      game: "hilo",
      sessionId,
      startedAt: now,
      stake: game.cost.type === "nkap" ? game.cost.amount : 0,
      wins: 0,
      current: hiloCard(sessionId, 0),
      free: charged.free,
    };
    const after = { ...charged.economy, minigameSession: session };
    commit(transaction, uid, state, state.economy, after, charged.inventory, now, `hilo:start:${sessionId}`, { gameId: "hilo", free: charged.free });
    return { session, resumed: false, economy: publicEconomy(after, now) };
  });
}

export async function guessHiLoHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const sessionId = requiredString(data, "sessionId", 64);
  const guess = data.guess === "higher" || data.guess === "lower" ? data.guess : null;
  if (!guess) throw new HttpsError("invalid-argument", "INVALID_GUESS");
  return runIdempotent(uid, "guessHiLo", data.idempotencyKey, async (transaction, now) => {
    const state = await loadState(transaction, uid, now);
    const session = activeHiLo(state.economy, sessionId);
    const wins = session.wins ?? 0;
    const current = session.current ?? hiloCard(sessionId, 0);
    const next = hiloCard(sessionId, wins + 1);
    const won = hiloGuessWins(current, next, guess);
    const newWins = won ? wins + 1 : wins;
    const finished = !won || newWins >= HILO_MAX_STEPS;
    const payout = won && finished ? hiloPayout(session.stake ?? 0, newWins) : 0;
    const reward: Reward | null = payout > 0 ? { type: "nkap", amount: payout } : null;
    let after: PlayerEconomy = { ...state.economy, minigameSession: finished ? null : { ...session, wins: newWins, current: next } };
    let inventory = state.inventory;
    if (reward) ({ economy: after, inventory } = grant(after, inventory, reward, now));
    commit(transaction, uid, state, state.economy, after, inventory, now, `hilo:${sessionId}:${wins + 1}`, { gameId: "hilo", guess, current, next, won, payout });
    return {
      next,
      won,
      wins: newWins,
      multiplier: HILO_MULTIPLIERS[newWins],
      finished,
      reward,
      economy: publicEconomy(after, now),
    };
  });
}

export async function cashOutHiLoHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const sessionId = requiredString(data, "sessionId", 64);
  return runIdempotent(uid, "cashOutHiLo", data.idempotencyKey, async (transaction, now) => {
    const state = await loadState(transaction, uid, now);
    const session = activeHiLo(state.economy, sessionId);
    const wins = session.wins ?? 0;
    if (wins < 1) throw new HttpsError("failed-precondition", "NOTHING_TO_CASH_OUT");
    const reward: Reward = { type: "nkap", amount: hiloPayout(session.stake ?? 0, wins) };
    const applied = grant({ ...state.economy, minigameSession: null }, state.inventory, reward, now);
    commit(transaction, uid, state, state.economy, applied.economy, applied.inventory, now, `hilo:cash:${sessionId}`, { gameId: "hilo", wins, reward });
    return { reward, wins, economy: publicEconomy(applied.economy, now) };
  });
}

/* ═══ Jeux d'adresse (gratuits, plafonnés) ═══ */

const SKILL_GAMES: MiniGameId[] = ["memory", "coinrain"];

export async function startSkillGameHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const game = gameOf(data.gameId);
  if (!SKILL_GAMES.includes(game.id)) throw new HttpsError("invalid-argument", "NOT_A_SKILL_GAME");
  return runIdempotent(uid, `startSkillGame:${game.id}`, data.idempotencyKey, async (transaction, now) => {
    const state = await loadState(transaction, uid, now);
    if (state.economy.minigameSession?.game === "hilo") throw new HttpsError("failed-precondition", "SESSION_IN_PROGRESS");
    // La partie est comptée dès le départ : relancer ne rend pas un essai.
    const charged = chargePlay(state.economy, state.inventory, game, now);
    const session: MiniGameSession = { game: game.id, sessionId: randomUUID(), startedAt: now, free: true };
    const after = { ...charged.economy, minigameSession: session };
    commit(transaction, uid, state, state.economy, after, charged.inventory, now, `skill:start:${session.sessionId}`, { gameId: game.id });
    return { session, economy: publicEconomy(after, now) };
  });
}

export async function finishSkillGameHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const sessionId = requiredString(data, "sessionId", 64);
  const score = Number(data.score);
  const timeLeftMs = Number(data.timeLeftMs ?? 0);
  if (!Number.isFinite(score) || score < 0) throw new HttpsError("invalid-argument", "INVALID_SCORE");
  return runIdempotent(uid, "finishSkillGame", data.idempotencyKey, async (transaction, now) => {
    const state = await loadState(transaction, uid, now);
    const session = state.economy.minigameSession;
    if (!session || session.sessionId !== sessionId || !SKILL_GAMES.includes(session.game as MiniGameId)) {
      throw new HttpsError("failed-precondition", "NO_ACTIVE_SESSION");
    }
    const elapsed = now - session.startedAt;
    let reward: Reward;
    if (session.game === "memory") {
      // Le temps restant annoncé ne peut pas dépasser le temps réellement écoulé côté serveur.
      const maxTimeLeft = Math.max(0, MEMORY_DURATION_MS - elapsed + 1_500);
      const pairs = Math.min(MEMORY_PAIRS, score);
      // Retrouver 6 paires demande au moins quelques secondes.
      const plausiblePairs = elapsed < 4_000 ? Math.min(pairs, 2) : pairs;
      reward = memoryReward(plausiblePairs, Math.min(Math.max(0, timeLeftMs), maxTimeLeft));
    } else {
      // Pluie de Nkap : la manche dure 10 s ; un score envoyé trop tôt est ramené au minimum.
      reward = coinRainReward(elapsed < COINRAIN_DURATION_MS - 1_500 ? 0 : score);
    }
    const applied = grant({ ...state.economy, minigameSession: null }, state.inventory, reward, now);
    commit(transaction, uid, state, state.economy, applied.economy, applied.inventory, now, `skill:finish:${sessionId}`, { gameId: session.game, score, elapsed, reward });
    return { reward, economy: publicEconomy(applied.economy, now) };
  });
}
