import { describe, expect, it } from "vitest";
import { getBottomNavVisual, resolveSceneBottomNav } from "../lib/homeArcadeMotion";
import { LAYOUT_BREAKPOINTS, LAYOUT_SIZES } from "../lib/layout";

describe("fondation responsive", () => {
  it("expose les seuils validés et les cibles tactiles", () => {
    expect(LAYOUT_BREAKPOINTS).toEqual({ mobileMin: 320, tabletMin: 600, desktopMin: 960 });
    expect(LAYOUT_SIZES.touchTargetMin).toBeGreaterThanOrEqual(44);
    expect(LAYOUT_SIZES.dockContentHeight).toBeGreaterThanOrEqual(44);
  });

  it("conserve une section active cohérente dans les sous-écrans", () => {
    expect(resolveSceneBottomNav("menu")).toBe("menu");
    expect(resolveSceneBottomNav("power_collection")).toBe("shop");
    expect(resolveSceneBottomNav("public_profile")).toBe("social");
    expect(getBottomNavVisual("notifications")).toMatchObject({ key: "social", index: 4 });
  });

  it("rattache chaque étape de préparation à Jouer", () => {
    for (const scene of ["bot_setup", "online_setup", "friends_invite", "lobby"] as const) {
      expect(resolveSceneBottomNav(scene)).toBe("play");
    }
  });
});
