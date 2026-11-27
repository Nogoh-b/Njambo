"use client";

/* Suit les packs d'assets choisis dans l'admin (runtime_config/asset_pack) :
   assets système, interface et cartes Pouvoir, ainsi que les packs Pouvoir
   importés (runtime_config/power_packs). À monter à la racine de l'application. */

import { useEffect } from "react";
import { ASSET_PACK_DOC, POWER_PACKS_DOC, readImportedPowerPacks } from "@/domain/assetPacks";
import { applyAssetPackDoc, setImportedPacks, useAssetPacks } from "@/lib/assetPack";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/firestoreClient";

export function useAssetPackSync() {
  useEffect(() => {
    const stops: Array<() => void> = [];
    try {
      stops.push(onSnapshot(
        doc(db, "runtime_config", POWER_PACKS_DOC),
        (snapshot) => setImportedPacks(readImportedPowerPacks(snapshot.exists() ? snapshot.data() : undefined)),
        () => { /* hors ligne : on garde les derniers packs importés connus */ },
      ));
      stops.push(onSnapshot(
        doc(db, "runtime_config", ASSET_PACK_DOC),
        (snapshot) => applyAssetPackDoc(snapshot.exists() ? snapshot.data() : undefined),
        () => { /* hors ligne : on garde les derniers packs connus */ },
      ));
    } catch {
      /* temps réel indisponible : derniers packs connus */
    }
    return () => stops.forEach((stop) => stop());
  }, []);
  // Re-rendu de la racine quand un pack change : les écrans affichés reprennent les nouveaux packs.
  return useAssetPacks();
}
