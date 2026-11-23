/* ═══════════════════════ Mini-jeux : catalogue & tirages ═══════════════════════
   Logique PURE partagée serveur / client :
   - le serveur s'en sert pour vérifier le coût, tirer le résultat et produire le
     « script » que l'appli se contente d'animer (aucune triche possible côté client) ;
   - l'appli s'en sert pour afficher coûts, parties gratuites et probabilités.
   Le hasard est injecté (`roll` ∈ [0, 1[) : le serveur passe son tirage
   cryptographique, les tests un générateur déterministe. */

import type { Reward } from "./catalog";
import { pickWeighted, type TicketTier, type WeightedValue } from "./economy";

export type MiniGameId = "scratch" | "cauris" | "dice" | "hilo" | "pick" | "chests" | "memory" | "coinrain";
export type MiniGameKind = "instant" | "hilo" | "skill";
export type MiniGameTone = "gold" | "teal" | "pink" | "cobalt";

export type MiniGameCost =
  | { type: "nkap"; amount: number }
  | { type: "cauris"; amount: number }
  | { type: "ticket"; tier: TicketTier; amount: number }
  | { type: "free" };

export interface MiniGameDef {
  id: MiniGameId;
  title: string;
  tagline: string;
  kind: MiniGameKind;
  tone: MiniGameTone;
  /** Coût d'une partie payante. */
  cost: MiniGameCost;
  /** Parties offertes chaque jour (heure de Douala) avant de payer. */
  freePerDay: number;
  /** Plafond de parties par jour (gratuites + payantes). */
  maxPerDay: number;
  /** Lots possibles (jeux « instant » à table pondérée). */
  rewards?: Array<WeightedValue<Reward>>;
  /** Jeux d'adresse : durée de la manche. */
  durationMs?: number;
}

const nkap = (amount: number): Reward => ({ type: "nkap", amount });
const cauris = (amount: number): Reward => ({ type: "cauris", amount });
const bronze: Reward = { type: "ticket", tier: "bronze", amount: 1 };
const energyHour: Reward = { type: "energy_pass", durationMinutes: 60 };
const normalBook: Reward = { type: "booster_book", boosterId: "normal", amount: 1 };

/* ── Ticket à gratter : 6 cases, 3 symboles identiques = le lot de ce symbole ── */
export const SCRATCH_REWARDS: Array<WeightedValue<Reward>> = [
  { value: nkap(60), weight: 34 },
  { value: nkap(150), weight: 26 },
  { value: cauris(4), weight: 18 },
  { value: nkap(300), weight: 12 },
  { value: energyHour, weight: 7 },
  { value: cauris(15), weight: 3 },
];

/* ── Lancer de cauris : nombre de cauris tombés « bouche ouverte » sur 6 ── */
export const CAURIS_TIERS: Array<{ counts: number[]; reward: Reward; label: string }> = [
  { counts: [3], reward: nkap(40), label: "3 ouverts" },
  { counts: [2, 4], reward: nkap(80), label: "2 ou 4 ouverts" },
  { counts: [1, 5], reward: cauris(5), label: "1 ou 5 ouverts" },
  { counts: [0, 6], reward: cauris(20), label: "Tous pareils" },
];

/* ── Dés du quartier : somme de 2 dés, double = gain ×2 ── */
export function dicePayout(sum: number): number {
  if (sum <= 6) return 25;
  if (sum === 7) return 60;
  if (sum <= 11) return 100;
  return 400;
}

/* ── Plus haut ou plus bas : multiplicateur après k bonnes réponses (k = 1..5) ── */
export const HILO_MULTIPLIERS = [0, 1.2, 1.55, 2.1, 3, 5] as const;
export const HILO_MAX_STEPS = HILO_MULTIPLIERS.length - 1;
export const HILO_RANK_MIN = 3;
export const HILO_RANK_MAX = 10;
export const HILO_STAKE = 100;

