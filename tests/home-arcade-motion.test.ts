import { describe, expect, it } from "vitest";
import {
  HOME_MOTION_FEATURES,
  getBottomNavVisual,
  getHomeResourceChange,
  normalizeBottomNavActive,
  resolveHomeMotionMode,
  type BottomNavKey,
  type HomeResourceKind,
} from "../lib/homeArcadeMotion";

describe("navigation arcade de l'accueil", () => {
  it("associe chaque onglet principal à son index et sa teinte", () => {
    expect(getBottomNavVisual("menu")).toMatchObject({ index: 0, tone: "gold" });
    expect(getBottomNavVisual("play")).toMatchObject({ index: 1, tone: "teal" });
    expect(getBottomNavVisual("events")).toMatchObject({ index: 2, tone: "pink" });
    expect(getBottomNavVisual("shop")).toMatchObject({ index: 3, tone: "gold" });
    expect(getBottomNavVisual("social")).toMatchObject({ index: 4, tone: "palm" });
  });

  it("normalise toutes les scènes sociales vers le même indicateur", () => {
    const socialScenes: BottomNavKey[] = ["players", "notifications", "messages", "friends"];
    for (const scene of socialScenes) {
      expect(normalizeBottomNavActive(scene)).toBe("social");
      expect(getBottomNavVisual(scene)).toMatchObject({ key: "social", index: 4, tone: "palm" });
    }
    expect(getBottomNavVisual()).toBeNull();
  });
});

describe("dégradation des effets arcade", () => {
  it("active toutes les familles uniquement en full", () => {
    expect(HOME_MOTION_FEATURES.full).toMatchObject({
      reactions: true,
      entrances: true,
      decorativeLoops: true,
      complexHalos: true,
      ambientSparkCount: 6,
      fallingCardCount: 14,
    });
  });

  it("réduit balanced puis limite lite aux réactions", () => {
    expect(HOME_MOTION_FEATURES.balanced).toMatchObject({
      reactions: true,
      decorativeLoops: true,
      complexHalos: false,
      ambientSparkCount: 3,
      fallingCardCount: 8,
    });
    expect(HOME_MOTION_FEATURES.balanced.loopDurationMultiplier).toBeGreaterThan(1);
    expect(HOME_MOTION_FEATURES.lite).toMatchObject({
      reactions: true,
      entrances: false,
      decorativeLoops: false,
      ambientSparkCount: 0,
      fallingCardCount: 0,
    });
  });

  it("coupe tout mouvement quand les animations sont désactivées", () => {
    expect(resolveHomeMotionMode(false, "full")).toBe("off");
    expect(HOME_MOTION_FEATURES.off).toMatchObject({
      reactions: false,
      entrances: false,
      decorativeLoops: false,
      complexHalos: false,
      ambientSparkCount: 0,
    });
  });
});

describe("réactions des ressources", () => {
  const resources: HomeResourceKind[] = ["energy", "nkap", "cauris"];

  it("détecte les gains et dépenses des trois ressources", () => {
    for (const kind of resources) {
      expect(getHomeResourceChange(kind, 100, 125, "full")).toEqual({ kind, direction: "gain", delta: 25 });
      expect(getHomeResourceChange(kind, 100, 70, "lite")).toEqual({ kind, direction: "spend", delta: -30 });
    }
  });

  it("ignore l'initialisation, les valeurs identiques et le profil off", () => {
    expect(getHomeResourceChange("energy", null, 100, "full")).toBeNull();
    expect(getHomeResourceChange("nkap", 100, 100, "balanced")).toBeNull();
    expect(getHomeResourceChange("cauris", 100, 120, "off")).toBeNull();
  });
});
