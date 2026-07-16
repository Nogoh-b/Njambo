import { randomInt } from "node:crypto";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { crownWinGain, resolveEventProgress, splitCrownLoss, spendEnergy, type EnergyState, type Reward } from "../../domain";
import { applyReward, asObject, boundedNumber, db, economyFrom, integer, ledger, requireUid, requiredString, runIdempotent, stableId } from "./core";
import type { DocumentReference, DocumentSnapshot, Transaction } from "./firestoreTypes";
import { GAME_CONFIG } from "../../config/gameConfig";
import { POWER_CARDS_BY_ID } from "../../config/powerCards";
import { PowerRuntimeState } from "../../engine/power/runtimeState";
import { applyTrickPowerRewards, consumeNextCardModifiers } from "../../engine/power/rewards";
import { loadEngineState, persistEngineState } from "./powerCommands";
import type { Card as EngineCard, PowerCardId } from "../../types/game";

type MatchMode = "bot" | "online" | "friends" | "event";
type Suit = "♥" | "♦" | "♣" | "♠";
interface ServerCard { id: string; suit: Suit; value: number; rank: string; color: string }
export interface MatchParticipant { uid: string; name: string; emoji: string; bot: boolean; crowns: number }
interface MatchPlay { uid: string; card: ServerCard; turnId: string }
export interface MatchDocument {
  status: string;
  mode: MatchMode;
  eventRunId?: string | null;
  eventRunIds?: Record<string, string>;
  ranked?: boolean;
  participantUids: string[];
  participants: MatchParticipant[];
  turnIndex: number;
  leaderIndex: number;
  trickNumber: number;
  trickPlays: MatchPlay[];
  deposits: Record<string, ServerCard[]>;
  turnId: string;
  potNkap: number;
  /** Joueurs ayant abandonné (online/friends) : retirés de la rotation, mais
   *  toujours comptés comme perdants au règlement (mise + couronnes perdues). */
  eliminatedUids?: string[];
  [key: string]: unknown;
}

const SUITS: Array<{ suit: Suit; color: string }> = [
  { suit: "♥", color: "#c1292e" }, { suit: "♦", color: "#c1292e" },
  { suit: "♣", color: "#1e1e1e" }, { suit: "♠", color: "#1e1e1e" },
];

function secureDeck(): ServerCard[] {
  const deck = SUITS.flatMap(({ suit, color }) => Array.from({ length: 8 }, (_, offset) => {
    const value = offset + 3;
    return { id: `${value}${suit}`, suit, value, rank: String(value), color };
  }));
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

function legalCards(hand: ServerCard[], ledSuit: Suit | null) {
  if (!ledSuit) return hand;
  const following = hand.filter((card) => card.suit === ledSuit);
  return following.length > 0 ? following : hand;
}

/* Même sémantique que engine/rules.trickWinner : la couleur demandée est la
   couleur BRUTE de la première carte ; la comparaison honore les
   modificateurs des cartes pouvoir (effectiveSuit / effectiveValue). */
function winnerIndex(plays: MatchPlay[], participants: MatchParticipant[]) {
  const effSuit = (card: ServerCard) => (card as EngineCard).effectiveSuit ?? card.suit;
  const effValue = (card: ServerCard) => (card as EngineCard).effectiveValue ?? card.value;
  const led = plays[0].card.suit;
  let best: MatchPlay | null = null;
  for (const play of plays) {
    if (effSuit(play.card) === led && (!best || effValue(play.card) > effValue(best.card))) best = play;
  }
  const winner = best ?? plays[0];
  return participants.findIndex((participant) => participant.uid === winner.uid);
}

function matchCost(mode: MatchMode) {
  if (mode === "bot") return 5;
  if (mode === "online" || mode === "friends") return 10;
  return 0;
}

/* Budgets d'animation CLIENT inclus dans actionDeadlineAt : le décompte
   affiché — clamp(deadline − now, 0, turnSeconds) — est ainsi synchrone entre
   tous les clients, reste plein pendant le replay/la donne, et atteint 0 au
   moment où le worker d'auto-play peut tirer (matchTimeouts.ts, grâce courte).
   COUPLÉ à GAME_CONFIG.anim (replayBotThinkMax + dropFlight + landSettle ;
   trickPause ; dealPerCard/dealFlight) — config/gameConfig.ts. */
const PLAY_ANIM_MS = 2_200;
const TRICK_PAUSE_MS = 2_200;
const SERVER_DELIVERY_MARGIN_MS = 2_000;
/** Miroir de la fenêtre "dealing" client (AuthoritativeGameSync.beginDealingWindow). */
function dealBudgetMs(playerCount: number) {
  return playerCount * 5 * 175 + 720 + 350;
}

/** Fin de match de salle (settlement, abandon) : la salle redevient
 *  RE-JOUABLE — status "waiting", activeMatchId effacé, invités remis
 *  non-prêts (players[].ready + room_consents). Le flux revanche redevient
 *  alors le flux lobby standard : setRoomReady → startGame → startMatch. */
function resetRoomAfterMatch(
  transaction: Transaction,
  roomRef: DocumentReference,
  room: Record<string, unknown>,
  now: number,
  excludedUids: ReadonlySet<string> = new Set(),
) {
  const previousPlayers = Array.isArray(room.players) ? room.players as Array<Record<string, unknown> & { uid: string }> : [];
  const players = previousPlayers.filter((player) => !excludedUids.has(player.uid));
  if (players.length === 0) {
    transaction.delete(roomRef);
    return { players, hostId: "" };
  }
  const previousHostId = String(room.hostId ?? "");
  const hostId = players.some((player) => player.uid === previousHostId) ? previousHostId : players[0].uid;
  transaction.update(roomRef, {
    status: "waiting",
    activeMatchId: null,
    hostId,
    players: players.map((player) => ({ ...player, ready: player.uid === hostId })),
    playerUids: players.map((player) => player.uid),
    updatedAt: now,
  });
  for (const player of previousPlayers) {
    const consentRef = db.doc(`room_consents/${roomRef.id}_${player.uid}`);
    if (excludedUids.has(player.uid) || player.uid === hostId) transaction.delete(consentRef);
    else transaction.set(consentRef, { roomId: roomRef.id, uid: player.uid, ready: false, updatedAt: now }, { merge: false });
  }
  return { players, hostId };
}

function publicState(matchId: string, match: Record<string, unknown>, hand: ServerCard[], equippedPowers: PowerCardId[] = []) {
  return { matchId, match, hand, equippedPowers };
}

export async function setRoomReadyHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const roomId = requiredString(data, "roomId", 96);
  if (typeof data.ready !== "boolean") throw new HttpsError("invalid-argument", "INVALID_READY_STATE");
  const ready = data.ready;
  return runIdempotent(uid, "setRoomReady", data.idempotencyKey, async (transaction, now) => {
    const roomRef = db.doc(`rooms/${roomId}`);
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists) {
      throw new HttpsError("failed-precondition", "ROOM_NOT_JOINABLE");
    }
    const room = roomSnap.data() as Record<string, unknown>;
    let status = String(room.status ?? "");
    let players = (room.players ?? []) as Array<Record<string, unknown> & { uid: string }>;
    const activeMatchId = typeof room.activeMatchId === "string" ? room.activeMatchId : "";

    // Auto-réparation d'une salle restée `playing` alors que son match est
    // déjà terminal (ancien serveur, redémarrage ou commit partiel historique).
    if (activeMatchId) {
      const activeMatchSnap = await transaction.get(db.doc(`matches/${activeMatchId}`));
      const activeStatus = String(activeMatchSnap.get("status") ?? "");
      if (activeMatchSnap.exists && ["settled", "forfeit", "cancelled"].includes(activeStatus)) {
        const eliminated = new Set<string>((activeMatchSnap.get("eliminatedUids") ?? []) as string[]);
        const reset = resetRoomAfterMatch(transaction, roomRef, room, now, eliminated);
        players = reset.players.map((player) => ({ ...player, ready: player.uid === reset.hostId }));
        status = "waiting";
      }
    }

    const memberUids = players.map((player) => player.uid);
    if (!memberUids.includes(uid) || status !== "waiting") {
      throw new HttpsError("failed-precondition", "ROOM_NOT_JOINABLE");
    }
    if (!players.some((player) => player.uid === uid)) throw new HttpsError("failed-precondition", "ROOM_MEMBERSHIP_MISMATCH");
    transaction.update(roomRef, {
      players: players.map((player) => player.uid === uid ? { ...player, ready } : player),
      updatedAt: now,
    });
    transaction.set(db.doc(`room_consents/${roomId}_${uid}`), { roomId, uid, ready, updatedAt: now }, { merge: false });
    return { roomId, ready };
  });
}

