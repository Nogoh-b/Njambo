/* ═══════════════ FILE: functions/src/powerCommands.ts ═══════════════
   Cartes pouvoir côté serveur autoritaire. Réutilise le moteur PowerScript
   partagé (engine/power) : le serveur est un "sync" de plus — il convertit
   seat↔uid, exécute le script, persiste les mutations et diffuse l'activation
   résolue pour que chaque client rejoue l'animation générique.

   État moteur d'un match (pioche restante, effets actifs, restrictions,
   pouvoirs consommés) : doc PRIVÉ `matches/{id}/private/__engine` — le
   segment `__engine` n'est jamais un uid participant, donc les règles authz
   (owner-only) le rendent illisible par tous les clients. */

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { asObject, db, requireUid, requiredString, runIdempotent, stableId } from "./core";
import type { DocumentData, DocumentReference, Transaction } from "./firestoreTypes";
import { GAME_CONFIG } from "../../config/gameConfig";
import { POWER_MODULES, powerScriptOf } from "../../config/powers";
import { canActivatePower } from "../../engine/power/canActivate";
import { interpretPowerScript } from "../../engine/power/interpret";
import { applyResolvedOps } from "../../engine/power/apply";
import { findBlockingEffect } from "../../engine/power/blocking";
import { resolveTargets } from "../../engine/power/targets";
import { PowerRuntimeState, type PowerRuntimeSnapshot } from "../../engine/power/runtimeState";
import type { PlayRestriction, PowerStateAdapter } from "../../engine/power/adapter";
import type { PowerChoices } from "../../engine/power/types";
import type {
  ActivePowerEffect, Card, GameState, Player, PowerCardActivation, PowerCardId,
} from "../../types/game";

const POWER_ANIMATION_BUDGET_MS = 8_000;

/* ── État moteur persisté par match ── */

export interface EngineDocument {
  deck: Card[];
  effects: ActivePowerEffect[];
  runtime: PowerRuntimeSnapshot;
  /** uid → cartes pouvoir consommées dans ce match. */
  usedPowers: Record<string, PowerCardId[]>;
  updatedAt: number;
}

export function engineRef(matchId: string): DocumentReference {
  return db.doc(`matches/${matchId}/private/__engine`);
}

export async function loadEngineState(transaction: Transaction, matchId: string): Promise<EngineDocument> {
  const snapshot = await transaction.get(engineRef(matchId));
  const data = (snapshot.exists ? snapshot.data() : undefined) ?? {};
  return {
    deck: [...((data.deck ?? []) as Card[])],
    effects: [...((data.effects ?? []) as ActivePowerEffect[])],
    runtime: (data.runtime ?? {}) as PowerRuntimeSnapshot,
    usedPowers: { ...((data.usedPowers ?? {}) as Record<string, PowerCardId[]>) },
    updatedAt: Number(data.updatedAt ?? 0),
  };
}

export function persistEngineState(transaction: Transaction, matchId: string, engine: EngineDocument, now: number): void {
  transaction.set(engineRef(matchId), clean({ ...engine, updatedAt: now }), { merge: false });
}

/** Supprime récursivement les clés `undefined` (les backends doc les refusent). */
export function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/* ── Construction du GameState moteur (seats = ordre des participants) ── */

interface MatchLike {
  status: string;
  participants: Array<{ uid: string; name: string; emoji: string; bot: boolean }>;
  turnIndex: number;
  leaderIndex: number;
  trickNumber: number;
  trickPlays: Array<{ uid: string; card: Card }>;
  deposits: Record<string, Card[]>;
  potNkap: number;
  eliminatedUids?: string[];
  [key: string]: unknown;
}

export function buildEngineGameState(
  match: MatchLike,
  hands: Map<string, Card[]>,
  pot: number,
  effects: ActivePowerEffect[],
  usedPowers: Record<string, PowerCardId[]>,
): GameState {
  const seatOf = new Map(match.participants.map((participant, index) => [participant.uid, index]));
  const players: Player[] = match.participants.map((participant) => ({
    name: participant.name,
    emoji: participant.emoji,
    isYou: false,
    balance: 0,
    hand: [...(hands.get(participant.uid) ?? [])],
    deposit: [...(match.deposits?.[participant.uid] ?? [])],
    powerActivations: (usedPowers[participant.uid] ?? []).map((cardId) => ({
      cardId,
      activatedByUid: participant.uid,
      trickNo: 0,
      used: true,
      playId: `used-${participant.uid}-${cardId}`,
    })),
  }));
  return {
    phase: match.status === "playing" ? "turns" : "result",
    trickNo: Number(match.trickNumber) + 1,
    trickPlays: (match.trickPlays ?? []).map((play) => ({ playerIdx: seatOf.get(play.uid) ?? -1, card: play.card })),
    leaderIdx: Number(match.leaderIndex),
    turnIdx: Number(match.turnIndex),
    pot,
    dominantIdx: null,
    banner: "",
    activePowerEffects: [...effects],
    players,
  };
}

