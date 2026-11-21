import { COSMETIC_DUPLICATE_CAURIS, type CosmeticRarity } from "./cosmetics";
import { DUPLICATE_COMPENSATION, type CardRarity, type PlayerEconomy, type TicketTier, type WeightedValue } from "./economy";

export type Reward =
  | { type: "nkap"; amount: number }
  | { type: "cauris"; amount: number }
  | { type: "ticket"; tier: TicketTier; amount: number }
  | { type: "energy_pass"; durationMinutes: number }
  | { type: "booster_book"; boosterId: string; amount: number }
  | { type: "card"; cardId: string; rarity: CardRarity }
  /** Phase 5 : cosmétique (nom/image copiés pour l'affichage des gains). */
  | { type: "cosmetic"; cosmeticId: string; rarity: CosmeticRarity; name?: string; imageUrl?: string };

export interface Price {
  currency: "cauris" | "xaf";
  amount: number;
}

export interface OfferDefinition {
  id: string;
  type: "cauris_pack" | "nkap_conversion" | "energy_pass" | "ticket" | "element_pack";
  title: string;
  description: string;
  prices: Price[];
  rewards: Reward[];
  randomRewards?: Array<WeightedValue<Reward>>;
  rewardGroups?: Array<Array<WeightedValue<Reward>>>;
  published: boolean;
  revision: number;
  startsAt?: number;
  endsAt?: number;
  ageRestrictedXaf?: boolean;
}

export interface StoredPack {
  packInstanceId: string;
  offerId: string;
  title: string;
  description?: string;
  acquiredAt: number;
  orderId?: string;
  /** Contenus garantis (visibles avant ouverture sans dévoiler les lots aléatoires). */
  guaranteedRewards?: Reward[];
  /** Indique la présence de lots aléatoires révélés uniquement à l'ouverture. */
  hasRandomRewards?: boolean;
}

export interface InventoryLike {
  tickets?: Partial<Record<TicketTier, number>>;
  boosterBooks?: Record<string, number>;
  energyPasses?: Record<string, number>;
  packs?: StoredPack[];
}

/** Indique si une offre boutique doit être stockée comme pack scellé à ouvrir dans Ma collection. */
export function isStoredPackOffer(
  offer: Pick<OfferDefinition, "id" | "type" | "rewards" | "randomRewards" | "rewardGroups">,
): boolean {
  if (offer.type !== "element_pack") return false;
  if (offer.id === "daily_grid_slot_xaf" || offer.id.startsWith("booster_")) return false;
  return offer.rewards.length > 0 || Boolean(offer.randomRewards?.length) || Boolean(offer.rewardGroups?.length);
}