export async function startMatchHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const mode = requiredString(data, "mode", 16) as MatchMode;
  if (!["bot", "online", "friends", "event"].includes(mode)) throw new HttpsError("invalid-argument", "INVALID_MODE");
  const requestedStake = Number(data.stake ?? 0);
  if (!Number.isInteger(requestedStake) || ![0, 100, 250, 500].includes(requestedStake)) throw new HttpsError("invalid-argument", "INVALID_STAKE");
  const roomId = typeof data.roomId === "string" ? data.roomId : undefined;
  const eventRunId = typeof data.eventRunId === "string" ? data.eventRunId : undefined;
  let matchId = stableId(uid, "match", String(data.idempotencyKey)).slice(0, 40);
  return runIdempotent(uid, "startMatch", data.idempotencyKey, async (transaction, now) => {
    let participants: MatchParticipant[] = [];
    let eventRunRefs: DocumentReference[] = [];
    let eventRunSnaps: DocumentSnapshot[] = [];
    let eventRunIds: Record<string, string> = {};
    let eventStake = 0;
    let eventRanked = false;
    let eventQueueRef: DocumentReference | null = null;
    let eventQueueEntries: Array<{ uid: string; runId: string; joinedAt: number }> | null = null;
    let roomRef: DocumentReference | null = null;
    if (mode === "bot") {
      const botCount = integer(data, "botCount", 1, 3);
      const playerSnap = await transaction.get(db.doc(`players/${uid}`));
      participants = [{ uid, name: String(playerSnap.get("name") ?? "Joueur"), emoji: String(playerSnap.get("emoji") ?? "🎴"), bot: false, crowns: Number(playerSnap.get("crowns") ?? 1_000) }];
      participants.push(...Array.from({ length: botCount }, (_, index) => ({ uid: `bot_${matchId}_${index}`, name: ["Massa", "Mami", "Tonton"][index], emoji: ["🧔🏿", "👩🏿", "🧓🏿"][index], bot: true, crowns: 1_000 })));
    } else if (mode === "event") {
      if (!eventRunId) throw new HttpsError("invalid-argument", "EVENT_RUN_REQUIRED");
      const ownRunRef = db.doc(`event_runs/${eventRunId}`);
      const ownRunSnap = await transaction.get(ownRunRef);
      if (!ownRunSnap.exists || ownRunSnap.get("uid") !== uid) throw new HttpsError("failed-precondition", "INVALID_EVENT_RUN");
      const currentMatchId = ownRunSnap.get("currentMatchId");
      if (typeof currentMatchId === "string") {
        const [existingMatch, privateHand] = await Promise.all([
          transaction.get(db.doc(`matches/${currentMatchId}`)),
          transaction.get(db.doc(`matches/${currentMatchId}/private/${uid}`)),
        ]);
        if (existingMatch.exists && privateHand.exists) return publicState(
          currentMatchId,
          existingMatch.data() ?? {},
          privateHand.get("hand") ?? [],
          privateHand.get("equippedPowers") ?? [],
        );
      }
      if (!["active", "matchmaking"].includes(String(ownRunSnap.get("status")))) throw new HttpsError("failed-precondition", "INVALID_EVENT_RUN_STATUS");
      const version = ownRunSnap.get("versionSnapshot") as {
        eventId: string;
        revision: number;
        mode: "pve" | "pvp";
        stages: Array<{ playerCount: number; stakeNkap: number; crownsEnabled?: boolean }>;
      };
      const stageIndex = Number(ownRunSnap.get("stageIndex") ?? 0);
      const stage = version.stages[stageIndex];
      if (!stage) throw new HttpsError("failed-precondition", "EVENT_STAGE_NOT_FOUND");
      eventStake = Number(stage.stakeNkap ?? 0);
      eventRanked = stage.crownsEnabled === true;
      if (version.mode === "pve") {
        const playerSnap = await transaction.get(db.doc(`players/${uid}`));
        participants = [{ uid, name: String(playerSnap.get("name") ?? "Joueur"), emoji: String(playerSnap.get("emoji") ?? "🎴"), bot: false, crowns: Number(playerSnap.get("crowns") ?? 1_000) }];
        participants.push(...Array.from({ length: Math.max(1, stage.playerCount - 1) }, (_, index) => ({ uid: `bot_${matchId}_${index}`, name: `Gardien ${index + 1}`, emoji: "🥁", bot: true, crowns: 1_000 })));
        eventRunRefs = [ownRunRef];
        eventRunSnaps = [ownRunSnap];
        eventRunIds = { [uid]: eventRunId };
      } else {
        const requiredPlayers = Math.max(2, Math.min(4, Number(stage.playerCount ?? 4)));
        eventQueueRef = db.doc(`event_matchmaking/${version.eventId}_v${version.revision}_s${stageIndex}`);
        const queueSnap = await transaction.get(eventQueueRef);
        const queued = ((queueSnap.get("entries") ?? []) as Array<{ uid: string; runId: string; joinedAt: number }>)
          .filter((entry) => entry.uid !== uid && entry.runId !== eventRunId)
          .slice(0, 12);
        const queuedRefs = queued.map((entry) => db.doc(`event_runs/${entry.runId}`));
        const queuedSnaps = await Promise.all(queuedRefs.map((ref) => transaction.get(ref)));
        const validQueued = queued.filter((entry, index) => {
          const snapshot = queuedSnaps[index];
          return snapshot.exists
            && snapshot.get("uid") === entry.uid
            && snapshot.get("status") === "matchmaking"
            && Number(snapshot.get("stageIndex") ?? -1) === stageIndex
            && !snapshot.get("currentMatchId");
        });
        const entries = [...validQueued, { uid, runId: eventRunId, joinedAt: now }];
        if (entries.length < requiredPlayers) {
          transaction.set(eventQueueRef, { eventId: version.eventId, revision: version.revision, stageIndex, entries, updatedAt: now }, { merge: false });
          return { waiting: true, status: "matchmaking", runId: eventRunId, playersFound: entries.length, playersRequired: requiredPlayers };
        }
        const group = entries.slice(0, requiredPlayers);
        eventQueueEntries = entries.slice(requiredPlayers);
        const snapshotByRunId = new Map(queued.map((entry, index) => [entry.runId, queuedSnaps[index]]));
        eventRunRefs = group.map((entry) => db.doc(`event_runs/${entry.runId}`));
        eventRunSnaps = group.map((entry) => entry.runId === eventRunId ? ownRunSnap : snapshotByRunId.get(entry.runId)!);
        const playerSnaps = await Promise.all(group.map((entry) => transaction.get(db.doc(`players/${entry.uid}`))));
        participants = group.map((entry, index) => ({
          uid: entry.uid,
          name: String(playerSnaps[index].get("name") ?? "Joueur"),
          emoji: String(playerSnaps[index].get("emoji") ?? "🎴"),
          bot: false,
          crowns: Number(playerSnaps[index].get("crowns") ?? 1_000),
        }));
        eventRunIds = Object.fromEntries(group.map((entry) => [entry.uid, entry.runId]));
        const runAttempts = group.map((entry, index) => `${entry.runId}:${Number(eventRunSnaps[index].get("matchesPlayed") ?? 0)}`).sort();
        const groupId = stableId("event-group", version.eventId, String(version.revision), String(stageIndex), ...runAttempts).slice(0, 40);
        matchId = stableId("event-match", groupId).slice(0, 40);
      }
    } else {
      if (!roomId) throw new HttpsError("invalid-argument", "ROOM_REQUIRED");
      roomRef = db.doc(`rooms/${roomId}`);
      const roomSnap = await transaction.get(roomRef);
      if (!roomSnap.exists || roomSnap.get("hostId") !== uid) throw new HttpsError("permission-denied", "ONLY_HOST_CAN_START");
      if (roomSnap.get("status") !== "playing") throw new HttpsError("failed-precondition", "ROOM_NOT_STARTED");
      const activeMatchId = roomSnap.get("activeMatchId");
      if (typeof activeMatchId === "string" && activeMatchId) {
        const [existingMatch, privateHand] = await Promise.all([
          transaction.get(db.doc(`matches/${activeMatchId}`)),
          transaction.get(db.doc(`matches/${activeMatchId}/private/${uid}`)),
        ]);
        if (existingMatch.exists && privateHand.exists && existingMatch.get("status") === "playing") {
          return publicState(
            activeMatchId,
            existingMatch.data() ?? {},
            privateHand.get("hand") ?? [],
            privateHand.get("equippedPowers") ?? [],
          );
        }
        throw new HttpsError("failed-precondition", "ROOM_ACTIVE_MATCH_INVALID");
      }
      const roomPlayers = (roomSnap.get("players") ?? []) as Array<{ uid: string; name: string; emoji: string }>;
      const memberUids = (roomSnap.get("playerUids") ?? []) as string[];
      const playerUids = roomPlayers.map((player) => player.uid);
      if (roomPlayers.length < 2 || roomPlayers.length > 4
        || new Set(playerUids).size !== roomPlayers.length
        || new Set(memberUids).size !== memberUids.length
        || memberUids.length !== playerUids.length
        || !playerUids.every((participantUid) => memberUids.includes(participantUid))
        || !roomPlayers.some((player) => player.uid === uid)) throw new HttpsError("failed-precondition", "INVALID_ROOM_PLAYERS");
      const guestUids = playerUids.filter((participantUid) => participantUid !== uid);
      const [playerSnaps, consentSnaps] = await Promise.all([
        Promise.all(roomPlayers.map((player) => transaction.get(db.doc(`players/${player.uid}`)))),
        Promise.all(guestUids.map((participantUid) => transaction.get(db.doc(`room_consents/${roomId}_${participantUid}`)))),
      ]);
      if (consentSnaps.some((snapshot, index) => !snapshot.exists
        || snapshot.get("roomId") !== roomId
        || snapshot.get("uid") !== guestUids[index]
        || snapshot.get("ready") !== true)) throw new HttpsError("failed-precondition", "ROOM_PLAYERS_NOT_READY");
      participants = roomPlayers.map((player, index) => ({ ...player, bot: false, crowns: Number(playerSnaps[index].get("crowns") ?? 1_000) }));
    }

    const stake = mode === "friends" ? 0 : mode === "event" ? eventStake : requestedStake;
    if (mode !== "friends" && mode !== "event" && ![100, 250, 500].includes(stake)) throw new HttpsError("invalid-argument", "STAKE_REQUIRED");
    const realParticipants = participants.filter((participant) => !participant.bot);
    const [economySnaps, inventorySnaps, economyConfigSnap] = await Promise.all([
      Promise.all(realParticipants.map((participant) => transaction.get(db.doc(`economies/${participant.uid}`)))),
      Promise.all(realParticipants.map((participant) => transaction.get(db.doc(`inventories/${participant.uid}`)))),
      transaction.get(db.doc("runtime_config/economy")),
    ]);
    const configuredCosts = (economyConfigSnap.get("matchEnergyCosts") ?? {}) as Partial<Record<MatchMode, number>>;
    const energyCost = mode === "event" ? 0 : Math.floor(boundedNumber(configuredCosts[mode], matchCost(mode), 0, 100));
    const nextEconomies = realParticipants.map((participant, index) => {
      if (!economySnaps[index].exists) throw new HttpsError("failed-precondition", "PLAYER_NOT_INITIALIZED");
      const economy = economyFrom(economySnaps[index].data(), now);
      if (economy.nkap < stake) throw new HttpsError("resource-exhausted", "INSUFFICIENT_NKAP");
      let energy: EnergyState;
      try { energy = spendEnergy(economy.energy, energyCost, now); }
      catch { throw new HttpsError("resource-exhausted", "INSUFFICIENT_ENERGY"); }
      return { ...economy, nkap: economy.nkap - stake, energy };
    });
    const devPowerBypass = process.env.POWERS_DEV_BYPASS === "1";
    const allPowerIds = Object.keys(POWER_CARDS_BY_ID) as PowerCardId[];
    const equippedByUid = new Map(realParticipants.map((participant, index) => [
      participant.uid,
      devPowerBypass ? allPowerIds : (inventorySnaps[index].get("equippedCards") ?? []) as PowerCardId[],
    ]));

    const deck = secureDeck();
    const hands = new Map<string, ServerCard[]>();
    participants.forEach((participant) => hands.set(participant.uid, deck.splice(0, 5)));
    const turnId = stableId(matchId, "turn", "0").slice(0, 24);
    const match = {
      id: matchId, mode, roomId: roomId ?? null, eventRunId: eventRunId ?? null, eventRunIds,
      ranked: mode === "online" || eventRanked,
      status: "playing", participants, participantUids: realParticipants.map((participant) => participant.uid),
      stakeNkap: stake, energyCost, potNkap: mode === "bot" ? stake * participants.length : stake * realParticipants.length,
      leaderIndex: 0, turnIndex: 0, trickNumber: 0, trickPlays: [], deposits: {},
      handCounts: Object.fromEntries(participants.map((participant) => [participant.uid, 5])),
      turnId, turnStartedAt: now, actionDeadlineAt: now + SERVER_DELIVERY_MARGIN_MS + dealBudgetMs(participants.length) + 15_000,
      missedTurns: Object.fromEntries(realParticipants.map((participant) => [participant.uid, 0])),
      result: null, settlementId: null, createdAt: now, updatedAt: now,
    };
    realParticipants.forEach((participant, index) => {
      const ref = db.doc(`economies/${participant.uid}`);
      transaction.set(ref, nextEconomies[index], { merge: false });
      ledger(transaction, participant.uid, stableId(participant.uid, "match-start", matchId), "startMatch", { nkap: -stake, energy: -energyCost }, nextEconomies[index], now, { matchId, mode });
    });
    transaction.create(db.doc(`matches/${matchId}`), match);
    participants.forEach((participant) => transaction.create(db.doc(`matches/${matchId}/private/${participant.uid}`), {
      uid: participant.uid,
      hand: hands.get(participant.uid),
      equippedPowers: equippedByUid.get(participant.uid) ?? [],
      updatedAt: now,
    }));
    // Pioche restante + état moteur des cartes pouvoir — doc privé illisible
    // par les clients (le segment `__engine` n'est jamais un uid participant).
    persistEngineState(transaction, matchId, { deck: deck as EngineCard[], effects: [], runtime: {}, usedPowers: {}, updatedAt: now }, now);
    if (roomRef) transaction.update(roomRef, { activeMatchId: matchId, status: "playing", updatedAt: now });
    if (eventQueueRef && eventQueueEntries) transaction.set(eventQueueRef, { entries: eventQueueEntries, updatedAt: now }, { merge: true });
    eventRunRefs.forEach((ref, index) => transaction.update(ref, {
      status: "active", firstMatchId: eventRunSnaps[index].get("firstMatchId") ?? matchId,
      ticketStatus: eventRunSnaps[index].get("ticketStatus") === "reserved" ? "consumed" : eventRunSnaps[index].get("ticketStatus"),
      currentMatchId: matchId, matchesPlayed: Number(eventRunSnaps[index].get("matchesPlayed") ?? 0) + 1, updatedAt: now,
    }));
    return publicState(matchId, match, hands.get(uid) ?? [], equippedByUid.get(uid) ?? []);
  });
}

