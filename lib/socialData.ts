"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from "@/lib/firestoreClient";
import { db } from "@/lib/firebase";
import { callBackend } from "@/lib/backend";
import type {
  ChatMessage,
  ConversationEntry,
  FriendRequest,
  NotificationEntry,
  PublicPlayerProfile,
  SocialFriendEntry,
  SocialUserLite,
} from "@/types/game";

function stats(raw: unknown) {
  const s = raw && typeof raw === "object" ? raw as { played?: unknown; won?: unknown; bestWin?: unknown } : {};
  return {
    played: typeof s.played === "number" ? s.played : 0,
    won: typeof s.won === "number" ? s.won : 0,
    bestWin: typeof s.bestWin === "number" ? s.bestWin : 0,
  };
}

function publicPlayer(id: string, raw: Record<string, unknown>): PublicPlayerProfile {
  return {
    uid: typeof raw.uid === "string" ? raw.uid : id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : "Joueur",
    emoji: typeof raw.emoji === "string" && raw.emoji.trim() ? raw.emoji : "😎",
    balance: typeof raw.balance === "number" ? raw.balance : 0,
    crowns: typeof raw.crowns === "number" ? raw.crowns : 1000,
    online: raw.online === true,
    lastSeen: typeof raw.lastSeen === "number" ? raw.lastSeen : 0,
    stats: stats(raw.stats),
  };
}

function friend(id: string, raw: Record<string, unknown>): SocialFriendEntry {
  return {
    uid: typeof raw.uid === "string" ? raw.uid : id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : "Joueur",
    emoji: typeof raw.emoji === "string" && raw.emoji.trim() ? raw.emoji : "😎",
    online: raw.online === true,
    lastSeen: typeof raw.lastSeen === "number" ? raw.lastSeen : 0,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
  };
}

function request(id: string, raw: Record<string, unknown>): FriendRequest {
  const status = raw.status === "accepted" || raw.status === "rejected" || raw.status === "cancelled"
    ? raw.status
    : "pending";
  return {
    id,
    fromUid: typeof raw.fromUid === "string" ? raw.fromUid : "",
    fromName: typeof raw.fromName === "string" ? raw.fromName : "Joueur",
    fromEmoji: typeof raw.fromEmoji === "string" ? raw.fromEmoji : "😎",
    toUid: typeof raw.toUid === "string" ? raw.toUid : "",
    toName: typeof raw.toName === "string" ? raw.toName : "Joueur",
    toEmoji: typeof raw.toEmoji === "string" ? raw.toEmoji : "😎",
    status,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

function notification(id: string, raw: Record<string, unknown>): NotificationEntry {
  const type = raw.type === "friend_request" || raw.type === "friend_accept" || raw.type === "room_invite" || raw.type === "message"
    ? raw.type
    : "message";
  return {
    id,
    type,
    actorUid: typeof raw.actorUid === "string" ? raw.actorUid : "",
    actorName: typeof raw.actorName === "string" ? raw.actorName : "Joueur",
    actorEmoji: typeof raw.actorEmoji === "string" ? raw.actorEmoji : "😎",
    title: typeof raw.title === "string" ? raw.title : "Notification",
    body: typeof raw.body === "string" ? raw.body : "",
    read: raw.read === true,
    roomId: typeof raw.roomId === "string" ? raw.roomId : undefined,
    conversationId: typeof raw.conversationId === "string" ? raw.conversationId : undefined,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
  };
}

function conversation(id: string, raw: Record<string, unknown>): ConversationEntry {
  return {
    id,
    participants: Array.isArray(raw.participants) ? raw.participants.filter((uid): uid is string => typeof uid === "string") : [],
    participantMeta: raw.participantMeta && typeof raw.participantMeta === "object"
      ? raw.participantMeta as Record<string, { name: string; emoji: string }>
      : {},
    lastMessage: typeof raw.lastMessage === "string" ? raw.lastMessage : "",
    lastMessageAt: typeof raw.lastMessageAt === "number" ? raw.lastMessageAt : 0,
    unreadBy: raw.unreadBy && typeof raw.unreadBy === "object" ? raw.unreadBy as Record<string, boolean> : {},
  };
}

function chatMessage(id: string, raw: Record<string, unknown>): ChatMessage {
  return {
    id,
    fromUid: typeof raw.fromUid === "string" ? raw.fromUid : "",
    text: typeof raw.text === "string" ? raw.text : "",
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
  };
}

export function conversationId(a: string, b: string) {
  return [a, b].sort().join("__");
}

export function listenDiscoverPlayers(
  currentUid: string | undefined,
  search: string,
  cb: (players: PublicPlayerProfile[]) => void,
): Unsubscribe {
  // Borne la lecture : sans limit, on retéléchargeait TOUTE la collection players.
  const q = query(collection(db, "players"), orderBy("name"), limit(200));
  return onSnapshot(q, (snap) => {
    const term = search.trim().toLowerCase();
    const players = snap.docs
      .map((playerDoc) => publicPlayer(playerDoc.id, playerDoc.data()))
      .filter((player) => player.uid !== currentUid)
      .filter((player) => !term || player.name.toLowerCase().includes(term));
    cb(players);
  });
}

export function listenPlayer(uid: string, cb: (player: PublicPlayerProfile | null) => void): Unsubscribe {
  return onSnapshot(doc(db, "players", uid), (snap) => {
    cb(snap.exists() ? publicPlayer(snap.id, snap.data()) : null);
  });
}

export function listenFriends(uid: string, cb: (friends: SocialFriendEntry[]) => void): Unsubscribe {
  const q = query(collection(db, "users", uid, "friends"), orderBy("name"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((friendDoc) => friend(friendDoc.id, friendDoc.data())));
  });
}

export function listenFriendRequests(uid: string, cb: (requests: FriendRequest[]) => void): Unsubscribe {
  let incoming: FriendRequest[] = [];
  let outgoing: FriendRequest[] = [];
  const emit = () => cb([...incoming, ...outgoing].sort((a, b) => b.createdAt - a.createdAt));
  const inQ = query(collection(db, "friendRequests"), where("toUid", "==", uid), where("status", "==", "pending"));
  const outQ = query(collection(db, "friendRequests"), where("fromUid", "==", uid), where("status", "==", "pending"));
  const unsubIn = onSnapshot(inQ, (snap) => {
    incoming = snap.docs.map((reqDoc) => request(reqDoc.id, reqDoc.data()));
    emit();
  });
  const unsubOut = onSnapshot(outQ, (snap) => {
    outgoing = snap.docs.map((reqDoc) => request(reqDoc.id, reqDoc.data()));
    emit();
  });
  return () => {
    unsubIn();
    unsubOut();
  };
}

export async function sendFriendRequest(from: SocialUserLite, to: SocialUserLite): Promise<void> {
  if (from.uid === to.uid) return;
  // Les contrôles (déjà amis, requête existante/inverse) sont faits côté
  // serveur, dans une transaction — la commande répond {sent:false} en no-op.
  await callBackend("sendFriendRequest", { from, to });
}

export async function acceptFriendRequest(req: FriendRequest): Promise<void> {
  await callBackend("acceptFriendRequest", { requestId: req.id });
}

export async function rejectFriendRequest(requestIdToUpdate: string, cancelled = false): Promise<void> {
  // Le serveur déduit le statut du rôle de l'appelant : destinataire → rejected,
  // émetteur → cancelled (le paramètre est conservé pour la signature).
  void cancelled;
  await callBackend("rejectFriendRequest", { requestId: requestIdToUpdate });
}

export function listenNotifications(uid: string, cb: (notifications: NotificationEntry[]) => void): Unsubscribe {
  const q = query(collection(db, "users", uid, "notifications"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((notifDoc) => notification(notifDoc.id, notifDoc.data())));
  });
}

