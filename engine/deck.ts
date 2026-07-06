import { GAME_CONFIG } from "@/config/gameConfig";
import type { Card, GameConfig } from "@/types/game";

/* ═══════════════ FILE: engine/deck.js ═══════════════ */
export function buildDeck(cfg: GameConfig = GAME_CONFIG): Card[] {
  const deck: Card[] = [];
  for (const su of cfg.suits)
    for (let v = cfg.ranks.min; v <= cfg.ranks.max; v++)
      deck.push({ rank: String(v), value: v, suit: su.s, color: su.color, id: v + su.s });
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const d = [...arr];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
