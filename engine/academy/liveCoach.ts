/* ═══════════════ Coach en direct : moteur pur ═══════════════
   Pendant une vraie partie, le coach ne voit que ce que voit le joueur : sa
   main, les cartes posées, le pli en cours. Les mains adverses ne sont jamais
   lues, même quand la partie locale les connaît : il ne peut pas tricher par
   erreur. Première utilisation : la partie de fin d'Académie (A4) ; la table
   complète des conseils, les niveaux et le retrait viendront en A12. */

import { GAME_CONFIG } from "../../config/gameConfig";
import { botChooseCard } from "../bot";
import { legalCards } from "../rules";
import type { Card, GameConfig, GameState, InstantReason, Result } from "../../types/game";
import type { CoachKey } from "./types";

/** Ce que le joueur voit de la table. */
export interface PlayerView {
  trickNo: number;
  /** Numéro du dernier pli (le Ngata). */
  lastTrick: number;
  yourTurn: boolean;
  hand: Card[];
  ledSuit: string | null;
  /** Meilleure carte de la tendance posée dans le pli en cours (valeur effective). */
  bestInTrick: number | null;
  /** Toutes les cartes posées sur la table pendant la manche. */
  seen: Card[];
}

export function playerView(state: GameState, cfg: GameConfig = GAME_CONFIG): PlayerView {
  const ledSuit = state.trickPlays[0]?.card.suit ?? null;
  const following = state.trickPlays.filter((play) => (play.card.effectiveSuit ?? play.card.suit) === ledSuit);
  return {
    trickNo: state.trickNo,
    lastTrick: cfg.cardsPerPlayer,
    yourTurn: state.phase === "turns" && state.turnIdx === 0 && state.trickPlays.length < state.players.length,
    hand: [...(state.players[0]?.hand ?? [])],
    ledSuit,
    bestInTrick: following.length ? Math.max(...following.map((play) => play.card.effectiveValue ?? play.card.value)) : null,
    seen: state.players.flatMap((player) => player.deposit),
  };
}

/** Conseil du moment, une seule fois par manche chacun (`said` : clés déjà dites). */
export function liveTip(view: PlayerView, said: ReadonlySet<CoachKey>): CoachKey | null {
  if (!view.yourTurn) return null;
  const tip = view.trickNo === view.lastTrick
    ? "live.lastTrick"
    : view.trickNo === view.lastTrick - 1
      ? "live.beforeLast"
      : "live.start";
  return said.has(tip) ? null : tip;
}

/** Carte conseillée (index dans la main) : l'IA « hard » du jeu, qui ne connaît que les cartes visibles. */
export function advisedCard(view: PlayerView): number | null {
  if (!view.yourTurn || view.hand.length === 0) return null;
  const index = botChooseCard(view.hand, view.ledSuit, view.trickNo >= view.lastTrick, view.bestInTrick, { difficulty: "hard", seen: view.seen });
  return legalCards(view.hand, view.ledSuit).includes(index) ? index : null;
}

/** Réplique de fin de la partie de l'Académie. */
export function finalLine(result: Pick<Result, "type" | "winnerIdx" | "doubles"> & { reason?: InstantReason }): CoachKey {
  const won = result.winnerIdx === 0;
  if (result.type === "instant") return won ? `final.instant.win.${result.reason ?? "under21"}` : "final.instant.lose";
  if (won) return result.doubles ? "final.winDouble" : "final.win";
  return "final.lose";
}
