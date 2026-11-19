"use client";

import { PlayArenaScreen } from "@/components/scenes/PlayArenaScreen";
import type { BotDifficulty } from "@/types/game";

interface BotSetupScreenProps {
  onStart: (botCount: number, mise: number, difficulty: BotDifficulty) => void;
}

export function BotSetupScreen({ onStart }: BotSetupScreenProps) {
  return <PlayArenaScreen initialMode="bot" onBotStart={onStart} />;
}
