"use client";

import { PlayArenaScreen } from "@/components/scenes/PlayArenaScreen";
import type { BotDifficulty } from "@/types/game";

interface OnlineSetupScreenProps {
  onBotStart: (botCount: number, mise: number, difficulty: BotDifficulty) => void;
}

export function OnlineSetupScreen({ onBotStart }: OnlineSetupScreenProps) {
  return <PlayArenaScreen initialMode="online" onBotStart={onBotStart} />;
}
