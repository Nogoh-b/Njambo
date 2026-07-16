import { GAME_CONFIG } from "../config/gameConfig";
import type { Card, GameConfig, InstantWinCore, Player, TrickPlay } from "../types/game";

/* ═══════════════ FILE: engine/rules.js ═══════════════ */
export const sumHand = (hand: Card[]): number => hand.reduce((s, c) => s + c.value, 0);

export const isFlush = (hand: Card[]): boolean =>
  hand.length > 0 && hand.every((c) => c.suit === hand[0].suit);

export function checkInstantWin(
  players: Player[],
  cfg: GameConfig = GAME_CONFIG
): Omit<InstantWinCore, "type"> | null {
  if (!cfg.instantWin.enabled) return null;
  const candidates: { i: number; prio: number; total: number; reason: "flush" | "exact21" | "under21"; doubles: boolean }[] = [];
  players.forEach((p, i) => {
    const total = sumHand(p.hand);
    if (cfg.instantWin.flushWins && isFlush(p.hand))
      candidates.push({ i, prio: 0, total, reason: "flush", doubles: cfg.instantWin.flushDoubles });
    else if (total === cfg.instantWin.sumExactDoubles)
      candidates.push({ i, prio: 1, total, reason: "exact21", doubles: true });
    else if (total < cfg.instantWin.sumBelow)
      candidates.push({ i, prio: 1, total, reason: "under21", doubles: false });
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.prio - b.prio || a.total - b.total);
  const w = candidates[0];
  return { winnerIdx: w.i, reason: w.reason, total: w.total, doubles: w.doubles };
}

export function legalCards(hand: Card[], ledSuit: string | null): number[] {
  if (!ledSuit) return hand.map((_, i) => i);
  const inSuit = hand.map((c, i) => (c.suit === ledSuit ? i : -1)).filter((i) => i >= 0);
  return inSuit.length > 0 ? inSuit : hand.map((_, i) => i);
}

export function trickWinner(plays: TrickPlay[], ledSuit: string): number {
  let best: TrickPlay | null = null;
  for (const p of plays)
    if ((p.card.effectiveSuit ?? p.card.suit) === ledSuit && (!best || (p.card.effectiveValue ?? p.card.value) > (best.card.effectiveValue ?? best.card.value))) best = p;
  return best!.playerIdx;
}

export const lastCardDoubles = (card: Card, cfg: GameConfig = GAME_CONFIG): boolean =>
  cfg.lastCardThreeDoubles && card.value === 3;