export async function submitGameActionHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const matchId = requiredString(data, "matchId", 96);
  const cardId = requiredString(data, "cardId", 64);
  const suppliedTurnId = requiredString(data, "turnId", 64);
  return runIdempotent(uid, "submitGameAction", data.idempotencyKey, async (transaction, now) => {
    const matchSnap = await transaction.get(db.doc(`matches/${matchId}`));
    if (!matchSnap.exists) throw new HttpsError("not-found", "MATCH_NOT_FOUND");
    const match = matchSnap.data() as MatchDocument;
    if (match.status !== "playing" || !match.participantUids.includes(uid)) throw new HttpsError("failed-precondition", "MATCH_NOT_PLAYABLE");
    if (match.turnId !== suppliedTurnId) throw new HttpsError("aborted", "STALE_TURN");
    if ((match.participants as MatchParticipant[])[match.turnIndex].uid !== uid) throw new HttpsError("failed-precondition", "NOT_YOUR_TURN");
    return performGameAction(transaction, now, matchId, match, {
      actorUid: uid,
      requestedCardId: cardId,
      pick: "random",
      automatic: false,
      actionSeed: String(data.idempotencyKey),
    });
  });
}

export interface GameActionOptions {
  actorUid: string;
  /** null → sélection automatique selon `pick`. */
  requestedCardId: string | null;
  /** "lowest" = carte légale la plus faible (timeout humain, parité
   *  LocalGameSync) ; "random" = comportement bot historique. */
  pick: "random" | "lowest";
  automatic: boolean;
  /** Graine des playIds/docs actions — l'idempotencyKey client, ou une
   *  graine déterministe (matchId+turnId) pour le worker de timeout. */
  actionSeed: string;
  /** Incréments à fusionner dans match.missedTurns (worker de timeout). */
  missedTurnsDelta?: Record<string, number>;
  /** Résout un pli déjà complet sans jouer une carte supplémentaire. */
  skipInitialPlay?: boolean;
}

