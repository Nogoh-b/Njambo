"use client";

/* Catalogue des cartes pouvoir publié depuis l'admin (power_catalog/current) :
   chargé une fois, mis à jour en temps réel, injecté dans le registre
   dynamique (config/powers/registry). Les cartes invalides sont ignorées ;
   catalogue absent ou vide → cartes du code (repli). */

import { useEffect, useSyncExternalStore } from "react";
import { powerCatalogRevision, setPowerCatalog, subscribePowerCatalog } from "@/config/powers/registry";
import { subscribeMotifCatalog } from "@/engine/anim/registry";
import { validatePowerCard } from "@/engine/power/validate";
import type { PowerModule } from "@/engine/power/types";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/firestoreClient";

export function usePowerCatalogLoader() {
  useEffect(() => {
    let raw: { cards: PowerModule[]; revision: number } | null = null;
    let applied = -1;
    const apply = () => {
      if (!raw) return;
      // Une chorégraphie peut viser un modèle d'animation publié : validée avec le registre des modèles du moment.
      const cards = raw.cards.filter((card) => validatePowerCard(card).length === 0);
      if (raw.revision === applied && cards.length === raw.cards.length) return;
      if (setPowerCatalog(cards, raw.revision)) applied = raw.revision;
    };
    const stopCards = onSnapshot(doc(db, "power_catalog", "current"), (snapshot) => {
      if (!snapshot.exists()) return;
      const revision = Number(snapshot.get("revision") ?? 0);
      if (revision === powerCatalogRevision()) return;
      raw = { cards: (snapshot.get("cards") ?? []) as PowerModule[], revision };
      apply();
    }, () => { /* hors ligne : on garde le catalogue courant */ });
    // Les modèles arrivent parfois après les cartes : on revalide alors les cartes écartées.
    const stopMotifs = subscribeMotifCatalog(() => { applied = -1; apply(); });
    return () => { stopCards(); stopMotifs(); };
  }, []);
}

/** Révision du catalogue : à lire dans un composant pour se re-rendre à chaque publication. */
export function usePowerCatalogRevision(): number {
  return useSyncExternalStore(subscribePowerCatalog, powerCatalogRevision, () => 0);
}
