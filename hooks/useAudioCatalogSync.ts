"use client";

/* Suit le catalogue audio publié depuis la Régie du Ter (`runtime_config/audio_catalog`).
   À monter à la racine de l'application (`NjamboApp`) et dans la console admin. */

import { useEffect } from "react";
import { AUDIO_CATALOG_DOC, GAME_SOUND_BY_ID, normalizeAudioCatalogConfig, type GameSoundId } from "@/domain/audioCatalog";
import { audioAsset, prefetchAssets } from "@/lib/assets/AssetLoader";
import { setAudioCatalogConfig, useAudioCatalogConfig } from "@/lib/audio/audioCatalogStore";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/firestoreClient";

export function useAudioCatalogSync() {
  useEffect(() => {
    try {
      return onSnapshot(
        doc(db, "runtime_config", AUDIO_CATALOG_DOC),
        (snapshot) => {
          const normalized = normalizeAudioCatalogConfig(snapshot.exists() ? snapshot.data() : undefined);
          setAudioCatalogConfig(normalized);
          const customSfx = Object.entries(normalized.slots)
            .filter(([id, override]) => GAME_SOUND_BY_ID[id as GameSoundId]?.kind === "sfx" && override?.enabled !== false && Boolean(override?.url))
            .map(([, override]) => audioAsset(override?.url));
          if (customSfx.length > 0) prefetchAssets(customSfx);
        },
        () => {
          /* hors ligne : conserve les réglages par défaut / derniers connus */
        },
      );
    } catch {
      return undefined;
    }
  }, []);
  return useAudioCatalogConfig();
}