/** Cœur d'un coup de jeu : joue la carte de l'acteur, enchaîne les bots,
 *  applique restrictions/modificateurs/récompenses des pouvoirs, règle la
 *  manche si terminée et persiste tout. Les GARDES (auth, turnId, tour de
 *  l'acteur) appartiennent aux appelants — submitGameActionHandler et le
 *  worker d'auto-play (functions/src/matchTimeouts.ts). */
export async function performGameAction(
  transaction: Transaction,
  now: number,
  matchId: string,
  match: MatchDocument,
  opts: GameActionOptions,
) {
    const uid = opts.actorUid;
    const matchRef = db.doc(`matches/${matchId}`);
    const participants = match.participants as MatchParticipant[];
    const realParticipants = participants.filter((participant) => !participant.bot);
    const privateRefs = participants.map((participant) => db.doc(`matches/${matchId}/private/${participant.uid}`));
    const runIdsByUid = match.eventRunIds ?? (match.eventRunId ? { [uid]: match.eventRunId } : {});
    const eventRunRefs = realParticipants.map((participant) => runIdsByUid[participant.uid]).filter(Boolean).map((runId) => db.doc(`event_runs/${runId}`));
    const eventInventoryRefs = eventRunRefs.length > 0 ? realParticipants.map((participant) => db.doc(`inventories/${participant.uid}`)) : [];
    const roomRef = typeof match.roomId === "string" && match.roomId ? db.doc(`rooms/${match.roomId}`) : null;
    const [privateSnaps, economySnaps, playerSnaps, eventRunSnaps, eventInventorySnaps, roomSnap] = await Promise.all([
      Promise.all(privateRefs.map((ref) => transaction.get(ref))),
      Promise.all(realParticipants.map((participant) => transaction.get(db.doc(`economies/${participant.uid}`)))),
      Promise.all(realParticipants.map((participant) => transaction.get(db.doc(`players/${participant.uid}`)))),
      Promise.all(eventRunRefs.map((ref) => transaction.get(ref))),
      Promise.all(eventInventoryRefs.map((ref) => transaction.get(ref))),
      roomRef ? transaction.get(roomRef) : Promise.resolve(null),
    ]);
    const eliminated = new Set<string>(match.eliminatedUids ?? []);
    const hands = new Map(participants.map((participant, index) => [
      participant.uid,
      eliminated.has(participant.uid) ? [] : [...(privateSnaps[index].get("hand") ?? [])] as ServerCard[],
    ]));
    // État moteur des cartes pouvoir : restrictions de jeu, effets actifs,
    // pénalités de timer — même consommation que LocalGameSync.
    const engine = await loadEngineState(transaction, matchId);
    const runtime = PowerRuntimeState.fromJSON(engine.runtime);
    const eliminatedSeats = new Set(participants.flatMap((participant, index) => eliminated.has(participant.uid) ? [index] : []));
    let effects = [...engine.effects].filter((effect) => !eliminatedSeats.has(effect.activatedBy));
    let pot = Number(match.potNkap ?? 0);
    const actions: Array<{ uid: string; card: ServerCard; turnId: string; automatic: boolean }> = [];
    let turnIndex = Number(match.turnIndex);
    let leaderIndex = Number(match.leaderIndex);
    let trickNumber = Number(match.trickNumber);
    let trickPlays = [...(match.trickPlays ?? [])] as MatchPlay[];
    const deposits = { ...(match.deposits ?? {}) } as Record<string, ServerCard[]>;
    let finished = false;
    let finalWinnerIndex = -1;
    let completedTricks = 0;

    // Rotation « consciente des éliminés » : un joueur ayant abandonné est
    // sauté (aucune carte), mais ses cartes déjà posées comptent pour le pli.
    const activeParticipants = participants.filter((participant) => !eliminated.has(participant.uid));
    if (activeParticipants.length === 0) throw new HttpsError("failed-precondition", "MATCH_HAS_NO_ACTIVE_PLAYER");
    const trickComplete = () => activeParticipants.every((participant) => trickPlays.some((play) => play.uid === participant.uid));
    const nextSeatToPlay = (fromSeat: number): number => {
      for (let step = 1; step <= participants.length; step += 1) {
        const seat = (fromSeat + step) % participants.length;
        const candidate = participants[seat];
        if (!eliminated.has(candidate.uid) && !trickPlays.some((play) => play.uid === candidate.uid)) return seat;
      }
      return fromSeat;
    };

    const resolveCompletedTrick = () => {
      finalWinnerIndex = winnerIndex(trickPlays, participants);
      const trickRewards = applyTrickPowerRewards(effects, trickNumber + 1, finalWinnerIndex, pot);
      pot = trickRewards.pot;
      effects = trickRewards.effects;
      leaderIndex = finalWinnerIndex;
      turnIndex = finalWinnerIndex;
      trickPlays = [];
      trickNumber += 1;
      completedTricks += 1;
      finished = activeParticipants.every((participant) => (hands.get(participant.uid)?.length ?? 0) === 0);
    };

    const play = (actor: MatchParticipant, requestedCardId: string | null, automatic: boolean, pick: "random" | "lowest") => {
      const seat = participants.findIndex((participant) => participant.uid === actor.uid);
      const hand = hands.get(actor.uid) ?? [];
      const ledSuit = trickPlays[0]?.card.suit ?? null;
      const legal = legalCards(hand, ledSuit);
      let card = requestedCardId
        ? hand.find((candidate) => candidate.id === requestedCardId)
        : pick === "lowest"
          ? [...legal].sort((a, b) => a.value - b.value)[0]
          : legal[randomInt(legal.length)];
      if (!card || !legal.some((candidate) => candidate.id === card?.id)) throw new HttpsError("failed-precondition", "ILLEGAL_CARD");

      // Restrictions des pouvoirs (Coupe-Circuit, Filet, Sceau…) : carte
      // forcée remplace le choix ; carte verrouillée → refus (le client
      // affiche l'erreur), un bot bascule sur une alternative légale.
      if (runtime.hasRestriction(seat)) {
        const requestedIdx = hand.findIndex((candidate) => candidate.id === card?.id);
        let resolvedIdx = runtime.resolvePlay(seat, hand as EngineCard[], ledSuit, requestedIdx);
        if (resolvedIdx === null && automatic) {
          for (const alternative of legal) {
            const alternativeIdx = hand.findIndex((candidate) => candidate.id === alternative.id);
            if (alternativeIdx === requestedIdx) continue;
            resolvedIdx = runtime.resolvePlay(seat, hand as EngineCard[], ledSuit, alternativeIdx);
            if (resolvedIdx !== null) break;
          }
        }
        if (resolvedIdx === null) throw new HttpsError("failed-precondition", "Cette carte est bloquée — choisis-en une autre.");
        card = hand[resolvedIdx];
      }

      // Modificateurs « prochaine carte » (Éclair, Pagne Changeant).
      const modifiers = consumeNextCardModifiers(effects, seat, card as EngineCard, ledSuit, GAME_CONFIG.ranks.max);
      effects = modifiers.effects;
      const resolvedCard = modifiers.card as ServerCard;

      hands.set(actor.uid, hand.filter((candidate) => candidate.id !== card?.id));
      const turnId = String(match.turnId);
      trickPlays.push({ uid: actor.uid, card: resolvedCard, turnId });
      deposits[actor.uid] = [...(deposits[actor.uid] ?? []), resolvedCard];
      actions.push({ uid: actor.uid, card: resolvedCard, turnId, automatic });
      if (trickComplete()) {
        resolveCompletedTrick();
      } else {
        turnIndex = nextSeatToPlay(seat);
      }
    };

    if (activeParticipants.length === 1) {
      finalWinnerIndex = participants.findIndex((participant) => participant.uid === activeParticipants[0].uid);
      leaderIndex = finalWinnerIndex;
      turnIndex = finalWinnerIndex;
      trickPlays = [];
      finished = true;
    } else {
      if (opts.skipInitialPlay) {
        if (!trickComplete()) throw new HttpsError("failed-precondition", "TRICK_NOT_COMPLETE");
        resolveCompletedTrick();
      } else {
        play(participants[turnIndex], opts.requestedCardId, opts.automatic, opts.pick);
      }
      while (!finished && participants[turnIndex].bot) play(participants[turnIndex], null, true, "random");
    }

    const handCounts = Object.fromEntries(participants.map((participant) => [participant.uid, hands.get(participant.uid)?.length ?? 0]));
    const nextTurnId = stableId(matchId, "turn", String(trickNumber), String(actions.length), String(now)).slice(0, 24);
    const result = finished ? {
      winnerUid: participants[finalWinnerIndex].uid,
      winnerName: participants[finalWinnerIndex].name,
      winnerIsBot: participants[finalWinnerIndex].bot,
      type: "lastTrick", settledAt: now,
    } : null;

    if (finished) {
      const winnerUid = participants[finalWinnerIndex].uid;
      realParticipants.forEach((participant, index) => {
        const stats = (playerSnaps[index].get("stats") ?? {}) as { played?: number; won?: number; bestWin?: number };
        const won = participant.uid === winnerUid;
        const gain = won ? pot : 0;
        transaction.set(db.doc(`players/${participant.uid}`), {
          stats: {
            played: Number(stats.played ?? 0) + 1,
            won: Number(stats.won ?? 0) + (won ? 1 : 0),
            bestWin: Math.max(Number(stats.bestWin ?? 0), gain),
          },
          updatedAt: now,
        }, { merge: true });
        transaction.create(db.doc(`users/${participant.uid}/matches/${matchId}`), {
          id: matchId, mode: match.mode, stake: Number(match.stakeNkap ?? 0), gain,
          won, winnerName: participants[finalWinnerIndex].name, playersCount: participants.length,
          resultType: "lastTrick", doubles: false, roomId: match.roomId ?? null, createdAt: now,
        });
      });
    }

    if (finished) {
      // Remboursement partiel des perdants protégés (Cauris Chanceux — refundOnLoss).
      const stakeNkap = Number(match.stakeNkap ?? 0);
      realParticipants.forEach((participant, index) => {
        const seat = participants.findIndex((candidate) => candidate.uid === participant.uid);
        if (seat === finalWinnerIndex || eliminated.has(participant.uid) || stakeNkap <= 0) return;
        const ratio = effects.find((effect) => effect.activatedBy === seat && effect.refundOnLoss)?.refundOnLoss;
        if (!ratio) return;
        const amount = Math.round(stakeNkap * ratio);
        if (amount <= 0) return;
        const loserEconomy = economyFrom(economySnaps[index].data(), now);
        loserEconomy.nkap += amount;
        transaction.set(db.doc(`economies/${participant.uid}`), loserEconomy, { merge: false });
        ledger(transaction, participant.uid, stableId(participant.uid, "power-refund", matchId), "powerRefund", { nkap: amount }, loserEconomy, now, { matchId });
      });
    }

    if (finished && !participants[finalWinnerIndex].bot) {
      const winnerUid = participants[finalWinnerIndex].uid;
      const winnerEconomyIndex = realParticipants.findIndex((participant) => participant.uid === winnerUid);
      const winnerEconomy = economyFrom(economySnaps[winnerEconomyIndex].data(), now);
      winnerEconomy.nkap += pot;
      transaction.set(db.doc(`economies/${winnerUid}`), winnerEconomy, { merge: false });
      ledger(transaction, winnerUid, stableId(winnerUid, "match-settle", matchId), "settleMatch", { nkap: pot }, winnerEconomy, now, { matchId });
      if (match.ranked === true && realParticipants.length > 1) {
        const crownValues = playerSnaps.map((snap) => Number(snap.get("crowns") ?? 1_000));
        const winnerPlayerIndex = realParticipants.findIndex((participant) => participant.uid === winnerUid);
        const opponentAverage = crownValues.filter((_, index) => index !== winnerPlayerIndex).reduce((sum, value) => sum + value, 0) / (crownValues.length - 1);
        const gain = crownWinGain(crownValues[winnerPlayerIndex], opponentAverage);
        const losses = splitCrownLoss(gain, realParticipants.length - 1);
        let lossIndex = 0;
        realParticipants.forEach((participant, index) => {
          const delta = index === winnerPlayerIndex ? gain : -losses[lossIndex++];
          transaction.set(db.doc(`players/${participant.uid}`), {
            crowns: Math.max(0, crownValues[index] + delta),
            placementMatchesRemaining: Math.max(0, Number(playerSnaps[index].get("placementMatchesRemaining") ?? 5) - 1),
            updatedAt: now,
          }, { merge: true });
        });
        (result as Record<string, unknown>).crownGain = gain;
      }
    }

    if (finished && eventRunSnaps.length > 0) {
      const winnerUid = participants[finalWinnerIndex].uid;
      realParticipants.forEach((participant, index) => {
        const eventRunSnap = eventRunSnaps[index];
        const eventRunRef = eventRunRefs[index];
        const eventInventoryRef = eventInventoryRefs[index];
        const eventInventorySnap = eventInventorySnaps[index];
        if (!eventRunSnap?.exists || !eventRunRef || !eventInventoryRef || !eventInventorySnap) return;
        const version = eventRunSnap.get("versionSnapshot") as {
          mode: "pve" | "pvp";
          allowedLosses: number;
          stages: Array<{ id: string; reward: Reward[]; rewardRepeatable: boolean }>;
          finalReward: Reward[];
        };
        const stageIndex = Number(eventRunSnap.get("stageIndex") ?? 0);
        const losses = Number(eventRunSnap.get("losses") ?? 0);
        if (participant.uid !== winnerUid) {
          const progress = resolveEventProgress({ mode: version.mode, won: false, stageIndex, stageCount: version.stages.length, losses, allowedLosses: Number(version.allowedLosses ?? 3) });
          transaction.update(eventRunRef, {
            losses: progress.losses,
            status: progress.status,
            currentMatchId: null,
            updatedAt: now,
          });
          return;
        }

        const stage = version.stages[stageIndex];
        const isFinal = stageIndex >= version.stages.length - 1;
        const progress = resolveEventProgress({ mode: version.mode, won: true, stageIndex, stageCount: version.stages.length, losses, allowedLosses: Number(version.allowedLosses ?? 3) });
        const claimed = [...(eventRunSnap.get("claimedRewardKeys") ?? [])] as string[];
        const stageKey = `stage:${stage.id}`;
        const rewards = (!stage.rewardRepeatable && claimed.includes(stageKey)) ? [] : [...stage.reward];
        if (!claimed.includes(stageKey)) claimed.push(stageKey);
        if (isFinal && !claimed.includes("final")) { rewards.push(...version.finalReward); claimed.push("final"); }
        const beforeRewards = economyFrom(economySnaps[index].data(), now);
        beforeRewards.nkap += pot;
        let nextEconomy = beforeRewards;
        let nextInventory = eventInventorySnap.data() ?? {};
        for (const reward of rewards) ({ economy: nextEconomy, inventory: nextInventory } = applyReward(nextEconomy, nextInventory, reward, now));
        transaction.set(db.doc(`economies/${participant.uid}`), nextEconomy, { merge: false });
        transaction.set(eventInventoryRef, { ...nextInventory, updatedAt: now }, { merge: false });
        transaction.update(eventRunRef, {
          stageIndex: progress.stageIndex,
          status: progress.status,
          claimedRewardKeys: claimed,
          currentMatchId: null,
          completedAt: isFinal ? now : null,
          updatedAt: now,
        });
        const runId = runIdsByUid[participant.uid];
        ledger(transaction, participant.uid, stableId(participant.uid, "event-reward", runId, stageKey), "settleEventStage", {
          nkap: nextEconomy.nkap - beforeRewards.nkap,
          cauris: nextEconomy.cauris - beforeRewards.cauris,
        }, nextEconomy, now, { eventRunId: runId, stageIndex, rewards });
      });
    }

    // Fin de manche en salle : la salle redevient re-jouable (revanche via le
    // flux lobby standard : setRoomReady → startGame → startMatch).
    if (finished && roomRef && roomSnap?.exists) {
      resetRoomAfterMatch(transaction, roomRef, roomSnap.data() as Record<string, unknown>, now, eliminated);
    }

    participants.forEach((participant, index) => transaction.set(privateRefs[index], { uid: participant.uid, hand: hands.get(participant.uid) ?? [], updatedAt: now }, { merge: true }));
    actions.forEach((action, index) => transaction.create(db.doc(`matches/${matchId}/actions/${stableId(opts.actionSeed, String(index)).slice(0, 32)}`), { ...action, createdAt: now + index }));
    // Pénalité de timer différée (Cri du Chef…) : consommée au début du tour
    // du prochain joueur — parité avec LocalGameSync.startTurnSeconds. À faire
    // AVANT la persistance du runtime pour que la consommation soit durable.
    const nextTurnSeconds = runtime.consumeTimerPenalty(turnIndex, GAME_CONFIG.turnSeconds, 3);
    // Persistance de l'état moteur des pouvoirs (effets restants, restrictions
    // consommées, pénalités) — la pioche n'est pas touchée par un pli.
    persistEngineState(transaction, matchId, { ...engine, effects: finished ? [] : effects, runtime: runtime.toJSON() }, now);
    let missedTurns: Record<string, number> | undefined;
    if (opts.missedTurnsDelta) {
      missedTurns = { ...((match.missedTurns as Record<string, number> | undefined) ?? {}) };
      for (const [player, delta] of Object.entries(opts.missedTurnsDelta)) {
        missedTurns[player] = Number(missedTurns[player] ?? 0) + delta;
      }
    }
    // Budget d'animation du batch : le temps que les clients rejouent les
    // coups, le décompte affiché (clampé à turnSeconds) reste plein.
    const animBudget = actions.length * PLAY_ANIM_MS + completedTricks * TRICK_PAUSE_MS;
    const update = {
      turnIndex, leaderIndex, trickNumber, trickPlays, deposits, handCounts, potNkap: pot,
      eliminatedUids: [...eliminated],
      turnId: nextTurnId, turnStartedAt: now, actionDeadlineAt: now + SERVER_DELIVERY_MARGIN_MS + animBudget + nextTurnSeconds * 1_000,
      status: finished ? "settled" : "playing", result,
      recentActions: actions.map((action, index) => ({ ...action, playId: stableId(opts.actionSeed, String(index)).slice(0, 32) })),
      ...(missedTurns ? { missedTurns } : {}),
      settlementId: finished ? stableId("settlement", matchId) : null, updatedAt: now,
    };
    transaction.update(matchRef, update);
    const ownPrivateIndex = participants.findIndex((participant) => participant.uid === uid);
    return publicState(
      matchId,
      { ...match, ...update },
      hands.get(uid) ?? [],
      ownPrivateIndex >= 0 ? privateSnaps[ownPrivateIndex].get("equippedPowers") ?? [] : [],
    );
}

