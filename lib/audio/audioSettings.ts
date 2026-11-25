/* ═══════════════ Préférences audio persistées (localStorage) ═══════════════
   Séparé de `lib/settingsStorage.ts` (animations) pour garder chaque réglage
   indépendant et rétrocompatible. */

export interface StoredAudioSettings {
  musicOn: boolean;
  sfxOn: boolean;
  /** Volume du bus Musique (0..1). */
  musicVolume: number;
  /** Volume du bus Effets sonores (0..1). */
  sfxVolume: number;
}

export const AUDIO_STORAGE_KEY = "njambo-audio-v1";

export const DEFAULT_AUDIO_SETTINGS: StoredAudioSettings = {
  musicOn: true,
  sfxOn: true,
  musicVolume: 0.55,
  sfxVolume: 0.9,
};

function clamp01(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

export function normalizeAudioSettings(value: unknown): StoredAudioSettings {
  const candidate = value && typeof value === "object" ? (value as Partial<StoredAudioSettings>) : {};
  return {
    musicOn: typeof candidate.musicOn === "boolean" ? candidate.musicOn : DEFAULT_AUDIO_SETTINGS.musicOn,
    sfxOn: typeof candidate.sfxOn === "boolean" ? candidate.sfxOn : DEFAULT_AUDIO_SETTINGS.sfxOn,
    musicVolume: clamp01(candidate.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume),
    sfxVolume: clamp01(candidate.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume),
  };
}

export function loadAudioSettings(): StoredAudioSettings {
  if (typeof window === "undefined") return { ...DEFAULT_AUDIO_SETTINGS };
  try {
    const raw = window.localStorage.getItem(AUDIO_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };
    return normalizeAudioSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function saveAudioSettings(settings: StoredAudioSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(normalizeAudioSettings(settings)));
  } catch {
    // Stockage indisponible (navigation privée / quota)
  }
}
