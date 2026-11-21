import { createHmac } from "node:crypto";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { normalizeGameplayConfig } from "../../domain/gameplayConfig";
import {
  DAILY_GRID_WEIGHTS,
  DEFAULT_BOOSTERS,
  DEFAULT_ECONOMY,
  DEFAULT_EVENTS,
  DEFAULT_OFFERS,
  WHEEL_REWARDS,
  doualaDayKey,
  enforceMinimumRarity,
  extendUnlimitedEnergy,
  isStoredPackOffer,
  pickWeighted,
  reservedTicketIsRefundable,
  type BoosterDefinition,
  type CardRarity,
  normalizeEventVersion,
  normalizeSeason,
  seasonPhase,
  type EventVersion,
  type OfferDefinition,
  type PlayerEconomy,
  type Reward,
  type StoredPack,
} from "../../domain";
import {
  applyReward,
  asObject,
  boundedNumber,
  db,
  economyFrom,
  integer,
  ledger,
  optionalString,
  publicEconomy,
  randomRoll,
  requireAdmin,
  requireUid,
  requiredString,
  runIdempotent,
  stableId,
} from "./core";
import { paymentProvider } from "./payments/providers";
import { boosterTierOf, getPowerModule, isInBoosters, listPowerModules } from "../../config/powers/registry";
import { ensurePowerCatalogFresh } from "./powerCatalog";
import { SEASON_PREMIUM_PREFIX } from "./seasonCommands";
import { bindChallengeRuns } from "./challengeCommands";
import type { Transaction } from "./firestoreTypes";

/* Cartes pouvoir pouvant tomber dans un livre, par palier — calculé depuis
   le catalogue dynamique (palier réglé dans l'admin ; cartes du code : palier
   historique). Palier vide → toutes les cartes éligibles. */
export function boosterCardPool(rarity: CardRarity): string[] {
  const eligible = listPowerModules().filter((card) => !card.dev && isInBoosters(card.def));
  const pool = eligible.filter((card) => boosterTierOf(card.def) === rarity).map((card) => card.def.id);
  if (pool.length > 0) return pool;
  return eligible.map((card) => card.def.id);
}

function pickCard(rarity: CardRarity) {
  const pool = boosterCardPool(rarity);
  return pool[Math.floor(randomRoll() * pool.length)];
}

function offerFallback(id: string) {
  return DEFAULT_OFFERS.find((offer) => offer.id === id);
}

function boosterFallback(id: string) {
  return DEFAULT_BOOSTERS.find((booster) => booster.id === id);
}

function eventFallback(id: string) {
  return DEFAULT_EVENTS.find((event) => event.eventId === id);
}

function resolveOfferRewards(offer: OfferDefinition): Reward[] {
  return [
    ...offer.rewards,
    ...(offer.randomRewards?.length ? [pickWeighted(offer.randomRewards, randomRoll())] : []),
    ...(offer.rewardGroups ?? []).map((group) => pickWeighted(group, randomRoll())),
  ];
}

async function economyAndInventory(transaction: Transaction, uid: string, now: number) {
  const economyRef = db.doc(`economies/${uid}`);
  const inventoryRef = db.doc(`inventories/${uid}`);
  const [economySnap, inventorySnap] = await Promise.all([transaction.get(economyRef), transaction.get(inventoryRef)]);
  if (!economySnap.exists) throw new HttpsError("failed-precondition", "PROFILE_NOT_INITIALIZED");
  return {
    economyRef,
    inventoryRef,
    economy: economyFrom(economySnap.data(), now),
    inventory: inventorySnap.data() ?? { tickets: { bronze: 0, argent: 0, or: 0 }, cards: {}, boosterBooks: {}, energyPasses: {}, packs: [] },
  };
}

export async function ensurePlayerProfileHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const name = optionalString(data, "name", 32) ?? "Joueur du Mboa";
  const emoji = optionalString(data, "emoji", 32) ?? "🎴";
  return runIdempotent(uid, "ensurePlayerProfile", data.idempotencyKey, async (transaction, now) => {
    const refs = {
      user: db.doc(`users/${uid}`), player: db.doc(`players/${uid}`),
      economy: db.doc(`economies/${uid}`), inventory: db.doc(`inventories/${uid}`),
      config: db.doc("runtime_config/economy"),
    };
    const [userSnap, playerSnap, economySnap, inventorySnap, configSnap] = await Promise.all([
      transaction.get(refs.user), transaction.get(refs.player), transaction.get(refs.economy), transaction.get(refs.inventory), transaction.get(refs.config),
    ]);
    const legacy = userSnap.data() ?? {};
    const energyMax = Math.floor(boundedNumber(configSnap.get("energyMax"), DEFAULT_ECONOMY.energy.max, 1, 1_000));
    const energyRegenMs = Math.floor(boundedNumber(configSnap.get("energyRegenMs"), DEFAULT_ECONOMY.energy.regenMs, 10_000, 86_400_000));
    const startingNkap = Math.floor(boundedNumber(configSnap.get("startingNkap"), DEFAULT_ECONOMY.nkap, 0, 1_000_000_000));
    const startingCauris = Math.floor(boundedNumber(configSnap.get("startingCauris"), DEFAULT_ECONOMY.cauris, 0, 1_000_000_000));
    const startingCrowns = Math.floor(boundedNumber(configSnap.get("startingCrowns"), 1_000, 0, 1_000_000_000));
    const economy: PlayerEconomy = economySnap.exists
      ? economyFrom(economySnap.data(), now)
      : {
          ...DEFAULT_ECONOMY,
          nkap: Number.isFinite(legacy.balance) ? Math.max(0, Math.floor(legacy.balance)) : startingNkap,
          cauris: Number.isFinite(legacy.cauris) ? Math.max(0, Math.floor(legacy.cauris)) : startingCauris,
          energy: { ...DEFAULT_ECONOMY.energy, stored: energyMax, max: energyMax, regenMs: energyRegenMs, anchorAt: now },
        };
    transaction.set(refs.user, {
      name, emoji, locale: typeof legacy.locale === "string" ? legacy.locale : "fr",
      ageBand: typeof legacy.ageBand === "string" ? legacy.ageBand : "unknown",
      createdAt: legacy.createdAt ?? now, updatedAt: now,
    }, { merge: true });
    transaction.set(refs.player, {
      uid, name, emoji, crowns: Number.isFinite(playerSnap.get("crowns")) ? playerSnap.get("crowns") : startingCrowns,
      placementMatchesRemaining: Number.isFinite(playerSnap.get("placementMatchesRemaining")) ? playerSnap.get("placementMatchesRemaining") : 5,
      stats: playerSnap.get("stats") ?? legacy.stats ?? { played: 0, won: 0, bestWin: 0 },
      createdAt: playerSnap.get("createdAt") ?? legacy.createdAt ?? now, updatedAt: now,
    }, { merge: true });
    transaction.set(refs.economy, economy, { merge: false });
    if (!inventorySnap.exists) {
      transaction.create(refs.inventory, {
        cards: legacy.powerInventory ?? {}, equippedCards: legacy.equippedPowers ?? [],
        tickets: { bronze: 0, argent: 0, or: 0 }, boosterBooks: {}, energyPasses: {}, packs: [], updatedAt: now,
      });
    }
    return { economy: publicEconomy(economy, now), migrated: !economySnap.exists };
  });
}

