"use client";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
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
    balance: typeof raw.balance === "number" ? raw.balance : 5000,
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

function requestId(fromUid: string, toUid: string) {
  return `${fromUid}_${toUid}`;
}

export function conversationId(a: string, b: string) {
  return [a, b].sort().join("__");
}

export function listenDiscoverPlayers(
  currentUid: string | undefined,
  search: string,
  cb: (players: PublicPlayerProfile[]) => void,
): Unsubscribe {
  const q = query(collection(db, "players"), orderBy("name"));
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
  const now = Date.now();
  const id = requestId(from.uid, to.uid);
  const existingFriend = await getDoc(doc(db, "users", from.uid, "friends", to.uid));
  if (existingFriend.exists()) return;

  const existingRequest = await getDoc(doc(db, "friendRequests", id));
  if (existingRequest.exists()) {
    const current = request(existingRequest.id, existingRequest.data());
    if (current.status === "pending" || current.status === "accepted") return;
  }

  const reverseRequest = await getDoc(doc(db, "friendRequests", requestId(to.uid, from.uid)));
  if (reverseRequest.exists()) {
    const current = request(reverseRequest.id, reverseRequest.data());
    if (current.status === "pending" || current.status === "accepted") return;
  }

  await setDoc(doc(db, "friendRequests", id), {
    fromUid: from.uid,
    fromName: from.name,
    fromEmoji: from.emoji,
    toUid: to.uid,
    toName: to.name,
    toEmoji: to.emoji,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  await addDoc(collection(db, "users", to.uid, "notifications"), {
    type: "friend_request",
    actorUid: from.uid,
    actorName: from.name,
    actorEmoji: from.emoji,
    title: "Demande d'amitie",
    body: `${from.name} veut t'ajouter en ami.`,
    read: false,
    createdAt: now,
  });
}

export async function acceptFriendRequest(req: FriendRequest): Promise<void> {
  const now = Date.now();
  const reqRef = doc(db, "friendRequests", req.id);
  const fromFriendRef = doc(db, "users", req.fromUid, "friends", req.toUid);
  const toFriendRef = doc(db, "users", req.toUid, "friends", req.fromUid);
  const notificationRef = doc(collection(db, "users", req.fromUid, "notifications"));

  await runTransaction(db, async (transaction) => {
    transaction.update(reqRef, { status: "accepted", updatedAt: now });
    transaction.set(fromFriendRef, {
      uid: req.toUid,
      name: req.toName,
      emoji: req.toEmoji,
      online: false,
      lastSeen: now,
      createdAt: now,
    }, { merge: true });
    transaction.set(toFriendRef, {
      uid: req.fromUid,
      name: req.fromName,
      emoji: req.fromEmoji,
      online: false,
      lastSeen: now,
      createdAt: now,
    }, { merge: true });
    transaction.set(notificationRef, {
      type: "friend_accept",
      actorUid: req.toUid,
      actorName: req.toName,
      actorEmoji: req.toEmoji,
      title: "Demande acceptee",
      body: `${req.toName} a accepte ta demande.`,
      read: false,
      createdAt: now,
    });
  });
}

export async function rejectFriendRequest(requestIdToUpdate: string, cancelled = false): Promise<void> {
  await updateDoc(doc(db, "friendRequests", requestIdToUpdate), {
    status: cancelled ? "cancelled" : "rejected",
    updatedAt: Date.now(),
  });
}

export function listenNotifications(uid: string, cb: (notifications: NotificationEntry[]) => void): Unsubscribe {
  const q = query(collection(db, "users", uid, "notifications"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((notifDoc) => notification(notifDoc.id, notifDoc.data())));
  });
}

export async function markNotificationRead(uid: string, notificationId: string): Promise<void> {
  await updateDoc(doc(db, "users", uid, "notifications", notificationId), { read: true });
}

export async function sendRoomInvite(from: SocialUserLite, to: SocialUserLite, roomId: string): Promise<void> {
  await addDoc(collection(db, "users", to.uid, "notifications"), {
    type: "room_invite",
    actorUid: from.uid,
    actorName: from.name,
    actorEmoji: from.emoji,
    title: "Invitation de table",
    body: `${from.name} t'invite a une partie.`,
    read: false,
    roomId,
    createdAt: Date.now(),
  });
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
  const id = conversationId(from.uid, to.uid);
  const now = Date.now();
  const convRef = doc(db, "conversations", id);
  await setDoc(convRef, {
    participants: [from.uid, to.uid],
    participantMeta: {
      [from.uid]: { name: from.name, emoji: from.emoji },
      [to.uid]: { name: to.name, emoji: to.emoji },
    },
    lastMessage: clean,
    lastMessageAt: now,
    unreadBy: { [to.uid]: true },
  }, { merge: true });
  await addDoc(collection(db, "conversations", id, "messages"), {
    fromUid: from.uid,
    text: clean,
    createdAt: now,
  });
  await addDoc(collection(db, "users", to.uid, "notifications"), {
    type: "message",
    actorUid: from.uid,
    actorName: from.name,
    actorEmoji: from.emoji,
    title: "Nouveau message",
    body: clean,
    read: false,
    conversationId: id,
    createdAt: now,
  });
  return id;
}

export async function markConversationRead(uid: string, convId: string): Promise<void> {
  await setDoc(doc(db, "conversations", convId), {
    unreadBy: { [uid]: false },
  }, { merge: true });
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
  const snap = await getDocs(query(collection(db, "players"), orderBy("name")));
  const term = search.trim().toLowerCase();
  return snap.docs
    .map((playerDoc) => publicPlayer(playerDoc.id, playerDoc.data()))
    .filter((player) => !term || player.name.toLowerCase().includes(term));
}
