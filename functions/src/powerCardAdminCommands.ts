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
import { getAnimV2 } from "../../engine/anim/v2/registry";
import { asObject, db, requireAdmin, requiredString, runIdempotent } from "./core";
import { ensurePowerCatalogFresh } from "./powerCatalog";
import { ensureMotifCatalogFresh } from "./animCatalog";

/** Carte sérialisable (sans composant React). */
export function storableCard(card: PowerModule): PowerModule {
  return JSON.parse(JSON.stringify({ def: card.def, script: card.script, ...(card.dev ? { dev: true } : {}) })) as PowerModule;
}

export async function rebuildPowerCatalog(updatedBy: string) {
  // Les chorégraphies peuvent viser des modèles publiés : registre des modèles à jour avant de valider.
  await ensureMotifCatalogFresh(true);
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
  await ensureMotifCatalogFresh();
  await ensurePowerCatalogFresh(true);
  const snap = await db.collection("power_cards").get();
  const cards = snap.docs.map((doc) => {
    const row = doc.data() ?? {};
    const shown = (row.def ? row : row.draft ?? {}) as { def?: unknown; script?: unknown };
    return {
      id: doc.id, def: shown.def, script: shown.script, dev: row.dev === true, published: row.published === true,
      revision: Number(row.revision ?? 0), order: Number(row.order ?? 0), source: row.source ?? "admin",
      hasDraft: Boolean(row.draft), updatedAt: Number(row.updatedAt ?? 0),
      issues: validatePowerCard({ def: (row.draft ?? row).def, script: (row.draft ?? row).script }),
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

/* ═══════════════ Phase B : brouillon, publication, duplication ═══════════════
   power_cards/{id}.draft = carte en cours d'édition (même incomplète).
   Publier = valider le brouillon → nouvelle révision immuable
   (power_card_versions) → fiche courante → catalogue republié. Le statut
   (archivée / coupée) se règle à part (setPowerCardStatus) et n'est jamais
   écrasé par une publication. */

const CARD_ID = /^[a-z0-9_]{3,48}$/;
const STATUS_KEYS = ["archived", "disabled"] as const;

function cardFromInput(raw: unknown): PowerModule {
  const source = asObject(raw);
  const def = asObject(source.def) as unknown as PowerModule["def"];
  const script = asObject(source.script) as unknown as PowerModule["script"];
  return storableCard({ def, script, ...(source.dev === true ? { dev: true } : {}) } as PowerModule);
}

export async function getAdminPowerCardHandler(request: CallableRequest<unknown>) {
  requireAdmin(request);
  await ensureMotifCatalogFresh();
  const cardId = requiredString(asObject(request.data), "cardId", 48);
  const snap = await db.doc(`power_cards/${cardId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "POWER_CARD_NOT_FOUND");
  const row = snap.data() ?? {};
  const current = row.def ? { def: row.def, script: row.script, ...(row.dev ? { dev: true } : {}) } as PowerModule : null;
  const draft = row.draft ? row.draft as PowerModule : null;
  const working = draft ?? current;
  return {
    cardId, published: row.published === true, revision: Number(row.revision ?? 0), current, draft, working,
    issues: working ? validatePowerCard(working) : [],
  };
}

/** Enregistre le brouillon (même invalide) ; crée la fiche si la carte est nouvelle. */
export async function savePowerCardDraftHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  await ensureMotifCatalogFresh();
  const data = asObject(request.data);
  const card = cardFromInput(data.card);
  const cardId = String(card.def.id ?? "");
  if (!CARD_ID.test(cardId)) throw new HttpsError("invalid-argument", "INVALID_CARDID");
  card.script = { ...card.script, id: cardId };
  const result = await runIdempotent(uid, "savePowerCardDraft", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`power_cards/${cardId}`);
    const snap = await transaction.get(ref);
    if (!snap.exists) {
      transaction.set(ref, { draft: card, published: false, revision: 0, order: now, source: "admin", createdAt: now, updatedAt: now, updatedBy: uid }, { merge: false });
    } else {
      transaction.update(ref, { draft: card, updatedAt: now, updatedBy: uid });
    }
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "power_card_save_draft", cardId, createdAt: now });
    return { cardId };
  });
  return { ...result, issues: validatePowerCard(card) };
}

export async function publishPowerCardHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  // Catalogue des modèles (V1 et V2) à jour : la carte peut viser un modèle tout juste publié.
  await ensureMotifCatalogFresh(true);
  const data = asObject(request.data);
  const cardId = requiredString(data, "cardId", 48);
  const result = await runIdempotent(uid, "publishPowerCard", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`power_cards/${cardId}`);
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "POWER_CARD_NOT_FOUND");
    const draft = snap.get("draft") as PowerModule | undefined;
    if (!draft) throw new HttpsError("failed-precondition", "DRAFT_NOT_FOUND");
    // Le statut courant (archivée / coupée) l'emporte sur le brouillon.
    const status = Object.fromEntries(STATUS_KEYS.filter((key) => snap.get(`def.${key}`) === true).map((key) => [key, true]));
    const def = { ...draft.def } as Record<string, unknown>;
    STATUS_KEYS.forEach((key) => { delete def[key]; });
    const card = storableCard({ ...draft, def: { ...def, ...status } as unknown as PowerModule["def"], script: { ...draft.script, id: cardId } });
    const issues = validatePowerCard(card);
    // Modèle V2 : il doit être publié (ou du jeu), sinon les joueurs ne l'auraient pas.
    if (card.def.animV2 && !getAnimV2(card.def.animV2)) issues.push({ path: "def.animV2", message: "Modèle V2 inconnu ou non publié." });
    if (issues.length > 0) throw new HttpsError("failed-precondition", "POWER_CARD_INVALID", { issues });
    const revision = Number(snap.get("revision") ?? 0) + 1;
    transaction.set(db.doc(`power_card_versions/${cardId}_v${revision}`), { ...card, revision, publishedAt: now, publishedBy: uid }, { merge: false });
    transaction.update(ref, { def: card.def, script: card.script, dev: card.dev === true, draft: null, published: true, revision, publishedAt: now, updatedAt: now, updatedBy: uid });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "power_card_publish", cardId, revision, createdAt: now });
    return { cardId, revision };
  });
  const catalog = await rebuildPowerCatalog(uid);
  return { ...result, catalogRevision: catalog.revision };
}

export async function duplicatePowerCardHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const cardId = requiredString(data, "cardId", 48);
  const newCardId = requiredString(data, "newCardId", 48);
  if (!CARD_ID.test(newCardId)) throw new HttpsError("invalid-argument", "INVALID_NEWCARDID");
  return runIdempotent(uid, "duplicatePowerCard", data.idempotencyKey, async (transaction, now) => {
    const [source, target] = await Promise.all([transaction.get(db.doc(`power_cards/${cardId}`)), transaction.get(db.doc(`power_cards/${newCardId}`))]);
    if (!source.exists) throw new HttpsError("not-found", "POWER_CARD_NOT_FOUND");
    if (target.exists) throw new HttpsError("already-exists", "POWER_CARD_ID_TAKEN");
    const base = (source.get("draft") ?? { def: source.get("def"), script: source.get("script") }) as PowerModule;
    const def = { ...base.def, id: newCardId, name: `${base.def.name} (copie)`.slice(0, 40) } as Record<string, unknown>;
    STATUS_KEYS.forEach((key) => { delete def[key]; });
    const draft = storableCard({ def: def as unknown as PowerModule["def"], script: { ...base.script, id: newCardId } });
    transaction.set(db.doc(`power_cards/${newCardId}`), { draft, published: false, revision: 0, order: now, source: "admin", createdAt: now, updatedAt: now, updatedBy: uid }, { merge: false });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "power_card_duplicate", cardId, newCardId, createdAt: now });
    return { cardId: newCardId };
  });
}

export async function discardPowerCardDraftHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const cardId = requiredString(data, "cardId", 48);
  return runIdempotent(uid, "discardPowerCardDraft", data.idempotencyKey, async (transaction, now) => {
    const ref = db.doc(`power_cards/${cardId}`);
    const snap = await transaction.get(ref);
    if (!snap.exists || !snap.get("draft")) throw new HttpsError("not-found", "DRAFT_NOT_FOUND");
    // Jamais publiée : la fiche disparaît avec son brouillon.
    if (Number(snap.get("revision") ?? 0) === 0) transaction.delete(ref);
    else transaction.update(ref, { draft: null, updatedAt: now, updatedBy: uid });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "power_card_discard_draft", cardId, createdAt: now });
    return { cardId };
  });
}
