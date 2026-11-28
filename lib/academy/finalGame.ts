/* Partie de fin d'Académie (A4) : une vraie partie locale (LocalGameSync), gratuite (D8),
   en une seule manche et sans chrono, contre Mado et Ya en bots faciles, sans pouvoirs. */

import { ACADEMY_OPPONENTS } from "@/data/academy/scenes";
import type { GameConfig } from "@/types/game";

export const FINAL_GAME_BOTS = ACADEMY_OPPONENTS;

/** Règles de la partie de fin : une manche, pas de chrono. Le reste suit la config du jeu. */
export function finalGameConfig(cfg: GameConfig): GameConfig {
  const single = Object.fromEntries(Object.keys(cfg.matchesByMode.bot).map((count) => [count, 1])) as GameConfig["matchesByMode"]["bot"];
  return { ...cfg, unlimitedTurnsBot: true, matchesByMode: { ...cfg.matchesByMode, bot: single } };
}
