export type StoredMotionQuality = "auto" | "performance" | "balanced" | "quality";

export interface StoredSettings {
  animationsOn: boolean;
  motionQuality: StoredMotionQuality;
}

const MOTION_QUALITIES: StoredMotionQuality[] = ["auto", "performance", "balanced", "quality"];

export function normalizeStoredSettings(value: unknown): StoredSettings {
  const candidate = value && typeof value === "object" ? value as Partial<StoredSettings> : {};
  const motionQuality = MOTION_QUALITIES.includes(candidate.motionQuality as StoredMotionQuality)
    ? candidate.motionQuality as StoredMotionQuality
    : "auto";
  return { animationsOn: candidate.animationsOn !== false, motionQuality };
}
