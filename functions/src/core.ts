import { createHash, randomInt } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import type { CompatFirestore, DocumentData, Transaction } from "./firestoreTypes";
import {
  DEFAULT_ECONOMY,
  DUPLICATE_COMPENSATION,
  calculateEnergy,
  extendUnlimitedEnergy,
  materializeEnergy,
  type PlayerEconomy,
} from "../../domain";
import type { Reward } from "../../domain/catalog";

if (getApps().length === 0) initializeApp();

/* Backend de persistance échangeable : Firestore (défaut, Cloud Functions)
   ou la façade Postgres du VPS (server/src/firestoreCompat), injectée au boot
   via setDbBackend AVANT le premier appel de commande. Les handlers importent
   `db` tel quel — aucune autre ligne ne change selon le backend. */
let backend: CompatFirestore | null = null;
export function setDbBackend(instance: CompatFirestore) { backend = instance; }
function active(): CompatFirestore {
  return backend ?? (backend = getFirestore() as unknown as CompatFirestore);
}
export const db: CompatFirestore = {
  doc: (path) => active().doc(path),
  collection: (path) => active().collection(path),
  runTransaction: (fn) => active().runTransaction(fn),
  batch: () => active().batch(),
};

export function requireUid(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "AUTH_REQUIRED");
  return uid;
}

export function requireAdmin(request: CallableRequest<unknown>): string {
  const uid = requireUid(request);
  if (request.auth?.token.admin !== true) throw new HttpsError("permission-denied", "ADMIN_REQUIRED");
  return uid;
}

export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "OBJECT_REQUIRED");
  }
  return value as Record<string, unknown>;
}

export function requiredString(data: Record<string, unknown>, key: string, max = 128): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new HttpsError("invalid-argument", `INVALID_${key.toUpperCase()}`);
  }
  return value.trim();
}

export function optionalString(data: Record<string, unknown>, key: string, max = 128): string | undefined {
  const value = data[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > max) throw new HttpsError("invalid-argument", `INVALID_${key.toUpperCase()}`);
  return value;
}

export function integer(data: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = data[key];
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new HttpsError("invalid-argument", `INVALID_${key.toUpperCase()}`);
  }
  return value as number;
}

export function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export function randomRoll(): number {
  return randomInt(0, 1_000_000_000) / 1_000_000_000;
}

export function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join(":"), "utf8").digest("hex");
}

export async function runIdempotent<T>(
  uid: string,
  command: string,
  rawKey: unknown,
  handler: (transaction: Transaction, now: number) => Promise<T>,
): Promise<T> {
  if (typeof rawKey !== "string" || rawKey.length < 8 || rawKey.length > 160) {
    throw new HttpsError("invalid-argument", "INVALID_IDEMPOTENCY_KEY");
  }
  const id = createHash("sha256").update(`${uid}:${command}:${rawKey}`).digest("hex");
  const receiptRef = db.collection("command_receipts").doc(id);
  return db.runTransaction(async (transaction) => {
    const receipt = await transaction.get(receiptRef);
    if (receipt.exists) return receipt.get("result") as T;
    const now = Date.now();
    const result = await handler(transaction, now);
    transaction.create(receiptRef, { uid, command, keyHash: id, result, createdAt: now });
    return result;
  });
}

export function economyFrom(data: DocumentData | undefined, now: number): PlayerEconomy {
  const source = data ?? {};
  const energySource = (source.energy && typeof source.energy === "object" ? source.energy : {}) as Partial<PlayerEconomy["energy"]>;
  return {
    ...DEFAULT_ECONOMY,
    ...source,
    version: 1,
    nkap: Number.isFinite(source.nkap) ? Math.max(0, Math.floor(source.nkap)) : DEFAULT_ECONOMY.nkap,
    cauris: Number.isFinite(source.cauris) ? Math.max(0, Math.floor(source.cauris)) : DEFAULT_ECONOMY.cauris,
    energy: {
      ...DEFAULT_ECONOMY.energy,
      ...energySource,
      anchorAt: Number.isFinite(energySource.anchorAt) && energySource.anchorAt! > 0 ? energySource.anchorAt! : now,
    },
    daily: { ...DEFAULT_ECONOMY.daily, ...(source.daily ?? {}) },
    pity: { ...(source.pity ?? {}) },
    debtCauris: Math.max(0, Number(source.debtCauris ?? 0)),
    spendingBlocked: source.spendingBlocked === true,
  };
}

export function publicEconomy(economy: PlayerEconomy, now: number) {
  const computed = calculateEnergy(economy.energy, now);
  return {
    nkap: economy.nkap,
    cauris: economy.cauris,
    energy: computed,
    daily: economy.daily,
    debtCauris: economy.debtCauris,
    spendingBlocked: economy.spendingBlocked,
  };
}

export function ledger(
  transaction: Transaction,
  uid: string,
  entryId: string,
  command: string,
  delta: { nkap?: number; cauris?: number; energy?: number },
  balances: PlayerEconomy,
  now: number,
  metadata: Record<string, unknown> = {},
) {
  transaction.create(db.doc(`economies/${uid}/ledger/${entryId}`), {
    uid, command, delta, balances: { nkap: balances.nkap, cauris: balances.cauris }, metadata, createdAt: now,
  });
}

export function applyReward(economy: PlayerEconomy, inventory: DocumentData, reward: Reward, now: number) {
  const nextEconomy: PlayerEconomy = { ...economy, energy: { ...economy.energy }, daily: { ...economy.daily }, pity: { ...economy.pity } };
  const nextInventory = {
    ...inventory,
    tickets: { bronze: 0, argent: 0, or: 0, ...(inventory.tickets ?? {}) },
    boosterBooks: { ...(inventory.boosterBooks ?? {}) },
    cards: { ...(inventory.cards ?? {}) },
  };
  if (reward.type === "nkap") nextEconomy.nkap += reward.amount;
  if (reward.type === "cauris") nextEconomy.cauris += reward.amount;
  if (reward.type === "energy_pass") nextEconomy.energy = extendUnlimitedEnergy(nextEconomy.energy, reward.durationMinutes * 60_000, now);
  if (reward.type === "ticket") nextInventory.tickets[reward.tier] = Number(nextInventory.tickets[reward.tier] ?? 0) + reward.amount;
  if (reward.type === "booster_book") nextInventory.boosterBooks[reward.boosterId] = Number(nextInventory.boosterBooks[reward.boosterId] ?? 0) + reward.amount;
  if (reward.type === "card") {
    if (nextInventory.cards[reward.cardId]) {
      nextEconomy.cauris += DUPLICATE_COMPENSATION[reward.rarity];
    } else {
      nextInventory.cards[reward.cardId] = { unlockedAt: now, rarity: reward.rarity };
    }
  }
  return { economy: nextEconomy, inventory: nextInventory };
}

export function normalizedEnergyForWrite(economy: PlayerEconomy, now: number): PlayerEconomy {
  return { ...economy, energy: materializeEnergy(economy.energy, now) };
}
