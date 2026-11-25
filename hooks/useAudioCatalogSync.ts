"use client";

/* Suit le catalogue audio publié depuis la Régie du Ter (`runtime_config/audio_catalog`).
   À monter à la racine de l'application (`NjamboApp`) et dans la console admin. */

import { useEffect } from "react";
import { AUDIO_CATALOG_DOC, normalizeAudioCatalogConfig } from "@/domain/audioCatalog";
import { setAudioCatalogConfig, useAudioCatalogConfig } from "@/lib/audio/audioCatalogStore";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/firestoreClient";

export function useAudioCatalogSync() {
  useEffect(() => {
    try {
      return onSnapshot(
        doc(db, "runtime_config", AUDIO_CATALOG_DOC),
        (snapshot) => {
          setAudioCatalogConfig(normalizeAudioCatalogConfig(snapshot.exists() ? snapshot.data() : undefined));
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
