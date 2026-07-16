/* ═══════════════ FILE: server/src/firestoreCompat/pg.ts ═══════════════
   Façade PostgreSQL implémentant le contrat CompatFirestore
   (functions/src/firestoreTypes.ts). Modèle : une table générique
   documents(path, parent, data JSONB) qui reproduit la sémantique
   document/collection/sous-collection de Firestore.

   Sémantiques préservées (celles dont dépendent les handlers) :
   - runTransaction : lectures verrouillées (SELECT FOR UPDATE), écritures
     bufferisées appliquées au commit, retry sur deadlock/sérialisation/
     violation d'unicité (l'idempotence par command_receipts s'appuie dessus).
   - transaction.create : échoue si le document existe (ALREADY_EXISTS).
   - transaction.update : échoue si le document n'existe pas (NOT_FOUND),
     remplacement shallow des clés de premier niveau.
   - set {merge:true} : fusion récursive (jsonb_deep_merge côté SQL).
   - where ==/</<=/>/>=/array-contains, orderBy (exclut les documents sans le
     champ trié, comme Firestore), limit.
   - onSnapshot doc + query via ChangeBus post-commit. */

import { randomBytes } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { HttpsError } from "firebase-functions/v2/https";
import type {
  CollectionReference,
  CompatFirestore,
  DocumentChange,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  OrderDirection,
  Query,
  QuerySnapshot,
  Transaction,
  WhereOp,
  WriteBatch,
} from "../../../functions/src/firestoreTypes";
import { ChangeBus, type ChangeEvent } from "./bus";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS documents (
  path TEXT PRIMARY KEY,
  parent TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_parent_idx ON documents (parent);
CREATE INDEX IF NOT EXISTS documents_data_gin ON documents USING gin (data jsonb_path_ops);

CREATE OR REPLACE FUNCTION jsonb_deep_merge(a jsonb, b jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  result jsonb;
  key text;
BEGIN
  IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR jsonb_typeof(b) IS DISTINCT FROM 'object' THEN
    RETURN b;
  END IF;
  result := a;
  FOR key IN SELECT jsonb_object_keys(b) LOOP
    IF result ? key THEN
      result := jsonb_set(result, ARRAY[key], jsonb_deep_merge(result -> key, b -> key));
    ELSE
      result := jsonb_set(result, ARRAY[key], b -> key);
    END IF;
  END LOOP;
  RETURN result;
END
$$;
`;

/* ── Helpers chemins ── */

function segmentsOf(path: string): string[] {
  const segments = path.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) throw new HttpsError("invalid-argument", `INVALID_PATH:${path}`);
  return segments;
}

function docPath(path: string): string {
  const segments = segmentsOf(path);
  if (segments.length % 2 !== 0) throw new HttpsError("invalid-argument", `NOT_A_DOCUMENT_PATH:${path}`);
  return segments.join("/");
}

function collectionPath(path: string): string {
  const segments = segmentsOf(path);
  if (segments.length % 2 !== 1) throw new HttpsError("invalid-argument", `NOT_A_COLLECTION_PATH:${path}`);
  return segments.join("/");
}

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

function autoId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(20);
  let id = "";
  for (let index = 0; index < 20; index += 1) id += alphabet[bytes[index] % alphabet.length];
  return id;
}

/* ── Snapshots ── */

class PgDocSnapshot implements DocumentSnapshot {
  constructor(readonly ref: PgDocRef, private readonly value: DocumentData | null) {}
  get id() { return this.ref.id; }
  get exists() { return this.value !== null; }
  data(): DocumentData | undefined { return this.value ?? undefined; }
  get(fieldPath: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cursor: any = this.value ?? undefined;
    for (const key of fieldPath.split(".")) {
      if (cursor === null || cursor === undefined || typeof cursor !== "object") return undefined;
      cursor = cursor[key];
    }
    return cursor;
  }
}

class PgQuerySnapshot implements QuerySnapshot {
  constructor(readonly docs: DocumentSnapshot[], private readonly changes: DocumentChange[]) {}
  get empty() { return this.docs.length === 0; }
  get size() { return this.docs.length; }
  docChanges(): DocumentChange[] { return this.changes; }
}

/* ── Écritures bufferisées (transaction et batch) ── */

interface PendingWrite {
  type: "create" | "set" | "update" | "delete";
  path: string;
  data?: DocumentData;
  merge?: boolean;
}

function jsonParam(data: DocumentData): string {
  return JSON.stringify(data);
}

type Queryable = Pool | PoolClient;

async function applyWrite(client: Queryable, write: PendingWrite, now: number): Promise<ChangeEvent> {
  const parent = parentOf(write.path);
  if (write.type === "delete") {
    await client.query("DELETE FROM documents WHERE path = $1", [write.path]);
    return { path: write.path, parent, data: null };
  }
  if (write.type === "create") {
    // Un conflit 23505 remonte brut : runTransaction le retente (le replay
    // idempotent retrouve alors le reçu committé) avant de le convertir.
    const result = await client.query(
      "INSERT INTO documents (path, parent, data, updated_at) VALUES ($1, $2, $3::jsonb, $4) RETURNING data",
      [write.path, parent, jsonParam(write.data ?? {}), now],
    );
    return { path: write.path, parent, data: result.rows[0].data };
  }
  if (write.type === "update") {
    const result = await client.query(
      "UPDATE documents SET data = data || $2::jsonb, updated_at = $3 WHERE path = $1 RETURNING data",
      [write.path, jsonParam(write.data ?? {}), now],
    );
    if (result.rowCount === 0) throw new HttpsError("not-found", `DOCUMENT_NOT_FOUND:${write.path}`);
    return { path: write.path, parent, data: result.rows[0].data };
  }
  // set
  const mergeExpression = write.merge
    ? "jsonb_deep_merge(documents.data, EXCLUDED.data)"
    : "EXCLUDED.data";
  const result = await client.query(
    `INSERT INTO documents (path, parent, data, updated_at) VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (path) DO UPDATE SET data = ${mergeExpression}, updated_at = EXCLUDED.updated_at
     RETURNING data`,
    [write.path, parent, jsonParam(write.data ?? {}), now],
  );
  return { path: write.path, parent, data: result.rows[0].data };
}

/* ── Construction SQL des requêtes ── */

interface QueryConstraints {
  where: Array<{ field: string; op: WhereOp; value: unknown }>;
  orderBy: Array<{ field: string; direction: OrderDirection }>;
  limit: number | null;
}

function buildQuerySql(parent: string, constraints: QueryConstraints): { sql: string; params: unknown[] } {
  const params: unknown[] = [parent];
  const clauses: string[] = ["parent = $1"];
  for (const clause of constraints.where) {
    const pathParam = params.push(clause.field.split(".")); // text[]
    if (clause.op === "==") {
      const valueParam = params.push(JSON.stringify(clause.value));
      clauses.push(`data #> $${pathParam}::text[] = $${valueParam}::jsonb`);
    } else if (clause.op === "array-contains") {
      const valueParam = params.push(JSON.stringify(clause.value));
      clauses.push(`data #> $${pathParam}::text[] @> $${valueParam}::jsonb`);
    } else {
      // < <= > >= : comparaison numérique ou textuelle selon le type de la valeur
      const valueParam = params.push(clause.value);
      if (typeof clause.value === "number") {
        clauses.push(`(data #>> $${pathParam}::text[])::numeric ${clause.op} $${valueParam}`);
      } else {
        clauses.push(`data #>> $${pathParam}::text[] ${clause.op} $${valueParam}`);
      }
    }
  }
  const orderParts: string[] = [];
  for (const order of constraints.orderBy) {
    const pathParam = params.push(order.field.split("."));
    // Comme Firestore : un document sans le champ de tri est exclu du résultat.
    clauses.push(`data #> $${pathParam}::text[] IS NOT NULL`);
    orderParts.push(`data #> $${pathParam}::text[] ${order.direction === "desc" ? "DESC" : "ASC"}`);
  }
  let sql = `SELECT path, data FROM documents WHERE ${clauses.join(" AND ")}`;
  if (orderParts.length > 0) sql += ` ORDER BY ${orderParts.join(", ")}`;
  if (constraints.limit !== null) {
    const limitParam = params.push(constraints.limit);
    sql += ` LIMIT $${limitParam}`;
  }
  return { sql, params };
}

