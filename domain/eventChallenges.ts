/* ═══════════════ Défis entre amis (phase 7) ═══════════════
   Deux amis s'affrontent sur le même événement : le prochain parcours de
   chacun est lié au défi ; à la fin des deux parcours (ou de l'événement),
   le meilleur score (barème du classement) gagne la récompense du défi. */

import type { EventVersion } from "./events";
import { scoreEventRun } from "./eventLeaderboard";

export type ChallengeStatus = "pending" | "accepted" | "declined" | "finished" | "expired";

/** Délai pour accepter un défi. */
export const CHALLENGE_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

const FINISHED_RUN = new Set(["completed", "eliminated", "left", "abandoned"]);

export function isRunFinished(status: string | undefined): boolean {
  return FINISHED_RUN.has(String(status));
}

export interface ChallengeRunState {
  status: string;
  stageIndex: number;
  losses: number;
  revivesUsed?: number;
  createdAt?: number;
  completedAt?: number | null;
  updatedAt?: number;
}

export interface ChallengeSideScore {
  score: number;
  stagesWon: number;
  durationMs: number;
  finished: boolean;
}

/** Score d'un parcours lié à un défi (même barème que le classement). */
export function challengeRunScore(run: ChallengeRunState, version: Pick<EventVersion, "stages" | "allowedLosses" | "leaderboard">): ChallengeSideScore {
  const completed = run.status === "completed";
  const stagesWon = completed ? version.stages.length : Math.max(0, run.stageIndex);
  const end = Number(run.completedAt ?? run.updatedAt ?? run.createdAt ?? 0);
  return {
    score: scoreEventRun({ stagesWon, completed, losses: run.losses, allowedLosses: version.allowedLosses, revivesUsed: run.revivesUsed }, version.leaderboard).total,
    stagesWon,
    durationMs: Math.max(0, end - Number(run.createdAt ?? end)),
    finished: isRunFinished(run.status),
  };
}

/** Vainqueur : meilleur score, puis le plus rapide ; égalité parfaite → null. */
export function decideChallenge(from: (ChallengeSideScore & { uid: string }) | null, to: (ChallengeSideScore & { uid: string }) | null): string | null {
  if (!from && !to) return null;
  if (!from) return to!.uid;
  if (!to) return from.uid;
  if (from.score !== to.score) return from.score > to.score ? from.uid : to.uid;
  if (from.durationMs !== to.durationMs) return from.durationMs < to.durationMs ? from.uid : to.uid;
  return null;
}
