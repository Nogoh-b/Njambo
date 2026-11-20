"use client";

/* Classement d'un événement (commande getEventLeaderboard). Rechargé quand
   refreshKey change (retour de partie) ; inactif si le classement est
   désactivé, sans utilisateur, ou en aperçu admin. */

import { useCallback, useEffect, useState } from "react";
import type { EventLeaderboardEntry, EventRankReward } from "@/domain";
import { callBackend } from "@/lib/backend";

export type RankedEntry = EventLeaderboardEntry & { rank: number };

export interface EventLeaderboardData {
  enabled: boolean;
  endsAt: number;
  settledAt: number | null;
  scoring: { pointsPerStage: number; pointsPerLifeLeft: number; perfectBonus: number };
  rankRewards: EventRankReward[];
  minParticipants: number;
  participants: number;
  top: RankedEntry[];
  me: RankedEntry | null;
}

export function useEventLeaderboard(eventId: string | null | undefined, active: boolean, refreshKey = 0) {
  const [data, setData] = useState<EventLeaderboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!eventId || !active) return;
    try {
      setError(null);
      setData((await callBackend<EventLeaderboardData>("getEventLeaderboard", { eventId })).data);
    } catch {
      setError("Classement indisponible pour le moment.");
    }
  }, [eventId, active]);

  useEffect(() => { void reload(); }, [reload, refreshKey]);

  return { data: active ? data : null, error, reload };
}
