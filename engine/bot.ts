import { GAME_CONFIG } from "../config/gameConfig";
import { legalCards } from "./rules";
import type { BotDifficulty, Card } from "../types/game";

/* ═══════════════ FILE: engine/bot.ts ═══════════════
   IA du bot, à 3 niveaux de difficulté.
   - easy   : passif, joue bas, prend rarement.
   - normal : comportement historique (≈50 % de prise, garde une haute au dernier pli).
   - hard   : mémoire des cartes vues → sait si une carte est « maîtresse »
              (imbattable), prend au plus juste, tient ses atouts. */

interface BotOptions {
  difficulty?: BotDifficulty;
  /** Toutes les cartes déjà visibles (dépôts de tous les joueurs). */
  seen?: Card[];
}

const MAX_VALUE = GAME_CONFIG.ranks.max;

/** Une carte est « maîtresse » si aucune carte plus forte de sa couleur ne peut
 *  encore sortir : toutes les valeurs supérieures sont déjà vues ou dans ma main. */
function isBoss(card: Card, hand: Card[], seen: Card[]): boolean {
  for (let v = card.value + 1; v <= MAX_VALUE; v++) {
    const stillOut =
      !seen.some((c) => c.suit === card.suit && c.value === v) &&
      !hand.some((c) => c.suit === card.suit && c.value === v);
    if (stillOut) return false; // une carte plus forte est encore dehors
  }
  return true;
}

export function botChooseCard(
  hand: Card[],
  ledSuit: string | null,
  isLastTrick: boolean,
  currentBestValue: number | null,
  opts: BotOptions = {},
): number {
  const difficulty = opts.difficulty ?? "normal";
  const seen = opts.seen ?? [];

  const legal = legalCards(hand, ledSuit);
  const byValue = [...legal].sort((a, b) => hand[a].value - hand[b].value);
  const lowest = byValue[0];
  const highest = byValue[byValue.length - 1];

  // Cartes légales qui battent le meilleur pli actuel (dans la couleur menée)
  const winners = ledSuit
    ? byValue.filter((i) => hand[i].suit === ledSuit && hand[i].value > (currentBestValue ?? 0))
    : [];
  const lowestWinner = winners[0];
  const highestWinner = winners[winners.length - 1];

  /* ── EASY : passif ── */
  if (difficulty === "easy") {
    if (!ledSuit) return lowest; // mène toujours bas
    if (isLastTrick && winners.length > 0) return highestWinner; // veut quand même le dernier
    if (lowestWinner !== undefined && Math.random() < 0.3) return lowestWinner;
    return lowest;
  }

  /* ── HARD : mémoire + tenue des atouts ── */
  if (difficulty === "hard") {
    if (!ledSuit) {
      // En tête : mener une maîtresse (gagne le pli à coup sûr), la plus basse
      // possible pour garder les grosses ; sinon se défausser du plus bas.
      const bossLeads = byValue.filter((i) => isBoss(hand[i], hand, seen));
      return bossLeads.length > 0 ? bossLeads[0] : lowest;
    }
    if (winners.length === 0) return lowest; // ne peut pas prendre → défausse
    const bossWinners = winners.filter((i) => isBoss(hand[i], hand, seen));
    if (isLastTrick) {
      // Dernier pli (doublé potentiel) : sécuriser avec la plus petite gagnante
      // imbattable, sinon tenter avec la plus haute.
      return bossWinners[0] ?? highestWinner;
    }
    // Pli courant : prendre seulement si c'est sûr, au plus juste ; sinon tenir
    // ses grosses cartes et se défausser du plus bas.
    return bossWinners.length > 0 ? bossWinners[0] : lowest;
  }

  /* ── NORMAL : comportement historique ── */
  if (!ledSuit) return isLastTrick ? highest : lowest;
  if (isLastTrick && winners.length > 0) return highestWinner;
  if (winners.length > 0 && Math.random() > 0.5) return lowestWinner;
  return lowest;
}
