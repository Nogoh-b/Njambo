import { describe, expect, it } from "vitest";
import {
  calculateEnergy,
  crownWinGain,
  enforceMinimumRarity,
  extendUnlimitedEnergy,
  pickWeighted,
  refundEnergy,
  reservedTicketIsRefundable,
  resolveEventProgress,
  spendEnergy,
  splitCrownLoss,
  updatePityCounter,
  type EnergyState,
} from "../domain";

const energy = (overrides: Partial<EnergyState> = {}): EnergyState => ({
  stored: 40, anchorAt: 1_000_000, unlimitedUntil: 0, max: 100, regenMs: 60_000, ...overrides,
});

describe("boosters", () => {
  const weights = [
    { value: "village" as const, weight: 70 },
    { value: "notable" as const, weight: 24 },
    { value: "chef" as const, weight: 5 },
    { value: "ancetre" as const, weight: 1 },
  ];

  it("respects the published weighted intervals", () => {
    const counts = { village: 0, notable: 0, chef: 0, ancetre: 0 };
    for (let index = 0; index < 10_000; index += 1) counts[pickWeighted(weights, (index + 0.5) / 10_000)] += 1;
    expect(counts).toEqual({ village: 7_000, notable: 2_400, chef: 500, ancetre: 100 });
  });

  it("enforces minimum rarity and resets pity only on a qualifying pull", () => {
    expect(enforceMinimumRarity("village", "chef")).toBe("chef");
    expect(updatePityCounter("notable", "chef", 7)).toBe(8);
    expect(updatePityCounter("chef", "chef", 7)).toBe(0);
  });
});

describe("energy", () => {
  it("regenerates one unit per minute without background writes", () => {
    expect(calculateEnergy(energy(), 1_000_000 + 12 * 60_000).available).toBe(52);
  });

  it("never exceeds the configured cap", () => {
    expect(calculateEnergy(energy({ stored: 99 }), 1_000_000 + 20 * 60_000).available).toBe(100);
  });

  it("spends from materialized energy and refunds safely", () => {
    const spent = spendEnergy(energy(), 10, 1_000_000 + 5 * 60_000);
    expect(spent.stored).toBe(35);
    expect(refundEnergy(spent, 10, spent.anchorAt).stored).toBe(45);
  });

  it("preserves a partial regeneration minute when energy is spent", () => {
    const spent = spendEnergy(energy(), 10, 1_000_000 + 90_000);
    expect(spent.stored).toBe(31);
    expect(calculateEnergy(spent, 1_000_000 + 120_000).available).toBe(32);
  });

  it("stacks unlimited passes while normal regeneration continues", () => {
    const first = extendUnlimitedEnergy(energy(), 60 * 60_000, 1_000_000);
    const second = extendUnlimitedEnergy(first, 2 * 60 * 60_000, 1_030_000);
    expect(second.unlimitedUntil).toBe(1_000_000 + 3 * 60 * 60_000);
    expect(second.stored).toBe(40);
  });
});

describe("crowns", () => {
  it("awards exactly 20 for equal ratings", () => expect(crownWinGain(1_200, 1_200)).toBe(20));
  it("rewards an upset more than a favorite", () => {
    expect(crownWinGain(1_000, 1_500)).toBeGreaterThan(crownWinGain(1_500, 1_000));
  });
  it("splits multiplayer losses without creating crowns", () => {
    const losses = splitCrownLoss(20, 3);
    expect(losses).toEqual([7, 7, 6]);
    expect(losses.reduce((sum, value) => sum + value, 0)).toBe(20);
  });
});

describe("Ter events", () => {
  it("eliminates a participant on the third global loss", () => {
    const progress = resolveEventProgress({ mode: "pvp", won: false, stageIndex: 2, stageCount: 5, losses: 2, allowedLosses: 3 });
    expect(progress).toEqual({ stageIndex: 2, losses: 3, status: "eliminated" });
  });

  it("advances a winner and sends them back to PvP matchmaking", () => {
    const progress = resolveEventProgress({ mode: "pvp", won: true, stageIndex: 1, stageCount: 5, losses: 1, allowedLosses: 3 });
    expect(progress).toEqual({ stageIndex: 2, losses: 1, status: "matchmaking" });
  });

  it("completes the last stage without resetting prior losses", () => {
    const progress = resolveEventProgress({ mode: "pve", won: true, stageIndex: 3, stageCount: 4, losses: 2, allowedLosses: 3 });
    expect(progress).toEqual({ stageIndex: 3, losses: 2, status: "completed" });
  });

  it("returns only a reserved ticket when no match ever started", () => {
    expect(reservedTicketIsRefundable("reserved", null)).toBe(true);
    expect(reservedTicketIsRefundable("reserved", "match_1")).toBe(false);
    expect(reservedTicketIsRefundable("consumed", null)).toBe(false);
  });
});
