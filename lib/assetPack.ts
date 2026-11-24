/* Pack d'assets système actif (choisi dans l'admin, runtime_config/asset_pack).
   Le pack est connu dès le chargement grâce au dernier pack vu (localStorage),
   puis suivi en temps réel. Un changement s'applique aux écrans au fil de leur
   affichage et entièrement au prochain lancement du jeu (les listes d'images
   calculées au chargement d'un écran gardent le pack de ce moment). */

import { useSyncExternalStore } from "react";
import { DEFAULT_ASSET_PACK, assetPackUrl, isAssetPackId, type AssetPackId } from "@/domain/assetPacks";

const STORAGE_KEY = "njambo-asset-pack";
/** Assets système référencés depuis les feuilles de style (variables CSS). */
const CSS_ASSETS: Record<string, string> = {
  "--nj-sys-card-back-64": "/assets/njambo/books/card-back-64.webp",
  "--nj-sys-card-back-128": "/assets/njambo/books/card-back-128.webp",
  "--nj-sys-loyalty-wheel": "/assets/njambo/economy/loyalty-wheel.webp",
};

let current: AssetPackId = DEFAULT_ASSET_PACK;
const listeners = new Set<() => void>();
let started = false;

function applyCss(pack: AssetPackId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  for (const [name, path] of Object.entries(CSS_ASSETS)) {
    root.setProperty(name, `url("${assetPackUrl(path, pack)}")`);
  }
}

/** Applique le pack reçu du serveur (appelé par useAssetPackSync). */
export function setAssetPack(pack: AssetPackId) {
  if (pack === current) return;
  current = pack;
  try { localStorage.setItem(STORAGE_KEY, pack); } catch { /* stockage indisponible */ }
  applyCss(pack);
  listeners.forEach((listener) => listener());
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isAssetPackId(saved)) current = saved;
  } catch { /* stockage indisponible */ }
  applyCss(current);
}

start();

/** Chemin d'un asset système (economy, tickets, books, ranks) dans le pack actif. */
export function sysAsset(path: string): string {
  return assetPackUrl(path, current);
}

export function currentAssetPack(): AssetPackId {
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => { listeners.delete(listener); };
}

/** Pack actif ; à lire dans un composant pour se re-rendre quand l'admin en change. */
export function useAssetPack(): AssetPackId {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULT_ASSET_PACK);
}
