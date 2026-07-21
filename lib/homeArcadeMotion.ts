import type { MotionLevel } from "@/lib/motionPolicy";
import type { SceneName } from "@/types/game";

export type HomeMotionMode = MotionLevel | "off";
export type HomeResourceKind = "energy" | "nkap" | "cauris";
export type BottomNavTone = "gold" | "teal" | "pink" | "cobalt" | "palm";
export type BottomNavKey = "menu" | "play" | "events" | "shop" | "social" | "players" | "notifications" | "messages" | "friends";
export type MainBottomNavKey = "menu" | "play" | "events" | "shop" | "social";

export interface HomeMotionFeatures {
  reactions: boolean;
  entrances: boolean;
  decorativeLoops: boolean;
  complexHalos: boolean;
  ambientSparkCount: number;
  loopDurationMultiplier: number;
}

export const HOME_MOTION_FEATURES: Record<HomeMotionMode, HomeMotionFeatures> = {
  full: {
    reactions: true,
    entrances: true,
    decorativeLoops: true,
    complexHalos: true,
    ambientSparkCount: 6,
    loopDurationMultiplier: 1,
  },
  balanced: {
    reactions: true,
    entrances: true,
    decorativeLoops: true,
    complexHalos: false,
    ambientSparkCount: 3,
    loopDurationMultiplier: 1.8,
  },
  lite: {
    reactions: true,
    entrances: false,
    decorativeLoops: false,
    complexHalos: false,
    ambientSparkCount: 0,
    loopDurationMultiplier: 0,
  },
  off: {
    reactions: false,
    entrances: false,
    decorativeLoops: false,
    complexHalos: false,
    ambientSparkCount: 0,
    loopDurationMultiplier: 0,
  },
};

const MAIN_NAV: ReadonlyArray<{ key: MainBottomNavKey; tone: BottomNavTone }> = [
  { key: "menu", tone: "gold" },
  { key: "play", tone: "teal" },
  { key: "events", tone: "pink" },
  { key: "shop", tone: "cobalt" },
  { key: "social", tone: "palm" },
];

const SOCIAL_NAV_KEYS = new Set<BottomNavKey>(["social", "players", "notifications", "messages", "friends"]);

const SCENE_NAV_SECTION: Partial<Record<SceneName, MainBottomNavKey>> = {
  menu: "menu",
  profile: "menu",
  leaderboard: "menu",
  options: "menu",
  history: "menu",
  rules: "menu",
  play: "play",
  bot_setup: "play",
  online_setup: "play",
  friends_invite: "play",
  lobby: "play",
  events: "events",
  shop: "shop",
  power_shop: "shop",
  power_collection: "shop",
  wallet: "shop",
  friends: "social",
  players: "social",
  friend_requests: "social",
  notifications: "social",
  messages: "social",
  chat: "social",
  public_profile: "social",
};

export function resolveHomeMotionMode(enabled: boolean, level: MotionLevel): HomeMotionMode {
  return enabled ? level : "off";
}

export function normalizeBottomNavActive(active?: BottomNavKey): MainBottomNavKey | undefined {
  if (!active) return undefined;
  return SOCIAL_NAV_KEYS.has(active) ? "social" : active as MainBottomNavKey;
}

export function resolveSceneBottomNav(scene: SceneName): MainBottomNavKey | undefined {
  return SCENE_NAV_SECTION[scene];
}

export function getBottomNavVisual(active?: BottomNavKey): { key: MainBottomNavKey; index: number; tone: BottomNavTone } | null {
  const normalized = normalizeBottomNavActive(active);
  if (!normalized) return null;
  const index = MAIN_NAV.findIndex((item) => item.key === normalized);
  if (index < 0) return null;
  return { ...MAIN_NAV[index], index };
}

export interface HomeResourceChange {
  kind: HomeResourceKind;
  direction: "gain" | "spend";
  delta: number;
}

export function getHomeResourceChange(
  kind: HomeResourceKind,
  previous: number | null,
  current: number,
  motionMode: HomeMotionMode,
): HomeResourceChange | null {
  if (!HOME_MOTION_FEATURES[motionMode].reactions || previous === null || previous === current) return null;
  return {
    kind,
    direction: current > previous ? "gain" : "spend",
    delta: current - previous,
  };
}
