/* État runtime des pouvoirs pendant une manche, indexé par SEAT :
   restrictions de jeu (Coupe-Circuit…), timers gelés, pénalités différées.
   Instancié par CHAQUE sync (local et host Firestore) — la logique de
   consommation est ainsi partagée au lieu d'être dupliquée. */

import { legalCards } from "@/engine/rules";
import type { Card } from "@/types/game";
import type { PlayRestriction } from "./adapter";

export class PowerRuntimeState {
  private restrictions = new Map<number, PlayRestriction>();
  private frozenUntil = new Map<number, number>();
  private pendingTimerPenalty = new Map<number, number>();

  /** À appeler à chaque nouvelle manche. */
  reset() {
    this.restrictions.clear();
    this.frozenUntil.clear();
    this.pendingTimerPenalty.clear();
  }

  setRestriction(seat: number, restriction: PlayRestriction) {
    this.restrictions.set(seat, restriction);
  }

  hasRestriction(seat: number): boolean {
    return this.restrictions.has(seat);
  }

  /**
   * Consomme la restriction du joueur → index de carte imposé dans sa main,
   * ou null s'il n'y a pas de restriction applicable.
   */
  resolveForcedPlay(seat: number, hand: Card[], ledSuit: string | null): number | null {
    const restriction = this.restrictions.get(seat);
    if (!restriction) return null;
    this.restrictions.delete(seat);
    const legal = legalCards(hand, ledSuit);
    if (legal.length === 0) return null;
    // forceSelector "weakest" : la plus basse carte LÉGALE (comportement
    // Coupe-Circuit/Filet). D'autres sélecteurs pourront être branchés ici.
    const sorted = [...legal].sort((a, b) => hand[a].value - hand[b].value);
    return restriction.select.kind === "strongest"
      ? sorted[sorted.length - 1] ?? null
      : sorted[0] ?? null;
  }

  /** Résout un clic en respectant forceSelector et lockSelector. Une carte
   * verrouillée retourne null sans consommer la restriction ; jouer une autre
   * carte légale consomme le verrou. */
  resolvePlay(seat: number, hand: Card[], ledSuit: string | null, requestedIdx: number): number | null {
    const restriction = this.restrictions.get(seat);
    if (!restriction) return requestedIdx;
    if (restriction.mode === "forceSelector") {
      return this.resolveForcedPlay(seat, hand, ledSuit);
    }

    const legal = legalCards(hand, ledSuit);
    if (legal.length < Math.max(2, restriction.minLegalChoices ?? 2)) {
      this.restrictions.delete(seat);
      return requestedIdx;
    }

    let blockedIdx: number | undefined;
    const select = restriction.select;
    if (select.kind === "byId") {
      blockedIdx = legal.find((index) => hand[index].id === select.cardId);
    } else if (select.kind === "strongest") {
      blockedIdx = [...legal].sort((a, b) => hand[b].value - hand[a].value)[0];
    } else if (select.kind === "weakest") {
      blockedIdx = [...legal].sort((a, b) => hand[a].value - hand[b].value)[0];
    } else if (select.kind === "bySuit") {
      const suit = select.suit === "led" ? ledSuit : select.suit;
      blockedIdx = legal.find((index) => hand[index].suit === suit);
    } else if (select.kind === "byValue") {
      blockedIdx = legal.find((index) =>
        (select.min === undefined || hand[index].value >= select.min)
        && (select.max === undefined || hand[index].value <= select.max),
      );
    }

    if (blockedIdx === undefined) {
      this.restrictions.delete(seat);
      return requestedIdx;
    }
    if (requestedIdx === blockedIdx) return null;
    this.restrictions.delete(seat);
    return requestedIdx;
  }

  freeze(seat: number, untilMs: number) {
    this.frozenUntil.set(seat, untilMs);
  }

  isFrozen(seat: number): boolean {
    return (this.frozenUntil.get(seat) ?? 0) > Date.now();
  }

  addTimerPenalty(seat: number, seconds: number) {
    this.pendingTimerPenalty.set(seat, (this.pendingTimerPenalty.get(seat) ?? 0) + seconds);
  }

  /** Secondes de départ d'un tour = base moins la pénalité différée, consommée une fois. */
  consumeTimerPenalty(seat: number, baseSeconds: number, minSeconds = 1): number {
    const penalty = this.pendingTimerPenalty.get(seat);
    if (!penalty) return baseSeconds;
    this.pendingTimerPenalty.delete(seat);
    return Math.max(minSeconds, baseSeconds - penalty);
  }
}
