/* ═══════════════ FILE: server/scripts/migrateFromFirestore.ts ═══════════════
   Migration ponctuelle Firestore → Postgres (table documents).

   Usage (depuis server/) :
     GOOGLE_APPLICATION_CREDENTIALS=... DATABASE_URL=... npx tsx scripts/migrateFromFirestore.ts [--dry-run]

   - Parcourt récursivement toutes les collections racine et sous-collections.
   - Convertit les Timestamp Firestore en millisecondes (le domaine n'utilise
     que des nombres ; ex. players_presence.lastSeen écrit via serverTimestamp).
   - Écrit chaque document via la façade Postgres (upsert idempotent : le
     script peut être relancé sans dégât). */

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { createPgFirestore } from "../src/firestoreCompat/pg";

const DRY_RUN = process.argv.includes("--dry-run");

function convertTimestamps(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toMillis();
  if (Array.isArray(value)) return value.map(convertTimestamps);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, convertTimestamps(entry)]));
  }
  return value;
}

async function main() {
  if (!process.env.DATABASE_URL && !DRY_RUN) throw new Error("DATABASE_URL requis (ou --dry-run)");
  if (getApps().length === 0) initializeApp();
  const source = getFirestore();
  const target = DRY_RUN ? null : await createPgFirestore(process.env.DATABASE_URL!);

  let migrated = 0;
  const migrateDocument = async (ref: DocumentReference) => {
    const snapshot = await ref.get();
    if (snapshot.exists) {
      const data = convertTimestamps(snapshot.data()) as Record<string, unknown>;
      if (target) await target.doc(ref.path).set(data);
      migrated += 1;
      if (migrated % 200 === 0) console.log(`  ${migrated} documents migrés…`);
    }
    // Sous-collections (ex. matches/{id}/private, economies/{id}/ledger).
    for (const sub of await ref.listCollections()) {
      for (const subDoc of await sub.listDocuments()) await migrateDocument(subDoc);
    }
  };

  for (const rootCollection of await source.listCollections()) {
    console.log(`Collection ${rootCollection.id}…`);
    for (const ref of await rootCollection.listDocuments()) await migrateDocument(ref);
  }

  console.log(`${DRY_RUN ? "[dry-run] " : ""}Terminé : ${migrated} documents.`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Migration échouée", error);
  process.exit(1);
});
