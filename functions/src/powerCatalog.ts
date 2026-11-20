/* ═══════════════ Catalogue des cartes pouvoir côté serveur ═══════════════
   power_cards/{id}            fiche courante (def + script + statut + brouillon)
   power_card_versions/{id}_v{rev}  révisions publiées, immuables
   power_catalog/current       catalogue publié complet, lu en UNE lecture
                               par les clients et par le serveur
   Le registre en mémoire (config/powers/registry) est rafraîchi au plus
   toutes les 30 s (revision de power_catalog/current) : plusieurs
   processus restent cohérents sans relire le catalogue à chaque coup. */

import { setPowerCatalog, powerCatalogRevision } from "../../config/powers/registry";
import type { PowerModule } from "../../engine/power/types";
import { db } from "./core";

const REFRESH_MS = 30_000;
let lastCheck = 0;
let inflight: Promise<void> | null = null;

export function catalogCards(raw: unknown): PowerModule[] {
  const cards = (raw && typeof raw === "object" ? (raw as { cards?: unknown }).cards : null);
  return Array.isArray(cards) ? cards.filter((card): card is PowerModule => Boolean(card?.def?.id && card?.script)) : [];
}

/** Recharge le registre si le catalogue publié a changé (au plus toutes les 30 s). */
export async function ensurePowerCatalogFresh(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastCheck < REFRESH_MS) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const snap = await db.doc("power_catalog/current").get();
      lastCheck = Date.now();
      if (!snap.exists) return;
      const revision = Number(snap.get("revision") ?? 0);
      if (revision === powerCatalogRevision()) return;
      setPowerCatalog(catalogCards(snap.data()), revision);
    } catch (error) {
      console.error("ensurePowerCatalogFresh", error);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
