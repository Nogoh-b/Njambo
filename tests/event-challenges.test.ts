import { describe, expect, it } from "vitest";
import { DEFAULT_EVENTS, challengeRunScore, decideChallenge, isRunFinished } from "../domain";

const event = { ...DEFAULT_EVENTS[0], leaderboard: { ...DEFAULT_EVENTS[0].leaderboard } }; // 4 tables, 3 vies, barème 100/30/50

describe("défis entre amis", () => {
  it("score d'un parcours : tables, vies restantes et parfait à l'arrivée", () => {
    expect(challengeRunScore({ status: "eliminated", stageIndex: 2, losses: 3, createdAt: 0, updatedAt: 60_000 }, event)).toEqual({ score: 200, stagesWon: 2, durationMs: 60_000, finished: true });
    expect(challengeRunScore({ status: "completed", stageIndex: 3, losses: 0, createdAt: 0, completedAt: 90_000 }, event).score).toBe(540);
    expect(challengeRunScore({ status: "active", stageIndex: 1, losses: 1, createdAt: 0, updatedAt: 1 }, event).finished).toBe(false);
  });
  it("vainqueur : score puis rapidité, égalité parfaite = nul", () => {
    const side = (uid: string, score: number, durationMs: number) => ({ uid, score, durationMs, stagesWon: 0, finished: true });
    expect(decideChallenge(side("a", 300, 10), side("b", 200, 1))).toBe("a");
    expect(decideChallenge(side("a", 300, 10), side("b", 300, 5))).toBe("b");
    expect(decideChallenge(side("a", 300, 10), side("b", 300, 10))).toBeNull();
    expect(decideChallenge(null, side("b", 0, 0))).toBe("b");
    expect(decideChallenge(null, null)).toBeNull();
  });
  it("statuts de fin de parcours", () => {
    expect(["completed", "eliminated", "left", "active", "matchmaking"].map(isRunFinished)).toEqual([true, true, true, false, false]);
  });
});
