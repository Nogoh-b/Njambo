import { describe, expect, it } from "vitest";
import { WHEEL_REWARDS } from "../domain/catalog";
import {
  SEGMENT_DEG,
  WHEEL_ORDER,
  decelDuration,
  decelProgress,
  mod360,
  restingAngleFor,
  segmentIndexForReward,
  travelTo,
} from "../lib/fortuneWheel";

/** Case sous l'aiguille (12 h) pour une rotation donnée du disque. */
function segmentUnderPointer(rotation: number): number {
  return Math.round(mod360(-rotation) / SEGMENT_DEG) % WHEEL_ORDER.length;
}

describe("roue des retrouvailles", () => {
  it("place chaque lot du catalogue sur exactement une case", () => {
    expect([...WHEEL_ORDER].sort()).toEqual(WHEEL_REWARDS.map((_, i) => i));
    WHEEL_REWARDS.forEach(({ value }) => {
      expect(segmentIndexForReward(value)).toBeGreaterThanOrEqual(0);
    });
    expect(segmentIndexForReward({ type: "nkap", amount: 9999 })).toBe(-1);
  });

  it("s'arrête toujours sur la case du lot gagné, même avec le décalage aléatoire", () => {
    WHEEL_REWARDS.forEach(({ value }) => {
      const segment = segmentIndexForReward(value);
      for (const jitter of [-1, -0.5, 0, 0.5, 1]) {
        const start = 123.4;
        const final = start + travelTo(start, restingAngleFor(segment, jitter), 720);
        expect(segmentUnderPointer(final)).toBe(segment);
      }
    });
  });

  it("fait au moins deux tours avant de s'arrêter", () => {
    expect(travelTo(10, 20, 720)).toBeGreaterThanOrEqual(720);
    expect(mod360(10 + travelTo(10, 20, 720))).toBeCloseTo(20);
  });

  it("décélère en douceur, sans à-coup de vitesse au début", () => {
    expect(decelProgress(0)).toBe(0);
    expect(decelProgress(1)).toBe(1);
    // Vitesse initiale de la courbe (4 Δ / D) = vitesse de croisière.
    const travel = 900;
    const v0 = 560;
    const duration = decelDuration(travel, v0);
    const dt = 1e-4;
    const speed = (travel * decelProgress(dt / duration)) / dt;
    expect(speed).toBeCloseTo(v0, 0);
    // Durée de ralentissement lisible : entre 5 et 8 secondes.
    expect(decelDuration(720, v0)).toBeGreaterThan(5);
    expect(decelDuration(1080, v0)).toBeLessThan(8);
  });
});
