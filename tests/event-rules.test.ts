import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVENT_REVIVE,
  DEFAULT_EVENT_LEADERBOARD,
  canRevive,
  difficultyForBotLevel,
  isPerfectRun,
  revivePrice,
  scoreEventRun,
  stageMatchRules,
} from "../domain";

const stage = { stakeNkap: 100, powersAllowed: true, modifiers: [] as Array<"no_powers" | "double_stake" | "turn_timer">, difficulty: "normal" as const, boss: undefined, turnTimerSeconds: undefined };
const revive = { ...DEFAULT_EVENT_REVIVE, enabled: true };
const NOW = 1_000_000_000;

describe("stageMatchRules", () => {
  it("table normale : valeurs par défaut", () => {
    expect(stageMatchRules(stage, 15)).toEqual({ stakeNkap: 100, powersDisabled: false, turnSeconds: 15, botDifficulty: "normal", modifiers: [], boss: null });
  });
  it("applique mise ×2, pouvoirs interdits et minuteur", () => {
    const rules = stageMatchRules({ ...stage, modifiers: ["double_stake", "no_powers", "turn_timer"], turnTimerSeconds: 8 }, 15);
    expect(rules).toMatchObject({ stakeNkap: 200, powersDisabled: true, turnSeconds: 8 });
  });
  it("le boss impose son niveau d'IA", () => {
    expect(stageMatchRules({ ...stage, difficulty: "facile", boss: { name: "Patriarche", botLevel: 5 } }, 15).botDifficulty).toBe("hard");
    expect(stageMatchRules({ ...stage, difficulty: "elite" }, 15).botDifficulty).toBe("hard");
    expect([1, 2, 3, 4, 5].map(difficultyForBotLevel)).toEqual(["easy", "easy", "normal", "hard", "hard"]);
  });
});

describe("rachat de vie", () => {
  it("prix successifs, le dernier se répète", () => {
    expect([0, 1, 2, 5].map((used) => revivePrice(used, { pricesCauris: [20, 40] }))).toEqual([20, 40, 40, 40]);
  });
  it("autorisé dans la fenêtre, sous le maximum", () => {
    const run = { status: "eliminated", eliminatedAt: NOW, revivesUsed: 0 };
    expect(canRevive(run, revive, NOW + 60_000)).toMatchObject({ ok: true, price: 20, remaining: 2, expiresAt: NOW + 600_000 });
    expect(canRevive({ ...run, revivesUsed: 1 }, revive, NOW).price).toBe(40);
  });
  it("refusé hors conditions", () => {
    const run = { status: "eliminated", eliminatedAt: NOW, revivesUsed: 0 };
    expect(canRevive(run, DEFAULT_EVENT_REVIVE, NOW).reason).toBe("disabled");
    expect(canRevive({ ...run, status: "active" }, revive, NOW).reason).toBe("not_eliminated");
    expect(canRevive({ ...run, revivesUsed: 2 }, revive, NOW).reason).toBe("max_reached");
    expect(canRevive(run, revive, NOW + 600_001).reason).toBe("window_expired");
    expect(canRevive({ ...run, eliminatedAt: null }, revive, NOW).reason).toBe("window_expired");
  });
});

describe("parcours parfait", () => {
  it("aucune vie perdue ni rachetée", () => {
    expect(isPerfectRun({ losses: 0 })).toBe(true);
    expect(isPerfectRun({ losses: 0, revivesUsed: 1 })).toBe(false);
    const board = { ...DEFAULT_EVENT_LEADERBOARD };
    expect(scoreEventRun({ stagesWon: 4, completed: true, losses: 0, allowedLosses: 1, revivesUsed: 1 }, board).perfect).toBe(0);
  });
});