export async function getPlayerEconomyHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  requiredString(data, "idempotencyKey", 160);
  const [economySnap, inventorySnap, playerSnap, pendingOpeningSnap] = await Promise.all([
    db.doc(`economies/${uid}`).get(), db.doc(`inventories/${uid}`).get(), db.doc(`players/${uid}`).get(),
    db.collection("booster_openings").where("uid", "==", uid).where("status", "==", "awaiting_choice").limit(1).get(),
  ]);
  if (!economySnap.exists) throw new HttpsError("failed-precondition", "PROFILE_NOT_INITIALIZED");
  const now = Date.now();
  return {
    economy: publicEconomy(economyFrom(economySnap.data(), now), now),
    inventory: inventorySnap.data() ?? {},
    player: playerSnap.data() ?? {},
    pendingBoosterOpening: pendingOpeningSnap.empty ? null : {
      openingId: pendingOpeningSnap.docs[0].id,
      boosterId: pendingOpeningSnap.docs[0].get("boosterId"),
      positions: Array.from({ length: 9 }, (_, position) => position),
    },
  };
}

export async function claimDailyRewardHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  return runIdempotent(uid, "claimDailyReward", data.idempotencyKey, async (transaction, now) => {
    const [state, configSnap] = await Promise.all([
      economyAndInventory(transaction, uid, now),
      transaction.get(db.doc("runtime_config/live_ops")),
    ]);
    const threshold = Math.floor(boundedNumber(configSnap.get("loyaltyThreshold"), 7, 1, 100));
    const rewardNkap = Math.floor(boundedNumber(configSnap.get("dailyRewardNkap"), 100, 0, 1_000_000));
    const day = doualaDayKey(now);
    if (state.economy.daily.lastClaimDay === day) throw new HttpsError("already-exists", "DAILY_ALREADY_CLAIMED");
    const accumulated = state.economy.daily.loyaltyPoints + 1;
    const newSpins = Math.floor(accumulated / threshold);
    const next = {
      ...state.economy,
      nkap: state.economy.nkap + rewardNkap,
      daily: {
        lastClaimDay: day,
        loyaltyPoints: accumulated % threshold,
        availableSpins: state.economy.daily.availableSpins + newSpins,
      },
    };
    transaction.set(state.economyRef, next, { merge: false });
    ledger(transaction, uid, stableId(uid, "daily", day), "claimDailyReward", { nkap: rewardNkap }, next, now, { day, newSpins, threshold });
    return { reward: { type: "nkap", amount: rewardNkap }, economy: publicEconomy(next, now), newSpins };
  });
}

export async function purchaseOfferHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const offerId = requiredString(data, "offerId");
  return runIdempotent(uid, "purchaseOffer", data.idempotencyKey, async (transaction, now) => {
    const offerRef = db.doc(`offers/${offerId}`);
    const [state, offerSnap] = await Promise.all([economyAndInventory(transaction, uid, now), transaction.get(offerRef)]);
    const offer = (offerSnap.exists ? offerSnap.data() : offerFallback(offerId)) as OfferDefinition | undefined;
    if (!offer?.published || (offer.startsAt && offer.startsAt > now) || (offer.endsAt && offer.endsAt <= now)) {
      throw new HttpsError("not-found", "OFFER_UNAVAILABLE");
    }
    const price = offer.prices.find((candidate) => candidate.currency === "cauris");
    if (!price) throw new HttpsError("failed-precondition", "XAF_REQUIRES_CHECKOUT");
    if (state.economy.spendingBlocked || state.economy.debtCauris > 0) throw new HttpsError("failed-precondition", "SPENDING_BLOCKED");
    if (state.economy.cauris < price.amount) throw new HttpsError("resource-exhausted", "INSUFFICIENT_CAURIS");
    const rewards = resolveOfferRewards(offer);
    let nextEconomy = { ...state.economy, cauris: state.economy.cauris - price.amount };
    let nextInventory = state.inventory;
    let storedPack: StoredPack | undefined;
    if (isStoredPackOffer(offer)) {
      const packInstanceId = stableId(uid, "pack", offerId, String(data.idempotencyKey)).slice(0, 32);
      storedPack = {
        packInstanceId,
        offerId: offer.id,
        title: offer.title,
        description: offer.description,
        acquiredAt: now,
        guaranteedRewards: offer.rewards,
        hasRandomRewards: Boolean(offer.randomRewards?.length || offer.rewardGroups?.length),
      };
      const existingPacks = Array.isArray(nextInventory.packs) ? [...nextInventory.packs] : [];
      nextInventory = { ...nextInventory, packs: [...existingPacks, storedPack] };
      transaction.create(db.doc(`sealed_packs/${packInstanceId}`), {
        uid,
        packInstanceId,
        offerId: offer.id,
        offerRevision: offer.revision,
        title: offer.title,
        description: offer.description,
        rewards,
        status: "sealed",
        createdAt: now,
        updatedAt: now,
      });
    } else {
      for (const reward of rewards) {
        ({ economy: nextEconomy, inventory: nextInventory } = applyReward(nextEconomy, nextInventory, reward, now));
      }
    }
    transaction.set(state.economyRef, nextEconomy, { merge: false });
    transaction.set(state.inventoryRef, { ...nextInventory, updatedAt: now }, { merge: false });
    ledger(transaction, uid, stableId(uid, "offer", String(data.idempotencyKey)), "purchaseOffer", { cauris: -price.amount }, nextEconomy, now, {
      offerId,
      revision: offer.revision,
      ...(storedPack ? { storedPackId: storedPack.packInstanceId } : {}),
    });
    return { offerId, rewards: storedPack ? [] : rewards, storedPack: storedPack ?? null, economy: publicEconomy(nextEconomy, now), inventory: nextInventory };
  });
}