/* ── Tire ta carte / Coffres : 3 choix cachés, on en retourne un ── */
export const PICK_REWARDS: Array<WeightedValue<Reward>> = [
  { value: nkap(150), weight: 34 },
  { value: cauris(8), weight: 24 },
  { value: bronze, weight: 16 },
  { value: energyHour, weight: 12 },
  { value: nkap(500), weight: 9 },
  { value: normalBook, weight: 5 },
];

export const CHEST_REWARDS: Array<WeightedValue<Reward>> = [
  { value: nkap(80), weight: 38 },
  { value: nkap(150), weight: 30 },
  { value: cauris(5), weight: 20 },
  { value: bronze, weight: 9 },
  { value: cauris(12), weight: 3 },
];

/* ── Jeux d'adresse : gains plafonnés (le score vient du téléphone) ── */
export const MEMORY_PAIRS = 6;
export const MEMORY_DURATION_MS = 25_000;
export const COINRAIN_DURATION_MS = 10_000;
export const COINRAIN_MAX_COINS = 36;

export function memoryReward(pairsFound: number, timeLeftMs: number): Reward {
  const pairs = Math.max(0, Math.min(MEMORY_PAIRS, Math.floor(pairsFound)));
  const bonus = pairs === MEMORY_PAIRS ? 30 + Math.floor(Math.max(0, Math.min(MEMORY_DURATION_MS, timeLeftMs)) / 1000) * 2 : 0;
  return nkap(Math.min(100, Math.max(10, pairs * 8 + bonus)));
}

export function coinRainReward(coins: number): Reward {
  const caught = Math.max(0, Math.min(COINRAIN_MAX_COINS, Math.floor(coins)));
  return nkap(Math.min(150, Math.max(10, caught * 4)));
}

export const MINI_GAMES: MiniGameDef[] = [
  { id: "scratch", title: "Ticket à gratter", tagline: "Gratte 6 cases : 3 pareilles, c'est gagné", kind: "instant", tone: "gold", cost: { type: "ticket", tier: "bronze", amount: 1 }, freePerDay: 1, maxPerDay: 30, rewards: SCRATCH_REWARDS },
  { id: "cauris", title: "Lancer de cauris", tagline: "Lance 6 cauris et lis ta chance", kind: "instant", tone: "teal", cost: { type: "cauris", amount: 3 }, freePerDay: 1, maxPerDay: 30 },
  { id: "dice", title: "Les dés du quartier", tagline: "Deux dés, un double paie double", kind: "instant", tone: "pink", cost: { type: "nkap", amount: 100 }, freePerDay: 1, maxPerDay: 40 },
  { id: "hilo", title: "Plus haut ou plus bas", tagline: "Devine la carte suivante, jusqu'à ×5", kind: "hilo", tone: "cobalt", cost: { type: "nkap", amount: HILO_STAKE }, freePerDay: 0, maxPerDay: 40 },
  { id: "pick", title: "Tire ta carte", tagline: "3 cartes cachées, une seule pour toi", kind: "instant", tone: "gold", cost: { type: "cauris", amount: 10 }, freePerDay: 0, maxPerDay: 20, rewards: PICK_REWARDS },
  { id: "chests", title: "Coffres du marché", tagline: "Choisis ton coffre au marché", kind: "instant", tone: "teal", cost: { type: "cauris", amount: 5 }, freePerDay: 0, maxPerDay: 20, rewards: CHEST_REWARDS },
  { id: "memory", title: "Paires du marché", tagline: "Retrouve les 6 paires en 25 s", kind: "skill", tone: "pink", cost: { type: "free" }, freePerDay: 3, maxPerDay: 3, durationMs: MEMORY_DURATION_MS },
  { id: "coinrain", title: "Pluie de Nkap", tagline: "Attrape les pièces pendant 10 s", kind: "skill", tone: "gold", cost: { type: "free" }, freePerDay: 1, maxPerDay: 1, durationMs: COINRAIN_DURATION_MS },
];

