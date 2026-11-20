/* ═══════════════ Classement des événements (phase 2) ═══════════════
   Règles pures : calcul du score d'un parcours, ordre du classement,
   récompense d'un rang. Partagées par le serveur (règlement de table, job
   de distribution) et le client (affichage des points gagnés). */

import type { Reward } from "./catalog";
import type { EventLeaderboardConfig } from "./events";

export interface EventRunScoreInput {
  /** Tables validées (= nombre de tables franchies). */
  stagesWon: number;
  completed: boolean;
  losses: number;
  allowedLosses: number;
  /** Un parcours sauvé (vie rachetée) n'est jamais « parfait ». */
  revivesUsed?: number;
}

export interface EventScoreBreakdown {
  stages: number;
  livesLeft: number;
  perfect: number;
  total: number;
}

/**
 * Barème de la fiche : points par table gagnée ; à la complétion seulement,
 * points par vie restante et bonus « parcours parfait » (aucune vie perdue).
 * Les vies ne comptent qu'à la fin pour qu'un simple inscrit ne marque rien.
 */
export function scoreEventRun(input: EventRunScoreInput, board: Pick<EventLeaderboardConfig, "pointsPerStage" | "pointsPerLifeLeft" | "perfectBonus">): EventScoreBreakdown {
  const stages = Math.max(0, input.stagesWon) * board.pointsPerStage;
  const livesLeft = input.completed ? Math.max(0, input.allowedLosses - input.losses) * board.pointsPerLifeLeft : 0;
  const perfect = input.completed && input.losses === 0 && (input.revivesUsed ?? 0) === 0 ? board.perfectBonus : 0;
  return { stages, livesLeft, perfect, total: stages + livesLeft + perfect };
}

export interface EventLeaderboardEntry {
  uid: string;
  eventId: string;
  runId: string;
  score: number;
  stagesWon: number;
  livesLeft: number;
  perfect: boolean;
  completed: boolean;
  /** Temps entre l'inscription du parcours et l'obtention de ce score. */
  durationMs: number;
  /** Instant où ce score a été atteint. */
  reachedAt: number;
  name: string;
  emoji: string;
  updatedAt: number;
}

type Comparable = Pick<EventLeaderboardEntry, "score" | "durationMs" | "reachedAt" | "uid">;

/** Ordre du classement : score ↓, puis le plus rapide, puis le premier arrivé. */
export function compareLeaderboardEntries(a: Comparable, b: Comparable): number {
  return b.score - a.score || a.durationMs - b.durationMs || a.reachedAt - b.reachedAt || a.uid.localeCompare(b.uid);
}

/**
 * Un joueur n'a qu'une ligne : son meilleur parcours. Le parcours déjà
 * inscrit se met toujours à jour ; un autre parcours ne le remplace que s'il
 * fait strictement mieux.
 */
export function shouldReplaceEntry(existing: Comparable & { runId: string } | null | undefined, candidate: Comparable & { runId: string }): boolean {
  if (!existing) return true;
  if (existing.runId === candidate.runId) return candidate.score >= existing.score;
  return compareLeaderboardEntries(candidate, existing) < 0;
}

export function rankRewardsFor(rank: number, board: Pick<EventLeaderboardConfig, "rankRewards">): Reward[] {
  return board.rankRewards.find((tier) => rank >= tier.fromRank && rank <= tier.toRank)?.reward ?? [];
}

/** Dernier rang récompensé (0 si aucune tranche). */
export function lastRewardedRank(board: Pick<EventLeaderboardConfig, "rankRewards">): number {
  return board.rankRewards.reduce((max, tier) => Math.max(max, tier.toRank), 0);
}

/** Rangs 1..n d'une liste déjà triée (pas d'ex æquo : le départage est total). */
export function rankEntries<T extends Comparable>(entries: T[]): Array<T & { rank: number }> {
  return [...entries].sort(compareLeaderboardEntries).map((entry, index) => ({ ...entry, rank: index + 1 }));
}