/* ── Références ── */

class PgDocRef implements DocumentReference {
  readonly path: string;
  constructor(private readonly store: PgFirestore, path: string) {
    this.path = docPath(path);
  }
  get id() { return this.path.slice(this.path.lastIndexOf("/") + 1); }

  async get(): Promise<DocumentSnapshot> {
    const result = await this.store.pool.query("SELECT data FROM documents WHERE path = $1", [this.path]);
    return new PgDocSnapshot(this, result.rowCount ? result.rows[0].data : null);
  }

  async set(data: DocumentData, options?: { merge?: boolean }): Promise<unknown> {
    const event = await applyWrite(this.store.pool, { type: "set", path: this.path, data, merge: options?.merge === true }, Date.now());
    this.store.bus.publishAll([event]);
    return undefined;
  }

  async delete(): Promise<unknown> {
    const event = await applyWrite(this.store.pool, { type: "delete", path: this.path }, Date.now());
    this.store.bus.publishAll([event]);
    return undefined;
  }

  onSnapshot(onNext: (snapshot: DocumentSnapshot) => void, onError?: (error: Error) => void): () => void {
    let closed = false;
    const emit = (value: DocumentData | null) => {
      if (!closed) onNext(new PgDocSnapshot(this, value));
    };
    const unsubscribe = this.store.bus.subscribe((event) => {
      if (event.path === this.path) emit(event.data);
    });
    this.get().then((snapshot) => emit(snapshot.data() ?? null)).catch((error) => onError?.(error as Error));
    return () => { closed = true; unsubscribe(); };
  }
}

