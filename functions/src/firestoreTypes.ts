/* ═══════════════ FILE: functions/src/firestoreTypes.ts ═══════════════
   Sous-ensemble structurel de l'API firebase-admin/firestore utilisé par les
   handlers. Zéro dépendance runtime : le vrai Firestore (Cloud Functions) et
   la façade Postgres du VPS (server/src/firestoreCompat) satisfont tous deux
   ce contrat — voir setDbBackend dans core.ts. */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type DocumentData = Record<string, any>;

export type WhereOp = "==" | "<" | "<=" | ">" | ">=" | "array-contains";
export type OrderDirection = "asc" | "desc";

export interface DocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  readonly ref: DocumentReference;
  data(): DocumentData | undefined;
  get(fieldPath: string): any;
}

export interface DocumentChange {
  readonly type: "added" | "modified" | "removed";
  readonly doc: DocumentSnapshot;
}

export interface QuerySnapshot {
  readonly empty: boolean;
  readonly size: number;
  readonly docs: DocumentSnapshot[];
  docChanges(): DocumentChange[];
}

export interface Query {
  where(field: string, op: WhereOp, value: unknown): Query;
  orderBy(field: string, direction?: OrderDirection): Query;
  limit(count: number): Query;
  get(): Promise<QuerySnapshot>;
  onSnapshot(onNext: (snapshot: QuerySnapshot) => void, onError?: (error: Error) => void): () => void;
}

export interface CollectionReference extends Query {
  doc(id?: string): DocumentReference;
}

export interface DocumentReference {
  readonly id: string;
  readonly path: string;
  get(): Promise<DocumentSnapshot>;
  set(data: DocumentData, options?: { merge?: boolean }): Promise<unknown>;
  delete(): Promise<unknown>;
  onSnapshot(onNext: (snapshot: DocumentSnapshot) => void, onError?: (error: Error) => void): () => void;
}

export interface Transaction {
  get(ref: DocumentReference): Promise<DocumentSnapshot>;
  create(ref: DocumentReference, data: DocumentData): unknown;
  set(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }): unknown;
  update(ref: DocumentReference, data: DocumentData): unknown;
  delete(ref: DocumentReference): unknown;
}

export interface WriteBatch {
  set(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }): unknown;
  update(ref: DocumentReference, data: DocumentData): unknown;
  delete(ref: DocumentReference): unknown;
  commit(): Promise<unknown>;
}

export interface CompatFirestore {
  doc(path: string): DocumentReference;
  collection(path: string): CollectionReference;
  runTransaction<T>(fn: (transaction: Transaction) => Promise<T>): Promise<T>;
  batch(): WriteBatch;
}
