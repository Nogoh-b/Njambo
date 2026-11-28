"use client";

/* Saisons en cours (ou en délai de réclamation) + ma progression.
   Mis en cache en mémoire par joueur (30 s) : revenir sur Événements ou passer
   d'Événements à Saison affiche le bandeau dès la 1re image sans décalage de mise
   en page ni requête HTTP redondante. `reload()` force une lecture fraîche. */

import { useCallback, useEffect, useState } from "react";
import type { SeasonDefinition, SeasonPhase, SeasonProgress } from "@/domain";
import { callBackend } from "@/lib/backend";
import { useAuth } from "@/hooks/useAuth";

export interface SeasonView { season: SeasonDefinition; phase: SeasonPhase; progress: SeasonProgress }

const CACHE_TTL_MS = 30_000;
const seasonsCache = new Map<string, { data: SeasonView[]; fetchedAt: number }>();
const inflight = new Map<string, Promise<SeasonView[]>>();

async function fetchSeasons(uid: string, force: boolean): Promise<SeasonView[]> {
  if (!force) {
    const cached = seasonsCache.get(uid);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;
    const pending = inflight.get(uid);
    if (pending) return pending;
  }
  const promise = callBackend<{ seasons: SeasonView[] }>("getSeasons")
    .then((result) => {
      seasonsCache.set(uid, { data: result.data.seasons, fetchedAt: Date.now() });
      return result.data.seasons;
    })
    .finally(() => {
      if (inflight.get(uid) === promise) inflight.delete(uid);
    });
  inflight.set(uid, promise);
  return promise;
}

export function useSeasons() {
  const { user } = useAuth();
  const uid = user && !user.isAnonymous ? user.uid : null;
  const signedIn = Boolean(uid);
  const [seasons, setSeasons] = useState<SeasonView[] | null>(() => {
    if (!uid) return [];
    return seasonsCache.get(uid)?.data ?? null;
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force: boolean) => {
    if (!uid) {
      setSeasons([]);
      return;
    }
    try {
      setError(null);
      setSeasons(await fetchSeasons(uid, force));
    } catch {
      setError("Saison indisponible pour le moment.");
    }
  }, [uid]);

  const reload = useCallback(() => load(true), [load]);

  useEffect(() => {
    if (!uid) {
      setSeasons([]);
      return;
    }
    const cached = seasonsCache.get(uid);
    if (cached) setSeasons(cached.data);
    void load(false);
  }, [uid, load]);

  return { seasons, error, reload, signedIn };
}
