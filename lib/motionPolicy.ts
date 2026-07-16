import type { MotionQualityPreference } from "@/contexts/SettingsContext";

export type MotionLevel = "full" | "balanced" | "lite";

export interface MotionCapabilities {
  width: number;
  height: number;
  hardwareConcurrency: number;
  deviceMemory: number | null;
}

const LEVEL_WEIGHT: Record<MotionLevel, number> = { lite: 0, balanced: 1, full: 2 };

export function deriveMotionLevel({ width, height, hardwareConcurrency, deviceMemory }: MotionCapabilities): MotionLevel {
  const smallestSide = Math.min(width, height);
  const isCompact = width < 640 || smallestSide < 430;
  const lowCpu = hardwareConcurrency <= 4;
  const mediumCpu = hardwareConcurrency <= 6;
  const lowMemory = deviceMemory != null && deviceMemory <= 2;
  const mediumMemory = deviceMemory != null && deviceMemory <= 4;

  if ((isCompact && (lowCpu || lowMemory)) || (lowCpu && lowMemory)) return "lite";
  if (isCompact || mediumCpu || mediumMemory) return "balanced";
  return "full";
}

export function preferenceMotionLevel(preference: MotionQualityPreference, capabilities: MotionCapabilities): MotionLevel {
  if (preference === "performance") return "lite";
  if (preference === "balanced") return "balanced";
  if (preference === "quality") return "full";
  return deriveMotionLevel(capabilities);
}

export function lowerMotionLevel(level: MotionLevel): MotionLevel {
  return level === "full" ? "balanced" : "lite";
}

export function lowestMotionLevel(left: MotionLevel, right: MotionLevel): MotionLevel {
  return LEVEL_WEIGHT[left] <= LEVEL_WEIGHT[right] ? left : right;
}

export function shouldDegradeMotion(totalFrames: number, slowFrames: number): boolean {
  return totalFrames > 20 && slowFrames / totalFrames > 0.1;
}
