/* ═══════════════ Packs d'assets (système et interface) ═══════════════
   Les images « système » (monnaies, énergie, roue, packs boutique, tickets,
   livres, rangs) existent en plusieurs directions artistiques. L'admin choisit
   le pack actif pour tout le jeu (runtime_config/asset_pack). Le pack
   « classique » correspond aux fichiers historiques ; les autres vivent dans
   /assets/njambo/packs/<pack>/ avec la même arborescence et les mêmes noms.
   Deux réglages indépendants : « system » (monnaies, tickets, livres, rangs)
   et « interface » (icônes, icônes de navigation, cadres de boutons, cartes de
   modes de jeu). Pour ajouter un pack : déposer ses fichiers dans
   public/assets/njambo/packs/<id>/ (mêmes sous-dossiers et noms) puis l'ajouter
   à ASSET_PACKS. */

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

export const ASSET_PACK_SCOPES = ["system", "interface"] as const;
export type AssetPackScope = (typeof ASSET_PACK_SCOPES)[number];
export type AssetPackSelection = Record<AssetPackScope, AssetPackId>;

export const DEFAULT_ASSET_PACKS: AssetPackSelection = { system: DEFAULT_ASSET_PACK, interface: DEFAULT_ASSET_PACK };

/** Champ du document runtime_config/asset_pack pour chaque réglage. */
export const ASSET_PACK_FIELD: Record<AssetPackScope, "pack" | "uiPack"> = { system: "pack", interface: "uiPack" };

/** Dossiers déclinés par pack, pour chaque réglage. */
const SCOPE_PATH: Record<AssetPackScope, RegExp> = {
  system: /^\/assets\/njambo\/(economy|tickets|books|ranks)\//,
  interface: /^\/assets\/njambo\/(ui\/icons|ui\/buttons|friendly\/icons|menu)\//,
};

export function isAssetPackId(value: unknown): value is AssetPackId {
  return typeof value === "string" && ASSET_PACKS.some((pack) => pack.id === value);
}

export function isAssetPackScope(value: unknown): value is AssetPackScope {
  return typeof value === "string" && (ASSET_PACK_SCOPES as readonly string[]).includes(value);
}

/** Lit le document runtime_config/asset_pack (valeur inconnue → pack classique). */
export function readAssetPacks(data: unknown): AssetPackSelection {
  const source = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const pick = (value: unknown) => (isAssetPackId(value) ? value : DEFAULT_ASSET_PACK);
  return { system: pick(source.pack), interface: pick(source.uiPack) };
}

/** Pack système seul (compatibilité). */
export function readAssetPack(data: unknown): AssetPackId {
  return readAssetPacks(data).system;
}

/** Chemin d'un asset dans le pack donné, pour un réglage (les autres chemins sont rendus tels quels). */
export function assetPackUrl(path: string, pack: AssetPackId, scope: AssetPackScope = "system"): string {
  const pattern = SCOPE_PATH[scope];
  if (pack === DEFAULT_ASSET_PACK || !pattern.test(path)) return path;
  return path.replace(pattern, `/assets/njambo/packs/${pack}/$1/`);
}

/** Chemin d'un asset selon les packs choisis pour chaque réglage. */
export function resolveAssetUrl(path: string, selection: AssetPackSelection): string {
  for (const scope of ASSET_PACK_SCOPES) {
    const next = assetPackUrl(path, selection[scope], scope);
    if (next !== path) return next;
  }
  return path;
}