/** Achat d'un livre de booster sans ouverture immédiate : ajouté au stock dans Ma collection. */
export async function buyBoosterBookHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const boosterId = requiredString(data, "boosterId", 64);
  return runIdempotent(uid, "buyBoosterBook", data.idempotencyKey, async (transaction, now) => {
    const defRef = db.doc(`booster_definitions/${boosterId}`);
    const [state, definitionSnap] = await Promise.all([economyAndInventory(transaction, uid, now), transaction.get(defRef)]);
    const definition = (definitionSnap.exists ? definitionSnap.data() : boosterFallback(boosterId)) as BoosterDefinition | undefined;
    if (!definition?.published) throw new HttpsError("not-found", "BOOSTER_UNAVAILABLE");
    const price = definition.prices.find((candidate) => candidate.currency === "cauris");
    if (!price) throw new HttpsError("failed-precondition", "XAF_REQUIRES_CHECKOUT");
    if (state.economy.spendingBlocked || state.economy.debtCauris > 0) throw new HttpsError("failed-precondition", "SPENDING_BLOCKED");
    if (state.economy.cauris < price.amount) throw new HttpsError("resource-exhausted", "INSUFFICIENT_CAURIS");
    const nextEconomy = { ...state.economy, cauris: state.economy.cauris - price.amount };
    const nextBooks = { ...(state.inventory.boosterBooks ?? {}) } as Record<string, number>;
    nextBooks[boosterId] = Number(nextBooks[boosterId] ?? 0) + 1;
    const nextInventory = { ...state.inventory, boosterBooks: nextBooks };
    transaction.set(state.economyRef, nextEconomy, { merge: false });
    transaction.set(state.inventoryRef, { ...nextInventory, updatedAt: now }, { merge: false });
    ledger(transaction, uid, stableId(uid, "buy-booster", String(data.idempotencyKey)), "buyBoosterBook", { cauris: -price.amount }, nextEconomy, now, {
      boosterId,
      revision: definition.revision,
    });
    return {
      boosterId,
      title: definition.title,
      ownedCount: nextBooks[boosterId],
      economy: publicEconomy(nextEconomy, now),
      inventory: nextInventory,
    };
  });
}

/** Ouvre un pack scellé stocké dans Ma collection et applique ses récompenses. */
export async function openPackHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const packInstanceId = requiredString(data, "packInstanceId", 96);
  return runIdempotent(uid, "openPack", data.idempotencyKey, async (transaction, now) => {
    const packRef = db.doc(`sealed_packs/${packInstanceId}`);
    const [state, packSnap] = await Promise.all([economyAndInventory(transaction, uid, now), transaction.get(packRef)]);
    if (!packSnap.exists || packSnap.get("uid") !== uid) throw new HttpsError("not-found", "PACK_NOT_FOUND");
    if (packSnap.get("status") !== "sealed") throw new HttpsError("failed-precondition", "PACK_ALREADY_OPENED");
    const rewards = (packSnap.get("rewards") ?? []) as Reward[];
    const existingPacks = Array.isArray(state.inventory.packs) ? (state.inventory.packs as StoredPack[]) : [];
    const remainingPacks = existingPacks.filter((entry) => entry.packInstanceId !== packInstanceId);
    let nextEconomy = state.economy;
    let nextInventory = { ...state.inventory, packs: remainingPacks };
    for (const reward of rewards) {
      ({ economy: nextEconomy, inventory: nextInventory } = applyReward(nextEconomy, nextInventory, reward, now));
    }
    transaction.set(state.economyRef, nextEconomy, { merge: false });
    transaction.set(state.inventoryRef, { ...nextInventory, updatedAt: now }, { merge: false });
    transaction.update(packRef, { status: "opened", openedAt: now, updatedAt: now });
    ledger(
      transaction,
      uid,
      stableId(uid, "open-pack", packInstanceId),
      "openPack",
      { nkap: nextEconomy.nkap - state.economy.nkap, cauris: nextEconomy.cauris - state.economy.cauris },
      nextEconomy,
      now,
      { packInstanceId, offerId: String(packSnap.get("offerId") ?? ""), rewards },
    );
    return {
      packInstanceId,
      offerId: String(packSnap.get("offerId") ?? ""),
      title: String(packSnap.get("title") ?? "Pack"),
      rewards,
      economy: publicEconomy(nextEconomy, now),
      inventory: nextInventory,
    };
  });
}

/** Active un pass d'énergie illimitée stocké dans Ma collection. */
export async function useEnergyPassHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const durationMinutes = integer(data, "durationMinutes", 1, 60 * 24 * 30);
  return runIdempotent(uid, "useEnergyPass", data.idempotencyKey, async (transaction, now) => {
    const state = await economyAndInventory(transaction, uid, now);
    const key = String(durationMinutes);
    const energyPasses = { ...(state.inventory.energyPasses ?? {}) } as Record<string, number>;
    const owned = Number(energyPasses[key] ?? 0);
    if (owned < 1) throw new HttpsError("resource-exhausted", "ENERGY_PASS_NOT_OWNED");
    if (owned <= 1) delete energyPasses[key];
    else energyPasses[key] = owned - 1;
    const nextEconomy: PlayerEconomy = {
      ...state.economy,
      energy: extendUnlimitedEnergy(state.economy.energy, durationMinutes * 60_000, now),
    };
    const nextInventory = { ...state.inventory, energyPasses };
    transaction.set(state.economyRef, nextEconomy, { merge: false });
    transaction.set(state.inventoryRef, { ...nextInventory, updatedAt: now }, { merge: false });
    ledger(transaction, uid, stableId(uid, "use-energy-pass", String(data.idempotencyKey)), "useEnergyPass", {}, nextEconomy, now, {
      durationMinutes,
      unlimitedUntil: nextEconomy.energy.unlimitedUntil,
    });
    return {
      durationMinutes,
      unlimitedUntil: nextEconomy.energy.unlimitedUntil,
      economy: publicEconomy(nextEconomy, now),
      inventory: nextInventory,
    };
  });
}

