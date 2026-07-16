/* Port entre le moteur générique et l'état d'un sync (local ou host Firestore).

   Toutes les méthodes travaillent en SEATS ; chaque sync fait ses conversions
   (idx local, uid Firestore) et sa persistance (mutation directe / updates doc). */

import type { ActivePowerEffect, Card, GameState, PowerCardId } from "../../types/game";
import type { CardSelector } from "./types";

export interface PlayRestriction {
  mode: "forceSelector" | "lockSelector";
  select: CardSelector;
  cardId: PowerCardId;
  minLegalChoices?: number;
}

export interface PowerStateAdapter {
  readonly maxCardValue: number;
  getState(): GameState;
  getDeck(): Card[];
  setDeck(deck: Card[]): void;
  setHand(seat: number, hand: Card[]): void;
  addPot(amount: number): void;
  multiplyPot(factor: number): void;
  pushEffect(effect: ActivePowerEffect): void;
  /** Retire et retourne le premier effet matché (consommation de bouclier…). */
  takeEffect(pred: (effect: ActivePowerEffect) => boolean): ActivePowerEffect | undefined;
  freezeTimer(seat: number, untilMs: number): void;
  /** Delta immédiat sur le timer du joueur AU TOUR. */
  applyTimerDelta(seat: number, seconds: number): void;
  /** Pénalité (positive = retrait) consommée au début du prochain tour du joueur. */
  addPendingTimerPenalty(seat: number, seconds: number): void;
  setPlayRestriction(seat: number, restriction: PlayRestriction): void;
}

/** Métadonnées d'application communes à toutes les ops d'une activation. */
export interface PowerApplyMeta {
  cardId: PowerCardId;
  /** Seat de l'activateur. */
  activatedBy: number;
  trickNo: number;
}
