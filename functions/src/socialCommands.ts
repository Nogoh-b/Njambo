/* ═══════════════ FILE: functions/src/socialCommands.ts ═══════════════
   Commandes serveur du graphe social : amis, messages, notifications,
   présence, réactions, profil. Remplacent les écritures directes du client
   (lib/socialData.ts, lib/playerData.ts, lib/reactions.ts,
   contexts/AuthContext.tsx) en portant la validation de firestore.rules. */

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { asObject, db, optionalString, requireUid, requiredString, runIdempotent } from "./core";
import type { DocumentData } from "./firestoreTypes";

type NotificationType = "friend_request" | "friend_accept" | "room_invite" | "message";

interface UserLite { uid: string; name: string; emoji: string }

function userLite(data: Record<string, unknown>, key: string): UserLite {
  const raw = data[key];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpsError("invalid-argument", `INVALID_${key.toUpperCase()}`);
  const value = raw as Record<string, unknown>;
  const uid = typeof value.uid === "string" && value.uid.length > 0 && value.uid.length <= 128 ? value.uid : null;
  const name = typeof value.name === "string" && value.name.trim().length > 0 && value.name.length <= 32 ? value.name : null;
  const emoji = typeof value.emoji === "string" && value.emoji.length > 0 && value.emoji.length <= 32 ? value.emoji : null;
  if (!uid || !name || !emoji) throw new HttpsError("invalid-argument", `INVALID_${key.toUpperCase()}`);
  return { uid, name, emoji };
}

function notificationPayload(
  type: NotificationType,
  actor: UserLite,
  title: string,
  body: string,
  now: number,
  extra: Record<string, string> = {},
) {
  if (title.length === 0 || title.length > 80 || body.length === 0 || body.length > 240) {
    throw new HttpsError("invalid-argument", "INVALID_NOTIFICATION_TEXT");
  }
  return {
    type,
    actorUid: actor.uid,
    actorName: actor.name,
    actorEmoji: actor.emoji,
    title,
    body,
    read: false,
    ...extra,
    createdAt: now,
  };
}

function requestId(fromUid: string, toUid: string) {
  return `${fromUid}_${toUid}`;
}

function conversationIdOf(a: string, b: string) {
  return [a, b].sort().join("__");
}

/* ── Profil (users/{uid}) ── */

export async function saveProfileHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const name = requiredString(data, "name", 32);
  const emoji = requiredString(data, "emoji", 32);
  const locale = optionalString(data, "locale", 8) ?? "fr";
  const ageBand = optionalString(data, "ageBand", 16) ?? "unknown";
  if (!["fr", "en"].includes(locale)) throw new HttpsError("invalid-argument", "INVALID_LOCALE");
  if (!["unknown", "13_17", "18_plus"].includes(ageBand)) throw new HttpsError("invalid-argument", "INVALID_AGE_BAND");
  const now = Date.now();
  const createdAt = typeof data.createdAt === "number" && data.createdAt > 0 ? data.createdAt : now;
  await db.doc(`users/${uid}`).set({ name, emoji, locale, ageBand, createdAt, updatedAt: now }, { merge: true });
  return { saved: true };
}

/* ── Présence (players_presence/{uid}) — battement, sans reçu d'idempotence ── */

export async function setPresenceHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  if (typeof data.online !== "boolean") throw new HttpsError("invalid-argument", "INVALID_ONLINE");
  await db.doc(`players_presence/${uid}`).set({ online: data.online, lastSeen: Date.now() }, { merge: true });
  return { saved: true };
}

/* ── Demandes d'amitié ── */

export async function sendFriendRequestHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const from = { ...userLite(data, "from"), uid };
  const to = userLite(data, "to");
  if (to.uid === uid) throw new HttpsError("invalid-argument", "CANNOT_FRIEND_SELF");
  const id = requestId(uid, to.uid);
  return runIdempotent(uid, "sendFriendRequest", data.idempotencyKey, async (transaction, now) => {
    const [friendSnap, requestSnap, reverseSnap] = await Promise.all([
      transaction.get(db.doc(`users/${uid}/friends/${to.uid}`)),
      transaction.get(db.doc(`friendRequests/${id}`)),
      transaction.get(db.doc(`friendRequests/${requestId(to.uid, uid)}`)),
    ]);
    const blockingStatus = (snapshot: typeof requestSnap) =>
      snapshot.exists && ["pending", "accepted"].includes(String(snapshot.get("status")));
    if (friendSnap.exists || blockingStatus(requestSnap) || blockingStatus(reverseSnap)) {
      return { sent: false, reason: "ALREADY_LINKED" };
    }
    transaction.set(db.doc(`friendRequests/${id}`), {
      fromUid: uid, fromName: from.name, fromEmoji: from.emoji,
      toUid: to.uid, toName: to.name, toEmoji: to.emoji,
      status: "pending", createdAt: now, updatedAt: now,
    }, { merge: true });
    transaction.create(db.collection(`users/${to.uid}/notifications`).doc(), notificationPayload(
      "friend_request", from, "Demande d'amitie", `${from.name} veut t'ajouter en ami.`, now,
    ));
    return { sent: true };
  });
}

