import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVENT_LEADERBOARD,
  compareLeaderboardEntries,
  lastRewardedRank,
  rankEntries,
  rankRewardsFor,
  scoreEventRun,
  shouldReplaceEntry,
} from "../domain";

const board = { ...DEFAULT_EVENT_LEADERBOARD, enabled: true };
const entry = (uid: string, score: number, durationMs: number, reachedAt = 0, runId = `run_${uid}`) => ({ uid, score, durationMs, reachedAt, runId });

describe("scoreEventRun (barème 100 / 30 / 50)", () => {
  it("ne compte que les tables tant que le parcours n'est pas fini", () => {
    expect(scoreEventRun({ stagesWon: 2, completed: false, losses: 0, allowedLosses: 3 }, board).total).toBe(200);
    expect(scoreEventRun({ stagesWon: 0, completed: false, losses: 0, allowedLosses: 3 }, board).total).toBe(0);
  });
  it("ajoute vies restantes et bonus parfait à la complétion", () => {
    expect(scoreEventRun({ stagesWon: 4, completed: true, losses: 0, allowedLosses: 3 }, board)).toEqual({ stages: 400, livesLeft: 90, perfect: 50, total: 540 });
    expect(scoreEventRun({ stagesWon: 4, completed: true, losses: 2, allowedLosses: 3 }, board)).toEqual({ stages: 400, livesLeft: 30, perfect: 0, total: 430 });
  });
});

describe("ordre du classement", () => {
  it("score décroissant puis le plus rapide", () => {
    const ranked = rankEntries([entry("a", 300, 9_000), entry("b", 540, 50_000), entry("c", 300, 4_000)]);
    expect(ranked.map((e) => [e.uid, e.rank])).toEqual([["b", 1], ["c", 2], ["a", 3]]);
  });
  it("à temps égal, le premier arrivé passe devant", () => {
    expect(compareLeaderboardEntries(entry("z", 100, 10, 1), entry("a", 100, 10, 2))).toBeLessThan(0);
  });
});

describe("shouldReplaceEntry", () => {
  it("le même parcours se met à jour, un autre doit faire mieux", () => {
    expect(shouldReplaceEntry(null, entry("a", 0, 0))).toBe(true);
    expect(shouldReplaceEntry(entry("a", 200, 10), entry("a", 300, 20))).toBe(true);
    expect(shouldReplaceEntry(entry("a", 300, 10, 0, "r1"), entry("a", 200, 5, 0, "r2"))).toBe(false);
    expect(shouldReplaceEntry(entry("a", 300, 10, 0, "r1"), entry("a", 300, 5, 0, "r2"))).toBe(true);
  });
});

describe("rankRewardsFor", () => {
  const tiers = { rankRewards: [
    { fromRank: 1, toRank: 1, reward: [{ type: "cauris" as const, amount: 100 }] },
    { fromRank: 2, toRank: 10, reward: [{ type: "cauris" as const, amount: 20 }] },
  ] };
  it("trouve la tranche du rang", () => {
    expect(rankRewardsFor(1, tiers)).toEqual([{ type: "cauris", amount: 100 }]);
    expect(rankRewardsFor(7, tiers)).toEqual([{ type: "cauris", amount: 20 }]);
    expect(rankRewardsFor(11, tiers)).toEqual([]);
    expect(lastRewardedRank(tiers)).toBe(10);
  });
});
