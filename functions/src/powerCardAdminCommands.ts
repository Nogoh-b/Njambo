/* ═══════════════ Cartes pouvoir : commandes admin (phase A) ═══════════════
   - seedPowerCards : copie les cartes du code en base (idempotent : une carte
     déjà présente n'est jamais écrasée) puis publie le catalogue.
   - listAdminPowerCards : fiches + statut.
   - setPowerCardStatus : archiver (hors boutique/livres, toujours jouable par
     ses possesseurs) et interrupteur d'urgence (activation refusée).
   - rebuildPowerCatalog : recompose power_catalog/current (lu en une fois
     par les clients et le serveur) à partir des cartes publiées.
   L'éditeur complet (brouillons, révisions, briques) arrive en phase B. */

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { CODE_BOOSTER_TIERS, CODE_POWER_MODULES } from "../../config/powers";
import { setPowerCatalog } from "../../config/powers/registry";
import { validatePowerCard } from "../../engine/power/validate";
import type { PowerModule } from "../../engine/power/types";
import { asObject, db, requireAdmin, requiredString, runIdempotent } from "./core";
import { ensurePowerCatalogFresh } from "./powerCatalog";

/** Carte sérialisable (sans composant React). */
export function storableCard(card: PowerModule): PowerModule {
  return JSON.parse(JSON.stringify({ def: card.def, script: card.script, ...(card.dev ? { dev: true } : {}) })) as PowerModule;
}

export async function rebuildPowerCatalog(updatedBy: string) {
  const snap = await db.collection("power_cards").where("published", "==", true).get();
  const rows = snap.docs.map((doc) => doc.data() ?? {})
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0) || String(a.def?.id).localeCompare(String(b.def?.id)));
  const cards = rows
    .map((row) => storableCard({ def: row.def, script: row.script, ...(row.dev ? { dev: true } : {}) } as PowerModule))
    .filter((card) => validatePowerCard(card).length === 0);
  const ref = db.doc("power_catalog/current");
  const revision = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    const next = Number(current.get("revision") ?? 0) + 1;
    transaction.set(ref, { published: true, revision: next, cards, count: cards.length, updatedAt: Date.now(), updatedBy }, { merge: false });
    return next;
  });
  setPowerCatalog(cards, revision);
  return { revision, count: cards.length, skipped: rows.length - cards.length };
}

export async function seedPowerCardsHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data ?? {});
  const result = await runIdempotent(uid, "seedPowerCards", data.idempotencyKey, async (transaction, now) => {
    const entries = Object.values(CODE_POWER_MODULES);
    const refs = entries.map((card) => db.doc(`power_cards/${card.def.id}`));
    const snaps = await Promise.all(refs.map((ref) => transaction.get(ref)));
    let created = 0;
    entries.forEach((card, index) => {
      if (snaps[index].exists) return;
      const tier = card.def.boosterTier ?? CODE_BOOSTER_TIERS[card.def.id];
      // Cartes absentes de l'ancienne table des livres : jamais en livre (comportement conservé).
      const stored = storableCard({ ...card, def: { ...card.def, ...(tier ? { boosterTier: tier } : { inBoosters: false }) } });
      transaction.set(refs[index], { ...stored, published: true, revision: 1, order: index, source: "code", createdAt: now, updatedAt: now, updatedBy: uid }, { merge: false });
      transaction.set(db.doc(`power_card_versions/${card.def.id}_v1`), { ...stored, revision: 1, publishedAt: now, publishedBy: uid }, { merge: false });
      created += 1;
    });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "power_cards_seed", created, createdAt: now });
    return { created, total: entries.length };
  });
  const catalog = await rebuildPowerCatalog(uid);
  return { ...result, catalogRevision: catalog.revision, published: catalog.count };
}

export async function listAdminPowerCardsHandler(request: CallableRequest<unknown>) {
  requireAdmin(request);
  await ensurePowerCatalogFresh(true);
  const snap = await db.collection("power_cards").get();
  const cards = snap.docs.map((doc) => {
    const row = doc.data() ?? {};
    return {
      id: doc.id, def: row.def, script: row.script, dev: row.dev === true, published: row.published === true,
      revision: Number(row.revision ?? 0), order: Number(row.order ?? 0), source: row.source ?? "admin",
      hasDraft: Boolean(row.draft), updatedAt: Number(row.updatedAt ?? 0),
      issues: validatePowerCard({ def: row.def, script: row.script }),
    };
  }).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return { cards, seeded: cards.length > 0 };
}

export async function setPowerCardStatusHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const cardId = requiredString(data, "cardId", 48);
  const patch: Record<string, boolean> = {};
  if (typeof data.archived === "boolean") patch.archived = data.archived;
  if (typeof data.disabled === "boolean") patch.disabled = data.disabled;
  if (Object.keys(patch).length === 0) throw new HttpsError("invalid-argument", "NOTHING_TO_CHANGE");
  await runIdempotent(uid, "setPowerCardStatus", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`power_cards/${cardId}`);
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "POWER_CARD_NOT_FOUND");
    const def = { ...(snap.get("def") ?? {}) } as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value) def[key] = true; else delete def[key];
    }
    transaction.update(ref, { def, updatedAt: now, updatedBy: uid });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "power_card_status", cardId, ...patch, createdAt: now });
    return { cardId };
  });
  const catalog = await rebuildPowerCatalog(uid);
  return { cardId, ...patch, catalogRevision: catalog.revision };
}