/** Formate une durée de pass énergie en français lisible (ex. 60 -> "1 h", 90 -> "1 h 30", 1440 -> "24 h"). */
export function formatEnergyDuration(durationMinutes: number): string {
  const mins = Math.max(1, Math.round(durationMinutes));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours} h` : `${hours} h ${String(rem).padStart(2, "0")}`;
}

/** Compte le total d'objets récupérés stockés (packs, livres, pass énergie, tickets). */
export function countStoredCollectionItems(inventory?: InventoryLike | null): {
  packs: number;
  books: number;
  energy: number;
  tickets: number;
  total: number;
} {
  const packs = Array.isArray(inventory?.packs) ? inventory.packs.length : 0;
  const books = Object.values(inventory?.boosterBooks ?? {}).reduce((sum, n) => sum + Math.max(0, Number(n ?? 0)), 0);
  const energy = Object.values(inventory?.energyPasses ?? {}).reduce((sum, n) => sum + Math.max(0, Number(n ?? 0)), 0);
  const tickets = Object.values(inventory?.tickets ?? {}).reduce((sum, n) => sum + Math.max(0, Number(n ?? 0)), 0);
  return { packs, books, energy, tickets, total: packs + books + energy + tickets };
}

/** Applique une récompense de façon pure : les monnaies créditent le portefeuille,
 *  tandis que les tickets, livres et pass énergie sont stockés dans l'inventaire
 *  pour être utilisés au clic depuis Ma collection. */
export function applyRewardToInventory<TInv extends Record<string, unknown>>(
  economy: PlayerEconomy,
  inventory: TInv,
  reward: Reward,
  now: number,
) {
  const nextEconomy: PlayerEconomy = {
    ...economy,
    energy: { ...economy.energy },
    daily: { ...economy.daily },
    pity: { ...economy.pity },
  };
  const inv = inventory as Record<string, unknown>;
  const existingTickets = (inv.tickets ?? {}) as Partial<Record<TicketTier, number>>;
  const existingBooks = (inv.boosterBooks ?? {}) as Record<string, number>;
  const existingEnergy = (inv.energyPasses ?? {}) as Record<string, number>;
  const existingCards = (inv.cards ?? {}) as Record<string, unknown>;
  const nextInventory = {
    ...inventory,
    tickets: { bronze: 0, argent: 0, or: 0, ...existingTickets } as Record<TicketTier, number>,
    boosterBooks: { ...existingBooks },
    energyPasses: { ...existingEnergy },
    packs: Array.isArray(inv.packs) ? [...(inv.packs as StoredPack[])] : ([] as StoredPack[]),
    cards: { ...existingCards },
    cosmetics: Array.isArray(inv.cosmetics) ? ([...(inv.cosmetics as string[])] as string[]) : ([] as string[]),
  };

  if (reward.type === "nkap") nextEconomy.nkap += reward.amount;
  if (reward.type === "cauris") nextEconomy.cauris += reward.amount;
  if (reward.type === "energy_pass") {
    const minutesKey = String(Math.max(1, Math.floor(reward.durationMinutes)));
    nextInventory.energyPasses[minutesKey] = Number(nextInventory.energyPasses[minutesKey] ?? 0) + 1;
  }
  if (reward.type === "ticket") {
    nextInventory.tickets[reward.tier] = Number(nextInventory.tickets[reward.tier] ?? 0) + reward.amount;
  }
  if (reward.type === "booster_book") {
    nextInventory.boosterBooks[reward.boosterId] = Number(nextInventory.boosterBooks[reward.boosterId] ?? 0) + reward.amount;
  }
  if (reward.type === "cosmetic") {
    if (nextInventory.cosmetics.includes(reward.cosmeticId)) {
      nextEconomy.cauris += COSMETIC_DUPLICATE_CAURIS[reward.rarity] ?? 10;
    } else {
      nextInventory.cosmetics.push(reward.cosmeticId);
    }
  }
  if (reward.type === "card") {
    if (nextInventory.cards[reward.cardId]) {
      nextEconomy.cauris += DUPLICATE_COMPENSATION[reward.rarity];
    } else {
      nextInventory.cards[reward.cardId] = { unlockedAt: now, rarity: reward.rarity };
    }
  }
  return { economy: nextEconomy, inventory: nextInventory };
}

export interface BoosterDefinition {
  id: string;
  title: string;
  prices: Price[];
  rarityWeights: Array<WeightedValue<CardRarity>>;
  minimumRarity: CardRarity;
  pity: { threshold: number; minimumRarity: CardRarity };
  published: boolean;
  revision: number;
}

const fixed = (type: Reward["type"], amount: number): Reward => ({ type, amount } as Reward);

export const DEFAULT_OFFERS: OfferDefinition[] = [
  ...[[500, 50], [1_000, 110], [2_500, 300], [5_000, 650]].map(([xaf, cauris]) => ({
    id: `cauris_${cauris}`,
    type: "cauris_pack" as const,
    title: `${cauris} cauris`,
    description: "Recharge premium simulée",
    prices: [{ currency: "xaf" as const, amount: xaf }],
    rewards: [fixed("cauris", cauris)],
    published: true,
    revision: 1,
    ageRestrictedXaf: true,
  })),
  ...[[20, 1_000], [50, 3_000], [100, 7_500], [250, 20_000]].map(([cauris, nkap]) => ({
    id: `nkap_${nkap}`,
    type: "nkap_conversion" as const,
    title: `${nkap.toLocaleString("fr-FR")} Nkap`,
    description: "Conversion définitive de cauris en Nkap",
    prices: [{ currency: "cauris" as const, amount: cauris }],
    rewards: [fixed("nkap", nkap)],
    published: true,
    revision: 1,
  })),
  ...[[60, 25], [120, 45], [1440, 250]].map(([minutes, cauris]) => ({
    id: `energy_${minutes}`,
    type: "energy_pass" as const,
    title: `Énergie illimitée ${minutes === 1440 ? "24 h" : `${minutes / 60} h`}`,
    description: "La régénération normale continue pendant le pass",
    prices: [{ currency: "cauris" as const, amount: cauris }],
    rewards: [{ type: "energy_pass" as const, durationMinutes: minutes }],
    published: true,
    revision: 1,
  })),
  ...(["bronze", "argent", "or"] as const).map((tier, index) => ({
    id: `ticket_${tier}`,
    type: "ticket" as const,
    title: `Ticket ${tier[0].toUpperCase()}${tier.slice(1)}`,
    description: "Accès à un Ter compatible",
    prices: [{ currency: "cauris" as const, amount: [20, 60, 150][index] }],
    rewards: [{ type: "ticket" as const, tier, amount: 1 }],
    published: true,
    revision: 1,
  })),
  ...[["normal", 200], ["rare", 600], ["exceptionnel", 1_500]].map(([boosterId, xaf]) => ({
    id: `booster_${boosterId}_xaf`, type: "element_pack" as const,
    title: `Livre ${boosterId === "exceptionnel" ? "Exceptionnel" : boosterId === "rare" ? "Rare" : "Normal"}`,
    description: "Livre à neuf cartes cachées — paiement simulé",
    prices: [{ currency: "xaf" as const, amount: Number(xaf) }],
    rewards: [{ type: "booster_book" as const, boosterId: String(boosterId), amount: 1 }],
    published: true, revision: 1, ageRestrictedXaf: true,
  })),
  {
    id: "daily_grid_slot_xaf", type: "element_pack", title: "Case de la grille quotidienne",
    description: "Une case, résultat privé déterministe — paiement simulé",
    prices: [{ currency: "xaf", amount: 150 }], rewards: [], published: true, revision: 1, ageRestrictedXaf: true,
  },
  {
    id: "pack_quartier", type: "element_pack", title: "Pack Quartier", description: "Les probabilités sont figées dans la commande.",
    prices: [{ currency: "xaf", amount: 500 }], rewards: [{ type: "booster_book", boosterId: "normal", amount: 1 }],
    rewardGroups: [
      [{ value: { type: "cauris", amount: 10 }, weight: 50 }, { value: { type: "cauris", amount: 20 }, weight: 50 }],
      [{ value: { type: "nkap", amount: 500 }, weight: 50 }, { value: { type: "nkap", amount: 1_000 }, weight: 50 }],
    ], published: true, revision: 1, ageRestrictedXaf: true,
  },
  {
    id: "pack_mboa", type: "element_pack", title: "Pack Mboa", description: "Livre Rare, cauris, Nkap et énergie 1 h.",
    prices: [{ currency: "xaf", amount: 1_500 }], rewards: [{ type: "booster_book", boosterId: "rare", amount: 1 }, { type: "energy_pass", durationMinutes: 60 }],
    rewardGroups: [
      [{ value: { type: "cauris", amount: 40 }, weight: 34 }, { value: { type: "cauris", amount: 60 }, weight: 33 }, { value: { type: "cauris", amount: 80 }, weight: 33 }],
      [{ value: { type: "nkap", amount: 1_500 }, weight: 34 }, { value: { type: "nkap", amount: 2_500 }, weight: 33 }, { value: { type: "nkap", amount: 4_000 }, weight: 33 }],
    ], published: true, revision: 1, ageRestrictedXaf: true,
  },
  {
    id: "pack_chefferie", type: "element_pack", title: "Pack Chefferie", description: "Livre Exceptionnel, ressources, énergie 2 h et ticket Or.",
    prices: [{ currency: "xaf", amount: 5_000 }],
    rewards: [{ type: "booster_book", boosterId: "exceptionnel", amount: 1 }, { type: "energy_pass", durationMinutes: 120 }, { type: "ticket", tier: "or", amount: 1 }],
    rewardGroups: [
      [{ value: { type: "cauris", amount: 180 }, weight: 34 }, { value: { type: "cauris", amount: 220 }, weight: 33 }, { value: { type: "cauris", amount: 260 }, weight: 33 }],
      [{ value: { type: "nkap", amount: 5_000 }, weight: 34 }, { value: { type: "nkap", amount: 7_500 }, weight: 33 }, { value: { type: "nkap", amount: 10_000 }, weight: 33 }],
    ], published: true, revision: 1, ageRestrictedXaf: true,
  },
];

export const DEFAULT_BOOSTERS: BoosterDefinition[] = [
  {
    id: "normal", title: "Livre Normal",
    prices: [{ currency: "cauris", amount: 20 }, { currency: "xaf", amount: 200 }],
    rarityWeights: [{ value: "village", weight: 70 }, { value: "notable", weight: 24 }, { value: "chef", weight: 5 }, { value: "ancetre", weight: 1 }],
    minimumRarity: "village", pity: { threshold: 10, minimumRarity: "notable" }, published: true, revision: 1,
  },
  {
    id: "rare", title: "Livre Rare",
    prices: [{ currency: "cauris", amount: 60 }, { currency: "xaf", amount: 600 }],
    rarityWeights: [{ value: "notable", weight: 75 }, { value: "chef", weight: 22 }, { value: "ancetre", weight: 3 }],
    minimumRarity: "notable", pity: { threshold: 8, minimumRarity: "chef" }, published: true, revision: 1,
  },
  {
    id: "exceptionnel", title: "Livre Exceptionnel",
    prices: [{ currency: "cauris", amount: 150 }, { currency: "xaf", amount: 1_500 }],
    rarityWeights: [{ value: "chef", weight: 85 }, { value: "ancetre", weight: 15 }],
    minimumRarity: "chef", pity: { threshold: 10, minimumRarity: "ancetre" }, published: true, revision: 1,
  },
];

export const DAILY_GRID_WEIGHTS: Array<WeightedValue<CardRarity>> = [
  { value: "village", weight: 55 },
  { value: "notable", weight: 32 },
  { value: "chef", weight: 11 },
  { value: "ancetre", weight: 2 },
];

export const WHEEL_REWARDS: Array<WeightedValue<Reward>> = [
  { value: { type: "nkap", amount: 100 }, weight: 35 },
  { value: { type: "nkap", amount: 250 }, weight: 25 },
  { value: { type: "cauris", amount: 5 }, weight: 20 },
  { value: { type: "ticket", tier: "bronze", amount: 1 }, weight: 10 },
  { value: { type: "energy_pass", durationMinutes: 60 }, weight: 7 },
  { value: { type: "booster_book", boosterId: "normal", amount: 1 }, weight: 3 },
];
