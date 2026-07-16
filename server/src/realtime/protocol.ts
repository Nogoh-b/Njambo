/* ═══════════════ FILE: server/src/realtime/protocol.ts ═══════════════
   Messages du canal temps réel WebSocket, partagés entre le serveur et le
   shim client (lib/firestoreClient.ts reproduit ces types côté front). */

import type { OrderDirection, WhereOp } from "../../../functions/src/firestoreTypes";

export interface SubscribeTarget {
  kind: "doc" | "query";
  /** Chemin de document (kind=doc) ou de collection (kind=query). */
  path: string;
  where?: Array<{ field: string; op: WhereOp; value: unknown }>;
  orderBy?: Array<{ field: string; direction: OrderDirection }>;
  limit?: number;
}

export type ClientMessage =
  | { type: "auth"; token: string }
  | { type: "subscribe"; id: number; target: SubscribeTarget }
  | { type: "unsubscribe"; id: number }
  | { type: "get"; id: number; target: SubscribeTarget };

export interface WireDoc {
  id: string;
  path: string;
  data: Record<string, unknown> | null;
}

export type ServerMessage =
  | { type: "ready"; uid: string }
  | { type: "doc"; id: number; doc: WireDoc }
  | { type: "docs"; id: number; docs: WireDoc[] }
  | { type: "error"; id?: number; code: string; message: string };
