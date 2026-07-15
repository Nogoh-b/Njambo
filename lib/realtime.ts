"use client";

/* ═══════════════ FILE: lib/realtime.ts ═══════════════
   Client WebSocket du canal temps réel du backend VPS (server/src/realtime).
   Une seule connexion partagée : auth par ID token au premier message,
   file d'attente des opérations tant que la connexion n'est pas prête,
   réabonnement automatique après coupure (backoff exponentiel).
   Consommé uniquement par lib/firestoreClient.ts. */

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { BACKEND_URL } from "@/lib/backend";

export interface SubscribeTarget {
  kind: "doc" | "query";
  path: string;
  where?: Array<{ field: string; op: "==" | "<" | "<=" | ">" | ">=" | "array-contains"; value: unknown }>;
  orderBy?: Array<{ field: string; direction: "asc" | "desc" }>;
  limit?: number;
}

export interface WireDoc {
  id: string;
  path: string;
  data: Record<string, unknown> | null;
}

type ServerMessage =
  | { type: "ready"; uid: string }
  | { type: "doc"; id: number; doc: WireDoc }
  | { type: "docs"; id: number; docs: WireDoc[] }
  | { type: "error"; id?: number; code: string; message: string };

interface Subscription {
  target: SubscribeTarget;
  onDoc?: (doc: WireDoc) => void;
  onDocs?: (docs: WireDoc[]) => void;
  onError?: (error: Error) => void;
}

interface PendingGet {
  target: SubscribeTarget;
  resolve: (value: WireDoc | WireDoc[]) => void;
  reject: (error: Error) => void;
  sent: boolean;
}

const WS_URL = `${BACKEND_URL.replace(/^http/, "ws")}/ws`;
const GET_TIMEOUT_MS = 15_000;

let socket: WebSocket | null = null;
let ready = false;
let connecting = false;
let retryDelay = 1_000;
let nextId = 1;
let authWatcherStarted = false;

const subscriptions = new Map<number, Subscription>();
const pendingGets = new Map<number, PendingGet>();

function realtimeError(code: string, message: string): Error {
  const error = new Error(message);
  error.name = code;
  return error;
}

function sendRaw(message: Record<string, unknown>) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function flushOperations() {
  for (const [id, subscription] of subscriptions) {
    sendRaw({ type: "subscribe", id, target: subscription.target });
  }
  for (const [id, pending] of pendingGets) {
    if (!pending.sent) {
      pending.sent = true;
      sendRaw({ type: "get", id, target: pending.target });
    }
  }
}

function handleMessage(message: ServerMessage) {
  if (message.type === "ready") {
    ready = true;
    retryDelay = 1_000;
    flushOperations();
    return;
  }
  if (message.type === "doc" || message.type === "docs") {
    const pending = pendingGets.get(message.id);
    if (pending) {
      pendingGets.delete(message.id);
      pending.resolve(message.type === "doc" ? message.doc : message.docs);
      return;
    }
    const subscription = subscriptions.get(message.id);
    if (!subscription) return;
    if (message.type === "doc") subscription.onDoc?.(message.doc);
    else subscription.onDocs?.(message.docs);
    return;
  }
  if (message.type === "error") {
    if (message.id !== undefined) {
      const pending = pendingGets.get(message.id);
      if (pending) {
        pendingGets.delete(message.id);
        pending.reject(realtimeError(message.code, message.message));
        return;
      }
      subscriptions.get(message.id)?.onError?.(realtimeError(message.code, message.message));
    }
  }
}

function scheduleReconnect() {
  if (subscriptions.size === 0 && pendingGets.size === 0) return;
  const delay = retryDelay;
  retryDelay = Math.min(retryDelay * 2, 30_000);
  setTimeout(() => { void ensureConnection(); }, delay);
}

async function ensureConnection() {
  if (typeof window === "undefined" || connecting || socket?.readyState === WebSocket.OPEN) return;
  const user = auth.currentUser;
  if (!user) return; // reconnexion retentée au prochain subscribe/get ou au login
  connecting = true;
  watchAuthChanges();
  try {
    const token = await user.getIdToken();
    const ws = new WebSocket(WS_URL);
    socket = ws;
    ws.onopen = () => { ws.send(JSON.stringify({ type: "auth", token })); };
    ws.onmessage = (event) => {
      try { handleMessage(JSON.parse(String(event.data)) as ServerMessage); } catch { /* message illisible : ignoré */ }
    };
    ws.onclose = () => {
      if (socket === ws) { socket = null; ready = false; }
      for (const pending of pendingGets.values()) pending.sent = false;
      scheduleReconnect();
    };
    ws.onerror = () => { ws.close(); };
  } finally {
    connecting = false;
  }
}

/* Déconnexion/reconnexion quand l'utilisateur change (nouveau token requis). */
function watchAuthChanges() {
  if (authWatcherStarted || typeof window === "undefined") return;
  authWatcherStarted = true;
  onAuthStateChanged(auth, () => {
    ready = false;
    socket?.close();
    socket = null;
    if (auth.currentUser) void ensureConnection();
  });
}

export function subscribe(
  target: SubscribeTarget,
  callbacks: { onDoc?: (doc: WireDoc) => void; onDocs?: (docs: WireDoc[]) => void; onError?: (error: Error) => void },
): () => void {
  const id = nextId++;
  subscriptions.set(id, { target, ...callbacks });
  if (ready) sendRaw({ type: "subscribe", id, target });
  else void ensureConnection();
  return () => {
    subscriptions.delete(id);
    if (ready) sendRaw({ type: "unsubscribe", id });
  };
}

export function getOnce(target: SubscribeTarget): Promise<WireDoc | WireDoc[]> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      if (pendingGets.delete(id)) reject(realtimeError("deadline-exceeded", "READ_TIMEOUT"));
    }, GET_TIMEOUT_MS);
    pendingGets.set(id, {
      target,
      sent: false,
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    if (ready) {
      const pending = pendingGets.get(id);
      if (pending) { pending.sent = true; sendRaw({ type: "get", id, target }); }
    } else {
      void ensureConnection();
    }
  });
}
