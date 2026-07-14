import type { PowerCardDef, PowerCardId } from "@/types/game";
import { POWER_MODULES } from "@/config/powers";

/**
 * Les définitions vivent désormais dans `config/powers/<id>.ts` (un module
 * par carte : def + script déclaratif). Ce fichier reste le point d'entrée
 * historique pour la boutique/l'inventaire — l'ordre du registre = l'ordre
 * d'affichage.
 *
 * NB : lecture directe de process.env (pas de DEV depuis devConfig — cycle
 * d'import). Les cartes `dev` n'apparaissent jamais en boutique hors dev.
 */
const DEV_MODE =
  process.env.NEXT_PUBLIC_DEV_MODE === "1" || process.env.NEXT_PUBLIC_DEV_MODE === "true";

export const POWER_CARDS: PowerCardDef[] = Object.values(POWER_MODULES)
  .filter((module) => DEV_MODE || !module.dev)
  .map((module) => module.def);

export const POWER_CARDS_BY_ID: Record<PowerCardId, PowerCardDef> = Object.fromEntries(
  Object.values(POWER_MODULES).map((module) => [module.def.id, module.def]),
) as Record<PowerCardId, PowerCardDef>;

export const MAX_EQUIPPED_POWERS = 3;

export const CAURIS_REWARDS = {
  perWin: 0,
  perTrick: 2,
  dailyChallenge: 50,
} as const;

export const STARTING_CAURIS = 20;
