/* ═══════════════ Packs d'assets (système, interface et pouvoirs) ═══════════════
   Les images « système » (monnaies, énergie, roue, packs boutique, tickets,
   livres, rangs) existent en plusieurs directions artistiques. L'admin choisit
   le pack actif pour tout le jeu (runtime_config/asset_pack). Le pack
   « classique » correspond aux fichiers historiques ; les autres vivent dans
   /assets/njambo/packs/<pack>/ avec la même arborescence et les mêmes noms.
   Trois réglages indépendants : « system » (monnaies, tickets, livres, rangs)
   et « interface » (icônes, icônes de navigation, cadres de boutons, cartes de
   modes de jeu), et « powers » (illustrations des cartes Pouvoir intégrées).
   Les illustrations Pouvoir vivent dans /assets/power-cards/packs/<id>/, ou,
   pour les packs importés depuis l'admin (ids « import-… »), sur le serveur
   d'uploads (runtime_config/power_packs, voir plus bas).
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

export type BuiltinAssetPackId = (typeof ASSET_PACKS)[number]["id"];
/** Packs de cartes Pouvoir importés depuis l'admin (images sur le serveur d'uploads). */
export type ImportedPowerPackId = `import-${string}`;
export type AssetPackId = BuiltinAssetPackId | ImportedPowerPackId;

/* ═══════════════ Packs Pouvoir importés (runtime_config/power_packs) ═══════════════
   L'admin crée un pack (nom, description, format), puis dépose une image par
   carte intégrée. Le serveur la décline en 720 / 256 / 128 px et enregistre
   ici l'URL de chaque taille. Une carte sans image garde son illustration
   d'origine. Les fichiers vivent hors de git (UPLOAD_DIR/power-packs/<id>/). */

export const POWER_PACKS_DOC = "power_packs";
export const IMPORTED_POWER_PACK_PREFIX = "import-";
export const IMPORTED_POWER_PACK_LIMITS = { packs: 30, name: 40, description: 160 } as const;

export interface ImportedPowerArt {
  /** Illustration 720 px de large, URL absolue du serveur d'uploads. */
  url: string;
  /** Vignettes 256 et 128 px. */
  thumb: string;
  small: string;
  /** Empreinte du fichier source (change à chaque nouvel import de la carte). */
  v: string;
  updatedAt: number;
}

export interface ImportedPowerPack extends AssetPackDefinition {
  id: ImportedPowerPackId;
  portrait: boolean;
  art: Partial<Record<string, ImportedPowerArt>>;
  createdAt: number;
  updatedAt: number;
}

let importedPowerPacks: readonly ImportedPowerPack[] = [];

/** Packs importés connus (client : suivis en temps réel ; serveur : lus à la demande). */
export function setImportedPowerPacks(packs: readonly ImportedPowerPack[]) {
  importedPowerPacks = packs;
}

export function getImportedPowerPacks(): readonly ImportedPowerPack[] {
  return importedPowerPacks;
}

export function isImportedPowerPackId(value: unknown): value is ImportedPowerPackId {
  return typeof value === "string" && /^import-[a-z0-9-]{2,48}$/.test(value);
}