function chooseRarity(definition: BoosterDefinition, pityCount: number): CardRarity {
  const forcedMinimum = pityCount + 1 >= definition.pity.threshold ? definition.pity.minimumRarity : definition.minimumRarity;
  return enforceMinimumRarity(pickWeighted(definition.rarityWeights, randomRoll()), forcedMinimum);
}

export async function openBoosterBookHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  await ensurePowerCatalogFresh();
  const data = asObject(request.data);
  const boosterId = requiredString(data, "boosterId", 64);
  const openingId = stableId(uid, "booster", String(data.idempotencyKey));
  return runIdempotent(uid, "openBoosterBook", data.idempotencyKey, async (transaction, now) => {
    const defRef = db.doc(`booster_definitions/${boosterId}`);
    const openingRef = db.doc(`booster_openings/${openingId}`);
    const [state, definitionSnap, existingOpening] = await Promise.all([
      economyAndInventory(transaction, uid, now), transaction.get(defRef), transaction.get(openingRef),
    ]);
    if (existingOpening.exists) return { openingId, status: existingOpening.get("status") };
    const definition = (definitionSnap.exists ? definitionSnap.data() : boosterFallback(boosterId)) as BoosterDefinition | undefined;
    if (!definition?.published) throw new HttpsError("not-found", "BOOSTER_UNAVAILABLE");
    let nextEconomy = { ...state.economy, pity: { ...state.economy.pity } };
    const nextInventory = { ...state.inventory, boosterBooks: { ...(state.inventory.boosterBooks ?? {}) } };
    const ownedBooks = Number(nextInventory.boosterBooks[boosterId] ?? 0);
    const requireOwned = data.requireOwned === true;
    if (ownedBooks > 0) nextInventory.boosterBooks[boosterId] = ownedBooks - 1;
    else if (requireOwned) throw new HttpsError("failed-precondition", "BOOSTER_NOT_OWNED");
    else {
      const price = definition.prices.find((candidate) => candidate.currency === "cauris");
      if (!price || nextEconomy.cauris < price.amount) throw new HttpsError("resource-exhausted", "INSUFFICIENT_CAURIS");
      if (nextEconomy.spendingBlocked) throw new HttpsError("failed-precondition", "SPENDING_BLOCKED");
      nextEconomy = { ...nextEconomy, cauris: nextEconomy.cauris - price.amount };
    }
    const pityCount = Number(nextEconomy.pity[boosterId] ?? 0);
    const slots = Array.from({ length: 9 }, (_, position) => {
      const rarity = chooseRarity(definition, pityCount);
      return { position, rarity, cardId: pickCard(rarity) };
    });
    transaction.set(state.economyRef, nextEconomy, { merge: false });
    transaction.set(state.inventoryRef, { ...nextInventory, updatedAt: now }, { merge: false });
    transaction.create(openingRef, { uid, boosterId, definitionRevision: definition.revision, slots, status: "awaiting_choice", createdAt: now, updatedAt: now });
    ledger(transaction, uid, stableId(uid, "booster-debit", openingId), "openBoosterBook", { cauris: nextEconomy.cauris - state.economy.cauris }, nextEconomy, now, { boosterId, openingId });
    return { openingId, status: "awaiting_choice", positions: Array.from({ length: 9 }, (_, position) => position) };
  });
}

export async function chooseBoosterCardHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const openingId = requiredString(data, "openingId", 128);
  const position = Number(data.position);
  if (!Number.isInteger(position) || position < 0 || position > 8) throw new HttpsError("invalid-argument", "INVALID_POSITION");
  return runIdempotent(uid, "chooseBoosterCard", data.idempotencyKey, async (transaction, now) => {
    const openingRef = db.doc(`booster_openings/${openingId}`);
    const [state, openingSnap] = await Promise.all([economyAndInventory(transaction, uid, now), transaction.get(openingRef)]);
    if (!openingSnap.exists || openingSnap.get("uid") !== uid) throw new HttpsError("not-found", "OPENING_NOT_FOUND");
    if (openingSnap.get("status") !== "awaiting_choice") {
      return { openingId, reward: openingSnap.get("chosen"), duplicateCompensation: openingSnap.get("duplicateCompensation") ?? 0 };
    }
    const slots = openingSnap.get("slots") as Array<{ position: number; rarity: CardRarity; cardId: string }>;
    const chosen = slots.find((slot) => slot.position === position);
    if (!chosen) throw new HttpsError("invalid-argument", "INVALID_POSITION");
    const alreadyOwned = Boolean(state.inventory.cards?.[chosen.cardId]);
    const applied = applyReward(state.economy, state.inventory, { type: "card", cardId: chosen.cardId, rarity: chosen.rarity }, now);
    const boosterId = String(openingSnap.get("boosterId"));
    const definition = boosterFallback(boosterId);
    const rarityOrder: CardRarity[] = ["village", "notable", "chef", "ancetre"];
    const metPity = definition ? rarityOrder.indexOf(chosen.rarity) >= rarityOrder.indexOf(definition.pity.minimumRarity) : true;
    applied.economy.pity[boosterId] = metPity ? 0 : Number(applied.economy.pity[boosterId] ?? 0) + 1;
    transaction.set(state.economyRef, applied.economy, { merge: false });
    transaction.set(state.inventoryRef, { ...applied.inventory, updatedAt: now }, { merge: false });
    const compensation = applied.economy.cauris - state.economy.cauris;
    transaction.update(openingRef, { status: "chosen", chosen, chosenAt: now, updatedAt: now, slots: [], duplicateCompensation: alreadyOwned ? compensation : 0 });
    ledger(transaction, uid, stableId(uid, "booster-choice", openingId), "chooseBoosterCard", { cauris: compensation }, applied.economy, now, { openingId, cardId: chosen.cardId, rarity: chosen.rarity, duplicate: alreadyOwned });
    return { openingId, reward: chosen, duplicateCompensation: alreadyOwned ? compensation : 0, economy: publicEconomy(applied.economy, now) };
  });
}

