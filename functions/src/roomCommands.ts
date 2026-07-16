/* ═══════════════ FILE: functions/src/roomCommands.ts ═══════════════
   Commandes serveur pour le cycle de vie des salles (rooms), qui remplacent
   les écritures directes du client (contexts/LobbyContext.tsx). La validation
   reprend les branches create/update/delete de firestore.rules — le client
   n'écrit plus jamais rooms/* lui-même. */

import { randomInt } from "node:crypto";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { asObject, db, integer, requireUid, requiredString, runIdempotent } from "./core";
import type { DocumentData, Transaction } from "./firestoreTypes";

interface RoomPlayer {
  uid: string;
  name: string;
  emoji: string;
  ready: boolean;
  balance: number;
  joinedAt: number;
}

const ROOM_STAKES = [0, 100, 250, 500];

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "NJAM";
  for (let index = 0; index < 3; index += 1) code += chars[randomInt(chars.length)];
  return code;
}

function playerIdentity(data: Record<string, unknown>) {
  return {
    name: requiredString(data, "name", 32),
    emoji: requiredString(data, "emoji", 32),
  };
}

function roomPlayers(snapshot: DocumentData): RoomPlayer[] {
  return Array.isArray(snapshot.players) ? snapshot.players as RoomPlayer[] : [];
}

async function getRoomOrThrow(transaction: Transaction, roomId: string) {
  const roomRef = db.doc(`rooms/${roomId}`);
  const roomSnap = await transaction.get(roomRef);
  if (!roomSnap.exists) throw new HttpsError("not-found", "ROOM_NOT_FOUND");
  return { roomRef, room: roomSnap.data() as DocumentData };
}

export async function createRoomHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const identity = playerIdentity(data);
  const stake = Number(data.stake);
  if (!ROOM_STAKES.includes(stake)) throw new HttpsError("invalid-argument", "INVALID_STAKE");
  const maxPlayers = integer(data, "maxPlayers", 2, 4);
  const roomType = data.roomType === "friends" ? "friends" : "online";
  return runIdempotent(uid, "createRoom", data.idempotencyKey, async (transaction, now) => {
    const player: RoomPlayer = { uid, ...identity, ready: true, balance: 5_000, joinedAt: now };
    const roomRef = db.collection("rooms").doc();
    const room = {
      code: generateCode(),
      hostId: uid,
      stake,
      status: "waiting",
      roomType,
      maxPlayers,
      players: [player],
      playerUids: [uid],
      createdAt: now,
    };
    transaction.create(roomRef, room);
    return { roomId: roomRef.id, room: { id: roomRef.id, ...room } };
  });
}

export async function joinRoomHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const roomId = requiredString(data, "roomId", 96);
  const identity = playerIdentity(data);
  return runIdempotent(uid, "joinRoom", data.idempotencyKey, async (transaction, now) => {
    const { roomRef, room } = await getRoomOrThrow(transaction, roomId);
    const players = roomPlayers(room);

    if (players.some((player) => player.uid === uid)) {
      // Déjà membre : simple rafraîchissement du nom/emoji (reconnexion).
      const updated = players.map((player) => player.uid === uid ? { ...player, ...identity } : player);
      transaction.update(roomRef, { players: updated, playerUids: updated.map((player) => player.uid), updatedAt: now });
      return { roomId, room: { id: roomId, ...room, players: updated, playerUids: updated.map((player) => player.uid) } };
    }

    if (room.status !== "waiting") throw new HttpsError("failed-precondition", "ROOM_ALREADY_STARTED");
    if (players.length >= Number(room.maxPlayers)) throw new HttpsError("failed-precondition", "ROOM_FULL");
    const updated = [...players, { uid, ...identity, ready: false, balance: 5_000, joinedAt: now } satisfies RoomPlayer];
    transaction.update(roomRef, { players: updated, playerUids: updated.map((player) => player.uid), updatedAt: now });
    return { roomId, room: { id: roomId, ...room, players: updated, playerUids: updated.map((player) => player.uid) } };
  });
}

export async function leaveRoomHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const roomId = requiredString(data, "roomId", 96);
  return runIdempotent(uid, "leaveRoom", data.idempotencyKey, async (transaction, now) => {
    const roomRef = db.doc(`rooms/${roomId}`);
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists) return { roomId, left: true, deleted: true };
    const room = roomSnap.data() as DocumentData;
    const players = roomPlayers(room);
    if (!players.some((player) => player.uid === uid)) return { roomId, left: true, deleted: false };

    const remaining = players.filter((player) => player.uid !== uid);
    if (remaining.length === 0) {
      transaction.delete(roomRef);
      return { roomId, left: true, deleted: true };
    }
    const hostLeftDuringMatch = room.hostId === uid && room.status === "playing";
    if (room.hostId === uid && !hostLeftDuringMatch) {
      transaction.delete(roomRef);
      return { roomId, left: true, deleted: true };
    }
    transaction.update(roomRef, {
      players: remaining,
      playerUids: remaining.map((player) => player.uid),
      ...(hostLeftDuringMatch ? { hostId: remaining[0].uid } : {}),
      updatedAt: now,
    });
    return { roomId, left: true, deleted: false };
  });
}

/** Reprise de partie : rafraîchit le nom/emoji du joueur dans une salle où il figure déjà. */
export async function refreshRoomPlayerHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const roomId = requiredString(data, "roomId", 96);
  const identity = playerIdentity(data);
  return runIdempotent(uid, "refreshRoomPlayer", data.idempotencyKey, async (transaction, now) => {
    const { roomRef, room } = await getRoomOrThrow(transaction, roomId);
    const players = roomPlayers(room);
    if (!players.some((player) => player.uid === uid)) throw new HttpsError("permission-denied", "NOT_A_ROOM_MEMBER");
    const updated = players.map((player) => player.uid === uid ? { ...player, ...identity } : player);
    transaction.update(roomRef, { players: updated, playerUids: updated.map((player) => player.uid), updatedAt: now });
    return { roomId, room: { id: roomId, ...room, players: updated, playerUids: updated.map((player) => player.uid) } };
  });
}

export async function startGameHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const roomId = requiredString(data, "roomId", 96);
  return runIdempotent(uid, "startGame", data.idempotencyKey, async (transaction, now) => {
    const { roomRef, room } = await getRoomOrThrow(transaction, roomId);
    if (room.hostId !== uid) throw new HttpsError("permission-denied", "ONLY_HOST_CAN_START");
    if (room.status === "playing") return { roomId, status: "playing" };
    if (room.status !== "waiting") throw new HttpsError("failed-precondition", "ROOM_NOT_STARTABLE");
    const players = roomPlayers(room);
    if (players.length < 2) throw new HttpsError("failed-precondition", "NOT_ENOUGH_PLAYERS");
    const guestsReady = players.filter((player) => player.uid !== uid).every((player) => player.ready === true);
    if (!guestsReady) throw new HttpsError("failed-precondition", "PLAYERS_NOT_READY");
    transaction.update(roomRef, { status: "playing", playerUids: players.map((player) => player.uid), updatedAt: now });
    return { roomId, status: "playing" };
  });
}
