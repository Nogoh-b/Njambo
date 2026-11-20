"use client";

/* Cosmétiques équipés du joueur connecté (players/{uid}.equippedCosmetics),
   en temps réel. Applique aussi son dos de carte à toute l'interface via la
   variable CSS --nj-card-back (lue par PlayCard). */

import { useEffect, useState } from "react";
import { readPlayerCosmetics, type PlayerCosmetics } from "@/domain";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/firestoreClient";

export function useMyCosmetics(applyCardBack = false): PlayerCosmetics {
  const { user } = useAuth();
  const [cosmetics, setCosmetics] = useState<PlayerCosmetics>({});
  const uid = user && !user.isAnonymous ? user.uid : null;

  useEffect(() => {
    if (!uid) { setCosmetics({}); return; }
    return onSnapshot(doc(db, "players", uid), (snapshot) => setCosmetics(readPlayerCosmetics(snapshot.get("equippedCosmetics"))), () => setCosmetics({}));
  }, [uid]);

  const cardBack = cosmetics.cardBack?.imageUrl ?? null;
  useEffect(() => {
    if (!applyCardBack) return;
    const root = document.documentElement;
    if (cardBack) root.style.setProperty("--nj-card-back", `url("${cardBack.replace(/"/g, "%22")}")`);
    else root.style.removeProperty("--nj-card-back");
  }, [applyCardBack, cardBack]);

  return cosmetics;
}