function deterministicGridRarity(uid: string, day: string, position: number): CardRarity {
  const secret = process.env.NJAMBO_GRID_SECRET || process.env.GCLOUD_PROJECT || "emulator-only-secret";
  const hex = createHmac("sha256", secret).update(`${uid}:${day}:${position}`).digest("hex").slice(0, 12);
  const roll = Number.parseInt(hex, 16) / 0xffffffffffff;
  return pickWeighted(DAILY_GRID_WEIGHTS, Math.min(0.999999999, roll));
}

function deterministicGridCard(uid: string, day: string, position: number, rarity: CardRarity): string {
  const secret = process.env.NJAMBO_GRID_SECRET || process.env.GCLOUD_PROJECT || "emulator-only-secret";
  const hex = createHmac("sha256", secret).update(`${uid}:${day}:${position}:card`).digest("hex").slice(0, 12);
  const pool = boosterCardPool(rarity);
  return pool[Number.parseInt(hex, 16) % pool.length];
}

export async function buyDailyGridSlotHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  await ensurePowerCatalogFresh();
  const data = asObject(request.data);
  const position = Number(data.position);
  if (!Number.isInteger(position) || position < 0 || position > 8) throw new HttpsError("invalid-argument", "INVALID_POSITION");
  return runIdempotent(uid, "buyDailyGridSlot", data.idempotencyKey, async (transaction, now) => {
    const day = doualaDayKey(now);
    const rotationRef = db.doc(`daily_rotations/${day}/players/${uid}`);
    const orderId = optionalString(data, "orderId", 96);
    const orderRef = orderId ? db.doc(`orders/${orderId}`) : null;
    const [state, rotationSnap, orderSnap] = await Promise.all([
      economyAndInventory(transaction, uid, now), transaction.get(rotationRef), orderRef ? transaction.get(orderRef) : Promise.resolve(null),
    ]);
    const purchased = (rotationSnap.get("purchased") ?? {}) as Record<string, unknown>;
    const duplicateCompensations = (rotationSnap.get("duplicateCompensations") ?? {}) as Record<string, number>;
    if (purchased[position]) {
      return {
        day,
        position,
        reward: purchased[position],
        duplicateCompensation: Number(duplicateCompensations[position] ?? 0),
        economy: publicEconomy(state.economy, now),
      };
    }
    const paidWithXaf = Boolean(orderRef && orderSnap?.exists && orderSnap.get("uid") === uid && orderSnap.get("offerId") === "daily_grid_slot_xaf" && orderSnap.get("status") === "paid" && !orderSnap.get("consumedAt"));
    if (!paidWithXaf && (state.economy.spendingBlocked || state.economy.cauris < 15)) throw new HttpsError("resource-exhausted", "INSUFFICIENT_CAURIS");
    const rarity = deterministicGridRarity(uid, day, position);
    const reward = { type: "card" as const, cardId: deterministicGridCard(uid, day, position, rarity), rarity };
    const alreadyOwned = Boolean(state.inventory.cards?.[reward.cardId]);
    const charged = { ...state.economy, cauris: state.economy.cauris - (paidWithXaf ? 0 : 15) };
    const applied = applyReward(charged, state.inventory, reward, now);
    const duplicateCompensation = alreadyOwned ? applied.economy.cauris - charged.cauris : 0;
    transaction.set(state.economyRef, applied.economy, { merge: false });
    transaction.set(state.inventoryRef, { ...applied.inventory, updatedAt: now }, { merge: false });
    transaction.set(rotationRef, {
      uid,
      day,
      purchased: { ...purchased, [position]: reward },
      duplicateCompensations: { ...duplicateCompensations, [position]: duplicateCompensation },
      updatedAt: now,
    }, { merge: true });
    if (paidWithXaf && orderRef) transaction.update(orderRef, { consumedAt: now, consumedFor: `daily_grid:${day}:${position}`, updatedAt: now });
    ledger(transaction, uid, stableId(uid, "daily-grid", day, String(position)), "buyDailyGridSlot", { cauris: applied.economy.cauris - state.economy.cauris }, applied.economy, now, { day, position, reward, duplicateCompensation });
    return { day, position, reward, duplicateCompensation, economy: publicEconomy(applied.economy, now) };
  });
}

export async function spinLoyaltyWheelHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  return runIdempotent(uid, "spinLoyaltyWheel", data.idempotencyKey, async (transaction, now) => {
    const state = await economyAndInventory(transaction, uid, now);
    if (state.economy.daily.availableSpins < 1) throw new HttpsError("failed-precondition", "NO_SPIN_AVAILABLE");
    const reward = pickWeighted(WHEEL_REWARDS, randomRoll());
    const consumed = { ...state.economy, daily: { ...state.economy.daily, availableSpins: state.economy.daily.availableSpins - 1 } };
    const applied = applyReward(consumed, state.inventory, reward, now);
    transaction.set(state.economyRef, applied.economy, { merge: false });
    transaction.set(state.inventoryRef, { ...applied.inventory, updatedAt: now }, { merge: false });
    ledger(transaction, uid, stableId(uid, "wheel", String(data.idempotencyKey)), "spinLoyaltyWheel", { nkap: applied.economy.nkap - state.economy.nkap, cauris: applied.economy.cauris - state.economy.cauris }, applied.economy, now, { reward });
    return { reward, economy: publicEconomy(applied.economy, now), inventory: applied.inventory };
  });
}

