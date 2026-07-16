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

const capable = { width: 1440, height: 900, hardwareConcurrency: 8, deviceMemory: 8 };

describe("profil d'animation", () => {
  it("sélectionne le profil selon le matériel et la préférence", () => {
    expect(deriveMotionLevel(capable)).toBe("full");
    expect(deriveMotionLevel({ width: 390, height: 844, hardwareConcurrency: 4, deviceMemory: 2 })).toBe("lite");
    expect(preferenceMotionLevel("performance", capable)).toBe("lite");
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
  it("conserve les durées synchronisées prévues", () => {
    expect(GAME_CONFIG.anim).toMatchObject({
      navigation: 160,
      roundIntro: 1200,
      dealPerCard: 80,
      dealFlight: 420,
      dropFlight: 380,
      landSettle: 140,
      trickPause: 950,
      moment: 1100,
      powerMax: 1600,
    });
  });

  it("borne les caches du service worker", () => {
    const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
    expect(serviceWorker).toContain("trim(STATIC_CACHE, 120)");
    expect(serviceWorker).toContain("trim(IMAGE_CACHE, 40)");
    expect(serviceWorker).toContain("url.pathname.startsWith(\"/api/\")");
  });
});
