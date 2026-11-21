import { describe, expect, it } from "vitest";
import { DEFAULT_GAMEPLAY_CONFIG, matchCountFor, normalizeGameplayConfig, seriesWinner, validateGameplayConfig } from "../domain/gameplayConfig";
import { normalizeEventStage, validateEventVersion } from "../domain/eventConfig";
import { DEFAULT_EVENTS } from "../domain/events";

describe("réglages des tables", () => {
  it("conserve les anciennes parties avec une seule manche et trois pouvoirs", () => {
    expect(normalizeGameplayConfig(undefined)).toEqual(DEFAULT_GAMEPLAY_CONFIG);
    expect(normalizeEventStage({}, 0).matchCount).toBeUndefined();
  });
  it("résout le nombre de manches selon le mode et le nombre de joueurs", () => {
    const config = normalizeGameplayConfig({ matchesByMode: { bot: { 2: 3, 3: 5, 4: 7 }, friends: { 2: 9 } } });
    expect([2, 3, 4].map((count) => matchCountFor(config, "bot", count))).toEqual([3, 5, 7]);
    expect(matchCountFor(config, "friends", 2)).toBe(9);
    expect(matchCountFor(config, "online", 2)).toBe(1);
  });
  it("refuse les réglages incomplets, fractionnaires et hors limites", () => {
    expect(validateGameplayConfig(DEFAULT_GAMEPLAY_CONFIG)).toBe(true);
    for (const maxEquippedPowers of [-1, 9, 2.5, "3"]) expect(validateGameplayConfig({ ...DEFAULT_GAMEPLAY_CONFIG, maxEquippedPowers })).toBe(false);
    expect(validateGameplayConfig({ ...DEFAULT_GAMEPLAY_CONFIG, turnSeconds: 4 })).toBe(false);
    expect(validateGameplayConfig({ matchesByMode: {} })).toBe(false);
    expect(validateGameplayConfig({ ...DEFAULT_GAMEPLAY_CONFIG, maxEquippedPowers: 0 })).toBe(true);
  });
  it("valide les manches configurées dans une table d’événement", () => {
    const event = structuredClone(DEFAULT_EVENTS[0]);
    event.stages[0].matchCount = 0;
    expect(validateEventVersion(event).some((issue) => issue.path === "stages.0.matchCount")).toBe(true);
    event.stages[0].matchCount = 3;
    expect(validateEventVersion(event).some((issue) => issue.path === "stages.0.matchCount")).toBe(false);
  });
  it("le score total désigne le gagnant et la dernière victoire départage", () => {
    expect(seriesWinner(["a", "a", "b"], ["a", "b"])).toBe("a");
    expect(seriesWinner(["a", "b", "a", "b"], ["a", "b"])).toBe("b");
    expect(seriesWinner(["a", "a", "b"], ["b"])).toBe("b");
  });
});
