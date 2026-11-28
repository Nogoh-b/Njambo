"use client";

/* Catalogue des cartes pouvoir publié depuis l'admin (power_catalog/current) :
   chargé une fois, mis à jour en temps réel, injecté dans le registre
   dynamique (config/powers/registry). Les cartes invalides sont ignorées ;
   catalogue absent ou vide → cartes du code (repli).
   Précharge automatiquement les sons personnalisés et pistes son de chorégraphie
   dès leur réception pour garantir une lecture à 0 ms en partie. */

import { useEffect, useSyncExternalStore } from "react";
import { listPowerModules, powerCatalogRevision, setPowerCatalog, subscribePowerCatalog } from "@/config/powers/registry";
import { subscribeMotifCatalog } from "@/engine/anim/registry";
import { validatePowerCard } from "@/engine/power/validate";
import type { PowerModule } from "@/engine/power/types";
import { audioAsset, prefetchAssets, type AssetRef } from "@/lib/assets/AssetLoader";
import { resolvePowerSoundUrl } from "@/lib/powerSounds";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/firestoreClient";

function prefetchPowerCatalogSounds(cards: readonly PowerModule[]): void {
  const assets: Array<AssetRef | null> = [];
  for (const card of cards) {
    if (card.def.sound?.ref) {
      assets.push(audioAsset(resolvePowerSoundUrl(card.def.sound.ref)));
    }
    for (const step of card.script?.steps ?? []) {
      for (const track of step.choreo?.tracks ?? []) {
        if (track.kind === "sound" && track.sound) {
          assets.push(audioAsset(resolvePowerSoundUrl(track.sound)));
        }
      }
    }
  }
  const clean = assets.filter(Boolean) as AssetRef[];
  if (clean.length > 0) prefetchAssets(clean);
}

export function usePowerCatalogLoader() {
  useEffect(() => {
    let raw: { cards: PowerModule[]; revision: number } | null = null;
    let applied = -1;

    // Si le catalogue est déjà en mémoire (ex. retour depuis /admin), précharge ses sons sans attendre.
    prefetchPowerCatalogSounds(listPowerModules());

    const apply = () => {
      if (!raw) return;
      // Une chorégraphie peut viser un modèle d'animation publié : validée avec le registre des modèles du moment.
      const cards = raw.cards.filter((card) => validatePowerCard(card).length === 0);
      if (raw.revision === applied && cards.length === raw.cards.length) return;
      if (setPowerCatalog(cards, raw.revision)) {
        applied = raw.revision;
        prefetchPowerCatalogSounds(cards);
      }
    };
    const stopCards = onSnapshot(doc(db, "power_catalog", "current"), (snapshot) => {
      if (!snapshot.exists()) return;
      const revision = Number(snapshot.get("revision") ?? 0);
      const cards = (snapshot.get("cards") ?? []) as PowerModule[];
      if (revision === powerCatalogRevision()) {
        prefetchPowerCatalogSounds(cards);
        return;
      }
      raw = { cards, revision };
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
