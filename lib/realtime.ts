"use client";

/* ═══════════════ FILE: lib/realtime.ts ═══════════════
   Client WebSocket du canal temps réel du backend VPS (server/src/realtime).
   Une seule connexion partagée : auth par ID token au premier message,
   file d'attente des opérations tant que la connexion n'est pas prête,
   réabonnement automatique après coupure (backoff exponentiel).
   Consommé uniquement par lib/firestoreClient.ts. */

import { auth, onAuthStateChanged } from "@/lib/authClient";
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
  | { type: "ready"; uid: string | null }
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
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;
let authWatcherStarted = false;
let stopAuthWatcher: (() => void) | null = null;
let stopOnlineWatcher: (() => void) | null = null;
let lastAuthUid: string | null = null;
let connectionGen = 0;
let forceRefreshNextAuth = false;

const subscriptions = new Map<number, Subscription>();
const pendingGets = new Map<number, PendingGet>();

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

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
    connecting = false;
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

function scheduleReconnect(delayOverride?: number) {
  if (subscriptions.size === 0 && pendingGets.size === 0) return;
  clearReconnectTimer();
  const delay = delayOverride ?? retryDelay;
  if (delayOverride === undefined) retryDelay = Math.min(retryDelay * 2, 30_000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void ensureConnection();
  }, delay);
}

function resetConnection(immediateReconnect: boolean) {
  connectionGen += 1;
  clearReconnectTimer();
  ready = false;
  connecting = false;
  retryDelay = 1_000;
  for (const pending of pendingGets.values()) pending.sent = false;
  const previous = socket;
  socket = null;
  previous?.close();
  if (immediateReconnect && (subscriptions.size > 0 || pendingGets.size > 0)) {
    void ensureConnection();
  }
}

async function ensureConnection() {
  if (typeof window === "undefined") return;
  watchAuthChanges();
  if (connecting || socket?.readyState === WebSocket.OPEN) return;
  if (subscriptions.size === 0 && pendingGets.size === 0) return;
  clearReconnectTimer();
  connecting = true;
  const gen = ++connectionGen;
  const user = auth.currentUser;
  const useForceRefresh = forceRefreshNextAuth && Boolean(user);
  forceRefreshNextAuth = false;
  try {
    // Sans utilisateur connecté, on ouvre la socket en mode lecture publique (`token: null`)
    // pour recevoir runtime_config/* (packs, sons, règles) et les catalogues publiés.
    const token = user ? await user.getIdToken(useForceRefresh) : null;
    // Un changement de session ou une autre connexion a pu survenir pendant l'attente du jeton.
    if (gen !== connectionGen || socket?.readyState === WebSocket.OPEN) {
      if (gen === connectionGen) connecting = false;
      return;
    }
    const ws = new WebSocket(WS_URL);
    socket = ws;
    ws.onopen = () => {
      if (socket !== ws) { ws.close(); return; }
      ws.send(JSON.stringify({ type: "auth", token }));
    };
    ws.onmessage = (event) => {
      if (socket !== ws) return;
      try { handleMessage(JSON.parse(String(event.data)) as ServerMessage); } catch { /* message illisible : ignoré */ }
    };
    ws.onclose = (event) => {
      if (socket !== ws) return;
      socket = null;
      ready = false;
      connecting = false;
      for (const pending of pendingGets.values()) pending.sent = false;
      // Jeton d'accès refusé (redémarrage serveur, secret changé, horloge décalée) :
      // un nouvel essai immédiat en forçant le renouvellement du JWT.
      if (event.code === 4401 && token !== null && !useForceRefresh && auth.currentUser) {
        forceRefreshNextAuth = true;
        scheduleReconnect(50);
        return;
      }
      scheduleReconnect();
    };
    ws.onerror = () => { ws.close(); };
  } catch {
    if (gen !== connectionGen) return;
    connecting = false;
    scheduleReconnect();
  }
}

/* Déconnexion/reconnexion quand l'utilisateur change (passage public ↔ connecté ou changement de compte). */
function watchAuthChanges() {
  if (authWatcherStarted || typeof window === "undefined") return;
  authWatcherStarted = true;
  lastAuthUid = auth.currentUser?.uid ?? null;
  stopAuthWatcher = onAuthStateChanged(auth, (user) => {
    const nextUid = user?.uid ?? null;
    if (nextUid === lastAuthUid) return;
    lastAuthUid = nextUid;
    forceRefreshNextAuth = false;
    resetConnection(true);
  });
  const onOnline = () => {
    if (!ready && !connecting && (subscriptions.size > 0 || pendingGets.size > 0)) {
      retryDelay = 1_000;
      clearReconnectTimer();
      void ensureConnection();
    }
  };
  window.addEventListener("online", onOnline);
  stopOnlineWatcher = () => window.removeEventListener("online", onOnline);
}

/** Tests uniquement : réinitialise l'état interne du client temps réel. */
export function __resetRealtimeForTest() {
  connectionGen += 1;
  clearReconnectTimer();
  stopAuthWatcher?.();
  stopAuthWatcher = null;
  stopOnlineWatcher?.();
  stopOnlineWatcher = null;
  const previous = socket;
  socket = null;
  ready = false;
  connecting = false;
  retryDelay = 1_000;
  nextId = 1;
  authWatcherStarted = false;
  lastAuthUid = null;
  forceRefreshNextAuth = false;
  subscriptions.clear();
  pendingGets.clear();
  previous?.close();
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
