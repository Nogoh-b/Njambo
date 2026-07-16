/* Interpréteur PUR d'un PowerScript : résout les ops abstraites en un plan
   d'opérations concrètes (seats + index de cartes) sans RIEN muter.

   `resolved.impact === false` ⇒ aucun effet concret : la carte ne doit PAS
   être consommée (ex. Marché de Nuit sans meilleure carte en pioche). */

import type {
  CardSelector,
  PowerResolved,
  PowerRunContext,
  PowerScript,
  PowerScriptTag,
} from "./types";
import { resolvePlayerRef } from "./targets";
import { selectInDeck, selectInHand, selectManyInHand } from "./selectors";
import { legalCards } from "../rules";

/** Opération concrète, prête à être appliquée par un PowerStateAdapter. */
export type ResolvedOp =
  /** Échange main↔pioche : hand[handIdx] part au fond de la pioche,
   *  deck[deckIdx] la remplace. */
  | { op: "swapHandDeck"; seat: number; handIdx: number; deckIdx: number }
  | { op: "swapPlayerCards"; leftSeat: number; rightSeat: number; leftIndexes: number[]; rightIndexes: number[] }
  /** Affichage seul — aucune mutation, mais compte comme impact. */
  | { op: "revealHand"; seat: number; durationMs: number }
  | { op: "highlightCard"; seat: number; cardIdx: number; durationMs: number }
  | {
      op: "restrictNextPlay";
      seat: number;
      mode: "forceSelector" | "lockSelector";
      select: CardSelector;
      minLegalChoices?: number;
    }
  | { op: "timerFreeze"; seat: number; durationMs: number }
  /** deferred : le joueur n'est pas au tour → delta appliqué au début de SON tour. */
  | { op: "timerDelta"; seat: number; seconds: number; deferred: boolean }
  | { op: "boostNextCard"; seat: number; valueBonus?: number; suitOverride?: boolean }
  | { op: "potBonus"; amount: number; when: "now" | "winTrick" }
  | { op: "potMultiplier"; factor: number }
  | { op: "grantShield"; seat: number; blocks: PowerScriptTag[] }
  | { op: "refundOnLoss"; seat: number; ratio: number }
  | { op: "preventDoublePenalty"; seat: number };

