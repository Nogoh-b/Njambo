"use client";

/* ═══════════════ Store client du catalogue audio global ═══════════════
   Alimenté en temps réel depuis `runtime_config/audio_catalog` par
   `useAudioCatalogSync`. Permet à chaque écran du jeu de jouer un moment
   sonore par son identifiant (`playGameSound("shop_item_click")`), en
   appliquant instantanément les fichiers, volumes et coupures réglés dans
   la console admin « Sons & Audio ». */

import { useSyncExternalStore } from "react";
import {
  EMPTY_AUDIO_CATALOG_CONFIG,
  GAME_SOUND_BY_ID,
  normalizeAudioCatalogConfig,
  type AudioCatalogConfig,
  type GameSoundId,
} from "@/domain/audioCatalog";
import { audioEngine, type SfxPlayOptions } from "./AudioEngine";

let currentConfig: AudioCatalogConfig = EMPTY_AUDIO_CATALOG_CONFIG;
const listeners = new Set<() => void>();

export function getAudioCatalogConfig(): AudioCatalogConfig {
  return currentConfig;
}

export function setAudioCatalogConfig(next: AudioCatalogConfig): void {
  const normalized = normalizeAudioCatalogConfig(next);
  currentConfig = normalized;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAudioCatalogConfig(): AudioCatalogConfig {
  return useSyncExternalStore(subscribe, getAudioCatalogConfig, () => EMPTY_AUDIO_CATALOG_CONFIG);
}

export interface ResolvedGameSound {
  id: GameSoundId;
  enabled: boolean;
  url: string | null;
  pool?: readonly string[];
  volume: number;
  customized: boolean;
  pitchJitter?: number;
  minGapMs?: number;
  maxPolyphony?: number;
  duckMusicMs?: number;
  duckDepth?: number;
  crossfadeMs?: number;
}

/** Résout un emplacement sonore en combinant le défaut du code et la surcharge admin active. */
export function resolveGameSound(
  id: GameSoundId,
  config: AudioCatalogConfig = currentConfig,
): ResolvedGameSound {
  const slot = GAME_SOUND_BY_ID[id];
  const override = config.slots[id];
  const enabled = override?.enabled !== false;
  const customUrl = override?.url;
  const url = customUrl ?? slot.defaultUrl;
  const pool = customUrl ? undefined : slot.defaultPool;
  const volume = override?.volume ?? slot.defaultVolume;
  const customized = Boolean(customUrl || override?.volume !== undefined || override?.enabled === false);

  return {
    id,
    enabled,
    url,
    pool,
    volume,
    customized,
    pitchJitter: slot.pitchJitter,
    minGapMs: slot.minGapMs,
    maxPolyphony: slot.maxPolyphony,
    duckMusicMs: slot.duckMusicMs,
    duckDepth: slot.duckDepth,
    crossfadeMs: slot.crossfadeMs,
  };
}

/** Joue un effet sonore du jeu en tenant compte des réglages admin en direct. */
export function playGameSound(
  id: GameSoundId,
  overrides: Partial<Omit<SfxPlayOptions, "url">> = {},
): void {
  const resolved = resolveGameSound(id);
  if (!resolved.enabled || !resolved.url) return;
  void audioEngine.playSfx({
    url: resolved.url,
    pool: resolved.pool,
    volume: (overrides.volume ?? 1) * resolved.volume,
    pitchJitter: overrides.pitchJitter ?? resolved.pitchJitter,
    pan: overrides.pan,
    minGapMs: overrides.minGapMs ?? resolved.minGapMs,
    maxPolyphony: overrides.maxPolyphony ?? resolved.maxPolyphony,
    duckMusicMs: overrides.duckMusicMs ?? resolved.duckMusicMs,
    duckDepth: overrides.duckDepth ?? resolved.duckDepth,
    maxLoadDelayMs: overrides.maxLoadDelayMs,
  });
}

/** Spécification de piste musicale résolue depuis le catalogue admin (`music_salon` / `music_table`). */
export function resolveMusicTrack(
  id: "music_salon" | "music_table",
  config: AudioCatalogConfig = currentConfig,
): { trackUrl: string | null; volume: number; crossfadeMs: number; enabled: boolean } {
  const resolved = resolveGameSound(id, config);
  return {
    trackUrl: resolved.enabled ? resolved.url : null,
    volume: resolved.volume,
    crossfadeMs: resolved.crossfadeMs ?? 1300,
    enabled: resolved.enabled,
  };
}
