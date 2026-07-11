import { POWER_CARDS } from "@/config/powerCards";
import type { PowerCardId } from "@/types/game";

/* ═══════════════ FILE: config/devConfig.ts ═══════════════
   Triches de DÉVELOPPEMENT, pilotées par des variables d'environnement
   `NEXT_PUBLIC_DEV_*` (inlinées au build). Tout est désactivé si le
   master switch `NEXT_PUBLIC_DEV_MODE` n'est pas activé → aucun impact prod.

   .env.local (exemple) :
     NEXT_PUBLIC_DEV_MODE=1              # master : active les triches ci-dessous
     NEXT_PUBLIC_DEV_ALL_POWERS=1        # équipe TOUTES les cartes pouvoir
     NEXT_PUBLIC_DEV_POWER_COUNT=6       # ou : équipe les N premières (prioritaire)
     NEXT_PUBLIC_DEV_UNLIMITED_POWERS=1  # réutilisation illimitée des pouvoirs
     NEXT_PUBLIC_DEV_UNLIMITED_TIME=1    # timer de tour désactivé
     NEXT_PUBLIC_DEV_RICH_BALANCE=1000000 # solde figé (0 = off)
*/

const bool = (v: string | undefined): boolean => v === "1" || v === "true";
const int = (v: string | undefined, def = 0): number => {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : def;
};

const on = bool(process.env.NEXT_PUBLIC_DEV_MODE);

export const DEV = {
  enabled: on,
  allPowers: on && bool(process.env.NEXT_PUBLIC_DEV_ALL_POWERS),
  /** Nombre de cartes pouvoir à équiper (0 = utiliser allPowers / défaut). */
  powerCount: on ? int(process.env.NEXT_PUBLIC_DEV_POWER_COUNT, 0) : 0,
  unlimitedPowers: on && bool(process.env.NEXT_PUBLIC_DEV_UNLIMITED_POWERS),
  unlimitedTime: on && bool(process.env.NEXT_PUBLIC_DEV_UNLIMITED_TIME),
  /** Solde figé (F). 0 = désactivé. */
  richBalance: on ? int(process.env.NEXT_PUBLIC_DEV_RICH_BALANCE, 0) : 0,
} as const;

/** Cartes pouvoir équipées en mode dev : N premières, ou toutes, sinon le fallback. */
export function devEquippedPowers(fallback: PowerCardId[]): PowerCardId[] {
  if (!DEV.enabled) return fallback;
  const all = POWER_CARDS.map((c) => c.id);
  if (DEV.powerCount > 0) return all.slice(0, Math.min(DEV.powerCount, all.length));
  if (DEV.allPowers) return all;
  return fallback;
}
