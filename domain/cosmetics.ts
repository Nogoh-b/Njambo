/* ═══════════════ Cosmétiques (phase 5) ═══════════════
   Catalogue géré dans l'admin (cosmetics/{id}), gagné via la récompense
   { type: "cosmetic" }, possédé dans inventories/{uid}.cosmetics, équipé
   dans players/{uid}.equippedCosmetics (public, copie dénormalisée pour
   l'affichage à la table, au classement et sur le profil).

   Un « Style d'animation » (atelier, phase G5) porte ses réglages dans
   `style` : ils sont copiés avec lui pour que tous les joueurs voient les
   mouvements de son propriétaire à ses couleurs. */

import { readAnimStyle, validateAnimStyle, type AnimStyle } from "../engine/anim/style";

export type CosmeticType = "card_back" | "avatar_frame" | "badge" | "title" | "anim_style" | "hand_arc";
export type CosmeticRarity = "commun" | "rare" | "epique" | "legendaire";
export type CosmeticSlot = "cardBack" | "avatarFrame" | "badge" | "title" | "animStyle" | "handArc";

export const COSMETIC_TYPES: CosmeticType[] = ["card_back", "avatar_frame", "badge", "title", "anim_style", "hand_arc"];
export const COSMETIC_RARITIES: CosmeticRarity[] = ["commun", "rare", "epique", "legendaire"];

export const COSMETIC_SLOT: Record<CosmeticType, CosmeticSlot> = {
  card_back: "cardBack",
  avatar_frame: "avatarFrame",
  badge: "badge",
  title: "title",
  anim_style: "animStyle",
  hand_arc: "handArc",
};

/** Types sans image obligatoire : le titre est un texte, le style se voit en jeu. */
const IMAGE_OPTIONAL: CosmeticType[] = ["title", "anim_style"];

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
  /** Réglages d'un style d'animation (type « anim_style » seulement). */
  style?: AnimStyle;
}

/** Copie affichable d'un cosmétique équipé. */
export interface EquippedCosmetic {
  id: string;
  name: string;
  rarity: CosmeticRarity;
  imageUrl?: string;
  style?: AnimStyle;
}

export type PlayerCosmetics = Partial<Record<CosmeticSlot, EquippedCosmetic>>;

export const COSMETIC_DEFAULTS_DOC = "cosmetics_defaults";

export interface DefaultCosmeticChoice {
  /** Identifiant d'un cosmétique du catalogue (si choisi dans le catalogue). */
  cosmeticId?: string;
  /** Nom lisible affiché dans l'admin et la collection. */
  name?: string;
  /** Asset image configuré comme valeur par défaut globale. */
  imageUrl: string;
}

export interface DefaultCosmeticsConfig {
  cardBack?: DefaultCosmeticChoice;
  handArc?: DefaultCosmeticChoice;
}

export type DefaultCosmeticSlot = keyof DefaultCosmeticsConfig;

const ID = /^[a-z0-9_]{3,64}$/;
const IMAGE = /^(\/[\w\-./]+|https?:\/\/[\w\-.]+(:\d+)?\/[\w\-./%]*)$/;

export function isValidCosmeticImageUrl(value: unknown): value is string {
  return typeof value === "string" && IMAGE.test(value);
}

export function validateCosmetic(cosmetic: CosmeticDefinition): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];
  if (!ID.test(cosmetic.id)) issues.push({ path: "id", message: "Identifiant : 3 à 64 caractères a-z, 0-9 ou _." });
  if (!COSMETIC_TYPES.includes(cosmetic.type)) issues.push({ path: "type", message: "Type inconnu." });
  if (!COSMETIC_RARITIES.includes(cosmetic.rarity)) issues.push({ path: "rarity", message: "Rareté inconnue." });
  if (cosmetic.name.trim().length < 2 || cosmetic.name.length > 40) issues.push({ path: "name", message: "Nom : 2 à 40 caractères." });
  if ((cosmetic.description ?? "").length > 160) issues.push({ path: "description", message: "Description : 160 caractères maximum." });
  if (!IMAGE_OPTIONAL.includes(cosmetic.type) && !cosmetic.imageUrl) issues.push({ path: "imageUrl", message: "Image requise (sauf pour un titre ou un style d'animation)." });
  if (cosmetic.imageUrl && !IMAGE.test(cosmetic.imageUrl)) issues.push({ path: "imageUrl", message: "Image : chemin /… ou URL http(s)." });
  if (cosmetic.type === "anim_style") {
    if (cosmetic.style === undefined) issues.push({ path: "style", message: "Réglages du style requis." });
    else issues.push(...validateAnimStyle(cosmetic.style, "style"));
  } else if (cosmetic.style !== undefined) {
    issues.push({ path: "style", message: "Seul un style d'animation a des réglages d'animation." });
  }
  return issues;
}

export function equippedCopy(cosmetic: CosmeticDefinition): EquippedCosmetic {
  return {
    id: cosmetic.id, name: cosmetic.name, rarity: cosmetic.rarity,
    ...(cosmetic.imageUrl ? { imageUrl: cosmetic.imageUrl } : {}),
    ...(cosmetic.type === "anim_style" && cosmetic.style ? { style: cosmetic.style } : {}),
  };
}

/** Lecture tolérante de players/{uid}.equippedCosmetics. */
export function readPlayerCosmetics(raw: unknown): PlayerCosmetics {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const out: PlayerCosmetics = {};
  for (const slot of Object.values(COSMETIC_SLOT)) {
    const item = source[slot] as Partial<EquippedCosmetic> | null | undefined;
    if (item && typeof item.id === "string" && typeof item.name === "string") {
      const style = slot === "animStyle" ? readAnimStyle(item.style) : null;
      out[slot] = {
        id: item.id, name: item.name, rarity: (COSMETIC_RARITIES.includes(item.rarity as CosmeticRarity) ? item.rarity : "commun") as CosmeticRarity,
        ...(typeof item.imageUrl === "string" ? { imageUrl: item.imageUrl } : {}),
        ...(style ? { style } : {}),
      };
    }
  }
  return out;
}

/** Cosmétiques montrés aux autres (classement) : cadre, badge, titre. */
export function displayCosmetics(cosmetics: PlayerCosmetics): PlayerCosmetics {
  const { avatarFrame, badge, title } = cosmetics;
  return { ...(avatarFrame ? { avatarFrame } : {}), ...(badge ? { badge } : {}), ...(title ? { title } : {}) };
}

/** Lecture tolérante de runtime_config/cosmetics_defaults (visuels par défaut configurés en admin). */
export function readDefaultCosmetics(raw: unknown): DefaultCosmeticsConfig {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: DefaultCosmeticsConfig = {};
  for (const slot of ["cardBack", "handArc"] as const) {
    const entry = source[slot] as Partial<DefaultCosmeticChoice> | null | undefined;
    if (entry && isValidCosmeticImageUrl(entry.imageUrl)) {
      out[slot] = {
        imageUrl: entry.imageUrl,
        ...(typeof entry.cosmeticId === "string" && ID.test(entry.cosmeticId) ? { cosmeticId: entry.cosmeticId } : {}),
        ...(typeof entry.name === "string" && entry.name.trim() ? { name: entry.name.trim().slice(0, 40) } : {}),
      };
    }
  }
  return out;
}
