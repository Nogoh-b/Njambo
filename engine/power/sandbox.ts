/* ═══════════════ Bac à sable des cartes de pouvoir (admin) ═══════════════
   Mini-table locale et reproductible (graine) sur laquelle on active le
   script EN COURS D'ÉDITION avec exactement le chemin du jeu :
   ciblage → validation (canActivatePower) → interception (bouclier) →
   interprétation → application des ops par un adaptateur mémoire.
   PUR : aucun accès réseau ni DOM, utilisé par l'éditeur et par les tests. */

import { buildDeck } from "../deck";
import { GAME_CONFIG } from "../../config/gameConfig";
import type { ActivePowerEffect, Card, DepositedCard, GameState, Player } from "../../types/game";
import type { PlayRestriction, PowerStateAdapter } from "./adapter";
import { applyResolvedOps } from "./apply";
import { findBlockingEffect } from "./blocking";
import { canActivatePower } from "./canActivate";
import { interpretPowerScript, type ResolvedOp } from "./interpret";
import { selectInHand } from "./selectors";
import { resolvePlayerRef, resolveTargets } from "./targets";
import type { PowerChoices, PowerResolved, PowerScript } from "./types";

export const SANDBOX_NAMES = ["Toi", "Tonton Rene", "Mado Biyem", "Ya Pauline"];
const EMOJIS = ["🎴", "🥁", "🎺", "🐘"];
const TURN_SECONDS = 15;

export interface SandboxTable {
  seed: number;
  state: GameState;
  deck: Card[];
  /** Secondes restantes au minuteur de chaque joueur. */
  timers: number[];
  /** Minuteurs gelés : seat → ms de gel. */
  frozen: Record<number, number>;
  /** Pénalités de minuteur différées (début du prochain tour). */
  pendingPenalty: Record<number, number>;
  restrictions: Record<number, PlayRestriction>;
}

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function rng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Donne en cours de manche (2e pli) : chaque joueur a 4 cartes en main et une
 * carte déposée au 1er pli ; c'est au tour de l'activateur. Avec
 * `trickStarted`, le joueur précédent a déjà ouvert le pli.
 */
export function createSandboxTable(options: { seed?: number; players?: number; activatedBy?: number; trickStarted?: boolean } = {}): SandboxTable {
  const seed = options.seed ?? 1;
  const count = Math.min(4, Math.max(2, options.players ?? 4));
  const random = rng(seed);
  const deck = buildDeck(GAME_CONFIG);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  const players: Player[] = Array.from({ length: count }, (_, seat) => {
    const hand = deck.splice(0, 4);
    const deposit: DepositedCard[] = [{ ...deck.splice(0, 1)[0], dropRot: 0, dx: 0, dy: 0 }];
    return { name: SANDBOX_NAMES[seat], emoji: EMOJIS[seat], isYou: seat === 0, balance: 5000, hand, deposit, powerActivations: [] };
  });
  const activatedBy = options.activatedBy ?? 0;
  // Pli entamé : le joueur précédent a déjà posé une carte (une couleur est demandée).
  const trickPlays: GameState["trickPlays"] = [];
  let leaderIdx = activatedBy;
  if (options.trickStarted) {
    leaderIdx = (activatedBy + count - 1) % count;
    const leader = players[leaderIdx];
    const [card] = leader.hand.splice(0, 1);
    leader.deposit.push({ ...card, dropRot: 0, dx: 0, dy: 0 });
    trickPlays.push({ playerIdx: leaderIdx, card });
  }
  return {
    seed,
    deck,
    timers: players.map(() => TURN_SECONDS),
    frozen: {},
    pendingPenalty: {},
    restrictions: {},
    state: {
      phase: "turns", trickNo: 2, trickPlays, leaderIdx, turnIdx: activatedBy,
      pot: 600, dominantIdx: null, banner: "", players, activePowerEffects: [],
    },
  };
}

function cloneTable(table: SandboxTable): SandboxTable {
  return JSON.parse(JSON.stringify(table)) as SandboxTable;
}

