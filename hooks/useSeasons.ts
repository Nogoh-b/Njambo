"use client";

/* Saisons en cours (ou en délai de réclamation) + ma progression. */

import { useCallback, useEffect, useState } from "react";
import type { SeasonDefinition, SeasonPhase, SeasonProgress } from "@/domain";
import { callBackend } from "@/lib/backend";
import { useAuth } from "@/hooks/useAuth";

export interface SeasonView { season: SeasonDefinition; phase: SeasonPhase; progress: SeasonProgress }

export function useSeasons() {
  const { user } = useAuth();
  const [seasons, setSeasons] = useState<SeasonView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signedIn = Boolean(user && !user.isAnonymous);

  const reload = useCallback(async () => {
    if (!signedIn) { setSeasons([]); return; }
    try {
      setError(null);
      setSeasons((await callBackend<{ seasons: SeasonView[] }>("getSeasons")).data.seasons);
    } catch {
      setError("Saison indisponible pour le moment.");
    }
  }, [signedIn]);

  useEffect(() => { void reload(); }, [reload]);
  return { seasons, error, reload, signedIn };
}
