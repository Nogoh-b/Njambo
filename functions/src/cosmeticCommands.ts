/* ═══════════════ Cosmétiques (phase 5) ═══════════════
   Catalogue admin (cosmetics/{id}, lisible par tous si published), collection
   et équipement du joueur (copie publique dans players/{uid}.equippedCosmetics). */

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import {
  COSMETIC_RARITIES,
  COSMETIC_SLOT,
  COSMETIC_TYPES,
  equippedCopy,
  readPlayerCosmetics,
  validateCosmetic,
  type CosmeticDefinition,
  type CosmeticSlot,
} from "../../domain";
import { asObject, db, requireAdmin, requireUid, requiredString, runIdempotent } from "./core";

function cosmeticFrom(raw: unknown): CosmeticDefinition {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cosmetic: CosmeticDefinition = {
    id: String(source.id ?? ""),
    type: (COSMETIC_TYPES.includes(source.type as CosmeticDefinition["type"]) ? source.type : "badge") as CosmeticDefinition["type"],
    name: String(source.name ?? ""),
    rarity: (COSMETIC_RARITIES.includes(source.rarity as CosmeticDefinition["rarity"]) ? source.rarity : "commun") as CosmeticDefinition["rarity"],
    published: source.published === true,
  };
  if (typeof source.description === "string" && source.description) cosmetic.description = source.description;
  if (typeof source.imageUrl === "string" && source.imageUrl) cosmetic.imageUrl = source.imageUrl;
  // Réglages bruts : validateCosmetic refuse un réglage hors liste blanche avant l'enregistrement.
  if (source.style !== undefined && source.style !== null) cosmetic.style = source.style as CosmeticDefinition["style"];
  return cosmetic;
}

/* ─────────────── Admin ─────────────── */

export async function listCosmeticsHandler(request: CallableRequest<unknown>) {
  requireAdmin(request);
  const snap = await db.collection("cosmetics").get();
  const cosmetics = snap.docs.map((doc) => cosmeticFrom({ ...doc.data(), id: doc.id })).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  return { cosmetics };
}

export async function saveCosmeticHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const cosmetic = cosmeticFrom(data.cosmetic);
  const issues = validateCosmetic(cosmetic);
  if (issues.length) throw new HttpsError("invalid-argument", "COSMETIC_INVALID", { issues });
  return runIdempotent(uid, "saveCosmetic", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`cosmetics/${cosmetic.id}`);
    const existing = await transaction.get(ref);
    if (existing.exists && existing.get("type") !== cosmetic.type) throw new HttpsError("failed-precondition", "COSMETIC_TYPE_LOCKED");
    transaction.set(ref, { ...cosmetic, createdAt: existing.get("createdAt") ?? now, updatedAt: now, updatedBy: uid }, { merge: false });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: existing.exists ? "cosmetic_update" : "cosmetic_create", cosmeticId: cosmetic.id, published: cosmetic.published, createdAt: now });
    return { cosmetic };
  });
}

/* ─────────────── Joueur ─────────────── */

/** Collection : cosmétiques possédés (même désactivés) + équipement. */
export async function getCosmeticCollectionHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const [inventory, player] = await Promise.all([db.doc(`inventories/${uid}`).get(), db.doc(`players/${uid}`).get()]);
  const owned = (inventory.get("cosmetics") ?? []) as string[];
  const defs = await Promise.all(owned.map((id) => db.doc(`cosmetics/${id}`).get()));
  return {
    owned: defs.filter((snap) => snap.exists).map((snap) => cosmeticFrom({ ...snap.data(), id: snap.id })),
    equipped: readPlayerCosmetics(player.get("equippedCosmetics")),
  };
}

export async function equipCosmeticHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const slot = requiredString(data, "slot", 16) as CosmeticSlot;
  if (!Object.values(COSMETIC_SLOT).includes(slot)) throw new HttpsError("invalid-argument", "INVALID_SLOT");
  const cosmeticId = typeof data.cosmeticId === "string" && data.cosmeticId ? data.cosmeticId : null;
  return runIdempotent(uid, "equipCosmetic", data.idempotencyKey, async (transaction, now) => {
    const playerRef = db.doc(`players/${uid}`);
    const [inventory, player, cosmeticSnap] = await Promise.all([
      transaction.get(db.doc(`inventories/${uid}`)),
      transaction.get(playerRef),
      cosmeticId ? transaction.get(db.doc(`cosmetics/${cosmeticId}`)) : Promise.resolve(null),
    ]);
    const equipped = readPlayerCosmetics(player.get("equippedCosmetics"));
    if (!cosmeticId) {
      delete equipped[slot];
    } else {
      if (!((inventory.get("cosmetics") ?? []) as string[]).includes(cosmeticId)) throw new HttpsError("permission-denied", "COSMETIC_NOT_OWNED");
      if (!cosmeticSnap?.exists) throw new HttpsError("not-found", "COSMETIC_NOT_FOUND");
      const cosmetic = cosmeticFrom({ ...cosmeticSnap.data(), id: cosmeticId });
      if (COSMETIC_SLOT[cosmetic.type] !== slot) throw new HttpsError("invalid-argument", "COSMETIC_WRONG_SLOT");
      equipped[slot] = equippedCopy(cosmetic);
    }
    if (!player.exists) throw new HttpsError("failed-precondition", "PROFILE_NOT_INITIALIZED");
    // update remplace l'objet entier (un merge profond garderait un emplacement retiré).
    transaction.update(playerRef, { equippedCosmetics: equipped, updatedAt: now });
    return { equipped };
  });
}
