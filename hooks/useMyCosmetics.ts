"use client";

/* Cosmétiques équipés du joueur connecté (players/{uid}.equippedCosmetics),
   en temps réel. Applique aussi le dos de carte et l'arche actifs (cosmétique
   équipé du joueur, sinon valeur par défaut configurée en admin, sinon asset
   intégré) sur :root via --nj-card-back et --nj-hand-arc. */

import { useEffect, useState } from "react";
import { readPlayerCosmetics, type PlayerCosmetics } from "@/domain";
import { useAuth } from "@/hooks/useAuth";
import { useDefaultCosmetics } from "@/hooks/useDefaultCosmetics";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/firestoreClient";

function cssUrlValue(url: string): string {
  return `url("${url.replace(/"/g, "%22")}")`;
}

export function useMyCosmetics(applyCardBack = false): PlayerCosmetics {
  const { user } = useAuth();
  const { defaultCardBackUrl, defaultHandArcUrl } = useDefaultCosmetics();
  const [cosmetics, setCosmetics] = useState<PlayerCosmetics>({});
  const uid = user && !user.isAnonymous ? user.uid : null;

  useEffect(() => {
    if (!uid) { setCosmetics({}); return; }
    return onSnapshot(
      doc(db, "players", uid),
      (snapshot) => setCosmetics(readPlayerCosmetics(snapshot.get("equippedCosmetics"))),
      () => setCosmetics({}),
    );
  }, [uid]);

  const effectiveCardBack = cosmetics.cardBack?.imageUrl ?? defaultCardBackUrl;
  const effectiveHandArc = cosmetics.handArc?.imageUrl ?? defaultHandArcUrl;

  useEffect(() => {
    if (!applyCardBack) return;
    const root = document.documentElement;
    if (effectiveCardBack) root.style.setProperty("--nj-card-back", cssUrlValue(effectiveCardBack));
    else root.style.removeProperty("--nj-card-back");
    if (effectiveHandArc) root.style.setProperty("--nj-hand-arc", cssUrlValue(effectiveHandArc));
    else root.style.removeProperty("--nj-hand-arc");
  }, [applyCardBack, effectiveCardBack, effectiveHandArc]);

  return cosmetics;
}