class MemoryAdapter implements PowerStateAdapter {
  readonly maxCardValue = GAME_CONFIG.ranks.max;
  constructor(private table: SandboxTable) {}
  getState() { return this.table.state; }
  getDeck() { return this.table.deck; }
  setDeck(deck: Card[]) { this.table.deck = deck; }
  setHand(seat: number, hand: Card[]) {
    this.table.state.players = this.table.state.players.map((player, index) => (index === seat ? { ...player, hand } : player));
  }
  addPot(amount: number) { this.table.state.pot += amount; }
  multiplyPot(factor: number) { this.table.state.pot = Math.round(this.table.state.pot * factor); }
  pushEffect(effect: ActivePowerEffect) { this.table.state.activePowerEffects = [...(this.table.state.activePowerEffects ?? []), effect]; }
  takeEffect(pred: (effect: ActivePowerEffect) => boolean) {
    const effects = this.table.state.activePowerEffects ?? [];
    const index = effects.findIndex(pred);
    if (index < 0) return undefined;
    const [taken] = effects.splice(index, 1);
    return taken;
  }
  freezeTimer(seat: number, untilMs: number) { this.table.frozen[seat] = Math.max(0, Math.round((untilMs - Date.now()) / 100) * 100); }
  applyTimerDelta(seat: number, seconds: number) { this.table.timers[seat] = Math.max(1, this.table.timers[seat] + seconds); }
  addPendingTimerPenalty(seat: number, seconds: number) { this.table.pendingPenalty[seat] = (this.table.pendingPenalty[seat] ?? 0) + seconds; }
  setPlayRestriction(seat: number, restriction: PlayRestriction) { this.table.restrictions[seat] = restriction; }
}

/** Choix automatiques pour les étapes interactives : premières cartes admissibles. */
export function autoChoices(script: PowerScript, table: SandboxTable, activatedBy: number, targets: number[]): PowerChoices {
  const choices: PowerChoices = {};
  const { state } = table;
  const refCtx = { activatedBy, targets, playerCount: state.players.length };
  for (const step of script.steps) {
    const request = step.choice;
    if (!request) continue;
    const owner = request.surface === "hand-self" ? activatedBy : resolvePlayerRef(request.player ?? "target", refCtx)[0];
    const player = owner === undefined ? undefined : state.players[owner];
    if (!player) continue;
    const collection: Card[] = request.surface === "deposit" ? player.deposit : player.hand;
    const eligible = request.filter ? selectInHand(collection, request.filter, { state, seat: owner, choices }) : collection.map((_, index) => index);
    const wanted = Math.max(1, request.count?.min ?? 1);
    const picks = eligible.slice(0, wanted).map((cardIdx) => ({ cardId: collection[cardIdx].id, cardIdx }));
    if (picks.length) choices[request.id] = wanted > 1 || request.count ? picks : picks[0];
  }
  return choices;
}

export interface SandboxOutcome {
  /** Refus de validation (message du jeu), sinon null. */
  refusal: string | null;
  /** La cible avait un bouclier : carte contrée (consommée, sans effet). */
  blocked: boolean;
  /** Effet concret ? (sinon la carte n'est pas consommée). */
  impact: boolean;
  targets: number[];
  choices: PowerChoices;
  plan: ResolvedOp[];
  resolved: PowerResolved | null;
  before: SandboxTable;
  after: SandboxTable;
  /** Journal lisible des opérations appliquées. */
  log: string[];
}

const cardLabel = (card: Card | undefined) => (card ? `${card.rank}${card.suit}` : "?");

