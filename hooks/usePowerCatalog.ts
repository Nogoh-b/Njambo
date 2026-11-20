"use client";

/* Catalogue des cartes pouvoir publié depuis l'admin (power_catalog/current) :
   chargé une fois, mis à jour en temps réel, injecté dans le registre
   dynamique (config/powers/registry). Les cartes invalides sont ignorées ;
   catalogue absent ou vide → cartes du code (repli). */

import { useEffect, useSyncExternalStore } from "react";
import { powerCatalogRevision, setPowerCatalog, subscribePowerCatalog } from "@/config/powers/registry";
import { validatePowerCard } from "@/engine/power/validate";
import type { PowerModule } from "@/engine/power/types";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/firestoreClient";

export function usePowerCatalogLoader() {
  useEffect(() => onSnapshot(doc(db, "power_catalog", "current"), (snapshot) => {
    if (!snapshot.exists()) return;
    const revision = Number(snapshot.get("revision") ?? 0);
    if (revision === powerCatalogRevision()) return;
    const cards = ((snapshot.get("cards") ?? []) as PowerModule[]).filter((card) => validatePowerCard(card).length === 0);
    setPowerCatalog(cards, revision);
  }, () => { /* hors ligne : on garde le catalogue courant */ }), []);
}

/** Révision du catalogue : à lire dans un composant pour se re-rendre à chaque publication. */
export function usePowerCatalogRevision(): number {
  return useSyncExternalStore(subscribePowerCatalog, powerCatalogRevision, () => 0);
}
