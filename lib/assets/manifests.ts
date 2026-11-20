/* ═══════════════ Manifestes d'assets par écran ═══════════════
   Chaque écran déclare ses assets :
   - critical   : indispensables avant affichage (LoadingGate attend, ≤ 6 s) ;
   - background : chargés après, sans bloquer (préchargement discret).
   Les fonds définis en CSS (variables --nj-table-image, --nj-card-back…) sont
   lus dans le style calculé : on charge exactement la variante (portrait,
   paysage, bureau) et le dos de carte équipé que le navigateur affichera. */

import { getPowerModule, listPowerModules } from "../../config/powers/registry";
import type { PowerCardId } from "../../types/game";
import { eventArt } from "../eventArt";
import { audioAsset, imageAsset, type AssetRef } from "./AssetLoader";

export interface AssetManifest { critical: AssetRef[]; background: AssetRef[] }

const EMPTY: AssetManifest = { critical: [], background: [] };

/** URL d'une variable CSS de type `url("…") …` sur :root (côté client). */
export function cssVarUrl(name: string): string | null {
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") return null;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  const match = /url\(\s*(['"]?)(.*?)\1\s*\)/.exec(value);
  return match?.[2] ? match[2].replace(/%22/g, '"') : null;
}

/** Visuel, son d'activation et sons de chorégraphie d'une carte de pouvoir. */
export function powerCardAssets(cardId: PowerCardId): { images: AssetRef[]; sounds: AssetRef[] } {
  const entry = getPowerModule(cardId);
  if (!entry) return { images: [], sounds: [] };
  const sounds: Array<AssetRef | null> = [audioAsset(entry.def.sound?.ref)];
  for (const step of entry.script?.steps ?? []) {
    for (const track of step.choreo?.tracks ?? []) {
      if (track.kind === "sound") sounds.push(audioAsset(track.sound));
    }
  }
  return {
    images: [imageAsset(entry.def.art)].filter(Boolean) as AssetRef[],
    sounds: sounds.filter(Boolean) as AssetRef[],
  };
}

function catalogPowerAssets(): AssetRef[] {
  return listPowerModules().flatMap((entry) => {
    const assets = powerCardAssets(entry.def.id);
    return [...assets.images, ...assets.sounds];
  });
}

type CosmeticsLike = { avatarFrame?: { imageUrl?: string }; badge?: { imageUrl?: string }; cardBack?: { imageUrl?: string } } | null | undefined;

export interface TableManifestInput {
  /** Cartes de pouvoir équipées par le joueur local (celles des adversaires restent secrètes). */
  myPowers?: PowerCardId[];
  /** Cosmétiques connus des participants (cadres, badges). */
  participants?: CosmeticsLike[];
}

/**
 * Table : tapis + fond + dos de carte (équipé ou classique) + pouvoirs du
 * joueur (visuels ET sons) en indispensable ; cosmétiques des participants et
 * tout le catalogue de pouvoirs (ce que les adversaires peuvent jouer) ensuite.
 */
export function tableManifest(input: TableManifestInput = {}): AssetManifest {
  if (typeof window === "undefined") return EMPTY;
  const critical: Array<AssetRef | null> = [
    imageAsset(cssVarUrl("--nj-table-image")),
    imageAsset(cssVarUrl("--nj-solar-app-bg")),
    imageAsset(cssVarUrl("--nj-card-back") ?? "/assets/njambo/card-back.webp"),
  ];
  for (const cardId of input.myPowers ?? []) {
    const assets = powerCardAssets(cardId);
    critical.push(...assets.images, ...assets.sounds);
  }
  const background: Array<AssetRef | null> = [];
  for (const cosmetics of input.participants ?? []) {
    background.push(imageAsset(cosmetics?.avatarFrame?.imageUrl), imageAsset(cosmetics?.badge?.imageUrl));
  }
  background.push(...catalogPowerAssets());
  return { critical: critical.filter(Boolean) as AssetRef[], background: background.filter(Boolean) as AssetRef[] };
}

const SHOP_STATIC = [
  "/assets/njambo/books/book-normal-256.webp",
  "/assets/njambo/books/book-rare-256.webp",
  "/assets/njambo/books/book-exceptionnel-256.webp",
  "/assets/njambo/books/card-back-256.webp",
  "/assets/njambo/economy/nkap-stack-64.webp",
  "/assets/njambo/economy/cauris-pouch-64.webp",
];

const EVENTS_STATIC = [
  "/assets/njambo/tickets/ticket-bronze-64.webp",
  "/assets/njambo/tickets/ticket-argent-64.webp",
  "/assets/njambo/tickets/ticket-or-64.webp",
  "/assets/njambo/economy/nkap-stack-64.webp",
  "/assets/njambo/economy/cauris-pouch-64.webp",
  "/assets/njambo/economy/energy-flask-64.webp",
];

/** Collection : les 12 premiers visuels (premier écran) bloquent, le reste suit. */
function powerCollectionManifest(): AssetManifest {
  const arts = listPowerModules().filter((entry) => !entry.dev && !entry.def.archived).map((entry) => imageAsset(entry.def.art)).filter(Boolean) as AssetRef[];
  return { critical: arts.slice(0, 12), background: [...arts.slice(12), ...catalogPowerAssets()] };
}

/** Liste des événements : icônes + vignettes des événements connus. */
export function eventsManifest(events: Array<{ imageUrl?: string | null }> = []): AssetManifest {
  return {
    critical: EVENTS_STATIC.map((url) => imageAsset(url)!),
    background: events.map((event) => imageAsset(eventArt(event, "thumb").src)).filter(Boolean) as AssetRef[],
  };
}

/** Détail d'un événement : son illustration plein format. */
export function eventDetailManifest(event: { imageUrl?: string | null } | null | undefined): AssetManifest {
  return { critical: [imageAsset(eventArt(event).src)!], background: [] };
}

/** Manifeste statique d'une scène de navigation (pour la porte et le préchargement d'approche). */
export function sceneManifest(scene: string): AssetManifest {
  switch (scene) {
    case "shop":
    case "power_shop":
      return { critical: SHOP_STATIC.map((url) => imageAsset(url)!), background: catalogPowerAssets() };
    case "power_collection":
      return powerCollectionManifest();
    case "events":
      return eventsManifest();
    default:
      return EMPTY;
  }
}

/** Scènes depuis lesquelles on s'apprête à rejoindre une table. */
export const TABLE_APPROACH_SCENES = new Set(["play", "bot_setup", "online_setup", "friends_invite", "lobby", "event_detail"]);
