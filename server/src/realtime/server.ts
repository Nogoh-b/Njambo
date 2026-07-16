/* ═══════════════ FILE: server/src/realtime/server.ts ═══════════════
   Canal temps réel WebSocket remplaçant onSnapshot côté client. Protocole
   minimal (protocol.ts) : auth par ID token Firebase au premier message,
   puis subscribe/unsubscribe/get sur des cibles doc ou query. S'appuie sur
   db (functions/src/core) — donc sur le backend actif, Postgres ou Firestore. */

import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { getAuth } from "firebase-admin/auth";
import { db } from "../../../functions/src/core";
import type { DocumentSnapshot, Query, QuerySnapshot, WhereOp } from "../../../functions/src/firestoreTypes";
import { authorizeTarget, parentCheckFor, type AuthInfo } from "./authz";
import type { ClientMessage, ServerMessage, SubscribeTarget, WireDoc } from "./protocol";

const WHERE_OPS: WhereOp[] = ["==", "<", "<=", ">", ">=", "array-contains"];
const MAX_SUBSCRIPTIONS = 100;
const AUTH_TIMEOUT_MS = 10_000;

function validateTarget(raw: unknown): SubscribeTarget | null {
  if (!raw || typeof raw !== "object") return null;
  const target = raw as SubscribeTarget;
  if (target.kind !== "doc" && target.kind !== "query") return null;
  if (typeof target.path !== "string" || target.path.length === 0 || target.path.length > 300) return null;
  const segments = target.path.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0 || segments.some((segment) => segment.includes("..") || segment.length > 200)) return null;
  if (target.kind === "doc" && segments.length % 2 !== 0) return null;
  if (target.kind === "query" && segments.length % 2 !== 1) return null;
  if (target.where !== undefined) {
    if (!Array.isArray(target.where) || target.where.length > 5) return null;
    for (const clause of target.where) {
      if (typeof clause?.field !== "string" || clause.field.length > 100 || !WHERE_OPS.includes(clause.op)) return null;
    }
  }
  if (target.orderBy !== undefined) {
    if (!Array.isArray(target.orderBy) || target.orderBy.length > 3) return null;
    for (const order of target.orderBy) {
      if (typeof order?.field !== "string" || order.field.length > 100) return null;
      if (order.direction !== "asc" && order.direction !== "desc") return null;
    }
  }
  if (target.limit !== undefined && (!Number.isInteger(target.limit) || target.limit < 1 || target.limit > 500)) return null;
  return target;
}

function buildQuery(target: SubscribeTarget): Query {
  let query: Query = db.collection(target.path);
  for (const clause of target.where ?? []) query = query.where(clause.field, clause.op, clause.value);
  for (const order of target.orderBy ?? []) query = query.orderBy(order.field, order.direction);
  if (target.limit) query = query.limit(target.limit);
  return query;
}

function wireDoc(snapshot: DocumentSnapshot): WireDoc {
  return { id: snapshot.id, path: snapshot.ref.path, data: snapshot.data() ?? null };
}

export function attachRealtime(httpServer: HttpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (socket: WebSocket) => {
    let auth: AuthInfo | null = null;
    const subscriptions = new Map<number, () => void>();

    const send = (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };
    const fail = (id: number | undefined, code: string, message: string) => send({ type: "error", id, code, message });

    const authTimer = setTimeout(() => {
      if (!auth) socket.close(4401, "AUTH_TIMEOUT");
    }, AUTH_TIMEOUT_MS);

    const handleSubscribeOrGet = async (message: Extract<ClientMessage, { type: "subscribe" | "get" }>) => {
      if (!auth) { fail(message.id, "unauthenticated", "AUTH_REQUIRED"); return; }
      const target = validateTarget(message.target);
      if (!target) { fail(message.id, "invalid-argument", "INVALID_TARGET"); return; }
      if (message.type === "subscribe" && subscriptions.size >= MAX_SUBSCRIPTIONS) {
        fail(message.id, "resource-exhausted", "TOO_MANY_SUBSCRIPTIONS");
        return;
      }
      const decision = authorizeTarget(auth, target);
      if (decision.kind === "deny") { fail(message.id, "permission-denied", "READ_DENIED"); return; }

      const parentCheck = parentCheckFor(auth, target);
      if (parentCheck) {
        const parentSnap = await db.doc(parentCheck.path).get();
        if (!parentSnap.exists || !parentCheck.predicate(parentSnap.data() ?? {})) {
          fail(message.id, "permission-denied", "READ_DENIED");
          return;
        }
      }

      const allowed = (data: Record<string, unknown> | null) =>
        decision.kind !== "filter" || (data !== null && decision.predicate(data));

      if (target.kind === "doc") {
        const ref = db.doc(target.path);
        const emit = (snapshot: DocumentSnapshot) => {
          const doc = wireDoc(snapshot);
          if (doc.data !== null && !allowed(doc.data)) {
            fail(message.id, "permission-denied", "READ_DENIED");
            subscriptions.get(message.id)?.();
            subscriptions.delete(message.id);
            return;
          }
          send({ type: "doc", id: message.id, doc });
        };
        if (message.type === "get") {
          emit(await ref.get());
          return;
        }
        subscriptions.get(message.id)?.();
        subscriptions.set(message.id, ref.onSnapshot(emit, (error) => {
          console.error(`realtime doc ${target.path}`, error);
          fail(message.id, "internal", "LISTENER_ERROR");
        }));
        return;
      }

      const query = buildQuery(target);
      const emit = (snapshot: QuerySnapshot) => {
        const docs = snapshot.docs.map(wireDoc).filter((doc) => allowed(doc.data));
        send({ type: "docs", id: message.id, docs });
      };
      if (message.type === "get") {
        emit(await query.get());
        return;
      }
      subscriptions.get(message.id)?.();
      subscriptions.set(message.id, query.onSnapshot(emit, (error) => {
        console.error(`realtime query ${target.path}`, error);
        fail(message.id, "internal", "LISTENER_ERROR");
      }));
    };

    socket.on("message", (payload) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(String(payload)) as ClientMessage;
      } catch {
        fail(undefined, "invalid-argument", "INVALID_JSON");
        return;
      }
      if (message.type === "auth") {
        if (typeof message.token !== "string") { fail(undefined, "unauthenticated", "INVALID_TOKEN"); return; }
        getAuth().verifyIdToken(message.token)
          .then((decoded) => {
            auth = { uid: decoded.uid, admin: decoded.admin === true };
            clearTimeout(authTimer);
            send({ type: "ready", uid: decoded.uid });
          })
          .catch(() => {
            fail(undefined, "unauthenticated", "INVALID_TOKEN");
            socket.close(4401, "INVALID_TOKEN");
          });
        return;
      }
      if (message.type === "unsubscribe") {
        subscriptions.get(message.id)?.();
        subscriptions.delete(message.id);
        return;
      }
      if (message.type === "subscribe" || message.type === "get") {
        if (!Number.isInteger(message.id)) { fail(undefined, "invalid-argument", "INVALID_ID"); return; }
        handleSubscribeOrGet(message).catch((error) => {
          console.error("realtime message error", error);
          fail(message.id, "internal", "INTERNAL_ERROR");
        });
        return;
      }
      fail(undefined, "invalid-argument", "UNKNOWN_MESSAGE_TYPE");
    });

    socket.on("close", () => {
      clearTimeout(authTimer);
      for (const unsubscribe of subscriptions.values()) unsubscribe();
      subscriptions.clear();
    });
  });

  return wss;
}
