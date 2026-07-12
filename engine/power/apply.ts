/* L'UNIQUE dispatch effet→état : applique un plan d'ops résolues via un
   PowerStateAdapter. Remplace les deux copies dupliquées de
   LocalGameSync.applyPowerEffect et FirestoreGameSync.hostProcessPowerActivation. */

import type { ActivePowerEffect } from "@/types/game";
import type { PowerApplyMeta, PowerStateAdapter } from "./adapter";
import type { ResolvedOp } from "./interpret";

export function applyResolvedOps(
  plan: ResolvedOp[],
  meta: PowerApplyMeta,
  adapter: PowerStateAdapter,
): void {
  const base = {
    cardId: meta.cardId,
    activatedBy: meta.activatedBy,
    scopeTrickNo: meta.trickNo,
  } satisfies Partial<ActivePowerEffect> & Pick<ActivePowerEffect, "cardId" | "activatedBy" | "scopeTrickNo">;

  for (const op of plan) {
    switch (op.op) {
      case "swapHandDeck": {
        const state = adapter.getState();
        const deck = adapter.getDeck();
        const hand = state.players[op.seat]?.hand ?? [];
        const outgoing = hand[op.handIdx];
        const incoming = deck[op.deckIdx];
        if (!outgoing || !incoming) break;
        const nextHand = [...hand];
        nextHand[op.handIdx] = incoming;
        const nextDeck = deck.filter((_, index) => index !== op.deckIdx);
        nextDeck.push(outgoing); // la carte échangée retourne au fond
        adapter.setHand(op.seat, nextHand);
        adapter.setDeck(nextDeck);
        break;
      }

      case "swapPlayerCards": {
        const state = adapter.getState();
        const leftHand = [...(state.players[op.leftSeat]?.hand ?? [])];
        const rightHand = [...(state.players[op.rightSeat]?.hand ?? [])];
        const leftCards = op.leftIndexes.map((index) => leftHand[index]);
        const rightCards = op.rightIndexes.map((index) => rightHand[index]);
        if (leftCards.some((card) => !card) || rightCards.some((card) => !card)) break;
        op.leftIndexes.forEach((index, position) => {
          leftHand[index] = rightCards[position];
        });
        op.rightIndexes.forEach((index, position) => {
          rightHand[index] = leftCards[position];
        });
        adapter.setHand(op.leftSeat, leftHand);
        adapter.setHand(op.rightSeat, rightHand);
        break;
      }

      case "revealHand":
      case "highlightCard":
        // Affichage seul — rejoué côté UI depuis activation.resolved.
        break;

      case "restrictNextPlay":
        adapter.setPlayRestriction(op.seat, {
          mode: op.mode,
          select: op.select,
          cardId: meta.cardId,
          minLegalChoices: op.minLegalChoices,
        });
        break;

      case "timerFreeze":
        adapter.freezeTimer(op.seat, Date.now() + op.durationMs);
        break;

      case "timerDelta":
        if (op.deferred) {
          // Pénalité positive = secondes retirées au prochain tour du joueur
          // (un gain différé arrive en pénalité négative → temps ajouté).
          adapter.addPendingTimerPenalty(op.seat, -op.seconds);
        } else {
          adapter.applyTimerDelta(op.seat, op.seconds);
        }
        break;

      case "boostNextCard":
        adapter.pushEffect({
          ...base,
          activatedBy: op.seat,
          ...(op.valueBonus !== undefined ? { valueBonus: op.valueBonus } : {}),
          ...(op.suitOverride ? { suitOverride: true } : {}),
        });
        break;

      case "potBonus":
        if (op.when === "now") {
          adapter.addPot(op.amount);
          adapter.pushEffect({ ...base, potBonus: op.amount });
        } else {
          adapter.pushEffect({ ...base, potBonus: op.amount, conditionalPotBonus: true });
        }
        break;

      case "potMultiplier":
        adapter.pushEffect({ ...base, scoreMultiplier: op.factor });
        break;

      case "grantShield":
        adapter.pushEffect({
          ...base,
          activatedBy: op.seat,
          blocks: op.blocks,
          // Champs legacy maintenus pour compatibilité (docs Firestore, UI).
          ...(op.blocks.includes("targeted") ? { shield: true } : {}),
          ...(op.blocks.includes("reveal") ? { cancelReveal: true } : {}),
        });
        break;

      case "refundOnLoss":
        adapter.pushEffect({ ...base, activatedBy: op.seat, refundOnLoss: op.ratio });
        break;

      case "preventDoublePenalty":
        adapter.pushEffect({ ...base, activatedBy: op.seat, preventDoublePenalty: true });
        break;
    }
  }
}
