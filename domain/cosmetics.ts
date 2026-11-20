/* ═══════════════ Cosmétiques (phase 5) ═══════════════
   Catalogue géré dans l'admin (cosmetics/{id}), gagné via la récompense
   { type: "cosmetic" }, possédé dans inventories/{uid}.cosmetics, équipé
   dans players/{uid}.equippedCosmetics (public, copie dénormalisée pour
   l'affichage à la table, au classement et sur le profil). */

export type CosmeticType = "card_back" | "avatar_frame" | "badge" | "title";
export type CosmeticRarity = "commun" | "rare" | "epique" | "legendaire";
export type CosmeticSlot = "cardBack" | "avatarFrame" | "badge" | "title";

export const COSMETIC_TYPES: CosmeticType[] = ["card_back", "avatar_frame", "badge", "title"];
export const COSMETIC_RARITIES: CosmeticRarity[] = ["commun", "rare", "epique", "legendaire"];

export const COSMETIC_SLOT: Record<CosmeticType, CosmeticSlot> = {
  card_back: "cardBack",
  avatar_frame: "avatarFrame",
  badge: "badge",
  title: "title",
};

/** Doublon gagné : converti en cauris selon la rareté. */
export const COSMETIC_DUPLICATE_CAURIS: Record<CosmeticRarity, number> = {
  commun: 10, rare: 25, epique: 60, legendaire: 150,
};

export interface CosmeticDefinition {
  id: string;
  type: CosmeticType;
  name: string;
  description?: string;
  /** Image (sauf pour un titre, purement textuel). */
  imageUrl?: string;
  rarity: CosmeticRarity;
  /** Actif : visible dans le catalogue et attribuable. */
  published: boolean;
}

/** Copie affichable d'un cosmétique équipé. */
export interface EquippedCosmetic {
  id: string;
  name: string;
  rarity: CosmeticRarity;
  imageUrl?: string;
}

export type PlayerCosmetics = Partial<Record<CosmeticSlot, EquippedCosmetic>>;

const ID = /^[a-z0-9_]{3,64}$/;
const IMAGE = /^(\/[\w\-./]+|https?:\/\/[\w\-.]+(:\d+)?\/[\w\-./%]*)$/;

export function validateCosmetic(cosmetic: CosmeticDefinition): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];
  if (!ID.test(cosmetic.id)) issues.push({ path: "id", message: "Identifiant : 3 à 64 caractères a-z, 0-9 ou _." });
  if (!COSMETIC_TYPES.includes(cosmetic.type)) issues.push({ path: "type", message: "Type inconnu." });
  if (!COSMETIC_RARITIES.includes(cosmetic.rarity)) issues.push({ path: "rarity", message: "Rareté inconnue." });
  if (cosmetic.name.trim().length < 2 || cosmetic.name.length > 40) issues.push({ path: "name", message: "Nom : 2 à 40 caractères." });
  if ((cosmetic.description ?? "").length > 160) issues.push({ path: "description", message: "Description : 160 caractères maximum." });
  if (cosmetic.type !== "title" && !cosmetic.imageUrl) issues.push({ path: "imageUrl", message: "Image requise (sauf pour un titre)." });
  if (cosmetic.imageUrl && !IMAGE.test(cosmetic.imageUrl)) issues.push({ path: "imageUrl", message: "Image : chemin /… ou URL http(s)." });
  return issues;
}

export function equippedCopy(cosmetic: CosmeticDefinition): EquippedCosmetic {
  return { id: cosmetic.id, name: cosmetic.name, rarity: cosmetic.rarity, ...(cosmetic.imageUrl ? { imageUrl: cosmetic.imageUrl } : {}) };
}

/** Lecture tolérante de players/{uid}.equippedCosmetics. */
export function readPlayerCosmetics(raw: unknown): PlayerCosmetics {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const out: PlayerCosmetics = {};
  for (const slot of Object.values(COSMETIC_SLOT)) {
    const item = source[slot] as Partial<EquippedCosmetic> | null | undefined;
    if (item && typeof item.id === "string" && typeof item.name === "string") {
      out[slot] = { id: item.id, name: item.name, rarity: (COSMETIC_RARITIES.includes(item.rarity as CosmeticRarity) ? item.rarity : "commun") as CosmeticRarity, ...(typeof item.imageUrl === "string" ? { imageUrl: item.imageUrl } : {}) };
    }
  }
  return out;
}

/** Cosmétiques montrés aux autres (classement) : cadre, badge, titre. */
export function displayCosmetics(cosmetics: PlayerCosmetics): PlayerCosmetics {
  const { avatarFrame, badge, title } = cosmetics;
  return { ...(avatarFrame ? { avatarFrame } : {}), ...(badge ? { badge } : {}), ...(title ? { title } : {}) };
}