function describe(op: ResolvedOp, before: SandboxTable): string {
  const name = (seat: number) => SANDBOX_NAMES[seat] ?? `Joueur ${seat + 1}`;
  const hand = (seat: number) => before.state.players[seat]?.hand ?? [];
  switch (op.op) {
    case "swapHandDeck": return `${name(op.seat)} : ${cardLabel(hand(op.seat)[op.handIdx])} part au fond de la pioche, ${cardLabel(before.deck[op.deckIdx])} arrive en main.`;
    case "swapPlayerCards": return `Échange : ${op.leftIndexes.map((i) => cardLabel(hand(op.leftSeat)[i])).join(", ")} (${name(op.leftSeat)}) ↔ ${op.rightIndexes.map((i) => cardLabel(hand(op.rightSeat)[i])).join(", ")} (${name(op.rightSeat)}).`;
    case "revealHand": return `Main de ${name(op.seat)} révélée ${op.durationMs / 1000} s.`;
    case "highlightCard": return `Carte ${cardLabel(hand(op.seat)[op.cardIdx])} de ${name(op.seat)} mise en évidence ${op.durationMs / 1000} s.`;
    case "restrictNextPlay": return `${name(op.seat)} : prochaine carte ${op.mode === "forceSelector" ? "imposée" : "interdite"} (${op.select.kind}).`;
    case "timerFreeze": return `Minuteur de ${name(op.seat)} gelé ${op.durationMs / 1000} s.`;
    case "timerDelta": return `Minuteur de ${name(op.seat)} : ${op.seconds > 0 ? "+" : ""}${op.seconds} s${op.deferred ? " (au début de son tour)" : ""}.`;
    case "boostNextCard": return `${name(op.seat)} : prochaine carte${op.valueBonus ? ` +${op.valueBonus}` : ""}${op.suitOverride ? ", prend la couleur demandée" : ""}.`;
    case "potBonus": return `Pot +${op.amount} Nkap${op.when === "winTrick" ? " si le pli est gagné" : ""}.`;
    case "potMultiplier": return `Pot ×${op.factor} si le pli est gagné.`;
    case "grantShield": return `${name(op.seat)} protégé (bloque : ${op.blocks.join(", ") || "tout"}).`;
    case "refundOnLoss": return `${name(op.seat)} : ${Math.round(op.ratio * 100)} % de la mise remboursés en cas de défaite.`;
    case "preventDoublePenalty": return `${name(op.seat)} : pas de double pénalité.`;
    default: return "Opération.";
  }
}

/** Active un script sur la table (le tableau d'origine n'est jamais muté). */
export function runSandboxActivation(
  source: SandboxTable,
  script: PowerScript,
  options: { activatedBy?: number; requestedTarget?: number; targetShield?: boolean; choices?: PowerChoices } = {},
): SandboxOutcome {
  const activatedBy = options.activatedBy ?? 0;
  const before = cloneTable(source);
  const table = cloneTable(source);
  table.state.turnIdx = activatedBy;
  const targets = resolveTargets(script.target, { activatedBy, playerCount: table.state.players.length, requested: options.requestedTarget });
  if (options.targetShield && targets[0] !== undefined) {
    table.state.activePowerEffects = [...(table.state.activePowerEffects ?? []), { cardId: "bouclier_sandbox", activatedBy: targets[0], scopeTrickNo: table.state.trickNo, shield: true, blocks: ["targeted", "reveal", "restrict", "timer_attack"] }];
  }
  const choices = options.choices ?? autoChoices(script, table, activatedBy, targets);
  const ctx = { state: table.state, activatedBy, targets, deck: table.deck, maxValue: GAME_CONFIG.ranks.max, choices };
  const base = { targets, choices, before, plan: [] as ResolvedOp[], resolved: null as PowerResolved | null };

  const refusal = canActivatePower(script, ctx);
  if (refusal) return { ...base, refusal, blocked: false, impact: false, after: table, log: [] };

  if (targets.length > 0) {
    const blocker = findBlockingEffect(script, targets[0], table.state.activePowerEffects ?? []);
    if (blocker) {
      table.state.activePowerEffects = (table.state.activePowerEffects ?? []).filter((effect) => effect !== blocker);
      return { ...base, refusal: null, blocked: true, impact: false, after: table, log: [`Contrée par le bouclier de ${SANDBOX_NAMES[targets[0]]} : carte consommée, aucun effet.`] };
    }
  }

  const outcome = interpretPowerScript(script, ctx);
  if (!outcome.resolved.impact) {
    return { ...base, refusal: null, blocked: false, impact: false, resolved: outcome.resolved, plan: outcome.plan, after: table, log: ["Aucun effet concret dans cette position : la carte ne serait pas consommée."] };
  }
  applyResolvedOps(outcome.plan, { cardId: script.id, activatedBy, trickNo: table.state.trickNo }, new MemoryAdapter(table));
  return {
    ...base, refusal: null, blocked: false, impact: true, resolved: outcome.resolved, plan: outcome.plan, after: table,
    log: outcome.plan.map((op) => describe(op, before)),
  };
}
