"use client";

/* Visuels par défaut de la table configurés depuis l'admin
   (runtime_config/cosmetics_defaults : dos de carte & arche de main).
   Un seul abonnement Firestore partagé pour toute l'application (connecté ou invité). */

import { useSyncExternalStore } from "react";
import { COSMETIC_DEFAULTS_DOC, readDefaultCosmetics, type DefaultCosmeticsConfig } from "@/domain";
import { DEFAULT_CARD_BACK_ASSET, DEFAULT_HAND_ARC_ASSET } from "@/lib/assets/manifests";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/firestoreClient";

interface DefaultCosmeticsSnapshot {
  defaults: DefaultCosmeticsConfig;
  defaultCardBackUrl: string;
  defaultHandArcUrl: string;
}

const INITIAL_SNAPSHOT: DefaultCosmeticsSnapshot = {
  defaults: {},
  defaultCardBackUrl: DEFAULT_CARD_BACK_ASSET,
  defaultHandArcUrl: DEFAULT_HAND_ARC_ASSET,
};

let currentSnapshot: DefaultCosmeticsSnapshot = INITIAL_SNAPSHOT;
const listeners = new Set<() => void>();
let unsubscribeFirestore: (() => void) | null = null;

function setSnapshot(defaults: DefaultCosmeticsConfig) {
  const defaultCardBackUrl = defaults.cardBack?.imageUrl || DEFAULT_CARD_BACK_ASSET;
  const defaultHandArcUrl = defaults.handArc?.imageUrl || DEFAULT_HAND_ARC_ASSET;
  if (
    currentSnapshot.defaultCardBackUrl === defaultCardBackUrl &&
    currentSnapshot.defaultHandArcUrl === defaultHandArcUrl &&
    currentSnapshot.defaults.cardBack?.cosmeticId === defaults.cardBack?.cosmeticId &&
    currentSnapshot.defaults.cardBack?.name === defaults.cardBack?.name &&
    currentSnapshot.defaults.handArc?.cosmeticId === defaults.handArc?.cosmeticId &&
    currentSnapshot.defaults.handArc?.name === defaults.handArc?.name
  ) {
    return;
  }
  currentSnapshot = { defaults, defaultCardBackUrl, defaultHandArcUrl };
  listeners.forEach((listener) => listener());
}

function ensureSubscribed() {
  if (unsubscribeFirestore || typeof window === "undefined") return;
  try {
    unsubscribeFirestore = onSnapshot(
      doc(db, "runtime_config", COSMETIC_DEFAULTS_DOC),
      (snapshot) => {
        setSnapshot(readDefaultCosmetics(snapshot.exists() ? snapshot.data() : undefined));
      },
      () => {
        /* Mode hors ligne / repli sur les assets intégrés par défaut. */
      },
    );
  } catch {
    unsubscribeFirestore = null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  ensureSubscribed();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribeFirestore) {
      unsubscribeFirestore();
      unsubscribeFirestore = null;
    }
  };
}

function getSnapshot(): DefaultCosmeticsSnapshot {
  return currentSnapshot;
}

function getServerSnapshot(): DefaultCosmeticsSnapshot {
  return INITIAL_SNAPSHOT;
}

export function useDefaultCosmetics(): DefaultCosmeticsSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
