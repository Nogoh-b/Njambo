"use client";

/* Suit le pack d'assets système choisi dans l'admin (runtime_config/asset_pack).
   À monter une seule fois, à la racine de l'application. */

import { useEffect } from "react";
import { ASSET_PACK_DOC, readAssetPack } from "@/domain/assetPacks";
import { setAssetPack, useAssetPack } from "@/lib/assetPack";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/firestoreClient";

export function useAssetPackSync() {
  useEffect(() => {
    try {
      return onSnapshot(
        doc(db, "runtime_config", ASSET_PACK_DOC),
        (snapshot) => setAssetPack(readAssetPack(snapshot.exists() ? snapshot.data() : undefined)),
        () => { /* hors ligne : on garde le dernier pack connu */ },
      );
    } catch {
      return undefined;
    }
  }, []);
  // Re-rendu de la racine quand le pack change : les écrans affichés reprennent le nouveau pack.
  return useAssetPack();
}
