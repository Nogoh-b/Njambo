/* Packs d'assets actifs (choisis dans l'admin, runtime_config/asset_pack) :
   un pour les assets système, un pour l'interface. Les packs sont connus dès le
   chargement grâce aux derniers packs vus (localStorage), puis suivis en temps
   réel. Un changement s'applique aux écrans au fil de leur affichage et
   entièrement au prochain lancement du jeu (les listes d'images calculées au
   chargement d'un écran gardent les packs de ce moment). */

import { useSyncExternalStore } from "react";
import {
  ASSET_PACK_SCOPES,
  DEFAULT_ASSET_PACKS,
  crispAssetUrl,
  isAssetPackId,
  resolveAssetUrl,
  type AssetPackSelection,
} from "@/domain/assetPacks";

const STORAGE_KEY: Record<keyof AssetPackSelection, string> = { system: "njambo-asset-pack", interface: "njambo-ui-pack" };

/** Assets référencés depuis les feuilles de style (variables CSS). */
const CSS_ASSETS: Record<string, string> = {
  "--nj-sys-card-back-64": "/assets/njambo/books/card-back-64.webp",
  "--nj-sys-card-back-128": "/assets/njambo/books/card-back-128.webp",
  "--nj-sys-loyalty-wheel": "/assets/njambo/economy/loyalty-wheel.webp",
  "--nj-ui-frame-dark": "/assets/njambo/ui/buttons/dark-frame.webp",
  "--nj-ui-frame-gold": "/assets/njambo/ui/buttons/gold-frame.webp",
  "--nj-ui-frame-teal": "/assets/njambo/ui/buttons/teal-frame.webp",
  "--nj-ui-frame-pink": "/assets/njambo/ui/buttons/pink-frame.webp",
  "--nj-ui-frame-ghost": "/assets/njambo/ui/buttons/ghost-frame.webp",
  "--nj-ui-icon-plate": "/assets/njambo/ui/buttons/icon-plate-128.webp",
};

let current: AssetPackSelection = DEFAULT_ASSET_PACKS;
const listeners = new Set<() => void>();
let started = false;

function applyCss(selection: AssetPackSelection) {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  for (const [name, path] of Object.entries(CSS_ASSETS)) {
    root.setProperty(name, `url("${crispAssetUrl(resolveAssetUrl(path, selection))}")`);
  }
}

/** Applique les packs reçus du serveur (appelé par useAssetPackSync) ou choisis dans l'admin. */
export function setAssetPacks(next: Partial<AssetPackSelection>) {
  const merged = { ...current, ...next };
  if (merged.system === current.system && merged.interface === current.interface) return;
  current = merged;
  for (const scope of ASSET_PACK_SCOPES) {
    try { localStorage.setItem(STORAGE_KEY[scope], current[scope]); } catch { /* stockage indisponible */ }
  }
  applyCss(current);
  listeners.forEach((listener) => listener());
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const saved = { ...current };
  for (const scope of ASSET_PACK_SCOPES) {
    try {
      const value = localStorage.getItem(STORAGE_KEY[scope]);
      if (isAssetPackId(value)) saved[scope] = value;
    } catch { /* stockage indisponible */ }
  }
  current = saved;
  applyCss(current);
}

start();

/** Chemin d'un asset (système ou interface) dans le pack actif, en déclinaison nette ; les autres chemins sont rendus tels quels. */
export function sysAsset(path: string): string {
  return crispAssetUrl(resolveAssetUrl(path, current));
}

export function currentAssetPacks(): AssetPackSelection {
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => { listeners.delete(listener); };
}

/** Packs actifs ; à lire dans un composant pour se re-rendre quand l'admin en change. */
export function useAssetPacks(): AssetPackSelection {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULT_ASSET_PACKS);
}
