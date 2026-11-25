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
import { rewardVisual } from "../eventRewards";
import type { Reward } from "../../domain";
import { audioAsset, imageAsset, type AssetRef } from "./AssetLoader";
import { sysAsset } from "@/lib/assetPack";
import { MENU_SFX_URLS, TABLE_SFX_URLS } from "@/lib/gxeSfx";
import { defaultPowerSoundRef, resolvePowerSoundUrl } from "@/lib/powerSounds";

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
  const primaryRef = entry.def.sound?.ref ?? defaultPowerSoundRef(entry.def.id);
  const sounds: Array<AssetRef | null> = [audioAsset(resolvePowerSoundUrl(primaryRef))];
  for (const step of entry.script?.steps ?? []) {
    for (const track of step.choreo?.tracks ?? []) {
      if (track.kind === "sound") sounds.push(audioAsset(resolvePowerSoundUrl(track.sound)));
    }
  }
  return {
    images: [imageAsset(sysAsset(entry.def.art))].filter(Boolean) as AssetRef[],
    sounds: sounds.filter(Boolean) as AssetRef[],
  };
}

function catalogPowerAssets(): AssetRef[] {
  return listPowerModules().flatMap((entry) => {
    const assets = powerCardAssets(entry.def.id);
    return [...assets.images, ...assets.sounds];
  });
}

export const DEFAULT_CARD_BACK_ASSET = "/assets/njambo/table/card-backs/cauri-soleil.webp";
export const DEFAULT_HAND_ARC_ASSET = "/assets/njambo/table/hand-arc-default.svg";

type CosmeticsLike = {
  avatarFrame?: { imageUrl?: string };
  badge?: { imageUrl?: string };
  cardBack?: { imageUrl?: string };
  handArc?: { imageUrl?: string };
} | null | undefined;

export interface TableManifestInput {
  /** Cartes de pouvoir équipées par le joueur local (celles des adversaires restent secrètes). */
  myPowers?: PowerCardId[];
  /** Cosmétiques connus des participants (cadres, badges, dos de carte). */
  participants?: CosmeticsLike[];
  /** Avatars distants connus (ex. boss d'événement ou joueurs de salle). */
  avatars?: Array<string | null | undefined>;
}

export interface TableAssetGroups {
  /** Tapis, fond de table, dos de cartes et icônes HUD indispensables. */
  decorAndCards: AssetRef[];
  /** Visuels et sons des cartes pouvoir équipées + cosmétiques des joueurs. */
  powersAndAudio: AssetRef[];
  /** Catalogue complet des pouvoirs & cadres chargés en arrière-plan. */
  background: AssetRef[];
}

const TABLE_UI_CRITICAL = [
  DEFAULT_CARD_BACK_ASSET,
  DEFAULT_HAND_ARC_ASSET,
  sysAsset("/assets/njambo/books/card-back-128.webp"),
  "/assets/njambo/ui/brand/njambo-mark-64.webp",
  "/assets/njambo/ui/brand/njambo-mark-128.webp",
  sysAsset("/assets/njambo/economy/nkap-64.webp"),
  sysAsset("/assets/njambo/economy/nkap-stack-64.webp"),
  sysAsset("/assets/njambo/ui/icons/cards-64.webp"),
  sysAsset("/assets/njambo/ui/icons/crown-64.webp"),
  sysAsset("/assets/njambo/ui/icons/trophy-64.webp"),
  sysAsset("/assets/njambo/ui/icons/coin-64.webp"),
  sysAsset("/assets/njambo/ui/icons/check-64.webp"),
  sysAsset("/assets/njambo/ui/icons/sparkle-64.webp"),
  sysAsset("/assets/njambo/ui/icons/home-64.webp"),
] as const;

const TABLE_UI_BACKGROUND = [
  sysAsset("/assets/njambo/ui/icons/hourglass-64.webp"),
  sysAsset("/assets/njambo/ui/buttons/gold-frame.webp"),
  sysAsset("/assets/njambo/ui/buttons/teal-frame.webp"),
  sysAsset("/assets/njambo/ui/buttons/pink-frame.webp"),
  sysAsset("/assets/njambo/ui/buttons/dark-frame.webp"),
] as const;

/**
 * Découpe les assets de la table par catégorie pour l'écran de chargement de
 * partie (suivi visuel par étape : Décors & Cartes, Pouvoirs & Sons, etc.).
 */