class PgQuery implements Query {
  constructor(
    protected readonly store: PgFirestore,
    protected readonly parent: string,
    protected readonly constraints: QueryConstraints,
  ) {}

  where(field: string, op: WhereOp, value: unknown): Query {
    return new PgQuery(this.store, this.parent, {
      ...this.constraints,
      where: [...this.constraints.where, { field, op, value }],
    });
  }

  orderBy(field: string, direction: OrderDirection = "asc"): Query {
    return new PgQuery(this.store, this.parent, {
      ...this.constraints,
      orderBy: [...this.constraints.orderBy, { field, direction }],
    });
  }

  limit(count: number): Query {
    return new PgQuery(this.store, this.parent, { ...this.constraints, limit: count });
  }

  async get(): Promise<QuerySnapshot> {
    const { sql, params } = buildQuerySql(this.parent, this.constraints);
    const result = await this.store.pool.query(sql, params);
    const docs = result.rows.map((row) => new PgDocSnapshot(new PgDocRef(this.store, row.path), row.data));
    return new PgQuerySnapshot(docs, docs.map((doc) => ({ type: "added" as const, doc })));
  }

  onSnapshot(onNext: (snapshot: QuerySnapshot) => void, onError?: (error: Error) => void): () => void {
    let closed = false;
    let previous = new Map<string, DocumentData>();
    let scheduled = false;

    const run = async (initial: boolean) => {
      scheduled = false;
      if (closed) return;
      try {
        const { sql, params } = buildQuerySql(this.parent, this.constraints);
        const result = await this.store.pool.query(sql, params);
        if (closed) return;
        const current = new Map<string, DocumentData>(result.rows.map((row) => [row.path as string, row.data as DocumentData]));
        const changes: DocumentChange[] = [];
        for (const [path, data] of current) {
          const snapshot = new PgDocSnapshot(new PgDocRef(this.store, path), data);
          if (!previous.has(path)) changes.push({ type: "added", doc: snapshot });
          else if (JSON.stringify(previous.get(path)) !== JSON.stringify(data)) changes.push({ type: "modified", doc: snapshot });
        }
        for (const [path, data] of previous) {
          if (!current.has(path)) changes.push({ type: "removed", doc: new PgDocSnapshot(new PgDocRef(this.store, path), data) });
        }
        previous = current;
        if (initial || changes.length > 0) {
          const docs = result.rows.map((row) => new PgDocSnapshot(new PgDocRef(this.store, row.path), row.data));
          onNext(new PgQuerySnapshot(docs, changes));
        }
      } catch (error) {
        onError?.(error as Error);
      }
    };

    const unsubscribe = this.store.bus.subscribe((event) => {
      if (event.parent !== this.parent || scheduled || closed) return;
      scheduled = true;
      setTimeout(() => { void run(false); }, 25);
    });
    void run(true);
    return () => { closed = true; unsubscribe(); };
  }
}