/* ── Version broadcast d'une activation : identités des cartes cachées
      expurgées (l'activateur reçoit la version complète via la réponse). ── */

export function redactActivationForBroadcast(activation: PowerCardActivation): PowerCardActivation {
  const { revealedHand: _drop, ...rest } = activation;
  void _drop;
  if (!rest.resolved) return clean(rest as PowerCardActivation);
  const moves = rest.resolved.moves?.map((move) => move.hiddenFor === "others"
    ? { ...move, cardIds: move.cardIds.map(() => "hidden"), cardSnapshots: undefined }
    : move);
  return clean({ ...rest, resolved: { ...rest.resolved, moves } } as PowerCardActivation);
}

/* ── Commande usePowerCard ── */

export async function usePowerCardHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const matchId = requiredString(data, "matchId", 96);
  const cardId = requiredString(data, "cardId", 64) as PowerCardId;
  const targetUid = typeof data.targetUid === "string" && data.targetUid.length > 0 ? data.targetUid : undefined;
  const choices = (data.choices && typeof data.choices === "object" && !Array.isArray(data.choices)
    ? data.choices
    : undefined) as PowerChoices | undefined;

  if (!(cardId in POWER_MODULES)) throw new HttpsError("invalid-argument", "UNKNOWN_POWER_CARD");
  const script = powerScriptOf(cardId);

  return runIdempotent(uid, "usePowerCard", data.idempotencyKey, async (transaction, now) => {
    const matchRef = db.doc(`matches/${matchId}`);
    const matchSnap = await transaction.get(matchRef);
    if (!matchSnap.exists) throw new HttpsError("not-found", "MATCH_NOT_FOUND");
    const match = matchSnap.data() as MatchLike & { participantUids: string[]; turnIndex: number; actionDeadlineAt: number; handCounts: Record<string, number> };
    if (match.status !== "playing" || !(match.participantUids ?? []).includes(uid)) {
      throw new HttpsError("failed-precondition", "MATCH_NOT_PLAYABLE");
    }
    const participants = match.participants;
    const seat = participants.findIndex((participant) => participant.uid === uid);
    if (seat < 0) throw new HttpsError("failed-precondition", "NOT_A_PARTICIPANT");
    const eliminated = new Set(match.eliminatedUids ?? []);
    if (eliminated.has(uid)) throw new HttpsError("failed-precondition", "PLAYER_ELIMINATED");

    // Bypass DEV opt-in (server/.env : POWERS_DEV_BYPASS=1) — parité avec
    // DEV.unlimitedPowers côté client : saute équipement + usage unique.
    // L'écriture de usedPowers reste inchangée pour ne pas diverger du moteur.
    const devBypass = process.env.POWERS_DEV_BYPASS === "1";

    // Équipement : source de vérité serveur (inventaire), pas le client.
    const inventorySnap = await transaction.get(db.doc(`inventories/${uid}`));
    const equipped = (inventorySnap.get("equippedCards") ?? []) as string[];
    if (!devBypass && !equipped.includes(cardId)) throw new HttpsError("failed-precondition", "POWER_NOT_EQUIPPED");

    const engine = await loadEngineState(transaction, matchId);
    if (!devBypass && (engine.usedPowers[uid] ?? []).includes(cardId)) {
      throw new HttpsError("failed-precondition", "POWER_ALREADY_USED");
    }

    const privateRefs = participants.map((participant) => db.doc(`matches/${matchId}/private/${participant.uid}`));
    const privateSnaps = await Promise.all(privateRefs.map((ref) => transaction.get(ref)));
    const hands = new Map(participants.map((participant, index) => [
      participant.uid,
      [...((privateSnaps[index].get("hand") ?? []) as Card[])],
    ]));

    let pot = Number(match.potNkap ?? 0);
    let effects = [...engine.effects];
    let deck = [...engine.deck];
    const runtime = PowerRuntimeState.fromJSON(engine.runtime);
    let deadlineDelta = 0;
    const touchedHands = new Set<string>();
    const trickNo = Number(match.trickNumber) + 1;

    const requestedSeat = targetUid ? participants.findIndex((participant) => participant.uid === targetUid) : -1;
    if (targetUid && requestedSeat < 0) throw new HttpsError("invalid-argument", "INVALID_TARGET");
    if (targetUid && eliminated.has(targetUid)) throw new HttpsError("failed-precondition", "TARGET_ELIMINATED");

    const buildState = () => buildEngineGameState(match, hands, pot, effects, devBypass ? {} : engine.usedPowers);
    const targets = resolveTargets(script.target, {
      activatedBy: seat,
      playerCount: participants.length,
      requested: requestedSeat >= 0 ? requestedSeat : undefined,
    }).filter((targetSeat) => !eliminated.has(participants[targetSeat]?.uid));
    const ctx = { state: buildState(), activatedBy: seat, targets, deck, maxValue: GAME_CONFIG.ranks.max, choices };

    const refusal = canActivatePower(script, ctx);
    if (refusal) throw new HttpsError("failed-precondition", refusal);

    // Interception (bouclier, masque…) : l'effet de la cible contre ce script.
    let blockedByCardId: PowerCardId | undefined;
    if (targets.length > 0) {
      const blocker = findBlockingEffect(script, targets[0], effects);
      if (blocker) {
        effects = effects.filter((effect) => effect !== blocker);
        blockedByCardId = blocker.cardId;
      }
    }

    let usedFlag = true;
    let resolved: PowerCardActivation["resolved"];
    let revealedHand: Card[] | undefined;

    if (!blockedByCardId) {
      const outcome = interpretPowerScript(script, ctx);
      resolved = outcome.resolved;
      if (outcome.resolved.impact) {
        const adapter: PowerStateAdapter = {
          maxCardValue: GAME_CONFIG.ranks.max,
          getState: buildState,
          getDeck: () => deck,
          setDeck: (next) => { deck = next; },
          setHand: (targetSeat, hand) => {
            const participant = participants[targetSeat];
            if (!participant) return;
            hands.set(participant.uid, hand);
            touchedHands.add(participant.uid);
          },
          addPot: (amount) => { pot += amount; },
          multiplyPot: (factor) => { pot *= factor; },
          pushEffect: (effect) => { effects.push(effect); },
          takeEffect: (pred) => {
            const found = effects.find(pred);
            if (found) effects = effects.filter((effect) => effect !== found);
            return found;
          },
          freezeTimer: (targetSeat, untilMs) => {
            runtime.freeze(targetSeat, untilMs);
            if (targetSeat === Number(match.turnIndex)) deadlineDelta += Math.max(0, untilMs - now);
          },
          applyTimerDelta: (targetSeat, seconds) => {
            if (targetSeat === Number(match.turnIndex)) deadlineDelta += seconds * 1_000;
          },
          addPendingTimerPenalty: (targetSeat, seconds) => runtime.addTimerPenalty(targetSeat, seconds),
          setPlayRestriction: (targetSeat, restriction: PlayRestriction) => runtime.setRestriction(targetSeat, restriction),
        };
        applyResolvedOps(outcome.plan, { cardId, activatedBy: seat, trickNo }, adapter);
      } else {
        // Aucun effet concret → la carte n'est PAS consommée (parité LocalGameSync).
        usedFlag = false;
      }
      const revealOp = outcome.plan.find((op) => op.op === "revealHand");
      if (revealOp && "seat" in revealOp) {
        const revealTarget = participants[revealOp.seat];
        if (revealTarget) revealedHand = [...(hands.get(revealTarget.uid) ?? [])];
      }
    }

    const consumed = blockedByCardId ? true : usedFlag;
    const activation: PowerCardActivation = {
      cardId,
      activatedByUid: uid,
      targetUid: targets[0] !== undefined ? participants[targets[0]]?.uid : undefined,
      trickNo,
      used: consumed,
      playId: stableId(uid, "power", String(data.idempotencyKey)).slice(0, 32),
      blockedByCardId,
      consumedCardIds: consumed ? [cardId] : [],
      resolved,
      scriptVersion: 1,
      ...(revealedHand ? { revealedHand } : {}),
    };

    if (consumed) {
      engine.usedPowers[uid] = [...(engine.usedPowers[uid] ?? []), cardId];
    }
    persistEngineState(transaction, matchId, { ...engine, deck, effects, runtime: runtime.toJSON() }, now);
    for (const touchedUid of touchedHands) {
      const index = participants.findIndex((participant) => participant.uid === touchedUid);
      transaction.set(privateRefs[index], { uid: touchedUid, hand: hands.get(touchedUid) ?? [], updatedAt: now }, { merge: true });
    }

    const update: DocumentData = clean({
      potNkap: pot,
      handCounts: Object.fromEntries(participants.map((participant) => [participant.uid, hands.get(participant.uid)?.length ?? 0])),
      actionDeadlineAt: Number(match.actionDeadlineAt) + POWER_ANIMATION_BUDGET_MS + deadlineDelta,
      recentPowerActivations: [redactActivationForBroadcast(activation)],
      updatedAt: now,
    });
    transaction.update(matchRef, update);

    return {
      state: {
        matchId,
        match: { ...match, ...update },
        hand: hands.get(uid) ?? [],
        equippedPowers: (privateSnaps[seat].get("equippedPowers") ?? []) as PowerCardId[],
      },
      activation: clean(activation),
    };
  });
}
