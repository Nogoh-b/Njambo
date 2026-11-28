"use client";

/* Suit les packs d'assets choisis dans l'admin (runtime_config/asset_pack) :
   assets système, interface et cartes Pouvoir, ainsi que les packs Pouvoir
   importés (runtime_config/power_packs). À monter à la racine de l'application. */

import { useEffect } from "react";
import { ASSET_PACK_DOC, POWER_PACKS_DOC, readImportedPowerPacks } from "@/domain/assetPacks";
import { applyAssetPackDoc, setImportedPacks, useAssetPacks } from "@/lib/assetPack";
import { applyPowerBorderDoc } from "@/lib/powerBorderStore";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/firestoreClient";

export function useAssetPackSync(onPowerPacksReady?: (error?: unknown) => void) {
  useEffect(() => {
    const stops: Array<() => void> = [];
    try {
      stops.push(onSnapshot(
        doc(db, "runtime_config", POWER_PACKS_DOC),
        (snapshot) => {
          setImportedPacks(readImportedPowerPacks(snapshot.exists() ? snapshot.data() : undefined));
          onPowerPacksReady?.();
        },
        (error) => onPowerPacksReady?.(error),
      ));
      stops.push(onSnapshot(
        doc(db, "runtime_config", ASSET_PACK_DOC),
        (snapshot) => {
          const data = snapshot.exists() ? snapshot.data() : undefined;
          applyAssetPackDoc(data);
          applyPowerBorderDoc(data);
        },
        () => { /* hors ligne : on garde les derniers packs connus */ },
      ));
    } catch (error) {
      onPowerPacksReady?.(error);
    }
    return () => stops.forEach((stop) => stop());
  }, [onPowerPacksReady]);
  // Re-rendu de la racine quand un pack change : les écrans affichés reprennent les nouveaux packs.
  return useAssetPacks();
}
