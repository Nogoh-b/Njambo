"use client";

import { useEffect, useMemo, useState } from "react";
import { listenPlayers } from "@/lib/playerData";
import { useAuth } from "@/hooks/useAuth";
import type { OnlinePlayerProfile } from "@/types/game";

interface UseOnlinePlayersReturn {
  players: OnlinePlayerProfile[];
  onlineCount: number;
  loading: boolean;
}

export function useOnlinePlayers(): UseOnlinePlayersReturn {
  const { user } = useAuth();
  const [players, setPlayers] = useState<OnlinePlayerProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = listenPlayers(user?.uid, (nextPlayers) => {
      setPlayers(nextPlayers);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  const onlineCount = useMemo(() => players.filter((p) => p.online).length, [players]);

  return { players, onlineCount, loading };
}
