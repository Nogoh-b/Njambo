"use client";

/* ═══════════════ Store client des bordures & particules des cartes Pouvoir ═══════════════
   - Réglage global : synchronisé en temps réel depuis `runtime_config/asset_pack`
     (champ `powerBorder`) via `useAssetPackSync`, avec persistance `localStorage` +
     synchronisation inter-onglets.
   - Préférence joueur : interrupteur local « Particules sur les cartes » (Options),
     permettant à chaque joueur de couper les particules sans affecter les bordures. */

import { useSyncExternalStore } from "react";
import {
  DEFAULT_POWER_BORDER_CONFIG,
  readPowerBorderConfig,
  type PowerBorderConfig,
} from "@/domain/powerBorders";

const STORAGE_KEY = "njambo-power-border";
const PLAYER_PARTICLES_KEY = "njambo-player-card-particles";

let current: PowerBorderConfig = DEFAULT_POWER_BORDER_CONFIG;
let playerParticlesEnabled = true;
const listeners = new Set<() => void>();
const playerListeners = new Set<() => void>();
let started = false;

function sameConfig(a: PowerBorderConfig, b: PowerBorderConfig): boolean {
  return (
    a.border === b.border &&
    a.particles === b.particles &&
    a.onPortrait === b.onPortrait &&
    a.textLayout === b.textLayout
  );
}

function readStored(): PowerBorderConfig | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return readPowerBorderConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readStoredPlayerParticles(): boolean {
  try {
    const raw = window.localStorage.getItem(PLAYER_PARTICLES_KEY);
    if (raw === "0" || raw === "false") return false;
    return true;
  } catch {
    return true;
  }
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const cached = readStored();
  if (cached) current = cached;
  playerParticlesEnabled = readStoredPlayerParticles();
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      const next = readStored() ?? DEFAULT_POWER_BORDER_CONFIG;
      if (sameConfig(current, next)) return;
      current = next;
      listeners.forEach((listener) => listener());
    } else if (event.key === PLAYER_PARTICLES_KEY) {
      const next = readStoredPlayerParticles();
      if (next === playerParticlesEnabled) return;
      playerParticlesEnabled = next;
      playerListeners.forEach((listener) => listener());
    }
  });
}

start();

export function getPowerBorderConfig(): PowerBorderConfig {
  return current;
}

export function setPowerBorderConfig(next: Partial<PowerBorderConfig>, persist = true): void {
  const merged = readPowerBorderConfig({ ...current, ...next });
  if (persist && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      /* stockage indisponible (navigation privée / quota) */
    }
  }
  if (sameConfig(current, merged)) return;
  current = merged;
  listeners.forEach((listener) => listener());
}

/** Applique le document `runtime_config/asset_pack` reçu du serveur. */
export function applyPowerBorderDoc(data: unknown): void {
  setPowerBorderConfig(readPowerBorderConfig(data));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

export function usePowerBorderConfig(): PowerBorderConfig {
  return useSyncExternalStore(subscribe, getPowerBorderConfig, () => DEFAULT_POWER_BORDER_CONFIG);
}

/* ── Préférence locale du joueur : activer / désactiver les particules des cartes ── */

export function getPlayerCardParticlesEnabled(): boolean {
  return playerParticlesEnabled;
}

export function setPlayerCardParticlesEnabled(enabled: boolean, persist = true): void {
  const next = Boolean(enabled);
  if (persist && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PLAYER_PARTICLES_KEY, next ? "1" : "0");
    } catch {
      /* stockage indisponible */
    }
  }
  if (next === playerParticlesEnabled) return;
  playerParticlesEnabled = next;
  playerListeners.forEach((listener) => listener());
}

function subscribePlayerParticles(listener: () => void) {
  playerListeners.add(listener);
  start();
  return () => {
    playerListeners.delete(listener);
  };
}

export function usePlayerCardParticlesEnabled(): boolean {
  return useSyncExternalStore(subscribePlayerParticles, getPlayerCardParticlesEnabled, () => true);
}
