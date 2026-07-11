"use client";

import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db, serverTimestamp } from "@/lib/firebase";
import { POWER_CARDS_BY_ID, STARTING_CAURIS } from "@/config/powerCards";
import type { PowerCardId, PowerCardInventory } from "@/types/game";

/* ═══════════════ Power Cards — Données Firestore ═══════════════
   Gestion de l'inventaire des cartes pouvoir et des cauris.
   Collections :
   - users/{uid}  → champs `cauris` et `powerInventory`
   - users/{uid}/power_inventory/{cardId} → quantité par carte (détail) */

/** Récupère le solde de cauris d'un joueur. */
export async function getCauris(uid: string): Promise<number> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return STARTING_CAURIS;
  const data = snap.data();
  return typeof data.cauris === "number" ? data.cauris : STARTING_CAURIS;
}

/** Récupère l'inventaire des power cards d'un joueur. */
export async function getInventory(uid: string): Promise<PowerCardInventory> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return {};
  const data = snap.data();
  const inv = data.powerInventory;
  if (!inv || typeof inv !== "object") return {};
  return inv as PowerCardInventory;
}

/** Écoute en temps réel l'inventaire + cauris d'un joueur. */
export function listenPowerData(
  uid: string,
  cb: (data: { cauris: number; inventory: PowerCardInventory }) => void,
): Unsubscribe {
  const ref = doc(db, "users", uid);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      cb({ cauris: STARTING_CAURIS, inventory: {} });
      return;
    }
    const data = snap.data();
    const cauris = typeof data.cauris === "number" ? data.cauris : STARTING_CAURIS;
    const inventory = (data.powerInventory && typeof data.powerInventory === "object")
      ? data.powerInventory as PowerCardInventory
      : {};
    cb({ cauris, inventory });
  });
}

/** Ajoute des cauris à un joueur (récompenses de partie). */
export async function addCauris(uid: string, amount: number): Promise<void> {
  const ref = doc(db, "users", uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() && typeof snap.data().cauris === "number"
      ? snap.data().cauris
      : STARTING_CAURIS;
    const next = Math.max(0, current + amount);
    if (snap.exists()) {
      tx.update(ref, { cauris: next });
    } else {
      tx.set(ref, { cauris: next, createdAt: serverTimestamp() });
    }
  });
}

/** Achète une carte pouvoir avec des cauris ou du FCFA. */
export async function buyPowerCard(
  uid: string,
  cardId: PowerCardId,
  currency: "cauris" | "fcfa",
): Promise<{ success: boolean; error?: string }> {
  const def = POWER_CARDS_BY_ID[cardId];
  if (!def) return { success: false, error: "Carte inconnue." };

  const cost = currency === "cauris" ? def.costCauris : def.costFcfa;
  if (!cost || cost <= 0) return { success: false, error: "Prix invalide." };

  const userRef = doc(db, "users", uid);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error("Profil introuvable.");

      const data = snap.data();
      const cauris = typeof data.cauris === "number" ? data.cauris : 0;
      const balance = typeof data.balance === "number" ? data.balance : 0;
      const inventory = (data.powerInventory && typeof data.powerInventory === "object")
        ? { ...(data.powerInventory as PowerCardInventory) }
        : {};

      // Vérifier le solde
      if (currency === "cauris") {
        if (cauris < cost) throw new Error("Cauris insuffisants.");
      } else {
        if (balance < cost) throw new Error("FCFA insuffisants.");
      }

      // Débiter
      const updates: Record<string, unknown> = {};
      if (currency === "cauris") {
        updates.cauris = cauris - cost;
      } else {
        updates.balance = balance - cost;
      }

      // Débloquer la carte de façon permanente
      if ((inventory[cardId] ?? 0) > 0) throw new Error("Carte déjà possédée.");
      inventory[cardId] = 1;
      updates.powerInventory = inventory;

      tx.update(userRef, updates);
    });
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur d'achat.";
    return { success: false, error: msg };
  }
}

/** API legacy : les cartes pouvoir étant permanentes, la consommation est un no-op. */
export async function consumePowerCard(
  uid: string,
  cardId: PowerCardId,
): Promise<{ success: boolean; error?: string }> {
  void uid;
  void cardId;
  return { success: true };
}

/** Sauvegarde les cartes équipées pour la prochaine partie. */
export async function saveEquippedPowers(
  uid: string,
  powers: PowerCardId[],
): Promise<void> {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { equippedPowers: powers }).catch(async () => {
    // Si le doc n'existe pas, le créer
    await setDoc(ref, { equippedPowers: powers }, { merge: true });
  });
}