export function tableAssetGroups(input: TableManifestInput = {}): TableAssetGroups {
  if (typeof window === "undefined") {
    return { decorAndCards: [], powersAndAudio: [], background: [] };
  }
  const decorRaw: Array<AssetRef | null> = [
    imageAsset(cssVarUrl("--nj-table-image")),
    imageAsset(cssVarUrl("--nj-card-back") ?? DEFAULT_CARD_BACK_ASSET),
    imageAsset(cssVarUrl("--nj-hand-arc") ?? DEFAULT_HAND_ARC_ASSET),
    ...TABLE_UI_CRITICAL.map((url) => imageAsset(url)),
  ];
  const powersRaw: Array<AssetRef | null> = [
    ...TABLE_SFX_URLS.map((url) => audioAsset(url)),
  ];
  for (const cardId of input.myPowers ?? []) {
    const assets = powerCardAssets(cardId);
    powersRaw.push(...assets.images, ...assets.sounds);
  }
  for (const cosmetics of input.participants ?? []) {
    powersRaw.push(
      imageAsset(cosmetics?.avatarFrame?.imageUrl),
      imageAsset(cosmetics?.badge?.imageUrl),
      imageAsset(cosmetics?.cardBack?.imageUrl),
      imageAsset(cosmetics?.handArc?.imageUrl),
    );
  }
  for (const avatarUrl of input.avatars ?? []) {
    powersRaw.push(imageAsset(avatarUrl));
  }
  const backgroundRaw: Array<AssetRef | null> = [
    ...TABLE_UI_BACKGROUND.map((url) => imageAsset(url)),
    ...catalogPowerAssets(),
  ];
  return {
    decorAndCards: decorRaw.filter(Boolean) as AssetRef[],
    powersAndAudio: powersRaw.filter(Boolean) as AssetRef[],
    background: backgroundRaw.filter(Boolean) as AssetRef[],
  };
}

/**
 * Table : tapis + fond + dos de carte (équipé ou classique) + icônes HUD +
 * pouvoirs du joueur (visuels ET sons) en indispensable ; cosmétiques des
 * participants et tout le catalogue de pouvoirs ensuite.
 */
export function tableManifest(input: TableManifestInput = {}): AssetManifest {
  if (typeof window === "undefined") return EMPTY;
  const groups = tableAssetGroups(input);
  return {
    critical: [...groups.decorAndCards, ...groups.powersAndAudio],
    background: groups.background,
  };
}

const RANK_BADGES_64 = [
  "/assets/njambo/ranks/rank-braise-64.webp",
  "/assets/njambo/ranks/rank-mboa-64.webp",
  "/assets/njambo/ranks/rank-notable-64.webp",
  "/assets/njambo/ranks/rank-chef-table-64.webp",
  "/assets/njambo/ranks/rank-tambour-64.webp",
  "/assets/njambo/ranks/rank-legende-237-64.webp",
  "/assets/njambo/ranks/rank-ancetre-64.webp",
] as const;

const MENU_CRITICAL = [
  "/assets/njambo/ui/brand/njambo-mark-256.webp",
  "/assets/njambo/ui/icons/coin-64.webp",
  "/assets/njambo/ui/icons/sparkle-64.webp",
  "/assets/njambo/ui/icons/trophy-64.webp",
  "/assets/njambo/ui/icons/history-64.webp",
  "/assets/njambo/ui/icons/cards-64.webp",
  "/assets/njambo/ui/icons/users-64.webp",
  "/assets/njambo/ui/icons/crown-64.webp",
  "/assets/njambo/ui/icons/notification-64.webp",
  "/assets/njambo/ui/icons/settings-64.webp",
  "/assets/njambo/ui/icons/play-64.webp",
  "/assets/njambo/ui/icons/bot-64.webp",
  "/assets/njambo/ui/icons/online-64.webp",
  "/assets/njambo/ui/icons/friends-64.webp",
  "/assets/njambo/ui/icons/profile-64.webp",
  "/assets/njambo/economy/energy-flask-64.webp",
  "/assets/njambo/economy/nkap-stack-64.webp",
  "/assets/njambo/economy/cauris-pouch-64.webp",
  "/assets/njambo/economy/loyalty-wheel-128.webp",
  "/assets/njambo/economy/cauri-64.webp",
  "/assets/njambo/economy/nkap-64.webp",
  "/assets/njambo/books/card-back-128.webp",
  "/assets/njambo/ranks/rank-mboa-64.webp",
  "/assets/njambo/events/defi-du-mboa-480.webp",
  "/assets/njambo/events/tournoi-du-ter-480.webp",
] as const;

