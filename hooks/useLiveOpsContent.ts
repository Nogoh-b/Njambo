"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDoc, onSnapshot, query, where } from "@/lib/firestoreClient";
import {
  DEFAULT_BOOSTERS,
  DEFAULT_EVENTS,
  DEFAULT_OFFERS,
  doualaDayKey,
  type BoosterDefinition,
  type EventVersion,
  type OfferDefinition,
  type Reward,
} from "@/domain";
import { db } from "@/lib/firebase";

interface LiveOpsContent {
  offers: OfferDefinition[];
  boosters: BoosterDefinition[];
  events: EventVersion[];
  loading: boolean;
  error: string | null;
}

export interface PlayerEventRun {
  id: string;
  uid: string;
  eventId: string;
  eventRevision: number;
  status: "active" | "matchmaking" | "completed" | "eliminated" | "left";
  ticketTier: "bronze" | "argent" | "or";
  ticketStatus: "reserved" | "consumed" | "returned";
  stageIndex: number;
  losses: number;
  updatedAt?: number;
}

/**
 * Flux public du contenu publié. Les valeurs embarquées gardent l'application
 * utilisable hors ligne et sont remplacées dès que Firestore répond.
 */
export function useLiveOpsContent(): LiveOpsContent {
  const [offers, setOffers] = useState<OfferDefinition[]>(DEFAULT_OFFERS);
  const [boosters, setBoosters] = useState<BoosterDefinition[]>(DEFAULT_BOOSTERS);
  const [events, setEvents] = useState<EventVersion[]>(DEFAULT_EVENTS);
  const [loaded, setLoaded] = useState({ offers: false, boosters: false, events: false });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fallbackTimer = window.setTimeout(() => {
      if (active) setLoaded({ offers: true, boosters: true, events: true });
    }, 1_200);
    const fail = () => {
      if (active) {
        setError("Le contenu en ligne est momentanément indisponible. Les données locales sont affichées.");
        setLoaded({ offers: true, boosters: true, events: true });
      }
    };

    const stopOffers = onSnapshot(
      query(collection(db, "offers"), where("published", "==", true)),
      (snapshot) => {
        if (!active) return;
        const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as OfferDefinition);
        if (next.length) setOffers(next);
        setLoaded((current) => ({ ...current, offers: true }));
      },
      fail,
    );

    const stopBoosters = onSnapshot(
      query(collection(db, "booster_definitions"), where("published", "==", true)),
      (snapshot) => {
        if (!active) return;
        const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as BoosterDefinition);
        if (next.length) setBoosters(next);
        setLoaded((current) => ({ ...current, boosters: true }));
      },
      fail,
    );

    const stopEvents = onSnapshot(
      query(collection(db, "events"), where("published", "==", true)),
      async (snapshot) => {
        try {
          const versions = await Promise.all(snapshot.docs.map(async (item) => {
            const revision = Number(item.get("activeRevision") ?? 1);
            const version = await getDoc(doc(db, "event_versions", `${item.id}_v${revision}`));
            return version.exists() ? ({ eventId: item.id, ...version.data() } as EventVersion) : null;
          }));
          if (!active) return;
          const next = versions.filter((event): event is EventVersion => Boolean(event?.published));
          if (next.length) setEvents(next);
          setLoaded((current) => ({ ...current, events: true }));
        } catch {
          fail();
        }
      },
      fail,
    );

    return () => {
      active = false;
      window.clearTimeout(fallbackTimer);
      stopOffers();
      stopBoosters();
      stopEvents();
    };
  }, []);

  return {
    offers,
    boosters,
    events,
    loading: !loaded.offers || !loaded.boosters || !loaded.events,
    error,
  };
}

export function usePlayerEventRuns(uid?: string) {
  const [runs, setRuns] = useState<PlayerEventRun[]>([]);
  const [loading, setLoading] = useState(Boolean(uid));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setRuns([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const fallbackTimer = window.setTimeout(() => setLoading(false), 1_200);
    const stop = onSnapshot(
      query(collection(db, "event_runs"), where("uid", "==", uid)),
      (snapshot) => {
        setRuns(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PlayerEventRun));
        setLoading(false);
        setError(null);
      },
      () => {
        setLoading(false);
        setError("Ta progression du Ter ne peut pas être chargée pour le moment.");
      },
    );
    return () => {
      window.clearTimeout(fallbackTimer);
      stop();
    };
  }, [uid]);

  return { runs, loading, error };
}

export function useDailyGrid(uid?: string) {
  const [day, setDay] = useState(() => doualaDayKey());
  const [purchased, setPurchased] = useState<Record<string, Reward>>({});
  const [duplicateCompensations, setDuplicateCompensations] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(Boolean(uid));

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = doualaDayKey();
      setDay((current) => current === next ? current : next);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!uid) {
      setPurchased({});
      setDuplicateCompensations({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const fallbackTimer = window.setTimeout(() => setLoading(false), 1_200);
    const stop = onSnapshot(
      doc(db, "daily_rotations", day, "players", uid),
      (snapshot) => {
        setPurchased((snapshot.get("purchased") ?? {}) as Record<string, Reward>);
        setDuplicateCompensations((snapshot.get("duplicateCompensations") ?? {}) as Record<string, number>);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => {
      window.clearTimeout(fallbackTimer);
      stop();
    };
  }, [day, uid]);

  return { day, purchased, duplicateCompensations, loading };
}
