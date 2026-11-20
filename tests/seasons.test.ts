import { describe, expect, it } from "vitest";
import { canClaimTier, normalizeSeason, normalizeSeasonProgress, reachedTiers, seasonPhase, seasonPointsFor, validateReward, validateSeason } from "../domain";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 20);
const season = normalizeSeason({
  id: "saison_1", title: "Saison du Ndop", startsAt: NOW - DAY, endsAt: NOW + 30 * DAY, premiumPriceXaf: 1500, published: true,
  tiers: [
    { points: 100, freeReward: [{ type: "nkap", amount: 500 }], premiumReward: [{ type: "cauris", amount: 20 }] },
    { points: 300, freeReward: [], premiumReward: [{ type: "cauris", amount: 50 }] },
  ],
});
const progress = (extra = {}) => ({ ...normalizeSeasonProgress({ points: 150 }, "saison_1", "u"), ...extra });

describe("saisons", () => {
  it("phases et délai de réclamation (7 j par défaut)", () => {
    expect(seasonPhase(season, NOW - 2 * DAY)).toBe("upcoming");
    expect(seasonPhase(season, NOW)).toBe("live");
    expect(seasonPhase(season, NOW + 33 * DAY)).toBe("grace");
    expect(seasonPhase(season, NOW + 38 * DAY)).toBe("closed");
  });
  it("paliers atteints", () => {
    expect(reachedTiers(season, 99)).toBe(0);
    expect(reachedTiers(season, 300)).toBe(2);
  });
  it("réclamation : règles", () => {
    expect(canClaimTier(season, progress(), 0, "free", NOW)).toEqual({ ok: true });
    expect(canClaimTier(season, progress(), 1, "free", NOW).reason).toBe("tier_locked");
    expect(canClaimTier(season, progress(), 0, "premium", NOW).reason).toBe("premium_required");
    expect(canClaimTier(season, progress({ premium: true }), 0, "premium", NOW)).toEqual({ ok: true });
    expect(canClaimTier(season, progress({ claimedFree: [0] }), 0, "free", NOW).reason).toBe("already_claimed");
    expect(canClaimTier(season, progress({ points: 400 }), 1, "free", NOW).reason).toBe("no_reward");
    expect(canClaimTier(season, progress(), 0, "free", NOW + 33 * DAY)).toEqual({ ok: true });
    expect(canClaimTier(season, progress(), 0, "free", NOW + 40 * DAY).reason).toBe("season_closed");
  });
  it("points crédités seulement pendant la saison", () => {
    expect(seasonPointsFor(season, 25, NOW)).toBe(25);
    expect(seasonPointsFor(season, 25, NOW + 31 * DAY)).toBe(0);
    expect(seasonPointsFor({ ...season, published: false }, 25, NOW)).toBe(0);
  });
  it("validation : paliers croissants et récompenses valides", () => {
    expect(validateSeason(season, validateReward)).toEqual([]);
    const bad = { ...season, tiers: [season.tiers[1], { ...season.tiers[0], points: 200, freeReward: [{ type: "nkap" as const, amount: 0 }] }] };
    expect(validateSeason(bad, validateReward).map((i) => i.path)).toEqual(["tiers.1.points", "tiers.1.freeReward.0.amount"]);
  });
});
