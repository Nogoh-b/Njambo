import type { PowerCardDef, PowerCardId } from "../types/game";
import { listPowerModules, subscribePowerCatalog } from "./powers";

/**
 * Vue « boutique / inventaire » du registre dynamique des cartes pouvoir
 * (config/powers/registry.ts). Ces deux objets sont MIS À JOUR EN PLACE à
 * chaque changement de catalogue (publication admin) : les imports existants
 * restent valides. Pour re-rendre à chaque changement, utiliser
 * usePowerCatalogRevision() (hooks/usePowerCatalog.ts).
 *
 * POWER_CARDS = cartes proposées (sans les cartes de test hors dev, ni les
 * archivées). POWER_CARDS_BY_ID = TOUTES les cartes connues (une carte
 * archivée reste jouable par ses possesseurs).
 *
 * NB : lecture directe de process.env (pas de DEV depuis devConfig — cycle
 * d'import).
 */
const DEV_MODE =
  process.env.NEXT_PUBLIC_DEV_MODE === "1" || process.env.NEXT_PUBLIC_DEV_MODE === "true";

export const POWER_CARDS: PowerCardDef[] = [];
export const POWER_CARDS_BY_ID: Record<PowerCardId, PowerCardDef> = {};

function refresh() {
  const modules = listPowerModules();
  POWER_CARDS.splice(0, POWER_CARDS.length, ...modules
    .filter((entry) => (DEV_MODE || !entry.dev) && !entry.def.archived)
    .map((entry) => entry.def));
  for (const key of Object.keys(POWER_CARDS_BY_ID)) delete POWER_CARDS_BY_ID[key];
  for (const entry of modules) POWER_CARDS_BY_ID[entry.def.id] = entry.def;
}
refresh();
subscribePowerCatalog(refresh);

/** Valeur de repli ; les parties utilisent runtime_config/gameplay. */
export const MAX_EQUIPPED_POWERS = 3;

export const CAURIS_REWARDS = {
  perWin: 0,
  perTrick: 2,
  dailyChallenge: 50,
} as const;

export const STARTING_CAURIS = 20;