const MENU_BACKGROUND = [
  ...RANK_BADGES_64,
  DEFAULT_CARD_BACK_ASSET,
  DEFAULT_HAND_ARC_ASSET,
  "/assets/njambo/ui/icons/home-64.webp",
  "/assets/njambo/ui/icons/check-64.webp",
  "/assets/njambo/ui/icons/hourglass-64.webp",
  "/assets/njambo/ui/icons/empty-64.webp",
  "/assets/njambo/ui/icons/spark-64.webp",
  "/assets/njambo/ui/icons/star-64.webp",
  "/assets/njambo/ui/icons/plus-64.webp",
  "/assets/njambo/ui/icons/sound-64.webp",
  "/assets/njambo/ui/icons/music-64.webp",
  "/assets/njambo/ui/icons/globe-64.webp",
  "/assets/njambo/ui/icons/message-64.webp",
  "/assets/njambo/ui/icons/search-64.webp",
] as const;

/** Accueil (Salon) : préchargé pendant le SplashScreen avant le premier rendu. */
export function menuManifest(): AssetManifest {
  return {
    critical: MENU_CRITICAL.map((url) => imageAsset(url)!),
    background: [
      ...MENU_BACKGROUND.map((url) => imageAsset(url)!),
      ...MENU_SFX_URLS.map((url) => audioAsset(url)!),
    ],
  };
}

const SHOP_STATIC = [
  sysAsset("/assets/njambo/economy/pack-mboa-256.webp"),
  sysAsset("/assets/njambo/economy/pack-quartier-256.webp"),
  sysAsset("/assets/njambo/economy/pack-chefferie-256.webp"),
  sysAsset("/assets/njambo/economy/cauris-pouch-256.webp"),
  sysAsset("/assets/njambo/economy/nkap-stack-256.webp"),
  sysAsset("/assets/njambo/economy/energy-flask-256.webp"),
  sysAsset("/assets/njambo/tickets/ticket-bronze-256.webp"),
  sysAsset("/assets/njambo/tickets/ticket-argent-256.webp"),
  sysAsset("/assets/njambo/tickets/ticket-or-256.webp"),
  sysAsset("/assets/njambo/books/book-normal-256.webp"),
  sysAsset("/assets/njambo/books/book-rare-256.webp"),
  sysAsset("/assets/njambo/books/book-exceptionnel-256.webp"),
  sysAsset("/assets/njambo/books/card-back-256.webp"),
  sysAsset("/assets/njambo/economy/nkap-stack-64.webp"),
  sysAsset("/assets/njambo/economy/cauris-pouch-64.webp"),
  sysAsset("/assets/njambo/economy/cauri-64.webp"),
  sysAsset("/assets/njambo/economy/energy-flask-64.webp"),
  sysAsset("/assets/njambo/tickets/ticket-bronze-64.webp"),
  sysAsset("/assets/njambo/tickets/ticket-argent-64.webp"),
  sysAsset("/assets/njambo/tickets/ticket-or-64.webp"),
  sysAsset("/assets/njambo/ui/icons/coin-64.webp"),
  sysAsset("/assets/njambo/ui/icons/cards-64.webp"),
  sysAsset("/assets/njambo/ui/icons/sparkle-64.webp"),
  sysAsset("/assets/njambo/ui/icons/trophy-64.webp"),
] as const;

const EVENTS_STATIC = [
  sysAsset("/assets/njambo/tickets/ticket-bronze-64.webp"),
  sysAsset("/assets/njambo/tickets/ticket-argent-64.webp"),
  sysAsset("/assets/njambo/tickets/ticket-or-64.webp"),
  sysAsset("/assets/njambo/economy/nkap-stack-64.webp"),
  sysAsset("/assets/njambo/economy/cauris-pouch-64.webp"),
  sysAsset("/assets/njambo/economy/energy-flask-64.webp"),
  "/assets/njambo/events/defi-du-mboa-480.webp",
  "/assets/njambo/events/tournoi-du-ter-480.webp",
  "/assets/njambo/events/event-fallback.webp",
] as const;

const PLAY_STATIC = [
  "/assets/njambo/economy/energy-flask-64.webp",
  "/assets/njambo/economy/nkap-stack-64.webp",
  "/assets/njambo/economy/nkap-64.webp",
  "/assets/njambo/books/card-back-64.webp",
  "/assets/njambo/books/card-back-128.webp",
  "/assets/njambo/ui/icons/bot-64.webp",
  "/assets/njambo/ui/icons/online-64.webp",
  "/assets/njambo/ui/icons/friends-64.webp",
  "/assets/njambo/ui/icons/play-64.webp",
  "/assets/njambo/ui/icons/cards-64.webp",
  "/assets/njambo/ui/icons/crown-64.webp",
  "/assets/njambo/ui/icons/sparkle-64.webp",
  "/assets/njambo/ui/icons/plus-64.webp",
] as const;