export async function acceptFriendRequestHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const id = requiredString(data, "requestId", 260);
  return runIdempotent(uid, "acceptFriendRequest", data.idempotencyKey, async (transaction, now) => {
    const requestRef = db.doc(`friendRequests/${id}`);
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists) throw new HttpsError("not-found", "REQUEST_NOT_FOUND");
    const entry = requestSnap.data() as DocumentData;
    if (entry.toUid !== uid) throw new HttpsError("permission-denied", "ONLY_RECIPIENT_CAN_ACCEPT");
    if (entry.status === "accepted") return { accepted: true, duplicate: true };
    if (entry.status !== "pending") throw new HttpsError("failed-precondition", "REQUEST_NOT_PENDING");

    transaction.update(requestRef, { status: "accepted", updatedAt: now });
    transaction.set(db.doc(`users/${entry.fromUid}/friends/${entry.toUid}`), {
      uid: entry.toUid, name: entry.toName, emoji: entry.toEmoji, online: false, lastSeen: now, createdAt: now,
    }, { merge: true });
    transaction.set(db.doc(`users/${entry.toUid}/friends/${entry.fromUid}`), {
      uid: entry.fromUid, name: entry.fromName, emoji: entry.fromEmoji, online: false, lastSeen: now, createdAt: now,
    }, { merge: true });
    transaction.create(db.collection(`users/${entry.fromUid}/notifications`).doc(), notificationPayload(
      "friend_accept",
      { uid: String(entry.toUid), name: String(entry.toName), emoji: String(entry.toEmoji) },
      "Demande acceptee",
      `${entry.toName} a accepte ta demande.`,
      now,
    ));
    return { accepted: true };
  });
}

export async function rejectFriendRequestHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const id = requiredString(data, "requestId", 260);
  return runIdempotent(uid, "rejectFriendRequest", data.idempotencyKey, async (transaction, now) => {
    const requestRef = db.doc(`friendRequests/${id}`);
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists) throw new HttpsError("not-found", "REQUEST_NOT_FOUND");
    const entry = requestSnap.data() as DocumentData;
    // Rôle → statut, comme les rules : le destinataire rejette, l'émetteur annule.
    const status = entry.toUid === uid ? "rejected" : entry.fromUid === uid ? "cancelled" : null;
    if (!status) throw new HttpsError("permission-denied", "NOT_A_PARTICIPANT");
    if (entry.status !== "pending") return { status: entry.status, duplicate: true };
    transaction.update(requestRef, { status, updatedAt: now });
    return { status };
  });
}

/* ── Suppression d'ami (users/{uid}/friends, autorisée aux deux côtés par les rules) ── */

export async function removeFriendHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const friendUid = requiredString(data, "friendUid", 128);
  return runIdempotent(uid, "removeFriend", data.idempotencyKey, async (transaction) => {
    transaction.delete(db.doc(`users/${uid}/friends/${friendUid}`));
    transaction.delete(db.doc(`users/${friendUid}/friends/${uid}`));
    return { removed: true };
  });
}

/* ── Notifications ── */

export async function markNotificationReadHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const notificationId = requiredString(data, "notificationId", 128);
  await db.doc(`users/${uid}/notifications/${notificationId}`).set({ read: true }, { merge: true });
  return { read: true };
}

export async function sendRoomInviteHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const from = { ...userLite(data, "from"), uid };
  const to = userLite(data, "to");
  const roomId = requiredString(data, "roomId", 96);
  if (to.uid === uid) throw new HttpsError("invalid-argument", "CANNOT_INVITE_SELF");
  return runIdempotent(uid, "sendRoomInvite", data.idempotencyKey, async (transaction, now) => {
    transaction.create(db.collection(`users/${to.uid}/notifications`).doc(), notificationPayload(
      "room_invite", from, "Invitation de table", `${from.name} t'invite a une partie.`, now, { roomId },
    ));
    return { sent: true };
  });
}

/* ── Messagerie ── */

export async function sendMessageHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const from = { ...userLite(data, "from"), uid };
  const to = userLite(data, "to");
  if (to.uid === uid) throw new HttpsError("invalid-argument", "CANNOT_MESSAGE_SELF");
  const text = requiredString(data, "text", 500).trim();
  if (text.length === 0) throw new HttpsError("invalid-argument", "INVALID_TEXT");
  const conversationId = conversationIdOf(uid, to.uid);
  return runIdempotent(uid, "sendMessage", data.idempotencyKey, async (transaction, now) => {
    transaction.set(db.doc(`conversations/${conversationId}`), {
      participants: [uid, to.uid].sort(),
      participantMeta: {
        [uid]: { name: from.name, emoji: from.emoji },
        [to.uid]: { name: to.name, emoji: to.emoji },
      },
      lastMessage: text,
      lastMessageAt: now,
      unreadBy: { [to.uid]: true },
    }, { merge: true });
    transaction.create(db.collection(`conversations/${conversationId}/messages`).doc(), {
      fromUid: uid, text, createdAt: now,
    });
    transaction.create(db.collection(`users/${to.uid}/notifications`).doc(), notificationPayload(
      "message", from, "Nouveau message", text.slice(0, 240), now, { conversationId },
    ));
    return { conversationId };
  });
}

export async function markConversationReadHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const conversationId = requiredString(data, "conversationId", 260);
  const snapshot = await db.doc(`conversations/${conversationId}`).get();
  if (!snapshot.exists) return { read: true, missing: true };
  const participants = (snapshot.get("participants") ?? []) as string[];
  if (!participants.includes(uid)) throw new HttpsError("permission-denied", "NOT_A_PARTICIPANT");
  await db.doc(`conversations/${conversationId}`).set({ unreadBy: { [uid]: false } }, { merge: true });
  return { read: true };
}

/* ── Réactions en salle ── */

export async function sendReactionHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const roomId = requiredString(data, "roomId", 96);
  const emoji = requiredString(data, "emoji", 8);
  const roomSnap = await db.doc(`rooms/${roomId}`).get();
  const memberUids = (roomSnap.get("playerUids") ?? []) as string[];
  if (!roomSnap.exists || !memberUids.includes(uid)) throw new HttpsError("permission-denied", "NOT_A_ROOM_MEMBER");
  await db.collection(`rooms/${roomId}/reactions`).doc().set({ fromUid: uid, emoji, createdAt: Date.now() });
  return { sent: true };
}
