/* Packs d'assets actifs (choisis dans l'admin, runtime_config/asset_pack) :
   un pour les assets système, un pour l'interface, un pour les cartes Pouvoir.
   Les packs Pouvoir importés depuis l'admin (runtime_config/power_packs) sont
   suivis aussi : un pack importé n'est reconnu qu'une fois sa définition reçue.
   Les packs sont connus dès le
   chargement grâce aux derniers packs vus (localStorage), puis suivis en temps
   réel. Un changement s'applique tout de suite aux écrans affichés : appeler
   sysAsset au rendu, jamais dans une constante de module (sinon l'image reste
   figée sur le pack du chargement ; seules les listes de préchargement le sont). */

import { useSyncExternalStore } from "react";
import {
  ASSET_PACK_SCOPES,
  DEFAULT_ASSET_PACKS,
  crispAssetUrl,
  isAssetPackForScope,
  powerPackSmallUrl,
  powerPackThumbUrl,
  readAssetPacks,
  readImportedPowerPacks,
  resolveAssetUrl,
  setImportedPowerPacks,
  type AssetPackSelection,
  type ImportedPowerPack,
} from "@/domain/assetPacks";

const STORAGE_KEY: Record<keyof AssetPackSelection, string> = { system: "njambo-asset-pack", interface: "njambo-ui-pack", powers: "njambo-power-pack" };
const IMPORTED_STORAGE_KEY = "njambo-power-packs";

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
/** Dernier document runtime_config/asset_pack reçu : relu quand la liste des packs importés change. */
let lastPackDoc: { data: unknown } | null = null;

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
  if (ASSET_PACK_SCOPES.every((scope) => merged[scope] === current[scope])) return;
  current = merged;
  for (const scope of ASSET_PACK_SCOPES) {
    try { localStorage.setItem(STORAGE_KEY[scope], current[scope]); } catch { /* stockage indisponible */ }
  }
  applyCss(current);
  listeners.forEach((listener) => listener());
}

/** Applique le document runtime_config/asset_pack reçu du serveur. */
export function applyAssetPackDoc(data: unknown) {
  lastPackDoc = { data };
  setAssetPacks(readAssetPacks(data));
}

/** Applique la liste des packs Pouvoir importés (runtime_config/power_packs). */
export function setImportedPacks(packs: readonly ImportedPowerPack[]) {
  setImportedPowerPacks(packs);
  try { localStorage.setItem(IMPORTED_STORAGE_KEY, JSON.stringify({ packs })); } catch { /* stockage indisponible */ }
  if (lastPackDoc) setAssetPacks(readAssetPacks(lastPackDoc.data));
  // Les URL d'un pack importé ont pu changer (nouvelle image) : on redessine les écrans.
  current = { ...current };
  applyCss(current);
  listeners.forEach((listener) => listener());
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const cached = localStorage.getItem(IMPORTED_STORAGE_KEY);
    if (cached) setImportedPowerPacks(readImportedPowerPacks(JSON.parse(cached)));
  } catch { /* cache absent ou illisible */ }
  const saved = { ...current };
  for (const scope of ASSET_PACK_SCOPES) {
    try {
      const value = localStorage.getItem(STORAGE_KEY[scope]);
      if (isAssetPackForScope(value, scope)) saved[scope] = value;
    } catch { /* stockage indisponible */ }
  }
  current = saved;

  window.addEventListener("storage", (event) => {
    if (event.key === IMPORTED_STORAGE_KEY) {
      try {
        setImportedPowerPacks(event.newValue ? readImportedPowerPacks(JSON.parse(event.newValue)) : []);
        if (lastPackDoc) {
          current = { ...readAssetPacks(lastPackDoc.data) };
        } else {
          const savedPower = localStorage.getItem(STORAGE_KEY.powers);
          current = {
            ...current,
            ...(isAssetPackForScope(savedPower, "powers") ? { powers: savedPower } : {}),
          };
        }
        applyCss(current);
        listeners.forEach((listener) => listener());
      } catch { /* cache illisible */ }
      return;
    }
    for (const scope of ASSET_PACK_SCOPES) {
      if (event.key === STORAGE_KEY[scope]) {
        const value = event.newValue;
        const nextPack = isAssetPackForScope(value, scope) ? value : DEFAULT_ASSET_PACKS[scope];
        if (nextPack !== current[scope]) {
          current = { ...current, [scope]: nextPack };
          applyCss(current);
          listeners.forEach((listener) => listener());
        }
        return;
      }
    }
  });
}

start();

/** Chemin d'un asset (système ou interface) dans le pack actif, en déclinaison nette ; les autres chemins sont rendus tels quels. */
export function sysAsset(path: string): string {
  return crispAssetUrl(resolveAssetUrl(path, current));
}

export function powerCardImage(path: string, size: "thumb" | "small" | "full" = "full"): string {
  if (size === "small") return powerPackSmallUrl(path, current.powers);
  if (size === "thumb") return powerPackThumbUrl(path, current.powers);
  return sysAsset(path);
}

export function currentAssetPacks(): AssetPackSelection {
  return current;
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  // Les variables CSS sont appliquées après l'hydratation de la racine.
  if (listeners.size === 1) applyCss(current);
  return () => { listeners.delete(listener); };
}

/** Packs actifs ; à lire dans un composant pour se re-rendre quand l'admin en change. */
export function useAssetPacks(): AssetPackSelection {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULT_ASSET_PACKS);
}
