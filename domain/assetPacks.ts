/* ═══════════════ Packs d'assets système ═══════════════
   Les images « système » (monnaies, énergie, roue, packs boutique, tickets,
   livres, rangs) existent en plusieurs directions artistiques. L'admin choisit
   le pack actif pour tout le jeu (runtime_config/asset_pack). Le pack
   « classique » correspond aux fichiers historiques ; les autres vivent dans
   /assets/njambo/packs/<pack>/ avec la même arborescence et les mêmes noms.
   Pour ajouter un pack : déposer les 23 assets (× tailles 64/128/256 + original)
   dans public/assets/njambo/packs/<id>/ puis l'ajouter à ASSET_PACKS. */

export const ASSET_PACK_DOC = "asset_pack";

export interface AssetPackDefinition {
  id: string;
  name: string;
  description: string;
}

export const ASSET_PACKS = [
  { id: "classique", name: "Classique", description: "Illustrations peintes d'origine, tons sombres." },
  { id: "soleil", name: "Soleil d'or", description: "Bijou en métal ciselé, médailles rondes, rayons chauds." },
  { id: "wax", name: "Wax festif", description: "Style autocollant : gros contours, tissu wax, paquets cadeaux." },
  { id: "cristal", name: "Aurore cristal", description: "Gemmes taillées et verre en lévitation, anneaux de lumière." },
] as const satisfies readonly AssetPackDefinition[];

export type AssetPackId = (typeof ASSET_PACKS)[number]["id"];

export const DEFAULT_ASSET_PACK: AssetPackId = "classique";

/** Dossiers d'assets système déclinés par pack. */
export const SYSTEM_ASSET_GROUPS = ["economy", "tickets", "books", "ranks"] as const;

const SYSTEM_ASSET_PATH = /^\/assets\/njambo\/(economy|tickets|books|ranks)\//;

export function isAssetPackId(value: unknown): value is AssetPackId {
  return typeof value === "string" && ASSET_PACKS.some((pack) => pack.id === value);
}

export function readAssetPack(data: unknown): AssetPackId {
  const pack = data && typeof data === "object" ? (data as Record<string, unknown>).pack : undefined;
  return isAssetPackId(pack) ? pack : DEFAULT_ASSET_PACK;
}

/** Chemin d'un asset système dans le pack donné (les autres chemins sont rendus tels quels). */
export function assetPackUrl(path: string, pack: AssetPackId): string {
  if (pack === DEFAULT_ASSET_PACK || !SYSTEM_ASSET_PATH.test(path)) return path;
  return path.replace(SYSTEM_ASSET_PATH, `/assets/njambo/packs/${pack}/$1/`);
}