export const MINI_GAMES_BY_ID: Record<MiniGameId, MiniGameDef> = Object.fromEntries(
  MINI_GAMES.map((game) => [game.id, game]),
) as Record<MiniGameId, MiniGameDef>;

export function isMiniGameId(value: unknown): value is MiniGameId {
  return typeof value === "string" && value in MINI_GAMES_BY_ID;
}

/* ═══ Compteurs quotidiens (stockés dans economies/{uid}.minigames) ═══ */

export interface MiniGameDailyState {
  day: string | null;
  plays: Partial<Record<MiniGameId, number>>;
}

export function playsToday(state: MiniGameDailyState | undefined, id: MiniGameId, day: string): number {
  if (!state || state.day !== day) return 0;
  return Math.max(0, Number(state.plays?.[id] ?? 0));
}

export function freePlaysLeft(state: MiniGameDailyState | undefined, id: MiniGameId, day: string): number {
  return Math.max(0, MINI_GAMES_BY_ID[id].freePerDay - playsToday(state, id, day));
}

export function playsLeft(state: MiniGameDailyState | undefined, id: MiniGameId, day: string): number {
  return Math.max(0, MINI_GAMES_BY_ID[id].maxPerDay - playsToday(state, id, day));
}

export function recordPlay(state: MiniGameDailyState | undefined, id: MiniGameId, day: string): MiniGameDailyState {
  const base = state && state.day === day ? state.plays : {};
  return { day, plays: { ...base, [id]: playsToday(state, id, day) + 1 } };
}

/** Total des parties gratuites restantes aujourd'hui (badge de la tuile d'accueil). */
export function totalFreePlaysLeft(state: MiniGameDailyState | undefined, day: string): number {
  return MINI_GAMES.reduce((sum, game) => sum + freePlaysLeft(state, game.id, day), 0);
}

/* ═══ Tirages des jeux « instant » : lot + script à animer ═══ */

export type InstantScript =
  | { game: "scratch"; cells: number[]; winning: number; symbols: Reward[] }
  | { game: "cauris"; faces: boolean[] }
  | { game: "dice"; dice: [number, number]; doubled: boolean }
  | { game: "pick" | "chests"; choice: number; items: Reward[] };

export interface InstantOutcome {
  reward: Reward;
  script: InstantScript;
}

type Roll = () => number;

function rewardKey(reward: Reward): string {
  return JSON.stringify(reward);
}

