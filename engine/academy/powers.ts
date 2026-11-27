/* ═══════════════ Académie : cartes Pouvoir des scènes ═══════════════
   On enseigne 4 gestes, pas 21 cartes. Si l'admin désactive ou archive une
   carte d'une scène, elle est remplacée par une carte du même geste qui fait
   encore gagner la scène (vérifié en la rejouant) ; sinon la scène est masquée. */

import { GAME_CONFIG } from "../../config/gameConfig";
import { POWER_CARDS_BY_ID } from "../../config/powerCards";
import { getPowerModule, listPowerModules } from "../../config/powers";
import type { GameConfig, PowerCardId } from "../../types/game";
import type { AcademyScene, CoachKey } from "./types";
import { validateScene } from "./validate";

export type PowerGesture =
  /** 1 toucher, effet immédiat. */
  | "direct"
  /** Toucher, puis choisir l'adversaire. */
  | "targeted"
  /** Choisir des cartes, puis valider. */
  | "choice"
  /** Se poser au bon moment : défense ou bonus de fin. */
  | "defense";

/** Classement du plan (docs/academie-suivi.md, A8). */
const GESTURE_BY_CARD: Record<PowerCardId, PowerGesture> = {
  eclair_mfoundi: "direct", tambour_appel: "direct", vent_nord: "direct", marche_nuit: "direct",
  main_griot: "direct", cri_chef: "direct", pagne_changeant: "direct",
  coupe_circuit: "targeted", filet_pecheur: "targeted", oeil_sorcier: "targeted", sable_temps: "targeted", sceau_entrave: "targeted",
  troc_cible: "choice", pacte_mains: "choice",
  bouclier_village: "defense", masque_bluffeur: "defense", totem_ancetres: "defense", cauris_chanceux: "defense",
  feu_camp: "defense", pluie_etoiles: "defense", benediction_chef: "defense",
};

/** Geste d'une carte ; une carte ajoutée par l'admin est classée d'après son script. */
export function gestureOf(cardId: PowerCardId): PowerGesture | null {
  if (GESTURE_BY_CARD[cardId]) return GESTURE_BY_CARD[cardId];
  const card = getPowerModule(cardId);
  if (!card) return null;
  if (card.script.steps.some((step) => step.choice)) return "choice";
  if (card.script.target.count !== "none" && card.script.target.chooser !== "engine") return "targeted";
  if (card.def.category === "defense") return "defense";
  return "direct";
}

const usable = (cardId: PowerCardId) => {
  const def = POWER_CARDS_BY_ID[cardId];
  return Boolean(def && !def.disabled && !def.archived);
};

/** Une scène doit se rejouer à l'identique : pas de remplaçant dont l'effet tire au hasard (Sceau d'Entrave…). */
const deterministic = (cardId: PowerCardId) => !JSON.stringify(getPowerModule(cardId)?.script ?? {}).includes('"kind":"random"');

/** Cartes Pouvoir d'une scène (équipées ou jouées). */
export function scenePowers(scene: AcademyScene): PowerCardId[] {
  const cards = Object.values(scene.equipped ?? {}).flatMap((list) => list ?? []);
  for (const action of scene.actions) if ("power" in action) cards.push(action.power);
  return [...new Set(cards)];
}

function replacePower(scene: AcademyScene, from: PowerCardId, to: PowerCardId): AcademyScene {
  const swap = (cardId: PowerCardId) => (cardId === from ? to : cardId);
  return {
    ...scene,
    equipped: Object.fromEntries(Object.entries(scene.equipped ?? {}).map(([seat, list]) => [seat, (list ?? []).map(swap)])),
    actions: scene.actions.map((action) => ("power" in action ? { ...action, power: swap(action.power) } : action)),
  };
}

/** La scène jouable avec le catalogue actuel, ou null si elle doit être masquée. */
export function resolveScenePowers(scene: AcademyScene, cfg: GameConfig = GAME_CONFIG, texts?: Record<CoachKey, string>): AcademyScene | null {
  let current = scene;
  for (const cardId of scenePowers(scene)) {
    if (usable(cardId)) continue;
    const gesture = gestureOf(cardId);
    const taken = new Set(scenePowers(current));
    const candidates = listPowerModules()
      .filter((card) => !card.dev && card.def.id !== cardId && !taken.has(card.def.id) && usable(card.def.id)
        && deterministic(card.def.id) && gestureOf(card.def.id) === gesture)
      .map((card) => replacePower(current, cardId, card.def.id));
    const replacement = candidates.find((candidate) => validateScene(candidate, cfg, texts).length === 0);
    if (!replacement) return null;
    current = replacement;
  }
  return current;
}
