import type { Card, DepositedCard, GameState, Player, TrickPlay } from "../types/game";

function sameCard(a: Card, b: Card): boolean {
  return a === b || (
    a.id === b.id
    && a.value === b.value
    && a.suit === b.suit
    && a.rank === b.rank
  );
}

function sameDepositedCard(a: DepositedCard, b: DepositedCard): boolean {
  return sameCard(a, b)
    && a.effectiveValue === b.effectiveValue
    && a.effectiveSuit === b.effectiveSuit
    && a.powerTag === b.powerTag
    && a.dx === b.dx
    && a.dy === b.dy
    && a.dropRot === b.dropRot;
}

function sameArray<T>(a: readonly T[], b: readonly T[], equal: (left: T, right: T) => boolean): boolean {
  return a === b || (a.length === b.length && a.every((value, index) => equal(value, b[index])));
}

function sameDeep(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a)
      && Array.isArray(b)
      && sameArray(a, b, sameDeep);
  }

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  return aKeys.length === bKeys.length
    && aKeys.every((key) => Object.prototype.hasOwnProperty.call(bRecord, key) && sameDeep(aRecord[key], bRecord[key]));
}

function stabilizePlayer(prev: Player | undefined, next: Player): Player {
  if (!prev) return next;

  const hand = sameArray(prev.hand, next.hand, sameCard) ? prev.hand : next.hand;
  const deposit = sameArray(prev.deposit, next.deposit, sameDepositedCard) ? prev.deposit : next.deposit;
  const equippedPowers = sameDeep(prev.equippedPowers, next.equippedPowers)
    ? prev.equippedPowers
    : next.equippedPowers;
  const powerActivations = sameDeep(prev.powerActivations, next.powerActivations)
    ? prev.powerActivations
    : next.powerActivations;

  if (
    prev.name === next.name
    && prev.emoji === next.emoji
    && prev.isYou === next.isYou
    && prev.balance === next.balance
    && hand === prev.hand
    && deposit === prev.deposit
    && equippedPowers === prev.equippedPowers
    && powerActivations === prev.powerActivations
  ) {
    return prev;
  }

  return { ...next, hand, deposit, equippedPowers, powerActivations };
}

function stabilizePlayers(prev: Player[], next: Player[]): Player[] {
  const players = next.map((player, index) => stabilizePlayer(prev[index], player));
  return players.length === prev.length && players.every((player, index) => player === prev[index])
    ? prev
    : players;
}

function stabilizeTrickPlays(prev: TrickPlay[], next: TrickPlay[]): TrickPlay[] {
  const plays = next.map((play, index) => {
    const previous = prev[index];
    return previous && previous.playerIdx === play.playerIdx && sameCard(previous.card, play.card)
      ? previous
      : play;
  });
  return plays.length === prev.length && plays.every((play, index) => play === prev[index])
    ? prev
    : plays;
}

/**
 * Restaure le partage structurel perdu par les snapshots des GameSync afin
 * que React puisse ignorer les émissions dont le contenu est inchangé.
 */
export function stabilizeGameState(prev: GameState, next: GameState): GameState {
  if (prev === next) return prev;

  const players = stabilizePlayers(prev.players, next.players);
  const trickPlays = stabilizeTrickPlays(prev.trickPlays, next.trickPlays);
  const activePowerEffects = sameDeep(prev.activePowerEffects, next.activePowerEffects)
    ? prev.activePowerEffects
    : next.activePowerEffects;
  const revealedHands = sameDeep(prev.revealedHands, next.revealedHands)
    ? prev.revealedHands
    : next.revealedHands;

  if (
    prev.phase === next.phase
    && prev.trickNo === next.trickNo
    && trickPlays === prev.trickPlays
    && prev.leaderIdx === next.leaderIdx
    && prev.turnIdx === next.turnIdx
    && prev.pot === next.pot
    && prev.dominantIdx === next.dominantIdx
    && prev.banner === next.banner
    && players === prev.players
    && activePowerEffects === prev.activePowerEffects
    && revealedHands === prev.revealedHands
  ) {
    return prev;
  }

  return { ...next, players, trickPlays, activePowerEffects, revealedHands };
}
