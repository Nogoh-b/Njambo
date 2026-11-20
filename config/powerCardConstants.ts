/* ═══════════════ FILE: config/powerCardConstants.ts ═══════════════
   Constantes numériques des effets de cartes pouvoir. Isolées ici (plutôt
   que dans engine/powerEffects.ts) pour que config/powerCards.ts puisse les
   IMPORTER SANS CYCLE : engine/powerEffects.ts importe déjà
   config/powerCards.ts (pour POWER_CARDS_BY_ID), donc l'inverse créerait un
   import circulaire. Ce fichier neutre est importé par les DEUX. */

export const REVEAL_DURATION_MS = 5000;
export const RECOMMEND_DURATION_MS = 6000;
export const FREEZE_DURATION_MS = 10000;
export const STAR_RAIN_BONUS = 200;
export const CAMPFIRE_BONUS = 100;
export const TIMER_BOOST_SECONDS = 8;
export const CHIEF_CRY_SECONDS = 3;
export const LIGHTNING_BONUS = 2;
/** Bénédiction du Chef : multiplicateur du gain de pli. */
export const BENEDICTION_MULTIPLIER = 2;
/** Cauris Chanceux : fraction de la mise remboursée en cas de défaite (0.5 = 50%). */
export const CAURIS_REFUND_RATIO = 0.5;
