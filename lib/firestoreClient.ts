"use client";

/* ═══════════════ FILE: lib/firestoreClient.ts ═══════════════
   Shim compatible avec le sous-ensemble de l'API firebase/firestore utilisé
   par l'app (doc, collection, query, where, orderBy, limit, onSnapshot,
   getDoc, getDocs). Les lectures passent par le canal temps réel du backend
   VPS (lib/realtime.ts) au lieu de Firestore. Les écritures ne passent PAS
   par ce shim : chaque écriture est une commande nommée via callBackend
   (lib/backend.ts), validée côté serveur.

   Le paramètre `db` des fonctions est un simple jeton ignoré — conservé pour
   garder les mêmes signatures d'appel que le SDK Firestore. */

import { getOnce, subscribe, type SubscribeTarget, type WireDoc } from "@/lib/realtime";

export type Unsubscribe = () => void;

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ── Références ── */

interface BaseRef { path: string }

export interface DocumentReference extends BaseRef {
  readonly type: "document";
  readonly id: string;
}

export interface CollectionReference extends BaseRef {
  readonly type: "collection";
}

export interface QueryConstraint {
  kind: "where" | "orderBy" | "limit";
  field?: string;
  op?: "==" | "<" | "<=" | ">" | ">=" | "array-contains";
  value?: unknown;
  direction?: "asc" | "desc";
  count?: number;
}

export interface Query extends BaseRef {
  readonly type: "query";
  readonly constraints: QueryConstraint[];
}

function joinSegments(segments: string[]): string {
  if (segments.some((segment) => typeof segment !== "string" || segment.length === 0 || segment.includes("/"))) {
    throw new Error(`Chemin Firestore invalide: ${segments.join("/")}`);
  }
  return segments.join("/");
}

export function doc(_db: unknown, ...segments: string[]): DocumentReference {
  const path = joinSegments(segments);
  return { type: "document", path, id: segments[segments.length - 1] };
}

export function collection(_db: unknown, ...segments: string[]): CollectionReference {
  return { type: "collection", path: joinSegments(segments) };
}

export function where(field: string, op: QueryConstraint["op"], value: unknown): QueryConstraint {
  return { kind: "where", field, op, value };
}

export function orderBy(field: string, direction: "asc" | "desc" = "asc"): QueryConstraint {
  return { kind: "orderBy", field, direction };
}

export function limit(count: number): QueryConstraint {
  return { kind: "limit", count };
}

export function query(source: CollectionReference | Query, ...constraints: QueryConstraint[]): Query {
  const existing = source.type === "query" ? source.constraints : [];
  return { type: "query", path: source.path, constraints: [...existing, ...constraints] };
}

function queryTarget(source: CollectionReference | Query): SubscribeTarget {
  const constraints = source.type === "query" ? source.constraints : [];
  const target: SubscribeTarget = { kind: "query", path: source.path };
  for (const constraint of constraints) {
    if (constraint.kind === "where") {
      (target.where ??= []).push({ field: constraint.field!, op: constraint.op!, value: constraint.value });
    } else if (constraint.kind === "orderBy") {
      (target.orderBy ??= []).push({ field: constraint.field!, direction: constraint.direction ?? "asc" });
    } else if (constraint.kind === "limit") {
      target.limit = constraint.count;
    }
  }
  return target;
}

/* ── Snapshots ── */

export class DocumentSnapshot {
  constructor(private readonly wire: WireDoc) {}
  get id() { return this.wire.id; }
  get ref(): DocumentReference { return { type: "document", path: this.wire.path, id: this.wire.id }; }
  exists(): boolean { return this.wire.data !== null; }
  data(): any { return this.wire.data ?? undefined; }
  get(fieldPath: string): any {
    let cursor: any = this.wire.data ?? undefined;
    for (const key of fieldPath.split(".")) {
      if (cursor === null || cursor === undefined || typeof cursor !== "object") return undefined;
      cursor = cursor[key];
    }
    return cursor;
  }
}

export class QuerySnapshot {
  readonly docs: DocumentSnapshot[];
  constructor(wireDocs: WireDoc[]) {
    this.docs = wireDocs.map((wire) => new DocumentSnapshot(wire));
  }
  get empty() { return this.docs.length === 0; }
  get size() { return this.docs.length; }
}

/* ── Lectures ── */

export function onSnapshot(
  target: DocumentReference,
  onNext: (snapshot: DocumentSnapshot) => void,
  onError?: (error: Error) => void,
): Unsubscribe;
export function onSnapshot(
  target: CollectionReference | Query,
  onNext: (snapshot: QuerySnapshot) => void,
  onError?: (error: Error) => void,
): Unsubscribe;
export function onSnapshot(
  target: DocumentReference | CollectionReference | Query,
  onNext: ((snapshot: DocumentSnapshot) => void) | ((snapshot: QuerySnapshot) => void),
  onError?: (error: Error) => void,
): Unsubscribe {
  if (target.type === "document") {
    return subscribe({ kind: "doc", path: target.path }, {
      onDoc: (wire) => (onNext as (snapshot: DocumentSnapshot) => void)(new DocumentSnapshot(wire)),
      onError,
    });
  }
  return subscribe(queryTarget(target), {
    onDocs: (wireDocs) => (onNext as (snapshot: QuerySnapshot) => void)(new QuerySnapshot(wireDocs)),
    onError,
  });
}

export async function getDoc(ref: DocumentReference): Promise<DocumentSnapshot> {
  const wire = await getOnce({ kind: "doc", path: ref.path });
  return new DocumentSnapshot(wire as WireDoc);
}

export async function getDocs(source: CollectionReference | Query): Promise<QuerySnapshot> {
  const wireDocs = await getOnce(queryTarget(source));
  return new QuerySnapshot(wireDocs as WireDoc[]);
}
