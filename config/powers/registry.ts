/* ═══════════════ Registre dynamique des cartes pouvoir ═══════════════
   Source unique pour le moteur, le serveur et l'interface. Démarre avec les
   cartes du code (config/powers/*.ts) puis est remplacé par le catalogue
   publié depuis l'admin (setPowerCatalog). Les rendus custom éventuels
   (renderOverlay) restent fournis par le code pour un même identifiant. */

import type { PowerBoosterTier, PowerCardDef, PowerCardId, PowerRarity } from "../../types/game";
import type { PowerModule, PowerScript } from "../../engine/power/types";
import { CODE_BOOSTER_TIERS, CODE_POWER_MODULES } from "./index";

let modules: Map<PowerCardId, PowerModule> | null = null;
let revision = 0;
let source: "code" | "catalog" = "code";
const listeners = new Set<() => void>();

function current(): Map<PowerCardId, PowerModule> {
  // Initialisation paresseuse : évite l'ordre d'évaluation circulaire avec ./index.
  if (!modules) modules = new Map(Object.entries(CODE_POWER_MODULES));
  return modules;
}

/** Remplace le catalogue (liste ordonnée). Une liste vide est ignorée (repli sur le code). */
export function setPowerCatalog(cards: PowerModule[], catalogRevision?: number): boolean {
  if (!Array.isArray(cards) || cards.length === 0) return false;
  const next = new Map<PowerCardId, PowerModule>();
  for (const card of cards) {
    if (!card?.def?.id || !card.script) continue;
    const code = CODE_POWER_MODULES[card.def.id];
    next.set(card.def.id, { ...card, ...(code?.renderOverlay ? { renderOverlay: code.renderOverlay } : {}) });
  }
  if (next.size === 0) return false;
  modules = next;
  revision = typeof catalogRevision === "number" ? catalogRevision : revision + 1;
  source = "catalog";
  listeners.forEach((listener) => listener());
  return true;
}

/** Revient au catalogue du code (tests). */
export function resetPowerCatalog() {
  modules = null;
  revision = 0;
  source = "code";
  listeners.forEach((listener) => listener());
}

export function subscribePowerCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function powerCatalogRevision() { return revision; }
export function powerCatalogSource() { return source; }

export function getPowerModule(cardId: PowerCardId | null | undefined): PowerModule | undefined {
  return cardId ? current().get(cardId) : undefined;
}

export function listPowerModules(): PowerModule[] {
  return [...current().values()];
}

/** Script d'une carte ; lève si la carte est inconnue. */
export function powerScriptOf(cardId: PowerCardId): PowerScript {
  const card = getPowerModule(cardId);
  if (!card) throw new Error(`UNKNOWN_POWER_CARD:${cardId}`);
  return card.script;
}

/** La carte attend-elle un choix de cible de l'activateur (modale) ? */
export function powerRequiresTarget(cardId: PowerCardId): boolean {
  const target = getPowerModule(cardId)?.script.target;
  return Boolean(target && target.count !== "none" && target.chooser !== "engine");
}

/** Correspondance rareté de carte → palier de livre (cartes sans réglage explicite). */
export const RARITY_BOOSTER_TIER: Record<PowerRarity, PowerBoosterTier> = {
  common: "village", rare: "notable", epic: "chef", legendary: "ancetre",
};

export function boosterTierOf(def: Pick<PowerCardDef, "id" | "rarity" | "boosterTier">): PowerBoosterTier {
  return def.boosterTier ?? CODE_BOOSTER_TIERS[def.id] ?? RARITY_BOOSTER_TIER[def.rarity] ?? "village";
}

/** La carte peut-elle tomber dans un livre ? Les cartes du code absentes de
 *  l'ancienne table des livres n'y tombaient pas : on conserve ce comportement. */
export function isInBoosters(def: Pick<PowerCardDef, "id" | "boosterTier" | "inBoosters" | "archived" | "disabled">): boolean {
  if (def.inBoosters === false || def.archived || def.disabled) return false;
  if (def.boosterTier || def.inBoosters === true) return true;
  return !(def.id in CODE_POWER_MODULES) || def.id in CODE_BOOSTER_TIERS;
}
