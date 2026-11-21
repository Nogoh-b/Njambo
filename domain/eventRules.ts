/* ═══════════════ Règles de jeu des événements (phase 4) ═══════════════
   Pures : règles d'une table (modificateurs, boss, IA), rachat de vie,
   parcours parfait. Partagées par le serveur et l'affichage client. */

import type { EventBoss, EventReviveConfig, EventStage, EventStageModifier } from "./events";

export type ServerBotDifficulty = "easy" | "normal" | "hard";

export interface StageMatchRules {
  stakeNkap: number;
  powersDisabled: boolean;
  turnSeconds: number;
  botDifficulty: ServerBotDifficulty;
  modifiers: EventStageModifier[];
  boss: EventBoss | null;
  matchCount: number;
}

/** Niveau de boss 1-5 → IA : 1-2 facile, 3 normale, 4-5 difficile. */
export function difficultyForBotLevel(level: number): ServerBotDifficulty {
  return level <= 2 ? "easy" : level === 3 ? "normal" : "hard";
}

const STAGE_DIFFICULTY: Record<EventStage["difficulty"], ServerBotDifficulty> = {
  facile: "easy", normal: "normal", difficile: "hard", elite: "hard",
};

export function stageMatchRules(
  stage: Pick<EventStage, "stakeNkap" | "powersAllowed" | "modifiers" | "turnTimerSeconds" | "difficulty" | "boss" | "matchCount">,
  defaultTurnSeconds: number,
): StageMatchRules {
  const modifiers = stage.modifiers ?? [];
  return {
    stakeNkap: Math.max(0, stage.stakeNkap) * (modifiers.includes("double_stake") ? 2 : 1),
    powersDisabled: !stage.powersAllowed || modifiers.includes("no_powers"),
    turnSeconds: modifiers.includes("turn_timer") && stage.turnTimerSeconds ? stage.turnTimerSeconds : defaultTurnSeconds,
    botDifficulty: stage.boss ? difficultyForBotLevel(stage.boss.botLevel) : STAGE_DIFFICULTY[stage.difficulty] ?? "normal",
    modifiers,
    boss: stage.boss ?? null,
    matchCount: stage.matchCount ?? 1,
  };
}

/* ─────────────── Rachat de vie ─────────────── */

export function revivePrice(revivesUsed: number, config: Pick<EventReviveConfig, "pricesCauris">): number {
  const prices = config.pricesCauris;
  if (prices.length === 0) return 0;
  return prices[Math.min(Math.max(0, revivesUsed), prices.length - 1)];
}

export type ReviveRefusal = "disabled" | "not_eliminated" | "max_reached" | "window_expired";

export interface ReviveCheck {
  ok: boolean;
  reason?: ReviveRefusal;
  price: number;
  /** Fin de la fenêtre de décision (0 si inconnue). */
  expiresAt: number;
  remaining: number;
}

export function canRevive(
  run: { status: string; eliminatedAt?: number | null; revivesUsed?: number },
  config: EventReviveConfig,
  now: number,
): ReviveCheck {
  const used = Math.max(0, run.revivesUsed ?? 0);
  const price = revivePrice(used, config);
  const expiresAt = run.eliminatedAt ? run.eliminatedAt + config.windowMinutes * 60_000 : 0;
  const base = { price, expiresAt, remaining: Math.max(0, config.maxPerRun - used) };
  if (!config.enabled) return { ...base, ok: false, reason: "disabled" };
  if (run.status !== "eliminated") return { ...base, ok: false, reason: "not_eliminated" };
  if (used >= config.maxPerRun) return { ...base, ok: false, reason: "max_reached" };
  if (!run.eliminatedAt || now > expiresAt) return { ...base, ok: false, reason: "window_expired" };
  return { ...base, ok: true };
}

/** Parcours parfait : terminé sans perdre de vie ni racheter de vie. */
export function isPerfectRun(run: { losses: number; revivesUsed?: number }): boolean {
  return run.losses === 0 && (run.revivesUsed ?? 0) === 0;
}
