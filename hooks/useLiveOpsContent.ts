"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { collection, doc, getDoc, onSnapshot, query, where } from "@/lib/firestoreClient";
import {
  DEFAULT_BOOSTERS,
  DEFAULT_EVENTS,
  DEFAULT_OFFERS,
  doualaDayKey,
  normalizeEventVersion,
  type BoosterDefinition,
  type EventVersion,
  type OfferDefinition,
  type Reward,
} from "@/domain";
import { db } from "@/lib/firebase";

export interface LiveOpsContent {
  offers: OfferDefinition[];
  boosters: BoosterDefinition[];
  events: EventVersion[];
  loading: boolean;
  eventsLoaded: boolean;
  error: string | null;
}

export interface PlayerEventRun {
  id: string;
  uid: string;
  eventId: string;
  eventRevision: number;
  status: "active" | "matchmaking" | "completed" | "eliminated" | "left" | "no_match";
  ticketTier: "bronze" | "argent" | "or";
  ticketStatus: "reserved" | "consumed" | "returned";
  stageIndex: number;
  losses: number;
  currentMatchId?: string | null;
  claimedRewardKeys?: string[];
  /** Score de classement du parcours (si le classement est actif). */
  score?: number;
  /** Phase 4 : fenêtre de rachat, vies rachetées, parcours parfait. */
  eliminatedAt?: number | null;
  revivesUsed?: number;
  perfect?: boolean;
  lastSeasonPoints?: number;
  /** Copie de la version de l'événement au moment de l'inscription. */
  versionSnapshot?: EventVersion;
  createdAt?: number;
  updatedAt?: number;
}

/* ═══════════════ Store partagé LiveOps (offers, boosters, events) ═══════════════
   Un seul jeu d'abonnements WebSocket partagé entre MenuScreen (gardé monté),
   EventsScreen, EventDetailScreen, ShopScreen et CollectionItems.
   Évite :
   - de réouvrir 3 abonnements + N getDoc(event_versions) à chaque changement d'écran ;
   - d'afficher DEFAULT_EVENTS puis de tout démonter/repeindre 50 ms plus tard ;
   - de bloquer EventDetailScreen derrière « Chargement… » alors que les événements
     sont déjà en mémoire. */

const LIVE_OPS_RELEASE_GRACE_MS = 5_000;

interface LiveOpsInternal {
  offers: OfferDefinition[];
  boosters: BoosterDefinition[];
  events: EventVersion[];
  loaded: { offers: boolean; boosters: boolean; events: boolean };
  error: string | null;
}

const initialInternal: LiveOpsInternal = {
  offers: DEFAULT_OFFERS,
  boosters: DEFAULT_BOOSTERS,
  events: DEFAULT_EVENTS,
  loaded: { offers: false, boosters: false, events: false },
  error: null,
};

function toPublicSnapshot(state: LiveOpsInternal): LiveOpsContent {
  return {
    offers: state.offers,
    boosters: state.boosters,
    events: state.events,
    loading: !state.loaded.offers || !state.loaded.boosters || !state.loaded.events,
    eventsLoaded: state.loaded.events,
    error: state.error,
  };
}

let liveOpsState: LiveOpsInternal = {
  ...initialInternal,
  loaded: { ...initialInternal.loaded },
};
let liveOpsSnapshot: LiveOpsContent = toPublicSnapshot(liveOpsState);
const SERVER_LIVE_OPS_SNAPSHOT: LiveOpsContent = toPublicSnapshot(initialInternal);

const liveOpsListeners = new Set<() => void>();
const eventVersionCache = new Map<string, EventVersion>();
let stopLiveOpsSockets: (() => void) | null = null;
let liveOpsReleaseTimer: ReturnType<typeof setTimeout> | null = null;
let eventsSeq = 0;

function updateLiveOps(patch: (current: LiveOpsInternal) => LiveOpsInternal) {
  liveOpsState = patch(liveOpsState);
  liveOpsSnapshot = toPublicSnapshot(liveOpsState);
  liveOpsListeners.forEach((listener) => listener());
}