export function interpretPowerScript(
  script: PowerScript,
  ctx: PowerRunContext,
): { resolved: PowerResolved; plan: ResolvedOp[] } {
  const { state, activatedBy, targets, deck, choices } = ctx;
  const refCtx = { activatedBy, targets, playerCount: state.players.length };
  const plan: ResolvedOp[] = [];
  const moves: NonNullable<PowerResolved["moves"]> = [];
  const resolved: PowerResolved = { targetSeats: [...targets], impact: false };

  for (const step of script.steps) {
    for (const op of step.ops ?? []) {
      switch (op.op) {
        case "moveCards": {
          // Seul le profil main→pioche avec échange existe aujourd'hui
          // (Vent du Nord, Marché de Nuit). Les autres combinaisons
          // (dépôt↔main…) seront ajoutées quand une carte les utilisera.
          if (op.from.zone !== "hand" || op.to.zone !== "deck" || !op.swap) break;
          const seat = resolvePlayerRef(op.from.player, refCtx)[0];
          const hand = state.players[seat]?.hand ?? [];
          const outIdx = selectInHand(hand, op.select, { state, seat, choices })[0];
          if (outIdx === undefined) break;
          const deckIdx = selectInDeck(deck, op.swap.incoming, {
            weakestValue: hand[outIdx].value,
            choices,
          });
          if (deckIdx < 0) break; // pas d'échange possible → no-op
          plan.push({ op: "swapHandDeck", seat, handIdx: outIdx, deckIdx });
          moves.push(
            {
              key: "outgoing",
              from: op.from,
              to: op.to,
              cardIds: [hand[outIdx].id],
              cardSnapshots: [{ ...hand[outIdx] }],
              fromCardIndexes: [outIdx],
              hiddenFor: "others",
            },
            {
              key: "incoming",
              from: op.to,
              to: op.from,
              cardIds: [deck[deckIdx].id],
              cardSnapshots: [{ ...deck[deckIdx] }],
              toCardIndexes: [outIdx],
              hiddenFor: "others",
            },
          );
          break;
        }
        case "revealHand": {
          for (const seat of resolvePlayerRef(op.player, refCtx)) {
            if (state.players[seat]) plan.push({ op: "revealHand", seat, durationMs: op.durationMs });
          }
          break;
        }
        case "highlightCard": {
          const seat = resolvePlayerRef(op.player, refCtx)[0];
          if (seat === undefined) break;
          const hand = state.players[seat]?.hand ?? [];
          const cardIdx = selectInHand(hand, op.select, { state, seat, choices })[0];
          if (cardIdx === undefined) break; // rien à suggérer → no-op
          plan.push({ op: "highlightCard", seat, cardIdx, durationMs: op.durationMs });
          resolved.highlight = { seat, cardIdx, cardId: hand[cardIdx].id };
          break;
        }
        case "exchangeCards": {
          const leftSeat = resolvePlayerRef(op.left, refCtx)[0];
          const rightSeat = resolvePlayerRef(op.right, refCtx)[0];
          if (leftSeat === undefined || rightSeat === undefined || leftSeat === rightSeat) break;
          const leftHand = state.players[leftSeat]?.hand ?? [];
          const rightHand = state.players[rightSeat]?.hand ?? [];
          const leftIndexes = selectInHand(leftHand, op.leftSelect, {
            state,
            seat: leftSeat,
            choices,
          });
          if (leftIndexes.length === 0) break;
          const rightIndexes = selectManyInHand(rightHand, op.rightSelect, leftIndexes.length, {
            state,
            seat: rightSeat,
            choices,
          });
          if (rightIndexes.length !== leftIndexes.length) break;
          plan.push({ op: "swapPlayerCards", leftSeat, rightSeat, leftIndexes, rightIndexes });
          moves.push(
            {
              key: "outgoing",
              from: { zone: "hand", player: op.left },
              to: { zone: "hand", player: op.right },
              cardIds: leftIndexes.map((index) => leftHand[index].id),
              cardSnapshots: leftIndexes.map((index) => ({ ...leftHand[index] })),
              fromCardIndexes: leftIndexes,
              toCardIndexes: rightIndexes,
              hiddenFor: "others",
            },
            {
              key: "incoming",
              from: { zone: "hand", player: op.right },
              to: { zone: "hand", player: op.left },
              cardIds: rightIndexes.map((index) => rightHand[index].id),
              cardSnapshots: rightIndexes.map((index) => ({ ...rightHand[index] })),
              fromCardIndexes: rightIndexes,
              toCardIndexes: leftIndexes,
              hiddenFor: "others",
            },
          );
          break;
        }
        case "blockNextLegalCard": {
          for (const seat of resolvePlayerRef(op.player, refCtx)) {
            const hand = state.players[seat]?.hand ?? [];
            const ledSuit = state.trickPlays[0]?.card.suit ?? null;
            const legal = legalCards(hand, ledSuit);
            const minimum = Math.max(2, op.minLegalChoices ?? 2);
            if (legal.length < minimum) continue;
            let candidates = selectInHand(hand, op.select, { state, seat, choices })
              .filter((index) => legal.includes(index));
            if (op.select.kind === "random") {
              candidates = [legal[Math.floor(Math.random() * legal.length)]];
            } else if (op.select.kind === "weakest") {
              candidates = [[...legal].sort((a, b) => hand[a].value - hand[b].value)[0]];
            } else if (op.select.kind === "strongest") {
              candidates = [[...legal].sort((a, b) => hand[b].value - hand[a].value)[0]];
            }
            const cardIdx = candidates[0];
            if (cardIdx === undefined) continue;
            const card = hand[cardIdx];
            plan.push({
              op: "restrictNextPlay",
              seat,
              mode: "lockSelector",
              select: { kind: "byId", cardId: card.id },
              minLegalChoices: minimum,
            });
            resolved.highlight = { seat, cardIdx, cardId: card.id };
          }
          break;
        }
        case "restrictNextPlay": {
          for (const seat of resolvePlayerRef(op.player, refCtx)) {
            if (!state.players[seat]) continue;
            plan.push({ op: "restrictNextPlay", seat, mode: op.mode, select: op.select });
          }
          break;
        }
        case "timerFreeze": {
          for (const seat of resolvePlayerRef(op.player, refCtx)) {
            if (!state.players[seat]) continue;
            plan.push({ op: "timerFreeze", seat, durationMs: op.durationMs });
          }
          break;
        }
        case "timerDelta": {
          for (const seat of resolvePlayerRef(op.player, refCtx)) {
            if (!state.players[seat]) continue;
            plan.push({
              op: "timerDelta",
              seat,
              seconds: op.seconds,
              deferred: seat !== state.turnIdx,
            });
          }
          break;
        }
        case "boostNextCard": {
          for (const seat of resolvePlayerRef(op.player, refCtx)) {
            plan.push({
              op: "boostNextCard",
              seat,
              valueBonus: op.valueBonus,
              suitOverride: op.suitOverride !== undefined,
            });
          }
          break;
        }
        case "potBonus":
          plan.push({ op: "potBonus", amount: op.amount, when: op.when });
          break;
        case "potMultiplier":
          plan.push({ op: "potMultiplier", factor: op.factor });
          break;
        case "grantShield": {
          for (const seat of resolvePlayerRef(op.player, refCtx)) {
            plan.push({ op: "grantShield", seat, blocks: op.blocks });
          }
          break;
        }
        case "refundOnLoss": {
          for (const seat of resolvePlayerRef(op.player, refCtx)) {
            plan.push({ op: "refundOnLoss", seat, ratio: op.ratio });
          }
          break;
        }
        case "preventDoublePenalty": {
          for (const seat of resolvePlayerRef(op.player, refCtx)) {
            plan.push({ op: "preventDoublePenalty", seat });
          }
          break;
        }
      }
    }
  }

  if (moves.length > 0) resolved.moves = moves;
  resolved.impact = plan.length > 0;
  return { resolved, plan };
}