const isHttpUrl = (value: unknown): value is string => typeof value === "string" && value.length <= 400 && /^https?:\/\/[^\s"'<>]+$/.test(value);

function readImportedArt(value: unknown): ImportedPowerArt | null {
  if (!value || typeof value !== "object") return null;
  const art = value as Record<string, unknown>;
  if (!isHttpUrl(art.url) || !isHttpUrl(art.thumb) || !isHttpUrl(art.small)) return null;
  return { url: art.url, thumb: art.thumb, small: art.small, v: typeof art.v === "string" ? art.v : "", updatedAt: Number(art.updatedAt) || 0 };
}

/** Lit le document runtime_config/power_packs (entrées invalides ignorées). */
export function readImportedPowerPacks(data: unknown): ImportedPowerPack[] {
  const source = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const list = Array.isArray(source.packs) ? source.packs : [];
  const packs: ImportedPowerPack[] = [];
  for (const raw of list.slice(0, IMPORTED_POWER_PACK_LIMITS.packs)) {
    if (!raw || typeof raw !== "object") continue;
    const pack = raw as Record<string, unknown>;
    if (!isImportedPowerPackId(pack.id) || packs.some((item) => item.id === pack.id)) continue;
    const name = typeof pack.name === "string" ? pack.name.trim().slice(0, IMPORTED_POWER_PACK_LIMITS.name) : "";
    if (!name) continue;
    const art: Partial<Record<string, ImportedPowerArt>> = {};
    const rawArt = pack.art && typeof pack.art === "object" ? (pack.art as Record<string, unknown>) : {};
    for (const card of BUILTIN_POWER_ART_IDS) {
      const entry = readImportedArt(rawArt[card]);
      if (entry) art[card] = entry;
    }
    packs.push({
      id: pack.id,
      name,
      description: typeof pack.description === "string" ? pack.description.trim().slice(0, IMPORTED_POWER_PACK_LIMITS.description) : "",
      scopes: ["powers"],
      portrait: pack.portrait === true,
      art,
      createdAt: Number(pack.createdAt) || 0,
      updatedAt: Number(pack.updatedAt) || 0,
    });
  }
  return packs;
}

/** Identifiant d'un nouveau pack importé, dérivé de son nom et unique. */
export function importedPowerPackIdFor(name: string, taken: readonly string[]): ImportedPowerPackId {
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "pack";
  const base = slug.length >= 2 ? slug : `pack-${slug}`;
  let id = `${IMPORTED_POWER_PACK_PREFIX}${base}` as ImportedPowerPackId;
  for (let n = 2; taken.includes(id); n++) id = `${IMPORTED_POWER_PACK_PREFIX}${base}-${n}` as ImportedPowerPackId;
  return id;
}

function importedPack(id: unknown, imported: readonly ImportedPowerPack[] = importedPowerPacks) {
  return imported.find((pack) => pack.id === id);
}

export function isPortraitPowerPack(id: AssetPackId, imported: readonly ImportedPowerPack[] = importedPowerPacks): boolean {
  const pack: AssetPackDefinition | undefined = ASSET_PACKS.find((item) => item.id === id) ?? importedPack(id, imported);
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

export function isAssetPackId(value: unknown, imported: readonly ImportedPowerPack[] = importedPowerPacks): value is AssetPackId {
  return typeof value === "string" && (ASSET_PACKS.some((pack) => pack.id === value) || Boolean(importedPack(value, imported)));
}

export function isAssetPackScope(value: unknown): value is AssetPackScope {
  return typeof value === "string" && (ASSET_PACK_SCOPES as readonly string[]).includes(value);
}

export function isAssetPackForScope(value: unknown, scope: AssetPackScope, imported: readonly ImportedPowerPack[] = importedPowerPacks): value is AssetPackId {
  if (scope === "powers" && importedPack(value, imported)) return true;
  const pack = (ASSET_PACKS as readonly AssetPackDefinition[]).find((pack) => pack.id === value);
  return Boolean(pack && (pack.scopes ?? ["system", "interface"]).includes(scope));
}

/** Packs proposés pour un réglage (les packs Pouvoir importés suivent les packs intégrés). */
export function assetPacksForScope(scope: AssetPackScope, imported: readonly ImportedPowerPack[] = importedPowerPacks): Array<AssetPackDefinition & { id: AssetPackId }> {
  const builtin = ASSET_PACKS.filter((pack) => isAssetPackForScope(pack.id, scope, imported));
  return scope === "powers" ? [...builtin, ...imported] : builtin;
}

/** Lit le document runtime_config/asset_pack (valeur inconnue → pack classique). */
export function readAssetPacks(data: unknown, imported: readonly ImportedPowerPack[] = importedPowerPacks): AssetPackSelection {
  const source = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const pick = (value: unknown, scope: AssetPackScope) => (isAssetPackForScope(value, scope, imported) ? value : DEFAULT_ASSET_PACK);
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
    // Pack importé : image du serveur d'uploads, sinon illustration d'origine.
    const imported = importedPack(pack);
    if (imported) return (id && imported.art[id]?.url) || path;
    return path.replace(pattern, "/assets/power-cards/packs/" + pack + "/$1.webp");
  }
  return path.replace(pattern, `/assets/njambo/packs/${pack}/$1/`);
}

/** Vignette 256 px d'une illustration Pouvoir dans un pack (aperçus de l'admin). */
export function powerPackThumbUrl(path: string, pack: AssetPackId): string {
  const url = assetPackUrl(path, pack, "powers");
  if (url === path) return path;
  const imported = importedPack(pack);
  if (imported) return Object.values(imported.art).find((art) => art?.url === url)?.thumb ?? url;
  return url.replace(/\.webp$/, "-256.webp");
}

/** Vrai si l'URL résolue d'une illustration Pouvoir vient d'un pack (intégré ou importé). */
export function isPackedPowerArt(resolved: string): boolean {
  return resolved.startsWith("/assets/power-cards/packs/") || resolved.includes("/uploads/power-packs/");
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
