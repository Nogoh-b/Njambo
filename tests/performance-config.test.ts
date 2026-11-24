import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../config/gameConfig";
import {
  deriveMotionLevel,
  lowerMotionLevel,
  preferenceMotionLevel,
  shouldDegradeMotion,
} from "../lib/motionPolicy";
import { normalizeStoredSettings } from "../lib/settingsStorage";
import { MOTION_DURATION_MS } from "../lib/motionTokens";

const capable = { width: 1440, height: 900, hardwareConcurrency: 8, deviceMemory: 8 };

describe("profil d'animation", () => {
  it("sélectionne le profil selon le matériel et la préférence", () => {
    expect(deriveMotionLevel(capable)).toBe("full");
    expect(deriveMotionLevel({ width: 390, height: 844, hardwareConcurrency: 4, deviceMemory: 2 })).toBe("lite");
    expect(preferenceMotionLevel("performance", capable)).toBe("lite");
    // « Auto » démarre au niveau maximal, même sur téléphone ; la baisse se fait à l'usage.
    expect(preferenceMotionLevel("auto", { width: 390, height: 844, hardwareConcurrency: 4, deviceMemory: 2 })).toBe("full");
  });

  it("dégrade après plus de 10 % de frames lentes", () => {
    expect(shouldDegradeMotion(100, 11)).toBe(true);
    expect(shouldDegradeMotion(100, 10)).toBe(false);
    expect(lowerMotionLevel("full")).toBe("balanced");
    expect(lowerMotionLevel("balanced")).toBe("lite");
  });

  it("normalise les réglages persistés", () => {
    expect(normalizeStoredSettings({ animationsOn: false, motionQuality: "quality" })).toEqual({
      animationsOn: false,
      motionQuality: "quality",
    });
    expect(normalizeStoredSettings({ motionQuality: "inconnu" })).toEqual({ animationsOn: true, motionQuality: "auto" });
  });
});

describe("budgets d'animation partagés", () => {
  it("respecte les cinq budgets d'interaction du shell", () => {
    expect(MOTION_DURATION_MS.press).toBeGreaterThanOrEqual(90);
    expect(MOTION_DURATION_MS.press).toBeLessThanOrEqual(120);
    expect(MOTION_DURATION_MS.interaction).toBeGreaterThanOrEqual(160);
    expect(MOTION_DURATION_MS.interaction).toBeLessThanOrEqual(200);
    expect(MOTION_DURATION_MS.navigation).toBeGreaterThanOrEqual(220);
    expect(MOTION_DURATION_MS.navigation).toBeLessThanOrEqual(280);
    expect(MOTION_DURATION_MS.panel).toBeGreaterThanOrEqual(280);
    expect(MOTION_DURATION_MS.panel).toBeLessThanOrEqual(360);
    expect(MOTION_DURATION_MS.flip).toBeGreaterThanOrEqual(520);
    expect(MOTION_DURATION_MS.flip).toBeLessThanOrEqual(700);
  });

  it("laisse lire les coups IA dans le budget du plus court tour", () => {
    const anim = GAME_CONFIG.anim;
    expect(anim.replayBotThinkMin).toBeGreaterThanOrEqual(500);
    expect(anim.replayBotThinkMax).toBeGreaterThanOrEqual(anim.replayBotThinkMin);
    expect(anim.botAfterPlay).toBeGreaterThanOrEqual(250);
    expect(anim.replayBotThinkMax + anim.dropFlight + anim.landSettle + anim.botAfterPlay + anim.trickPause).toBeLessThan(5000);
  });

  it("borne les caches du service worker", () => {
    const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
    expect(serviceWorker).toContain("trim(STATIC_CACHE, 120)");
    expect(serviceWorker).toContain("trim(IMAGE_CACHE, 320)");
    expect(serviceWorker).toContain("url.pathname.startsWith(\"/api/\")");
  });
});
