export const PLAYER_COUNTS = [2, 3, 4] as const;
export const GAMEPLAY_MODES = ["bot", "friends", "online"] as const;
export type GameplayMode = typeof GAMEPLAY_MODES[number];
export type PlayerCount = typeof PLAYER_COUNTS[number];
export type MatchCounts = Record<PlayerCount, number>;
export interface GameplayConfig {
  turnSeconds: number;
  maxEquippedPowers: number;
  matchesByMode: Record<GameplayMode, MatchCounts>;
}

export const DEFAULT_GAMEPLAY_CONFIG: GameplayConfig = {
  turnSeconds: 15,
  maxEquippedPowers: 3,
  matchesByMode: {
    bot: { 2: 1, 3: 1, 4: 1 },
    friends: { 2: 1, 3: 1, 4: 1 },
    online: { 2: 1, 3: 1, 4: 1 },
  },
};

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const validInt = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && Number(value) >= min && Number(value) <= max;

export function normalizeGameplayConfig(raw: unknown): GameplayConfig {
  const source = object(raw);
  const modes = object(source.matchesByMode);
  const matchesByMode = { ...DEFAULT_GAMEPLAY_CONFIG.matchesByMode };
  for (const mode of GAMEPLAY_MODES) {
    const counts = object(modes[mode]);
    matchesByMode[mode] = { 2: 1, 3: 1, 4: 1 };
    for (const count of PLAYER_COUNTS) matchesByMode[mode][count] = validInt(counts[count], 1, 20) ? counts[count] : 1;
  }
  return {
    turnSeconds: validInt(source.turnSeconds, 5, 120) ? source.turnSeconds : 15,
    maxEquippedPowers: validInt(source.maxEquippedPowers, 0, 8) ? source.maxEquippedPowers : 3,
    matchesByMode,
  };
}

export function validateGameplayConfig(raw: unknown): boolean {
  const source = object(raw);
  const modes = object(source.matchesByMode);
  return validInt(source.turnSeconds, 5, 120) && validInt(source.maxEquippedPowers, 0, 8)
    && GAMEPLAY_MODES.every((mode) => PLAYER_COUNTS.every((count) => validInt(object(modes[mode])[count], 1, 20)));
}

export function matchCountFor(config: GameplayConfig, mode: GameplayMode, players: number): number {
  return config.matchesByMode[mode][players as PlayerCount] ?? 1;
}

/** Le plus de manches gagnées ; la victoire la plus récente départage les égalités. */
export function seriesWinner<T extends string | number>(winners: T[], eligible: T[]): T {
  const scores = new Map(eligible.map((id) => [id, winners.filter((winner) => winner === id).length]));
  const best = Math.max(0, ...scores.values());
  return [...winners].reverse().find((id) => scores.get(id) === best) ?? eligible[0];
}
