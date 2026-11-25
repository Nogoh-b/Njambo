/* ═══════════════ Packs d'assets (système, interface et pouvoirs) ═══════════════
   Les images « système » (monnaies, énergie, roue, packs boutique, tickets,
   livres, rangs) existent en plusieurs directions artistiques. L'admin choisit
   le pack actif pour tout le jeu (runtime_config/asset_pack). Le pack
   « classique » correspond aux fichiers historiques ; les autres vivent dans
   /assets/njambo/packs/<pack>/ avec la même arborescence et les mêmes noms.
   Trois réglages indépendants : « system » (monnaies, tickets, livres, rangs)
   et « interface » (icônes, icônes de navigation, cadres de boutons, cartes de
   modes de jeu), et « powers » (illustrations des cartes Pouvoir intégrées).
   Les illustrations Pouvoir vivent dans /assets/power-cards/packs/<id>/.
   Pour ajouter un pack système/interface : déposer ses fichiers dans
   public/assets/njambo/packs/<id>/ (mêmes sous-dossiers et noms) puis l'ajouter
   à ASSET_PACKS. */

export const ASSET_PACK_DOC = "asset_pack";

export interface AssetPackDefinition {
  id: string;
  name: string;
  description: string;
  scopes?: readonly AssetPackScope[];
  portrait?: boolean;
}

export const ASSET_PACKS = [
  { id: "classique", name: "Classique", description: "Illustrations peintes d'origine, tons sombres.", scopes: ["system", "interface", "powers"] },
  { id: "soleil", name: "Soleil d'or", description: "Bijou en métal ciselé, médailles rondes, rayons chauds." },
  { id: "wax", name: "Wax festif", description: "Style autocollant : gros contours, tissu wax, paquets cadeaux." },
  { id: "cristal", name: "Aurore cristal", description: "Gemmes taillées et verre en lévitation, anneaux de lumière." },
  { id: "email-royal", name: "Émail Royal", description: "Émail émeraude bombé, ivoire lumineux et larges contours en or brillant." },
  { id: "ndop-heritage", name: "Ndop Héritage", description: "Textile émeraude, motifs ndop indigo et ivoire, cuir acajou et or." },
  { id: "acajou-sculpte", name: "Acajou Sculpté", description: "Bois acajou sculpté, reliefs géométriques et incrustations d'or et d'émeraude." },
  { id: "porcelaine-mboa", name: "Porcelaine Mboa", description: "Porcelaine ivoire brillante, incrustations émeraude et liserés dorés." },
  { id: "jade-imperial", name: "Jade Impérial", description: "Jade émeraude veiné, feuilles sculptées et finitions en or poli." },
  { id: "raphia-prestige", name: "Raphia Prestige", description: "Raphia ivoire tressé, cuir émeraude et attaches en or brillant." },
  { id: "obsidienne-royale", name: "Obsidienne Royale", description: "Obsidienne vert noir, volumes sculptés et arêtes dorées." },
  { id: "cuivre-du-ter", name: "Cuivre du Ter", description: "Cuivre martelé chaleureux, patine émeraude et détails ivoire." },
  { id: "ndop-mystique", name: "Ndop Mystique", description: "Pouvoirs brodés en relief sur textile ndop émeraude et indigo.", scopes: ["powers"] },
  { id: "bronze-ancestral", name: "Bronze Ancestral", description: "Reliques de bronze sculpté, patine verte et lumière dorée.", scopes: ["powers"] },
  { id: "email-arcane", name: "Émail Arcane", description: "Talismans en émail bombé, ivoire lumineux et magie turquoise.", scopes: ["powers"] },
  { id: "ivoire-grave", name: "Ivoire Gravé", description: "Reliefs ivoire gravés, incrustations émeraude et or fin.", scopes: ["powers"] },
  { id: "jade-astral", name: "Jade Astral", description: "Sculptures de jade translucide, feuilles d'or et énergie intérieure.", scopes: ["powers"] },
  { id: "classique-joaillier", name: "Classique joaillier", description: "Emblèmes sertis d’or et de pierres de couleur sur satin.", scopes: ["powers"], portrait: true },
  { id: "derniere-manche", name: "Dernière manche", description: "Trois cases de BD racontent chaque pouvoir autour de la table.", scopes: ["powers"], portrait: true },
  { id: "fenetre-sur-le-wouri", name: "Fenêtre sur le Wouri", description: "Paysages du Wouri en papier découpé, ombres et reflets superposés.", scopes: ["powers"], portrait: true },
  { id: "double-vue", name: "Double vue", description: "Figures tête-bêche et jeux de silhouettes en risographie.", scopes: ["powers"], portrait: true },
] as const satisfies readonly AssetPackDefinition[];

export type AssetPackId = (typeof ASSET_PACKS)[number]["id"];

export function isPortraitPowerPack(id: AssetPackId): boolean {
  const pack: AssetPackDefinition | undefined = ASSET_PACKS.find((item) => item.id === id);
  return pack?.portrait === true;
}

export const DEFAULT_ASSET_PACK: AssetPackId = "classique";

export const ASSET_PACK_SCOPES = ["system", "interface", "powers"] as const;
export type AssetPackScope = (typeof ASSET_PACK_SCOPES)[number];
export type AssetPackSelection = Record<AssetPackScope, AssetPackId>;

