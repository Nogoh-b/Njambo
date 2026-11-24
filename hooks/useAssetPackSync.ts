"use client";

/* Suit les packs d'assets choisis dans l'admin (runtime_config/asset_pack) :
   assets système et interface. À monter une seule fois, à la racine de l'application. */

import { useEffect } from "react";
import { ASSET_PACK_DOC, readAssetPacks } from "@/domain/assetPacks";
import { setAssetPacks, useAssetPacks } from "@/lib/assetPack";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/firestoreClient";

export function useAssetPackSync() {
  useEffect(() => {
    try {
      return onSnapshot(
        doc(db, "runtime_config", ASSET_PACK_DOC),
        (snapshot) => setAssetPacks(readAssetPacks(snapshot.exists() ? snapshot.data() : undefined)),
        () => { /* hors ligne : on garde les derniers packs connus */ },
      );
    } catch {
      return undefined;
    }
  }, []);
  // Re-rendu de la racine quand un pack change : les écrans affichés reprennent les nouveaux packs.
  return useAssetPacks();
}
