"use client";

import { PlayArenaScreen } from "@/components/scenes/PlayArenaScreen";
import type { BotDifficulty } from "@/types/game";

interface FriendsSetupScreenProps {
  onBotStart: (botCount: number, mise: number, difficulty: BotDifficulty) => void;
}

export function FriendsSetupScreen({ onBotStart }: FriendsSetupScreenProps) {
  return <PlayArenaScreen initialMode="friends" onBotStart={onBotStart} />;
}