export async function markNotificationRead(_uid: string, notificationId: string): Promise<void> {
  await callBackend("markNotificationRead", { notificationId });
}

export async function sendRoomInvite(from: SocialUserLite, to: SocialUserLite, roomId: string): Promise<void> {
  await callBackend("sendRoomInvite", { from, to, roomId });
}

export function listenConversations(uid: string, cb: (conversations: ConversationEntry[]) => void): Unsubscribe {
  const q = query(collection(db, "conversations"), where("participants", "array-contains", uid));
  return onSnapshot(q, (snap) => {
    cb(snap.docs
      .map((convDoc) => conversation(convDoc.id, convDoc.data()))
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt));
  });
}

export function listenMessages(conversationIdToListen: string, cb: (messages: ChatMessage[]) => void): Unsubscribe {
  const q = query(collection(db, "conversations", conversationIdToListen, "messages"), orderBy("createdAt"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((msgDoc) => chatMessage(msgDoc.id, msgDoc.data())));
  });
}

export async function sendMessage(from: SocialUserLite, to: SocialUserLite, text: string): Promise<string> {
  const clean = text.trim();
  if (!clean) return conversationId(from.uid, to.uid);
  const result = await callBackend<{ conversationId: string }>("sendMessage", { from, to, text: clean });
  return result.data.conversationId;
}

export async function markConversationRead(_uid: string, convId: string): Promise<void> {
  await callBackend("markConversationRead", { conversationId: convId });
}

export function listenSocialCounts(uid: string, cb: (counts: { notifications: number; messages: number; requests: number }) => void): Unsubscribe {
  let notifications = 0;
  let messages = 0;
  let requests = 0;
  const emit = () => cb({ notifications, messages, requests });
  const unsubNotifs = listenNotifications(uid, (items) => {
    notifications = items.filter((item) => !item.read).length;
    emit();
  });
  const unsubConvs = listenConversations(uid, (items) => {
    messages = items.filter((item) => item.unreadBy?.[uid]).length;
    emit();
  });
  const unsubReqs = listenFriendRequests(uid, (items) => {
    requests = items.filter((item) => item.toUid === uid && item.status === "pending").length;
    emit();
  });
  return () => {
    unsubNotifs();
    unsubConvs();
    unsubReqs();
  };
}

export async function getPublicPlayer(uid: string): Promise<PublicPlayerProfile | null> {
  const snap = await getDoc(doc(db, "players", uid));
  return snap.exists() ? publicPlayer(snap.id, snap.data()) : null;
}

export async function findPublicPlayers(search = ""): Promise<PublicPlayerProfile[]> {
  const snap = await getDocs(query(collection(db, "players"), orderBy("name"), limit(200)));
  const term = search.trim().toLowerCase();
  return snap.docs
    .map((playerDoc) => publicPlayer(playerDoc.id, playerDoc.data()))
    .filter((player) => !term || player.name.toLowerCase().includes(term));
}
