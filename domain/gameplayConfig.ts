export const PLAYER_COUNTS = [2, 3, 4] as const;
export const GAMEPLAY_MODES = ["bot", "friends", "online"] as const;
export type GameplayMode = typeof GAMEPLAY_MODES[number];
export type PlayerCount = typeof PLAYER_COUNTS[number];
export type MatchCounts = Record<PlayerCount, number>;
export interface GameplayConfig {
  turnSeconds: number;
  maxEquippedPowers: number;
  /** Rythme de la donne : délai entre deux cartes distribuées (ms). Copié dans les règles de chaque partie à son départ. */
  dealPerCardMs: number;
  /** Rythme de la donne : durée du vol d'une carte (ms). */
  dealFlightMs: number;
  /** Tables contre l'IA : pas de limite de temps par tour (aucun coup joué automatiquement). Amis, Online et événements gardent leur minuteur. */
  unlimitedTurnsBot: boolean;
  /** Taille des cartes des adversaires en % de la main du joueur (admin, Règles des parties). */
  opponentCardScale: number;
  /** Taille des cartes du joueur en % de l'échelle de base (admin, Règles des parties). */
  playerCardScale: number;
  matchesByMode: Record<GameplayMode, MatchCounts>;
}

/** Échéance d'un tour sans limite : jamais atteinte (date maximale représentable). */
export const UNLIMITED_DEADLINE_AT = 8_640_000_000_000_000;

/** Bornes du rythme de la donne (réglable dans l'admin, Règles des parties). */
export const DEAL_TIMING_LIMITS = {
  perCardMs: { min: 40, max: 400 },
  flightMs: { min: 200, max: 1500 },
} as const;

/** Bornes d'échelle des cartes sur la table (%, réglable dans l'admin, Règles des parties). */
export const CARD_SCALE_LIMITS = {
  opponentPct: { min: 60, max: 130 },
  playerPct: { min: 80, max: 130 },
} as const;

export const DEFAULT_GAMEPLAY_CONFIG: GameplayConfig = {
  turnSeconds: 15,
  maxEquippedPowers: 3,
  dealPerCardMs: 110,
  dealFlightMs: 520,
  unlimitedTurnsBot: false,
  opponentCardScale: 92,
  playerCardScale: 100,
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
    // Réglages enregistrés avant l'ajout du rythme de la donne : valeurs par défaut.
    dealPerCardMs: validInt(source.dealPerCardMs, DEAL_TIMING_LIMITS.perCardMs.min, DEAL_TIMING_LIMITS.perCardMs.max) ? source.dealPerCardMs : DEFAULT_GAMEPLAY_CONFIG.dealPerCardMs,
    dealFlightMs: validInt(source.dealFlightMs, DEAL_TIMING_LIMITS.flightMs.min, DEAL_TIMING_LIMITS.flightMs.max) ? source.dealFlightMs : DEFAULT_GAMEPLAY_CONFIG.dealFlightMs,
    unlimitedTurnsBot: source.unlimitedTurnsBot === true,
    opponentCardScale: validInt(source.opponentCardScale, CARD_SCALE_LIMITS.opponentPct.min, CARD_SCALE_LIMITS.opponentPct.max)
      ? source.opponentCardScale
      : DEFAULT_GAMEPLAY_CONFIG.opponentCardScale,
    playerCardScale: validInt(source.playerCardScale, CARD_SCALE_LIMITS.playerPct.min, CARD_SCALE_LIMITS.playerPct.max)
      ? source.playerCardScale
      : DEFAULT_GAMEPLAY_CONFIG.playerCardScale,
    matchesByMode,
  };
}

export function validateGameplayConfig(raw: unknown): boolean {
  const source = object(raw);
  const modes = object(source.matchesByMode);
  return validInt(source.turnSeconds, 5, 120) && validInt(source.maxEquippedPowers, 0, 8)
    && validInt(source.dealPerCardMs, DEAL_TIMING_LIMITS.perCardMs.min, DEAL_TIMING_LIMITS.perCardMs.max)
    && validInt(source.dealFlightMs, DEAL_TIMING_LIMITS.flightMs.min, DEAL_TIMING_LIMITS.flightMs.max)
    && (source.unlimitedTurnsBot === undefined || typeof source.unlimitedTurnsBot === "boolean")
    && (source.opponentCardScale === undefined || validInt(source.opponentCardScale, CARD_SCALE_LIMITS.opponentPct.min, CARD_SCALE_LIMITS.opponentPct.max))
    && (source.playerCardScale === undefined || validInt(source.playerCardScale, CARD_SCALE_LIMITS.playerPct.min, CARD_SCALE_LIMITS.playerPct.max))
    && GAMEPLAY_MODES.every((mode) => PLAYER_COUNTS.every((count) => validInt(object(modes[mode])[count], 1, 20)));
}

/** Rythme de la donne d'une partie : celui copié dans ses règles au départ, sinon la valeur donnée. */
export interface DealTiming { perCardMs: number; flightMs: number }
export function dealTimingOf(rules: { dealPerCardMs?: unknown; dealFlightMs?: unknown } | null | undefined, fallback: DealTiming): DealTiming {
  const perCard = Number(rules?.dealPerCardMs), flight = Number(rules?.dealFlightMs);
  return {
    perCardMs: Number.isFinite(perCard) && perCard > 0 ? perCard : fallback.perCardMs,
    flightMs: Number.isFinite(flight) && flight > 0 ? flight : fallback.flightMs,
  };
}

/** Durée totale de la donne (toutes les cartes parties et posées). */
export function dealDurationMs(timing: DealTiming, playerCount: number, cardsPerPlayer: number): number {
  return playerCount * cardsPerPlayer * timing.perCardMs + timing.flightMs;
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