export const DEFAULT_ASSET_PACKS: AssetPackSelection = { system: DEFAULT_ASSET_PACK, interface: DEFAULT_ASSET_PACK, powers: DEFAULT_ASSET_PACK };

/** Champ du document runtime_config/asset_pack pour chaque réglage. */
export const ASSET_PACK_FIELD: Record<AssetPackScope, "pack" | "uiPack" | "powerPack"> = { system: "pack", interface: "uiPack", powers: "powerPack" };

/** Seules ces illustrations intégrées sont déclinées. Les créations et uploads de l'admin gardent leur URL. */
export const BUILTIN_POWER_ART_IDS = [
  "oeil_sorcier", "pluie_etoiles", "vent_nord", "benediction_chef", "coupe_circuit",
  "sable_temps", "bouclier_village", "tambour_appel", "cauris_chanceux", "main_griot",
  "eclair_mfoundi", "totem_ancetres", "masque_bluffeur", "filet_pecheur", "marche_nuit",
  "cri_chef", "feu_camp", "pagne_changeant", "troc_cible", "pacte_mains", "sceau_entrave",
] as const;

/** Dossiers déclinés par pack, pour chaque réglage. */
const SCOPE_PATH: Record<AssetPackScope, RegExp> = {
  system: /^\/assets\/njambo\/(economy|tickets|books|ranks)\//,
  interface: /^\/assets\/njambo\/(ui\/icons|ui\/buttons|friendly\/icons|menu)\//,
  powers: /^\/assets\/power-cards\/(?:v2\/)?([a-z0-9_]+)\.webp$/,
};

export function isAssetPackId(value: unknown): value is AssetPackId {
  return typeof value === "string" && ASSET_PACKS.some((pack) => pack.id === value);
}

export function isAssetPackScope(value: unknown): value is AssetPackScope {
  return typeof value === "string" && (ASSET_PACK_SCOPES as readonly string[]).includes(value);
}

export function isAssetPackForScope(value: unknown, scope: AssetPackScope): value is AssetPackId {
  const pack = (ASSET_PACKS as readonly AssetPackDefinition[]).find((pack) => pack.id === value);
  return Boolean(pack && (pack.scopes ?? ["system", "interface"]).includes(scope));
}

export function assetPacksForScope(scope: AssetPackScope) {
  return ASSET_PACKS.filter((pack) => isAssetPackForScope(pack.id, scope));
}

/** Lit le document runtime_config/asset_pack (valeur inconnue → pack classique). */
export function readAssetPacks(data: unknown): AssetPackSelection {
  const source = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const pick = (value: unknown, scope: AssetPackScope) => (isAssetPackForScope(value, scope) ? value : DEFAULT_ASSET_PACK);
  return { system: pick(source.pack, "system"), interface: pick(source.uiPack, "interface"), powers: pick(source.powerPack, "powers") };
}

/** Pack système seul (compatibilité). */
export function readAssetPack(data: unknown): AssetPackId {
  return readAssetPacks(data).system;
}

/** Chemin d'un asset dans le pack donné, pour un réglage (les autres chemins sont rendus tels quels). */
export function assetPackUrl(path: string, pack: AssetPackId, scope: AssetPackScope = "system"): string {
  const pattern = SCOPE_PATH[scope];
  if (pack === DEFAULT_ASSET_PACK || !isAssetPackForScope(pack, scope) || !pattern.test(path)) return path;
  if (scope === "powers") {
    const id = pattern.exec(path)?.[1];
    if (!BUILTIN_POWER_ART_IDS.some((candidate) => candidate === id)) return path;
    return path.replace(pattern, "/assets/power-cards/packs/" + pack + "/$1.webp");
  }
  return path.replace(pattern, `/assets/njambo/packs/${pack}/$1/`);
}

/** Chemin d'un asset selon les packs choisis pour chaque réglage. */
export function resolveAssetUrl(path: string, selection: Partial<AssetPackSelection>): string {
  for (const scope of ASSET_PACK_SCOPES) {
    const next = assetPackUrl(path, selection[scope] ?? DEFAULT_ASSET_PACK, scope);
    if (next !== path) return next;
  }
  return path;
}

/* Netteté en petite taille : les vignettes 64 px (et 128 px pour les assets
   système) sont agrandies sur les écrans de téléphone (densité 2 à 3). On sert
   la déclinaison supérieure, présente dans tous les packs ; next/image la
   réduit ensuite à la taille réellement affichée. */
const CRISP_SYSTEM = /^(\/assets\/njambo\/(?:packs\/[a-z0-9-]+\/)?(?:economy|tickets|books|ranks)\/[a-z0-9-]+)-(?:64|128)\.webp$/;
const CRISP_INTERFACE = /^(\/assets\/njambo\/(?:packs\/[a-z0-9-]+\/)?ui\/(?:icons|buttons)\/[a-z0-9-]+)-64\.webp$/;

export function crispAssetUrl(path: string): string {
  if (CRISP_SYSTEM.test(path)) return path.replace(CRISP_SYSTEM, "$1-256.webp");
  if (CRISP_INTERFACE.test(path)) return path.replace(CRISP_INTERFACE, "$1-128.webp");
  return path;
}
