"use client";

import { ResultScreen } from "@/components/scenes/ResultScreen";
import type { Result } from "@/types/game";

interface ResultOverlayProps {
  result: Result;
  mise: number;
  onNext: () => void;
  onMenu: () => void;
  canNext: boolean;
}

export function ResultOverlay(props: ResultOverlayProps) {
  return <ResultScreen {...props} />;
}