export async function equipPowerCardsHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  await ensurePowerCatalogFresh();
  const data = asObject(request.data);
  const rawCardIds = data.cardIds;
  if (!Array.isArray(rawCardIds) || rawCardIds.length > 8 || rawCardIds.some((value) => typeof value !== "string" || value.length > 64)) {
    throw new HttpsError("invalid-argument", "INVALID_EQUIPPED_CARDS");
  }
  const cardIds = [...new Set(rawCardIds as string[])];
  if (cardIds.length !== rawCardIds.length) throw new HttpsError("invalid-argument", "DUPLICATE_EQUIPPED_CARD");
  return runIdempotent(uid, "equipPowerCards", data.idempotencyKey, async (transaction, now) => {
    const gameplay = normalizeGameplayConfig((await transaction.get(db.doc("runtime_config/gameplay"))).data());
    if (cardIds.length > gameplay.maxEquippedPowers) throw new HttpsError("invalid-argument", "INVALID_EQUIPPED_CARDS");
    const state = await economyAndInventory(transaction, uid, now);
    const ownedCards = (state.inventory.cards ?? {}) as Record<string, unknown>;
    if (cardIds.some((cardId) => !ownedCards[cardId])) throw new HttpsError("failed-precondition", "CARD_NOT_OWNED");
    if (cardIds.some((cardId) => !getPowerModule(cardId))) throw new HttpsError("failed-precondition", "UNKNOWN_POWER_CARD");
    const inventory = { ...state.inventory, equippedCards: cardIds, updatedAt: now };
    transaction.set(state.inventoryRef, inventory, { merge: false });
    return { equippedCards: cardIds };
  });
}

export async function joinEventHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const eventId = requiredString(data, "eventId", 96);
  const runId = stableId(uid, eventId, String(data.idempotencyKey)).slice(0, 40);
  const result = await joinEventTransaction(uid, eventId, runId, data.idempotencyKey);
  // Défis entre amis (phase 7) : ce nouveau parcours compte pour les duels acceptés.
  try { await bindChallengeRuns(uid, eventId, result.runId); } catch (error) { console.error("bindChallengeRuns", error); }
  return result;
}

function joinEventTransaction(uid: string, eventId: string, runId: string, idempotencyKey: unknown) {
  return runIdempotent(uid, "joinEvent", idempotencyKey, async (transaction, now) => {
    const eventRef = db.doc(`events/${eventId}`);
    const [state, eventSnap] = await Promise.all([economyAndInventory(transaction, uid, now), transaction.get(eventRef)]);
    const activeRevision = Number(eventSnap.get("activeRevision") ?? 1);
    const versionRef = db.doc(`event_versions/${eventId}_v${activeRevision}`);
    const versionSnap = await transaction.get(versionRef);
    const rawVersion = versionSnap.exists ? versionSnap.data() : eventFallback(eventId);
    const version: EventVersion | undefined = rawVersion ? normalizeEventVersion(rawVersion) : undefined;
    if (!version?.published || version.startsAt > now || version.endsAt <= now) throw new HttpsError("not-found", "EVENT_UNAVAILABLE");
    const tickets = { bronze: 0, argent: 0, or: 0, ...(state.inventory.tickets ?? {}) };
    if (Number(tickets[version.ticketTier]) < 1) throw new HttpsError("resource-exhausted", "TICKET_REQUIRED");
    tickets[version.ticketTier] = Number(tickets[version.ticketTier]) - 1;
    const ticketStatus = version.mode === "pve" ? "consumed" : "reserved";
    transaction.set(state.inventoryRef, { ...state.inventory, tickets, updatedAt: now }, { merge: false });
    transaction.create(db.doc(`event_runs/${runId}`), {
      uid, eventId, eventRevision: version.revision, versionSnapshot: version,
      mode: version.mode, status: version.mode === "pvp" ? "matchmaking" : "active",
      ticketTier: version.ticketTier, ticketStatus, stageIndex: 0, losses: 0,
      claimedRewardKeys: [], createdAt: now, updatedAt: now,
    });
    return { runId, event: version, ticketStatus };
  });
}

export async function leaveEventHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const runId = requiredString(data, "runId", 96);
  return runIdempotent(uid, "leaveEvent", data.idempotencyKey, async (transaction, now) => {
    const runRef = db.doc(`event_runs/${runId}`);
    const [state, runSnap] = await Promise.all([economyAndInventory(transaction, uid, now), transaction.get(runRef)]);
    if (!runSnap.exists || runSnap.get("uid") !== uid) throw new HttpsError("not-found", "EVENT_RUN_NOT_FOUND");
    const currentMatchId = runSnap.get("currentMatchId");
    if (typeof currentMatchId === "string" && currentMatchId) {
      const match = await transaction.get(db.doc(`matches/${currentMatchId}`));
      // Le groupe a pu démarrer pendant le clic Quitter : le client doit
      // abandonner ce match, jamais marquer son parcours « left » derrière lui.
      if (match.exists && ["playing", "between_rounds"].includes(String(match.get("status")))) return { runId, ticketReturned: false, matchId: currentMatchId };
    }
    const refundable = reservedTicketIsRefundable(String(runSnap.get("ticketStatus")), runSnap.get("firstMatchId"));
    let inventory = state.inventory;
    if (refundable) {
      const tier = String(runSnap.get("ticketTier"));
      const tickets = { bronze: 0, argent: 0, or: 0, ...(inventory.tickets ?? {}) } as Record<string, number>;
      tickets[tier] = Number(tickets[tier] ?? 0) + 1;
      inventory = { ...inventory, tickets };
      transaction.set(state.inventoryRef, { ...inventory, updatedAt: now }, { merge: false });
    }
    transaction.update(runRef, { status: "left", ticketStatus: refundable ? "returned" : runSnap.get("ticketStatus"), leftAt: now, updatedAt: now });
    return { runId, ticketReturned: refundable };
  });
}

