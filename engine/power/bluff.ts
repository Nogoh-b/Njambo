/* Bluff du Masque du Bluffeur : au lieu d'annuler une révélation, le masque
   montre à l'attaquant une FAUSSE main. Fonctions pures, partagées entre
   LocalGameSync et le serveur (functions/src/powerCommands.ts). */

import { buildDeck, shuffle } from "../deck";
import type { ActivePowerEffect, Card, GameState } from "../../types/game";
import { deriveScriptTags, effectBlocks } from "./blocking";
import type { PowerScript } from "./types";

/** Le bloqueur est un masque (il intercepte les révélations) et le script révèle une main : on bluffe. */
export function isBluff(blocker: ActivePowerEffect, script: PowerScript): boolean {
  return effectBlocks(blocker).includes("reveal") && deriveScriptTags(script).includes("reveal");
}

/**
 * Fausse main de la même taille que la vraie : des cartes que l'attaquant ne peut pas
 * démentir (ni dans sa main, ni posées sur la table, ni dans la vraie main de la cible).
 */
export function bluffHand(state: GameState, attackerSeat: number, targetSeat: number, pick: <T>(cards: T[]) => T[] = shuffle): Card[] {
  const size = state.players[targetSeat]?.hand.length ?? 0;
  const seen = new Set<string>([
    ...(state.players[attackerSeat]?.hand ?? []).map((card) => card.id),
    ...(state.players[targetSeat]?.hand ?? []).map((card) => card.id),
    ...state.players.flatMap((player) => (player.deposit ?? []).map((card) => card.id)),
    ...state.trickPlays.map((play) => play.card.id),
  ]);
  return pick(buildDeck().filter((card) => !seen.has(card.id))).slice(0, size);
}
