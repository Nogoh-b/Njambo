import type { EventVersion, Reward } from "@/domain";

/* Calcul pur des conséquences d'une partie d'événement : compare la photo
   du parcours prise avant la partie au run réglé par le serveur. */

export interface EventRunBefore {
  stageIndex: number;
  losses: number;
  score?: number;
}

export interface EventRunAfter {
  status: string;
  stageIndex: number;
  losses: number;
  score?: number;
  perfect?: boolean;
  versionSnapshot?: EventVersion;
}

export type EventOutcome =
  | { kind: "advance"; stageIndex: number; losses: number; rewards: Reward[]; pointsGained?: number }
  | { kind: "completed"; stageIndex: number; losses: number; rewards: Reward[]; pointsGained?: number; perfect?: boolean }
  | { kind: "life_lost"; stageIndex: number; losses: number }
  | { kind: "eliminated"; stageIndex: number; losses: number };

export function resolveEventOutcome(
  event: EventVersion,
  before: EventRunBefore,
  after: EventRunAfter,
): EventOutcome | null {
  // Le run garde la version de l'événement au moment de l'inscription.
  const version = after.versionSnapshot ?? event;
  const stages = version.stages;
  const losses = Number(after.losses ?? 0);
  const stageIndex = Number(after.stageIndex ?? 0);
  /* Points de classement gagnés (présents seulement si le classement est actif). */
  const gained = Number(after.score ?? 0) - Number(before.score ?? 0);
  const points = gained > 0 ? { pointsGained: gained } : {};

  if (after.status === "completed") {
    const last = stages[stageIndex];
    return {
      kind: "completed",
      stageIndex,
      losses,
      rewards: [...(last?.reward ?? []), ...version.finalReward, ...(after.perfect ? version.perfectRun?.reward ?? [] : [])],
      ...points,
      ...(after.perfect ? { perfect: true } : {}),
    };
  }
  if (after.status === "eliminated" && losses > before.losses) {
    return { kind: "eliminated", stageIndex, losses };
  }
  if (stageIndex > before.stageIndex) {
    const cleared = stages[before.stageIndex];
    return { kind: "advance", stageIndex: before.stageIndex, losses, rewards: [...(cleared?.reward ?? [])], ...points };
  }
  if (losses > before.losses) {
    return { kind: "life_lost", stageIndex, losses };
  }
  return null;
}