export async function createPaymentIntentHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const offerId = requiredString(data, "offerId", 96);
  const provider = requiredString(data, "provider", 32);
  const adapter = paymentProvider(provider);
  if (!adapter) throw new HttpsError("invalid-argument", "INVALID_PROVIDER");
  return runIdempotent(uid, "createPaymentIntent", data.idempotencyKey, async (transaction, now) => {
    /* Passe premium de saison (phase 6) : commande spéciale, prix lu sur la saison. */
    if (offerId.startsWith(SEASON_PREMIUM_PREFIX)) {
      const seasonId = offerId.slice(SEASON_PREMIUM_PREFIX.length);
      const [userSnap, seasonSnap, progressSnap] = await Promise.all([
        transaction.get(db.doc(`users/${uid}`)), transaction.get(db.doc(`seasons/${seasonId}`)), transaction.get(db.doc(`season_progress/${seasonId}_${uid}`)),
      ]);
      if (userSnap.get("ageBand") !== "18_plus") throw new HttpsError("permission-denied", "CHECKOUT_REQUIRES_ADULT_CONFIRMATION");
      const season = normalizeSeason({ ...(seasonSnap.data() ?? {}), id: seasonId });
      if (!seasonSnap.exists || !season.published || seasonPhase(season, now) !== "live" || season.premiumPriceXaf <= 0) throw new HttpsError("not-found", "SEASON_PREMIUM_UNAVAILABLE");
      if (progressSnap.get("premium") === true) throw new HttpsError("already-exists", "SEASON_PREMIUM_OWNED");
      const orderId = stableId(uid, offerId, String(data.idempotencyKey)).slice(0, 40);
      const external = await adapter.createIntent({ orderId, amountXaf: season.premiumPriceXaf, uid });
      transaction.create(db.doc(`orders/${orderId}`), { uid, offerId, kind: "season_premium", seasonId, amountXaf: season.premiumPriceXaf, provider, status: external.status, rewards: [], createdAt: now, updatedAt: now });
      transaction.create(db.doc(`payment_intents/${orderId}`), { uid, orderId, provider, externalRef: external.externalRef, status: external.status, simulation: adapter.simulated, createdAt: now, updatedAt: now });
      return { orderId, status: external.status, amountXaf: season.premiumPriceXaf, provider, simulated: adapter.simulated };
    }
    const [userSnap, offerSnap] = await Promise.all([transaction.get(db.doc(`users/${uid}`)), transaction.get(db.doc(`offers/${offerId}`))]);
    if (userSnap.get("ageBand") !== "18_plus") throw new HttpsError("permission-denied", "CHECKOUT_REQUIRES_ADULT_CONFIRMATION");
    const offer = (offerSnap.exists ? offerSnap.data() : offerFallback(offerId)) as OfferDefinition | undefined;
    const price = offer?.prices.find((candidate) => candidate.currency === "xaf");
    if (!offer?.published || !price) throw new HttpsError("not-found", "XAF_OFFER_UNAVAILABLE");
    const orderId = stableId(uid, offerId, String(data.idempotencyKey)).slice(0, 40);
    const rewards = resolveOfferRewards(offer);
    const storeAsPack = isStoredPackOffer(offer);
    const external = await adapter.createIntent({ orderId, amountXaf: price.amount, uid });
    const status = external.status;
    transaction.create(db.doc(`orders/${orderId}`), {
      uid,
      offerId,
      offerRevision: offer.revision,
      offerTitle: offer.title,
      offerDescription: offer.description,
      guaranteedRewards: offer.rewards,
      hasRandomRewards: Boolean(offer.randomRewards?.length || offer.rewardGroups?.length),
      storeAsPack,
      amountXaf: price.amount,
      provider,
      status,
      rewards,
      createdAt: now,
      updatedAt: now,
    });
    transaction.create(db.doc(`payment_intents/${orderId}`), { uid, orderId, provider, externalRef: external.externalRef, status, simulation: adapter.simulated, createdAt: now, updatedAt: now });
    return { orderId, status, amountXaf: price.amount, provider, simulated: adapter.simulated };
  });
}