class PgCollectionRef extends PgQuery implements CollectionReference {
  constructor(store: PgFirestore, path: string) {
    super(store, collectionPath(path), { where: [], orderBy: [], limit: null });
  }
  doc(id?: string): DocumentReference {
    return new PgDocRef(this.store, `${this.parent}/${id ?? autoId()}`);
  }
}

/* ── Transaction ── */

const RETRYABLE_SQLSTATES = new Set(["40001", "40P01", "23505"]);

class PgTransaction implements Transaction {
  private writes: PendingWrite[] = [];
  readonly events: ChangeEvent[] = [];
  constructor(private readonly client: PoolClient) {}

  async get(ref: DocumentReference): Promise<DocumentSnapshot> {
    const result = await this.client.query("SELECT data FROM documents WHERE path = $1 FOR UPDATE", [ref.path]);
    return new PgDocSnapshot(ref as PgDocRef, result.rowCount ? result.rows[0].data : null);
  }

  create(ref: DocumentReference, data: DocumentData): unknown {
    this.writes.push({ type: "create", path: ref.path, data });
    return this;
  }
  set(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }): unknown {
    this.writes.push({ type: "set", path: ref.path, data, merge: options?.merge === true });
    return this;
  }
  update(ref: DocumentReference, data: DocumentData): unknown {
    this.writes.push({ type: "update", path: ref.path, data });
    return this;
  }
  delete(ref: DocumentReference): unknown {
    this.writes.push({ type: "delete", path: ref.path });
    return this;
  }

  async flush(now: number) {
    for (const write of this.writes) {
      this.events.push(await applyWrite(this.client, write, now));
    }
  }
}

/* ── Batch ── */

class PgWriteBatch implements WriteBatch {
  private writes: PendingWrite[] = [];
  constructor(private readonly store: PgFirestore) {}
  set(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }): unknown {
    this.writes.push({ type: "set", path: ref.path, data, merge: options?.merge === true });
    return this;
  }
  update(ref: DocumentReference, data: DocumentData): unknown {
    this.writes.push({ type: "update", path: ref.path, data });
    return this;
  }
  delete(ref: DocumentReference): unknown {
    this.writes.push({ type: "delete", path: ref.path });
    return this;
  }
  async commit(): Promise<unknown> {
    const client = await this.store.pool.connect();
    const events: ChangeEvent[] = [];
    try {
      await client.query("BEGIN");
      const now = Date.now();
      for (const write of this.writes) events.push(await applyWrite(client, write, now));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    this.store.bus.publishAll(events);
    return undefined;
  }
}

/* ── Point d'entrée ── */

export class PgFirestore implements CompatFirestore {
  readonly bus = new ChangeBus();
  constructor(readonly pool: Pool) {}

  doc(path: string): DocumentReference { return new PgDocRef(this, path); }
  collection(path: string): CollectionReference { return new PgCollectionRef(this, path); }
  batch(): WriteBatch { return new PgWriteBatch(this); }

  async runTransaction<T>(fn: (transaction: Transaction) => Promise<T>): Promise<T> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const client = await this.pool.connect();
      const transaction = new PgTransaction(client);
      try {
        await client.query("BEGIN");
        const result = await fn(transaction);
        await transaction.flush(Date.now());
        await client.query("COMMIT");
        this.bus.publishAll(transaction.events);
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        lastError = error;
        const sqlState = (error as { code?: string }).code ?? "";
        if (!RETRYABLE_SQLSTATES.has(sqlState)) throw error;
      } finally {
        client.release();
      }
    }
    if ((lastError as { code?: string })?.code === "23505") {
      throw new HttpsError("already-exists", "DOCUMENT_ALREADY_EXISTS");
    }
    throw lastError;
  }
}

export async function createPgFirestore(connectionString: string): Promise<PgFirestore> {
  const pool = new Pool({ connectionString });
  await pool.query(SCHEMA_SQL);
  return new PgFirestore(pool);
}
