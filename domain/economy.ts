export const ECONOMY_VERSION = 1 as const;

export type Currency = "nkap" | "cauris";
export type TicketTier = "bronze" | "argent" | "or";
export type CardRarity = "village" | "notable" | "chef" | "ancetre";

export interface EnergyState {
  stored: number;
  anchorAt: number;
  unlimitedUntil: number;
  max: number;
  regenMs: number;
}

export interface PlayerEconomy {
  version: typeof ECONOMY_VERSION;
  nkap: number;
  cauris: number;
  energy: EnergyState;
  daily: {
    lastClaimDay: string | null;
    loyaltyPoints: number;
    availableSpins: number;
  };
  pity: Record<string, number>;
  debtCauris: number;
  spendingBlocked: boolean;
}

export const DEFAULT_ECONOMY: PlayerEconomy = {
  version: ECONOMY_VERSION,
  nkap: 5_000,
  cauris: 20,
  energy: {
    stored: 100,
    anchorAt: 0,
    unlimitedUntil: 0,
    max: 100,
    regenMs: 60_000,
  },
  daily: {
    lastClaimDay: null,
    loyaltyPoints: 0,
    availableSpins: 0,
  },
  pity: {},
  debtCauris: 0,
  spendingBlocked: false,
};

export interface AvailableEnergy {
  available: number;
  unlimited: boolean;
  unlimitedUntil: number;
  nextUnitAt: number | null;
}

export function calculateEnergy(energy: EnergyState, now = Date.now()): AvailableEnergy {
  const elapsed = Math.max(0, now - energy.anchorAt);
  const regenerated = Math.floor(elapsed / Math.max(1, energy.regenMs));
  const available = Math.min(energy.max, Math.max(0, energy.stored) + regenerated);
  const unlimited = energy.unlimitedUntil > now;
  const nextUnitAt = available >= energy.max
    ? null
    : energy.anchorAt + (regenerated + 1) * energy.regenMs;
  return { available, unlimited, unlimitedUntil: energy.unlimitedUntil, nextUnitAt };
}

export function materializeEnergy(energy: EnergyState, now = Date.now()): EnergyState {
  const calculated = calculateEnergy(energy, now);
  const regenerated = Math.floor(Math.max(0, now - energy.anchorAt) / Math.max(1, energy.regenMs));
  const anchorAt = calculated.available >= energy.max
    ? now
    : energy.anchorAt + regenerated * energy.regenMs;
  return { ...energy, stored: calculated.available, anchorAt };
}

export function spendEnergy(energy: EnergyState, amount: number, now = Date.now()): EnergyState {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("INVALID_ENERGY_AMOUNT");
  const current = materializeEnergy(energy, now);
  if (current.unlimitedUntil > now || amount === 0) return current;
  if (current.stored < amount) throw new Error("INSUFFICIENT_ENERGY");
  return { ...current, stored: current.stored - amount };
}

export function refundEnergy(energy: EnergyState, amount: number, now = Date.now()): EnergyState {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("INVALID_ENERGY_AMOUNT");
  const current = materializeEnergy(energy, now);
  const stored = Math.min(current.max, current.stored + amount);
  return { ...current, stored, anchorAt: stored >= current.max ? now : current.anchorAt };
}

export function extendUnlimitedEnergy(energy: EnergyState, durationMs: number, now = Date.now()): EnergyState {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("INVALID_PASS_DURATION");
  const current = materializeEnergy(energy, now);
  return {
    ...current,
    unlimitedUntil: Math.max(now, current.unlimitedUntil) + durationMs,
  };
}

export function doualaDayKey(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Douala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

export const RANK_TIERS = [
  { id: "braise", label: "Braise du Quartier", min: Number.NEGATIVE_INFINITY, max: 999 },
  { id: "mboa", label: "Joueur du Mboa", min: 1_000, max: 1_149 },
  { id: "notable", label: "Notable du Ter", min: 1_150, max: 1_299 },
  { id: "chef_table", label: "Chef de Table", min: 1_300, max: 1_499 },
  { id: "tambour", label: "Grand Tambour", min: 1_500, max: 1_699 },
  { id: "legende_237", label: "Légende du 237", min: 1_700, max: 1_999 },
  { id: "ancetre", label: "Ancêtre Njambo", min: 2_000, max: Number.POSITIVE_INFINITY },
] as const;

export function rankTier(crowns: number) {
  return RANK_TIERS.find((tier) => crowns >= tier.min && crowns <= tier.max) ?? RANK_TIERS[1];
}

/** Elo-like score where an equal-strength win is exactly +20. */
export function crownWinGain(winnerCrowns: number, opponentAverage: number): number {
  const expected = 1 / (1 + 10 ** ((opponentAverage - winnerCrowns) / 400));
  return Math.max(5, Math.min(40, Math.round(40 * (1 - expected))));
}

export function splitCrownLoss(totalLoss: number, loserCount: number): number[] {
  if (!Number.isInteger(totalLoss) || totalLoss < 0 || !Number.isInteger(loserCount) || loserCount <= 0) {
    throw new Error("INVALID_CROWN_SPLIT");
  }
  const base = Math.floor(totalLoss / loserCount);
  const remainder = totalLoss % loserCount;
  return Array.from({ length: loserCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

export interface WeightedValue<T> { value: T; weight: number }

export function pickWeighted<T>(values: WeightedValue<T>[], roll: number): T {
  const total = values.reduce((sum, value) => sum + value.weight, 0);
  if (!(roll >= 0 && roll < 1) || total <= 0) throw new Error("INVALID_WEIGHTED_PICK");
  let cursor = roll * total;
  for (const entry of values) {
    cursor -= entry.weight;
    if (cursor < 0) return entry.value;
  }
  return values[values.length - 1].value;
}

export const DUPLICATE_COMPENSATION: Record<CardRarity, number> = {
  village: 2,
  notable: 5,
  chef: 15,
  ancetre: 50,
};

export const RARITY_ORDER: CardRarity[] = ["village", "notable", "chef", "ancetre"];

export function enforceMinimumRarity(rarity: CardRarity, minimum: CardRarity): CardRarity {
  return RARITY_ORDER.indexOf(rarity) < RARITY_ORDER.indexOf(minimum) ? minimum : rarity;
}

export function updatePityCounter(pulled: CardRarity, pityMinimum: CardRarity, current: number): number {
  return RARITY_ORDER.indexOf(pulled) >= RARITY_ORDER.indexOf(pityMinimum) ? 0 : current + 1;
}
