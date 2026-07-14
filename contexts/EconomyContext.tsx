"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { calculateEnergy, rankTier, type PlayerEconomy } from "@/domain";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

interface PublicEconomy {
  nkap: number;
  cauris: number;
  energy: ReturnType<typeof calculateEnergy>;
  daily: PlayerEconomy["daily"];
  debtCauris: number;
  spendingBlocked: boolean;
}

interface PlayerRank {
  crowns: number;
  badge: ReturnType<typeof rankTier>;
  placementMatchesRemaining: number;
}

export interface InventoryState {
  tickets?: Partial<Record<"bronze" | "argent" | "or", number>>;
  cards?: Record<string, { unlockedAt?: number; rarity?: string }>;
  boosterBooks?: Record<string, number>;
  equippedCards?: string[];
  [key: string]: unknown;
}

interface EconomyContextValue {
  economy: PublicEconomy | null;
  inventory: InventoryState;
  rank: PlayerRank;
  pendingBoosterOpening: { openingId: string; boosterId: string; positions: number[] } | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  command: <T = unknown>(name: string, payload?: Record<string, unknown>) => Promise<T>;
}

const EconomyContext = createContext<EconomyContextValue | null>(null);

function idempotencyKey(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function EconomyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [economy, setEconomy] = useState<PublicEconomy | null>(null);
  const [rawEnergy, setRawEnergy] = useState<PlayerEconomy["energy"] | null>(null);
  const [inventory, setInventory] = useState<InventoryState>({});
  const [rank, setRank] = useState<PlayerRank>({ crowns: 1_000, badge: rankTier(1_000), placementMatchesRemaining: 5 });
  const [pendingBoosterOpening, setPendingBoosterOpening] = useState<EconomyContextValue["pendingBoosterOpening"]>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const command = useCallback(async <T,>(name: string, payload: Record<string, unknown> = {}) => {
    const call = httpsCallable<Record<string, unknown>, T>(functions, name);
    const result = await call({ ...payload, idempotencyKey: payload.idempotencyKey ?? idempotencyKey(name) });
    return result.data;
  }, []);

  const refresh = useCallback(async () => {
    if (!user || user.isAnonymous) return;
    setLoading(true);
    setError(null);
    try {
      await command("ensurePlayerProfile", { name: user.name, emoji: user.emoji });
      const result = await command<{ economy: PublicEconomy; inventory: InventoryState; player: { crowns?: number; placementMatchesRemaining?: number }; pendingBoosterOpening: EconomyContextValue["pendingBoosterOpening"] }>("getPlayerEconomy");
      setEconomy(result.economy);
      setInventory(result.inventory);
      setPendingBoosterOpening(result.pendingBoosterOpening);
      const crowns = Number(result.player.crowns ?? 1_000);
      setRank({ crowns, badge: rankTier(crowns), placementMatchesRemaining: Number(result.player.placementMatchesRemaining ?? 5) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ECONOMY_UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  }, [command, user]);

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setEconomy(null); setRawEnergy(null); setInventory({});
      return;
    }
    void refresh();
    const unsubEconomy = onSnapshot(doc(db, "economies", user.uid), (snapshot) => {
      if (!snapshot.exists()) return;
      const value = snapshot.data() as PlayerEconomy;
      setRawEnergy(value.energy);
      setEconomy({
        nkap: value.nkap, cauris: value.cauris, energy: calculateEnergy(value.energy), daily: value.daily,
        debtCauris: value.debtCauris ?? 0, spendingBlocked: value.spendingBlocked === true,
      });
    });
    const unsubInventory = onSnapshot(doc(db, "inventories", user.uid), (snapshot) => setInventory((snapshot.data() ?? {}) as InventoryState));
    const unsubPlayer = onSnapshot(doc(db, "players", user.uid), (snapshot) => {
      const crowns = Number(snapshot.get("crowns") ?? 1_000);
      setRank({ crowns, badge: rankTier(crowns), placementMatchesRemaining: Number(snapshot.get("placementMatchesRemaining") ?? 5) });
    });
    return () => { unsubEconomy(); unsubInventory(); unsubPlayer(); };
  }, [refresh, user]);

  useEffect(() => {
    if (!rawEnergy) return;
    const timer = setInterval(() => setEconomy((current) => current ? { ...current, energy: calculateEnergy(rawEnergy) } : current), 15_000);
    return () => clearInterval(timer);
  }, [rawEnergy]);

  const value = useMemo(() => ({ economy, inventory, rank, pendingBoosterOpening, loading, error, refresh, command }), [economy, inventory, rank, pendingBoosterOpening, loading, error, refresh, command]);
  return <EconomyContext.Provider value={value}>{children}</EconomyContext.Provider>;
}

export function useEconomy() {
  const value = useContext(EconomyContext);
  if (!value) throw new Error("useEconomy doit être utilisé sous <EconomyProvider>");
  return value;
}