const MINIGAMES_STATIC = [
  "/assets/njambo/tickets/ticket-bronze-128.webp",
  "/assets/njambo/tickets/ticket-bronze-64.webp",
  "/assets/njambo/economy/cauri-128.webp",
  "/assets/njambo/books/card-back-128.webp",
  "/assets/njambo/economy/cauris-pouch-128.webp",
  "/assets/njambo/economy/cauris-pouch-64.webp",
  "/assets/njambo/economy/energy-flask-128.webp",
  "/assets/njambo/economy/nkap-128.webp",
  "/assets/njambo/economy/nkap-stack-64.webp",
  "/assets/njambo/economy/loyalty-wheel-128.webp",
] as const;

const WALLET_STATIC = [
  "/assets/njambo/economy/nkap-stack-64.webp",
  "/assets/njambo/economy/cauris-pouch-64.webp",
  "/assets/njambo/economy/energy-flask-64.webp",
  "/assets/njambo/ui/icons/coin-64.webp",
  ...RANK_BADGES_64,
] as const;

const PROFILE_STATIC = [
  "/assets/njambo/economy/nkap-stack-64.webp",
  "/assets/njambo/economy/cauris-pouch-64.webp",
  "/assets/njambo/economy/energy-flask-64.webp",
  "/assets/njambo/ui/icons/history-64.webp",
  "/assets/njambo/ui/icons/trophy-64.webp",
  "/assets/njambo/ui/icons/profile-64.webp",
  ...RANK_BADGES_64,
] as const;

/** Collection : toutes les cartes actives visibles dans le classeur (≤ 24) en critique, le reste ensuite. */
function powerCollectionManifest(): AssetManifest {
  const arts = listPowerModules()
    .filter((entry) => !entry.dev && !entry.def.archived)
    .map((entry) => imageAsset(sysAsset(entry.def.art)))
    .filter(Boolean) as AssetRef[];
  return {
    critical: arts.slice(0, 24),
    background: [
      ...arts.slice(24),
      ...SHOP_STATIC.map((url) => imageAsset(url)!),
      ...catalogPowerAssets(),
    ],
  };
}

/** Liste des événements : icônes + vignettes des événements connus. */
export function eventsManifest(events: Array<{ imageUrl?: string | null }> = []): AssetManifest {
  return {
    critical: EVENTS_STATIC.map((url) => imageAsset(url)!),
    background: events.map((event) => imageAsset(eventArt(event, "thumb").src)).filter(Boolean) as AssetRef[],
  };
}

type EventLike = {
  imageUrl?: string | null;
  stages?: Array<{ boss?: { avatarUrl?: string }; reward?: Reward[] }>;
  finalReward?: Reward[];
} | null | undefined;

/** Visuels visibles du parcours et de l'introduction des boss. */
export function eventDetailManifest(event: EventLike): AssetManifest {
  const stages = event?.stages ?? [];
  const critical: Array<AssetRef | null> = [imageAsset(eventArt(event).src)];
  for (const stage of stages) critical.push(imageAsset(stage.boss?.avatarUrl));
  const rewards = [...stages.flatMap((stage) => stage.reward ?? []), ...(event?.finalReward ?? [])];
  critical.push(...rewards.map((reward) => imageAsset(rewardVisual(reward).src)));
  return { critical: critical.filter(Boolean) as AssetRef[], background: [] };
}

/** Manifeste statique d'une scène de navigation (pour la porte et le préchargement d'approche). */
export function sceneManifest(scene: string): AssetManifest {
  switch (scene) {
    case "menu":
      return menuManifest();
    case "play":
    case "bot_setup":
    case "online_setup":
    case "friends_invite":
      return { critical: PLAY_STATIC.map((url) => imageAsset(url)!), background: [] };
    case "minigames":
      return { critical: MINIGAMES_STATIC.map((url) => imageAsset(url)!), background: [] };
    case "wallet":
      return { critical: WALLET_STATIC.map((url) => imageAsset(url)!), background: [] };
    case "profile":
    case "leaderboard":
    case "friends":
      return { critical: PROFILE_STATIC.map((url) => imageAsset(url)!), background: [] };
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
