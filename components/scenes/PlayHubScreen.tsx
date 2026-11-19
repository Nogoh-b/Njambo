"use client";

import { useAuth } from "@/hooks/useAuth";
import { PlayArenaScreen } from "@/components/scenes/PlayArenaScreen";
import type { BotDifficulty } from "@/types/game";

interface PlayHubScreenProps {
  onBotStart: (botCount: number, mise: number, difficulty: BotDifficulty) => void;
}

export function PlayHubScreen({ onBotStart }: PlayHubScreenProps) {
  const { user } = useAuth();
  const isGuest = !user || user.isAnonymous === true;

  return <PlayArenaScreen initialMode={isGuest ? "bot" : "online"} onBotStart={onBotStart} />;
}
