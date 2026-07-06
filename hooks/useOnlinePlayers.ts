"use client";

import { useMemo } from "react";
import { MOCK_FRIENDS } from "@/data/mock";

/* ═══════════════ useOnlinePlayers — stub pour Firebase (joueurs en ligne) ═══════════════
   Prêt à être remplacé par une implémentation Firebase réelle
   (Firestore onSnapshot sur la collection "players"). */

interface OnlinePlayer {
  uid: string;
  name: string;
  emoji: string;
  online: boolean;
}

interface UseOnlinePlayersReturn {
  players: OnlinePlayer[];
  onlineCount: number;
}

export function useOnlinePlayers(): UseOnlinePlayersReturn {
  const players = useMemo<OnlinePlayer[]>(() =>
    MOCK_FRIENDS.map((f, i) => ({
      uid: "mock_" + i,
      name: f.name,
      emoji: f.emoji,
      online: f.online,
    })),
    [],
  );

  const onlineCount = useMemo(() => players.filter((p) => p.online).length, [players]);

  return { players, onlineCount };
}