export async function verifyStorePurchaseHandler(request: CallableRequest<unknown>) {
  const uid = requireUid(request);
  const data = asObject(request.data);
  const orderId = requiredString(data, "orderId", 96);
  const outcome = optionalString(data, "simulationOutcome", 32) ?? "success";
  if (!["success", "pending", "refused", "duplicate", "refunded"].includes(outcome)) throw new HttpsError("invalid-argument", "INVALID_SIMULATION_OUTCOME");
  return runIdempotent(uid, "verifyStorePurchase", data.idempotencyKey, async (transaction, now) => {
    const orderRef = db.doc(`orders/${orderId}`);
    const intentRef = db.doc(`payment_intents/${orderId}`);
    const [state, orderSnap, intentSnap] = await Promise.all([economyAndInventory(transaction, uid, now), transaction.get(orderRef), transaction.get(intentRef)]);
    if (!orderSnap.exists || orderSnap.get("uid") !== uid || !intentSnap.exists) throw new HttpsError("not-found", "ORDER_NOT_FOUND");
    /* Passe premium de saison & éventuel pack scellé : lus ici (toutes les lectures avant les écritures). */
    const seasonId = orderSnap.get("kind") === "season_premium" ? String(orderSnap.get("seasonId")) : null;
    const seasonProgressRef = seasonId ? db.doc(`season_progress/${seasonId}_${uid}`) : null;
    const sealedPackId = typeof orderSnap.get("sealedPackId") === "string" ? String(orderSnap.get("sealedPackId")) : null;
    const sealedPackRef = sealedPackId ? db.doc(`sealed_packs/${sealedPackId}`) : null;
    const [, sealedPackSnap] = await Promise.all([
      seasonProgressRef ? transaction.get(seasonProgressRef) : Promise.resolve(null),
      sealedPackRef ? transaction.get(sealedPackRef) : Promise.resolve(null),
    ]);
    if (orderSnap.get("status") === "paid" && outcome === "refunded") {
      if (sealedPackRef && sealedPackSnap?.exists && sealedPackSnap.get("status") === "sealed") {
        const existingPacks = Array.isArray(state.inventory.packs) ? (state.inventory.packs as StoredPack[]) : [];
        const remainingPacks = existingPacks.filter((entry) => entry.packInstanceId !== sealedPackId);
        transaction.set(state.inventoryRef, { ...state.inventory, packs: remainingPacks, updatedAt: now }, { merge: false });
        transaction.update(sealedPackRef, { status: "refunded", refundedAt: now, updatedAt: now });
        transaction.update(orderRef, { status: "refunded", refundedAt: now, updatedAt: now });
        transaction.update(intentRef, { status: "refunded", updatedAt: now });
        ledger(transaction, uid, stableId(uid, "refund", orderId), "refundPayment", {}, state.economy, now, { orderId, sealedPackId, packRevoked: true });
        return { orderId, status: "refunded", debtCauris: state.economy.debtCauris, spendingBlocked: state.economy.spendingBlocked };
      }
      const rewards = (orderSnap.get("rewards") ?? []) as Reward[];
      const caurisToReverse = rewards.filter((reward) => reward.type === "cauris").reduce((sum, reward) => sum + (reward.type === "cauris" ? reward.amount : 0), 0);
      const available = state.economy.cauris;
      const debt = Math.max(0, caurisToReverse - available);
      const nextEconomy = {
        ...state.economy,
        cauris: Math.max(0, available - caurisToReverse),
        debtCauris: state.economy.debtCauris + debt,
        spendingBlocked: state.economy.spendingBlocked || debt > 0,
      };
      transaction.set(state.economyRef, nextEconomy, { merge: false });
      transaction.update(orderRef, { status: "refunded", refundedAt: now, updatedAt: now });
      // Remboursement d'un passe premium : le premium est retiré (les paliers déjà réclamés restent).
      if (seasonProgressRef) transaction.set(seasonProgressRef, { premium: false, premiumRefundedAt: now, updatedAt: now }, { merge: true });
      transaction.update(intentRef, { status: "refunded", updatedAt: now });
      ledger(transaction, uid, stableId(uid, "refund", orderId), "refundPayment", { cauris: nextEconomy.cauris - available }, nextEconomy, now, { orderId, debtCreated: debt });
      return { orderId, status: "refunded", debtCauris: nextEconomy.debtCauris, spendingBlocked: nextEconomy.spendingBlocked };
    }
    if (orderSnap.get("status") === "paid") return { orderId, status: "paid", duplicate: true };
    if (orderSnap.get("status") === "refunded") return { orderId, status: "refunded", terminal: true };
    if (outcome !== "success" && outcome !== "duplicate") {
      transaction.update(orderRef, { status: outcome, updatedAt: now });
      transaction.update(intentRef, { status: outcome, updatedAt: now });
      return { orderId, status: outcome };
    }
    let nextEconomy = state.economy;
    let nextInventory = state.inventory;
    const rewards = (orderSnap.get("rewards") ?? []) as Reward[];
    const offerId = String(orderSnap.get("offerId") ?? "");
    const fallbackOffer = offerFallback(offerId);
    const shouldStoreAsPack = orderSnap.get("storeAsPack") === true
      || (orderSnap.get("storeAsPack") === undefined && Boolean(fallbackOffer && isStoredPackOffer(fallbackOffer)));
    let storedPack: StoredPack | null = null;
    if (shouldStoreAsPack) {
      const packInstanceId = stableId(uid, "pack", orderId).slice(0, 32);
      const title = typeof orderSnap.get("offerTitle") === "string"
        ? String(orderSnap.get("offerTitle"))
        : (fallbackOffer?.title ?? offerId);
      const description = typeof orderSnap.get("offerDescription") === "string"
        ? String(orderSnap.get("offerDescription"))
        : fallbackOffer?.description;
      const guaranteedRewards = Array.isArray(orderSnap.get("guaranteedRewards"))
        ? (orderSnap.get("guaranteedRewards") as Reward[])
        : (fallbackOffer?.rewards ?? []);
      const hasRandomRewards = orderSnap.get("hasRandomRewards") === true
        || Boolean(fallbackOffer?.randomRewards?.length || fallbackOffer?.rewardGroups?.length);
      storedPack = {
        packInstanceId,
        offerId,
        title,
        description,
        acquiredAt: now,
        orderId,
        guaranteedRewards,
        hasRandomRewards,
      };
      const existingPacks = Array.isArray(nextInventory.packs) ? [...nextInventory.packs] : [];
      nextInventory = { ...nextInventory, packs: [...existingPacks, storedPack] };
      transaction.create(db.doc(`sealed_packs/${packInstanceId}`), {
        uid,
        packInstanceId,
        offerId,
        orderId,
        title,
        description,
        rewards,
        status: "sealed",
        createdAt: now,
        updatedAt: now,
      });
    } else {
      for (const reward of rewards) ({ economy: nextEconomy, inventory: nextInventory } = applyReward(nextEconomy, nextInventory, reward, now));
    }
    transaction.set(state.economyRef, nextEconomy, { merge: false });
    transaction.set(state.inventoryRef, { ...nextInventory, updatedAt: now }, { merge: false });
    transaction.update(orderRef, {
      status: "paid",
      paidAt: now,
      ...(storedPack ? { sealedPackId: storedPack.packInstanceId } : {}),
      updatedAt: now,
    });
    transaction.update(intentRef, { status: "paid", verifiedAt: now, updatedAt: now });
    if (seasonProgressRef && seasonId) {
      transaction.set(seasonProgressRef, { seasonId, uid, premium: true, premiumOrderId: orderId, premiumAt: now, updatedAt: now }, { merge: true });
    }
    ledger(
      transaction,
      uid,
      stableId(uid, "payment", orderId),
      "verifyStorePurchase",
      { nkap: nextEconomy.nkap - state.economy.nkap, cauris: nextEconomy.cauris - state.economy.cauris },
      nextEconomy,
      now,
      { orderId, ...(storedPack ? { storedPackId: storedPack.packInstanceId } : {}) },
    );
    return { orderId, status: "paid", rewards: storedPack ? [] : rewards, storedPack, economy: publicEconomy(nextEconomy, now), inventory: nextInventory };
  });
}

export async function publishAdminDraftHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const draftId = requiredString(data, "draftId", 96);
  return runIdempotent(uid, "publishAdminDraft", data.idempotencyKey, async (transaction, now) => {
    const draftRef = db.doc(`admin_drafts/${draftId}`);
    const draftSnap = await transaction.get(draftRef);
    if (!draftSnap.exists) throw new HttpsError("not-found", "DRAFT_NOT_FOUND");
    const type = draftSnap.get("type");
    const contentId = String(draftSnap.get("contentId"));
    const revision = Number(draftSnap.get("revision") ?? 1);
    const target = type === "event"
      ? db.doc(`event_versions/${contentId}_v${revision}`)
      : type === "runtime_config"
        ? db.doc(`runtime_config/${contentId}`)
        : db.doc(`${String(type)}s/${contentId}`);
    transaction.set(target, { ...draftSnap.get("payload"), revision, published: true, publishedAt: now, publishedBy: uid }, { merge: false });
    if (type === "event") transaction.set(db.doc(`events/${contentId}`), { activeRevision: revision, published: true, updatedAt: now }, { merge: true });
    transaction.update(draftRef, { status: "published", publishedAt: now, updatedAt: now });
    transaction.create(db.collection("admin_audit").doc(), { uid, action: "publish", draftId, type, contentId, revision, createdAt: now });
    return { draftId, type, contentId, revision, published: true };
  });
}
