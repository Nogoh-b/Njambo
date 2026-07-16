"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { normalizeStoredSettings } from "@/lib/settingsStorage";

export type MotionQualityPreference = "auto" | "performance" | "balanced" | "quality";

interface SettingsContextValue {
  animationsOn: boolean;
  setAnimationsOn: (enabled: boolean) => void;
  motionQuality: MotionQualityPreference;
  setMotionQuality: (quality: MotionQualityPreference) => void;
}

const STORAGE_KEY = "njambo-settings-v1";
const SettingsContext = createContext<SettingsContextValue | null>(null);

function loadSettings(): Pick<SettingsContextValue, "animationsOn" | "motionQuality"> {
  if (typeof window === "undefined") return { animationsOn: true, motionQuality: "auto" };
  try {
    return normalizeStoredSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return { animationsOn: true, motionQuality: "auto" };
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(loadSettings);
  const [animationsOn, setAnimationsOnState] = useState(initial.animationsOn);
  const [motionQuality, setMotionQualityState] = useState(initial.motionQuality);

  const persist = useCallback((next: { animationsOn: boolean; motionQuality: MotionQualityPreference }) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* stockage indisponible */ }
  }, []);
  const setAnimationsOn = useCallback((enabled: boolean) => {
    setAnimationsOnState(enabled);
    setMotionQualityState((quality) => { persist({ animationsOn: enabled, motionQuality: quality }); return quality; });
  }, [persist]);
  const setMotionQuality = useCallback((quality: MotionQualityPreference) => {
    setMotionQualityState(quality);
    setAnimationsOnState((enabled) => { persist({ animationsOn: enabled, motionQuality: quality }); return enabled; });
  }, [persist]);

  const value = useMemo(() => ({ animationsOn, setAnimationsOn, motionQuality, setMotionQuality }), [animationsOn, motionQuality, setAnimationsOn, setMotionQuality]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings doit être utilisé sous SettingsProvider");
  return value;
}
