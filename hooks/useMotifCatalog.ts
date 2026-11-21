"use client";

/* Catalogue des modèles d'animation publié depuis l'admin (anim_catalog/current) :
   chargé une fois, mis à jour en temps réel, injecté dans le registre
   (engine/anim/registry). Les modèles invalides sont ignorés ; sans
   catalogue, les modèles par défaut du jeu s'appliquent. */

import { useEffect, useSyncExternalStore } from "react";
import { MOMENT_PREVIEW_PARAM, parseMomentPreview } from "@/engine/anim/moments";
import { validateMotif, type AnimMotif } from "@/engine/anim/motif";
import { motifCatalogRevision, motifRegistryVersion, setMomentPreview, setMotifCatalog, setStylePreview, subscribeMotifCatalog } from "@/engine/anim/registry";
import { STYLE_PREVIEW_PARAM, parseAnimStyle } from "@/engine/anim/style";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "@/lib/firestoreClient";

export function useMotifCatalogLoader() {
  useEffect(() => onSnapshot(doc(db, "anim_catalog", "current"), (snapshot) => {
    if (!snapshot.exists()) return;
    const revision = Number(snapshot.get("revision") ?? 0);
    if (revision === motifCatalogRevision()) return;
    const motifs = ((snapshot.get("motifs") ?? []) as AnimMotif[]).filter((motif) => validateMotif(motif).length === 0);
    const archivedIds = snapshot.get("archivedIds");
    const moments = snapshot.get("moments");
    setMotifCatalog(motifs, revision, Array.isArray(archivedIds) ? archivedIds.map(String) : [], moments && typeof moments === "object" ? moments : {});
  }, () => { /* hors ligne : on garde les modèles courants */ }), []);
}

/** « Essayer dans une partie » (admin) : l'attribution des moments passée dans l'URL
 *  ne vaut que pour cet onglet. Les modèles publiés arrivés ensuite sont repris. */
export function useMomentPreviewFromUrl() {
  useEffect(() => {
    const text = new URLSearchParams(window.location.search).get(MOMENT_PREVIEW_PARAM);
    if (text === null) return;
    const apply = () => setMomentPreview(parseMomentPreview(text));
    const kept = apply();
    console.info("[animations] Aperçu des moments du jeu (cet onglet seulement) :", kept);
    let lastRevision = motifCatalogRevision();
    const unsubscribe = subscribeMotifCatalog(() => {
      if (motifCatalogRevision() === lastRevision) return;
      lastRevision = motifCatalogRevision();
      apply();
    });
    return () => { unsubscribe(); setMomentPreview(null); };
  }, []);
}

/** « Essayer dans une partie » d'un style d'animation (admin) : les mouvements du joueur local
 *  prennent le style passé dans l'URL, pour cet onglet seulement. */
export function useStylePreviewFromUrl() {
  useEffect(() => {
    const text = new URLSearchParams(window.location.search).get(STYLE_PREVIEW_PARAM);
    if (text === null) return;
    const style = parseAnimStyle(text);
    setStylePreview(style);
    console.info("[animations] Aperçu du style d'animation (cet onglet seulement) :", style);
    return () => setStylePreview(null);
  }, []);
}

/** Version du registre (catalogue publié ou aperçu) : à lire dans un composant pour se re-rendre à chaque changement. */
export function useMotifCatalogRevision(): number {
  return useSyncExternalStore(subscribeMotifCatalog, motifRegistryVersion, () => 0);
}
