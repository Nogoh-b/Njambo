import { legalCards } from "@/engine/rules";
import type { Card } from "@/types/game";

/* ═══════════════ FILE: engine/bot.js ═══════════════ */
export function botChooseCard(
  hand: Card[],
  ledSuit: string | null,
  isLastTrick: boolean,
  currentBestValue: number | null
): number {
  const legal = legalCards(hand, ledSuit);
  const byValue = [...legal].sort((a, b) => hand[a].value - hand[b].value);
  if (!ledSuit) return isLastTrick ? byValue[byValue.length - 1] : byValue[0];
  const canWin = byValue.filter(
    (i) => hand[i].suit === ledSuit && hand[i].value > (currentBestValue ?? 0)
  );
  if (isLastTrick && canWin.length > 0) return canWin[canWin.length - 1];
  if (canWin.length > 0 && Math.random() > 0.5) return canWin[0];
  return byValue[0];
}