function shuffleWith<T>(items: T[], roll: Roll): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(roll() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function scratchOutcome(roll: Roll): InstantOutcome {
  const symbols = SCRATCH_REWARDS.map((entry) => entry.value);
  const reward = pickWeighted(SCRATCH_REWARDS, roll());
  const winning = symbols.findIndex((symbol) => rewardKey(symbol) === rewardKey(reward));
  // 3 cases gagnantes + 3 « leurres » pris parmi les autres symboles, jamais 3 fois le même.
  const others = shuffleWith(symbols.map((_, i) => i).filter((i) => i !== winning), roll);
  const decoys = [others[0], others[1], roll() < 0.5 ? others[0] : others[2]];
  const cells = shuffleWith([winning, winning, winning, ...decoys], roll);
  return { reward, script: { game: "scratch", cells, winning, symbols } };
}

function caurisOutcome(roll: Roll): InstantOutcome {
  const faces = Array.from({ length: 6 }, () => roll() < 0.5);
  const open = faces.filter(Boolean).length;
  const tier = CAURIS_TIERS.find((entry) => entry.counts.includes(open)) ?? CAURIS_TIERS[0];
  return { reward: tier.reward, script: { game: "cauris", faces } };
}

function diceOutcome(roll: Roll): InstantOutcome {
  const a = 1 + Math.floor(roll() * 6);
  const b = 1 + Math.floor(roll() * 6);
  const doubled = a === b;
  return { reward: nkap(dicePayout(a + b) * (doubled ? 2 : 1)), script: { game: "dice", dice: [a, b], doubled } };
}

function pickOutcome(game: "pick" | "chests", choice: number, roll: Roll): InstantOutcome {
  const table = game === "pick" ? PICK_REWARDS : CHEST_REWARDS;
  const reward = pickWeighted(table, roll());
  // Les deux autres choix montrent « ce que tu aurais pu avoir » : lots différents du tien.
  const decoyPool = shuffleWith(table.map((entry) => entry.value).filter((value) => rewardKey(value) !== rewardKey(reward)), roll);
  const index = Math.max(0, Math.min(2, Math.floor(choice)));
  const items: Reward[] = [];
  let next = 0;
  for (let i = 0; i < 3; i++) items.push(i === index ? reward : decoyPool[next++]);
  return { reward, script: { game, choice: index, items } };
}

export function playInstantGame(id: MiniGameId, roll: Roll, choice = 0): InstantOutcome {
  switch (id) {
    case "scratch": return scratchOutcome(roll);
    case "cauris": return caurisOutcome(roll);
    case "dice": return diceOutcome(roll);
    case "pick":
    case "chests": return pickOutcome(id, choice, roll);
    default: throw new Error("NOT_AN_INSTANT_GAME");
  }
}

/* ═══ Plus haut ou plus bas ═══ */

export type HiLoGuess = "higher" | "lower";

/** Gagné si la carte suivante est strictement plus haute (ou plus basse) : une égalité perd. */
export function hiloGuessWins(current: number, next: number, guess: HiLoGuess): boolean {
  return guess === "higher" ? next > current : next < current;
}

export function hiloPayout(stake: number, wins: number): number {
  const k = Math.max(0, Math.min(HILO_MAX_STEPS, Math.floor(wins)));
  return Math.floor(stake * HILO_MULTIPLIERS[k]);
}

/** Valeur de carte (3..10) à partir d'un nombre dans [0, 1[. */
export function hiloRankFromRoll(value: number): number {
  return HILO_RANK_MIN + Math.floor(Math.max(0, Math.min(0.999999, value)) * (HILO_RANK_MAX - HILO_RANK_MIN + 1));
}

/* ═══ Probabilités affichées (« Lots & chances ») ═══ */

export function miniGameOdds(id: MiniGameId): Array<{ label: string; weight: number }> {
  const label = (reward: Reward) =>
    reward.type === "nkap" ? `${reward.amount} Nkap`
      : reward.type === "cauris" ? `${reward.amount} cauris`
      : reward.type === "ticket" ? "Ticket Bronze"
      : reward.type === "energy_pass" ? "Pass Énergie 1 h"
      : reward.type === "booster_book" ? "Livre Normal"
      : "Lot";
  if (id === "cauris") {
    const binom = [1, 6, 15, 20, 15, 6, 1];
    return CAURIS_TIERS.map((tier) => ({ label: `${tier.label} · ${label(tier.reward)}`, weight: tier.counts.reduce((sum, c) => sum + binom[c], 0) }));
  }
  if (id === "dice") {
    return [
      { label: "Somme 2 à 6 · 25 Nkap", weight: 15 },
      { label: "Somme 7 · 60 Nkap", weight: 6 },
      { label: "Somme 8 à 11 · 100 Nkap", weight: 14 },
      { label: "Double 6 · 800 Nkap", weight: 1 },
      { label: "Tout double paie ×2 (dont 6 + 6)", weight: 0 },
    ];
  }
  if (id === "hilo") {
    return HILO_MULTIPLIERS.slice(1).map((m, i) => ({ label: `${i + 1} bonne${i ? "s" : ""} réponse${i ? "s" : ""} · ×${m}`, weight: 0 }));
  }
  const table = MINI_GAMES_BY_ID[id].rewards;
  return table ? table.map((entry) => ({ label: label(entry.value), weight: entry.weight })) : [];
}