function startLiveOpsSockets() {
  if (stopLiveOpsSockets || typeof window === "undefined") return;
  let active = true;
  const fallbackTimer = window.setTimeout(() => {
    if (!active) return;
    updateLiveOps((current) => {
      if (current.loaded.offers && current.loaded.boosters && current.loaded.events) return current;
      return { ...current, loaded: { offers: true, boosters: true, events: true } };
    });
  }, 1_200);

  const fail = () => {
    if (!active) return;
    updateLiveOps((current) => ({
      ...current,
      error: "Le contenu en ligne est momentanément indisponible. Les données locales sont affichées.",
      loaded: { offers: true, boosters: true, events: true },
    }));
  };

  const stopOffers = onSnapshot(
    query(collection(db, "offers"), where("published", "==", true)),
    (snapshot) => {
      if (!active) return;
      const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as OfferDefinition);
      updateLiveOps((current) => ({
        ...current,
        offers: next.length ? next : current.offers,
        loaded: { ...current.loaded, offers: true },
        error: null,
      }));
    },
    fail,
  );

  const stopBoosters = onSnapshot(
    query(collection(db, "booster_definitions"), where("published", "==", true)),
    (snapshot) => {
      if (!active) return;
      const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as BoosterDefinition);
      updateLiveOps((current) => ({
        ...current,
        boosters: next.length ? next : current.boosters,
        loaded: { ...current.loaded, boosters: true },
        error: null,
      }));
    },
    fail,
  );

  const stopEvents = onSnapshot(
    query(collection(db, "events"), where("published", "==", true)),
    async (snapshot) => {
      const seq = ++eventsSeq;
      try {
        const versions = await Promise.all(snapshot.docs.map(async (item) => {
          const revision = Number(item.get("activeRevision") ?? 1);
          const versionKey = `${item.id}_v${revision}`;
          // Les révisions publiées (`event_versions/{id}_v{rev}`) sont immuables.
          const cached = eventVersionCache.get(versionKey);
          if (cached) return cached;
          const version = await getDoc(doc(db, "event_versions", versionKey));
          if (!version.exists()) return null;
          const normalized = normalizeEventVersion({ eventId: item.id, ...version.data() });
          eventVersionCache.set(versionKey, normalized);
          return normalized;
        }));
        if (!active || seq !== eventsSeq) return;
        const next = versions.filter((event): event is EventVersion => Boolean(event?.published));
        updateLiveOps((current) => ({
          ...current,
          events: next.length ? next : current.events,
          loaded: { ...current.loaded, events: true },
          error: null,
        }));
      } catch {
        if (seq === eventsSeq) fail();
      }
    },
    fail,
  );

  stopLiveOpsSockets = () => {
    active = false;
    window.clearTimeout(fallbackTimer);
    stopOffers();
    stopBoosters();
    stopEvents();
    stopLiveOpsSockets = null;
  };
}

function subscribeLiveOps(listener: () => void) {
  if (liveOpsReleaseTimer !== null) {
    clearTimeout(liveOpsReleaseTimer);
    liveOpsReleaseTimer = null;
  }
  liveOpsListeners.add(listener);
  startLiveOpsSockets();
  return () => {
    liveOpsListeners.delete(listener);
    if (liveOpsListeners.size === 0 && stopLiveOpsSockets) {
      liveOpsReleaseTimer = setTimeout(() => {
        liveOpsReleaseTimer = null;
        if (liveOpsListeners.size === 0) stopLiveOpsSockets?.();
      }, LIVE_OPS_RELEASE_GRACE_MS);
    }
  };
}

/**
 * Flux public du contenu publié, partagé en mémoire entre tous les écrans.
 * Les valeurs embarquées gardent l'application utilisable hors ligne et sont
 * remplacées dès que le backend répond.
 */
export function useLiveOpsContent(): LiveOpsContent {
  return useSyncExternalStore(subscribeLiveOps, () => liveOpsSnapshot, () => SERVER_LIVE_OPS_SNAPSHOT);
}

/* ═══════════════ Store partagé des parcours d'événements du joueur ═══════════════ */

interface RunsSnapshot {
  runs: PlayerEventRun[];
  loading: boolean;
  error: string | null;
}

interface RunsEntry {
  snapshot: RunsSnapshot;
  listeners: Set<() => void>;
  stop: (() => void) | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
}

const EMPTY_RUNS_SNAPSHOT: RunsSnapshot = { runs: [], loading: false, error: null };
const runsEntries = new Map<string, RunsEntry>();

function getRunsEntry(uid: string): RunsEntry {
  let entry = runsEntries.get(uid);
  if (!entry) {
    entry = {
      snapshot: { runs: [], loading: true, error: null },
      listeners: new Set(),
      stop: null,
      releaseTimer: null,
    };
    runsEntries.set(uid, entry);
  }
  return entry;
}

function setRunsSnapshot(entry: RunsEntry, next: RunsSnapshot) {
  entry.snapshot = next;
  entry.listeners.forEach((listener) => listener());
}

function subscribeRuns(uid: string | undefined, listener: () => void) {
  if (!uid || typeof window === "undefined") return () => {};
  const entry = getRunsEntry(uid);
  if (entry.releaseTimer !== null) {
    clearTimeout(entry.releaseTimer);
    entry.releaseTimer = null;
  }
  entry.listeners.add(listener);
  if (!entry.stop) {
    let active = true;
    const fallbackTimer = window.setTimeout(() => {
      if (active && entry.snapshot.loading) {
        setRunsSnapshot(entry, { ...entry.snapshot, loading: false });
      }
    }, 1_200);
    const stopSocket = onSnapshot(
      query(collection(db, "event_runs"), where("uid", "==", uid)),
      (snapshot) => {
        if (!active) return;
        setRunsSnapshot(entry, {
          runs: snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PlayerEventRun),
          loading: false,
          error: null,
        });
      },
      () => {
        if (!active) return;
        setRunsSnapshot(entry, {
          ...entry.snapshot,
          loading: false,
          error: "Ta progression du Ter ne peut pas être chargée pour le moment.",
        });
      },
    );
    entry.stop = () => {
      active = false;
      window.clearTimeout(fallbackTimer);
      stopSocket();
      entry.stop = null;
    };
  }
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0 && entry.stop) {
      entry.releaseTimer = setTimeout(() => {
        entry.releaseTimer = null;
        if (entry.listeners.size === 0) entry.stop?.();
      }, LIVE_OPS_RELEASE_GRACE_MS);
    }
  };
}

export function usePlayerEventRuns(uid?: string) {
  return useSyncExternalStore(
    (listener) => subscribeRuns(uid, listener),
    () => (uid ? getRunsEntry(uid).snapshot : EMPTY_RUNS_SNAPSHOT),
    () => EMPTY_RUNS_SNAPSHOT,
  );
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