export async function reconnectMatchHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  requiredString(data, "idempotencyKey", 160);
  const matchId = requiredString(data, "matchId", 96);
  const [matchSnap, privateSnap] = await Promise.all([db.doc(`matches/${matchId}`).get(), db.doc(`matches/${matchId}/private/${uid}`).get()]);
  if (!matchSnap.exists || !privateSnap.exists || !(matchSnap.get("participantUids") ?? []).includes(uid)) throw new HttpsError("not-found", "MATCH_NOT_FOUND");
  return publicState(matchId, matchSnap.data() ?? {}, privateSnap.get("hand") ?? [], privateSnap.get("equippedPowers") ?? []);
}

export async function abandonMatchHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const matchId = requiredString(data, "matchId", 96);
  return runIdempotent(uid, "abandonMatch", data.idempotencyKey, async (transaction, now) => {
    const matchRef = db.doc(`matches/${matchId}`);
    const matchSnap = await transaction.get(matchRef);
    if (!matchSnap.exists || !(matchSnap.get("participantUids") ?? []).includes(uid)) throw new HttpsError("not-found", "MATCH_NOT_FOUND");
    if (matchSnap.get("status") !== "playing") return { matchId, status: matchSnap.get("status") };
    const match = matchSnap.data() as MatchDocument;
    const participants = match.participants as MatchParticipant[];
    const alreadyEliminated = new Set<string>(match.eliminatedUids ?? []);
    if (alreadyEliminated.has(uid)) return { matchId, status: "playing", eliminated: true };

    const eventRunIds = (matchSnap.get("eventRunIds") ?? {}) as Record<string, string>;
    const eventRunId = eventRunIds[uid] ?? matchSnap.get("eventRunId");
    const isEvent = matchSnap.get("mode") === "event";
    if (isEvent) {
      let runRef: DocumentReference | null = null;
      let runSnap: DocumentSnapshot | null = null;
      if (eventRunId) {
        runRef = db.doc(`event_runs/${eventRunId}`);
        runSnap = await transaction.get(runRef);
      }
      transaction.update(matchRef, { status: "forfeit", forfeitedBy: uid, forfeitedAt: now, updatedAt: now });
      if (runRef && runSnap) {
        const losses = Number(runSnap.get("losses") ?? 0) + 1;
        const maxLosses = Number(runSnap.get("versionSnapshot.allowedLosses") ?? 3);
        transaction.update(runRef, { losses, status: losses >= maxLosses ? "eliminated" : "active", currentMatchId: null, updatedAt: now });
      }
      return { matchId, status: "forfeit", eliminated: true };
    }

    const eliminated = new Set(alreadyEliminated).add(uid);
    const activeParticipants = participants.filter((participant) => !eliminated.has(participant.uid));
    if (activeParticipants.length === 0) throw new HttpsError("failed-precondition", "MATCH_HAS_NO_ACTIVE_PLAYER");
    const filteredTrickPlays = (match.trickPlays ?? []).filter((play) => play.uid !== uid);
    const quitterSeat = participants.findIndex((participant) => participant.uid === uid);
    const roomId = typeof match.roomId === "string" && match.roomId ? match.roomId : null;

    const removeQuitterFromRoom = (roomSnap: DocumentSnapshot | null) => {
      if (!roomId || !roomSnap?.exists) return;
      const roomRef = db.doc(`rooms/${roomId}`);
      const room = roomSnap.data() as Record<string, unknown>;
      const players = (Array.isArray(room.players) ? room.players : []) as Array<Record<string, unknown> & { uid: string }>;
      const remainingPlayers = players.filter((player) => player.uid !== uid);
      const previousHostId = String(room.hostId ?? "");
      const hostId = remainingPlayers.some((player) => player.uid === previousHostId) ? previousHostId : remainingPlayers[0]?.uid;
      transaction.update(roomRef, {
        hostId,
        players: remainingPlayers,
        playerUids: remainingPlayers.map((player) => player.uid),
        updatedAt: now,
      });
      transaction.delete(db.doc(`room_consents/${roomId}_${uid}`));
    };

    if (activeParticipants.length === 1) {
      const winner = activeParticipants[0];
      const winnerSeat = participants.findIndex((participant) => participant.uid === winner.uid);
      const state = await performGameAction(transaction, now, matchId, {
        ...match,
        eliminatedUids: [...eliminated],
        trickPlays: filteredTrickPlays,
        turnIndex: winnerSeat,
        leaderIndex: winnerSeat,
      }, {
        actorUid: winner.uid,
        requestedCardId: null,
        pick: "lowest",
        automatic: true,
        actionSeed: stableId(matchId, "abandon", uid, String(now)),
      });
      return { matchId, status: "settled", eliminated: true, winnerUid: winner.uid, state };
    }

    const remainingTrickComplete = activeParticipants.every((participant) => filteredTrickPlays.some((play) => play.uid === participant.uid));
    if (remainingTrickComplete) {
      const roomSnap = roomId ? await transaction.get(db.doc(`rooms/${roomId}`)) : null;
      const actor = activeParticipants[0];
      const state = await performGameAction(transaction, now, matchId, {
        ...match,
        eliminatedUids: [...eliminated],
        trickPlays: filteredTrickPlays,
      }, {
        actorUid: actor.uid,
        requestedCardId: null,
        pick: "lowest",
        automatic: true,
        actionSeed: stableId(matchId, "abandon-trick", uid, String(now)),
        skipInitialPlay: true,
      });
      if (state.match.status === "playing") removeQuitterFromRoom(roomSnap);
      return {
        matchId,
        status: state.match.status,
        eliminated: true,
        remainingPlayers: activeParticipants.length,
        state,
      };
    }

    const currentTurnSeat = Number(match.turnIndex);
    const currentTurnEliminated = currentTurnSeat === quitterSeat || eliminated.has(participants[currentTurnSeat]?.uid);
    let nextTurnSeat = currentTurnSeat;
    if (currentTurnEliminated) {
      for (let step = 1; step <= participants.length; step += 1) {
        const candidateSeat = (currentTurnSeat + step) % participants.length;
        const candidate = participants[candidateSeat];
        if (!eliminated.has(candidate.uid) && !filteredTrickPlays.some((play) => play.uid === candidate.uid)) {
          nextTurnSeat = candidateSeat;
          break;
        }
      }
    }

    if (roomId) {
      const roomSnap = await transaction.get(db.doc(`rooms/${roomId}`));
      removeQuitterFromRoom(roomSnap);
    }

    const nextTurnId = stableId(matchId, "turn", "abandon", uid, String(now)).slice(0, 24);
    const handCounts = { ...((match.handCounts as Record<string, number> | undefined) ?? {}), [uid]: 0 };
    transaction.set(db.doc(`matches/${matchId}/private/${uid}`), { uid, hand: [], updatedAt: now }, { merge: true });
    transaction.update(matchRef, {
      eliminatedUids: [...eliminated],
      trickPlays: filteredTrickPlays,
      handCounts,
      turnIndex: nextTurnSeat,
      leaderIndex: Number(match.leaderIndex) === quitterSeat ? nextTurnSeat : Number(match.leaderIndex),
      turnId: nextTurnId,
      turnStartedAt: currentTurnEliminated ? now : match.turnStartedAt,
      actionDeadlineAt: currentTurnEliminated ? now + GAME_CONFIG.turnSeconds * 1_000 : match.actionDeadlineAt,
      forfeitedBy: [...((match.forfeitedBy as string[] | undefined) ?? []), uid],
      forfeitedAt: now,
      updatedAt: now,
    });
    return { matchId, status: "playing", eliminated: true, remainingPlayers: activeParticipants.length };
  });
}
