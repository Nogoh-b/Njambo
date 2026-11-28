/* ═══════════════ Validation des cartes pouvoir (catalogue dynamique) ═══════════════
   Partagée par l'éditeur admin (erreurs en direct), le serveur (refus de
   publier) et le client (une carte reçue invalide est ignorée). Vérifie la
   STRUCTURE (briques, sélecteurs, cibles, cues connus) et des BORNES de
   sécurité pour qu'une carte ne puisse pas casser une partie (durées,
   montants, multiplicateurs, nombre d'étapes…). Erreurs { path, message }. */

import type { PowerCardDef } from "../../types/game";
import { isPowerBorderId, isPowerBorderParticlesMode } from "../../domain/powerBorders";
import { validateChoreography } from "./choreography";
import type { AnimCue, CardSelector, ChoiceRequest, PowerModule, PowerOp, PowerStep, ZoneRef } from "./types";

export interface PowerValidationIssue {
  path: string;
  message: string;
}

/* Énumérations (miroir des types ; un test vérifie les 21 cartes du code). */
export const POWER_CATEGORIES = ["offensive", "defense", "score", "tactical", "perturbation", "economy"] as const;
export const POWER_RARITIES = ["common", "rare", "epic", "legendary"] as const;
export const POWER_TARGET_MODES = ["none", "self", "opponent"] as const;
export const POWER_TONES = ["gold", "teal", "pink", "cobalt"] as const;
export const POWER_BOOSTER_TIERS = ["village", "notable", "chef", "ancetre"] as const;
export const POWER_ANIM_TAGS = [
  "hand_self_mutate", "hand_self_recommend", "hand_self_boost", "hand_target_reveal", "hand_target_restrict",
  "deposit_from_hand", "hand_from_deposit", "hand_swap_players", "timer_self", "timer_target",
  "timer_all_opponents", "pot_bonus", "future_block", "result_economy",
] as const;
export const PLAYER_REFS = ["self", "target", "each_target", "all_opponents", "all"] as const;
export const TARGET_COUNTS = ["none", "one", "many", "all_opponents", "random_opponent"] as const;
export const SELECTOR_KINDS = ["weakest", "strongest", "all", "bySuit", "byValue", "topOfDeck", "random", "byId", "firstBetterThanWeakest", "bestLegal", "chosen"] as const;
export const CONDITION_KINDS = ["deckNotEmpty", "isTrickLeader", "ledSuitKnown", "activatorLacksLedSuit", "notLastTrick"] as const;
export const SHIELD_TAGS = ["targeted", "reveal", "restrict", "timer_attack"] as const;
export const OP_KINDS = [
  "moveCards", "revealHand", "highlightCard", "exchangeCards", "blockNextLegalCard", "restrictNextPlay",
  "timerFreeze", "timerDelta", "boostNextCard", "potBonus", "potMultiplier", "grantShield", "refundOnLoss", "preventDoublePenalty",
] as const;
export const CUE_KINDS = ["flyCards", "revealOverlay", "highlightHandCard", "timerFx", "deckPulse", "potFlash", "avatarAura", "toast"] as const;
export const FX_PRESETS = ["mystic", "wind", "frost", "time", "goldRain", "shield", "revealMist", "lock", "boost"] as const;

/** Bornes de sécurité (modifiables ici seulement, par un développeur). */
export const POWER_LIMITS = {
  steps: 6,
  opsPerStep: 8,
  cuesPerStep: 10,
  durationMs: 15_000,
  timerSeconds: 30,
  valueBonus: 10,
  potBonus: 100_000,
  potFactor: 5,
  refundRatio: 1,
  choiceTimeoutMs: 30_000,
  maxTargets: 3,
  costCauris: 100_000,
  costNkap: 10_000_000,
  toastLength: 80,
} as const;

const ID = /^[a-z0-9_]{3,48}$/;
/** Préréglages de synthèse connus (miroir de lib/powerSounds.ts, vérifié par un test). */
export const SOUND_PRESET_NAMES = ["pouvoir", "tambour", "eclair", "vent", "givre", "gong", "pieces", "magie", "alarme", "sceau", "souffle"] as const;
const SOUND_URL = /^(\/[\w\-./]+|https?:\/\/[\w\-.]+(:\d+)?\/[\w\-./%]*)\.(mp3|ogg|m4a|wav)$/i;
export function isSoundRef(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.startsWith("preset:")) return (SOUND_PRESET_NAMES as readonly string[]).includes(value.slice(7));
  return SOUND_URL.test(value);
}
const ASSET = /^(\/[\w\-./]+|https?:\/\/[\w\-.]+(:\d+)?\/[\w\-./%]*)$/;
const has = <T extends readonly string[]>(list: T, value: unknown): value is T[number] => typeof value === "string" && (list as readonly string[]).includes(value);
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});
const isInt = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const isNum = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function validatePowerDef(def: PowerCardDef, issues: PowerValidationIssue[] = []): PowerValidationIssue[] {
  const push = (path: string, message: string) => issues.push({ path: `def.${path}`, message });
  if (!ID.test(def.id ?? "")) push("id", "Identifiant : 3 à 48 caractères a-z, 0-9 ou _.");
  if (typeof def.name !== "string" || def.name.trim().length < 2 || def.name.length > 40) push("name", "Nom : 2 à 40 caractères.");
  if (typeof def.description !== "string" || def.description.trim().length < 5 || def.description.length > 200) push("description", "Description : 5 à 200 caractères.");
  if (typeof def.activationTitle !== "string" || def.activationTitle.trim().length < 2 || def.activationTitle.length > 24) push("activationTitle", "Titre d'activation : 2 à 24 caractères.");
  if (typeof def.activationText !== "string" || def.activationText.length > 80) push("activationText", "Texte d'activation : 80 caractères maximum.");
  if (def.activationTextOthers !== undefined && (typeof def.activationTextOthers !== "string" || def.activationTextOthers.length > 80)) push("activationTextOthers", "Texte pour les autres joueurs : 80 caractères maximum.");
  if (!has(POWER_CATEGORIES, def.category)) push("category", "Catégorie inconnue.");
  if (!has(POWER_RARITIES, def.rarity)) push("rarity", "Rareté inconnue.");
  if (!has(POWER_TARGET_MODES, def.targetMode)) push("targetMode", "Mode de ciblage inconnu.");
  if (!has(POWER_TONES, def.tone)) push("tone", "Teinte inconnue.");
  if (typeof def.icon !== "string" || def.icon.length < 2 || def.icon.length > 32) push("icon", "Icône requise.");
  if (typeof def.art !== "string" || !ASSET.test(def.art)) push("art", "Visuel : chemin /… ou URL http(s).");
  if (!isInt(def.costCauris, 0, POWER_LIMITS.costCauris)) push("costCauris", "Prix en cauris : entier positif.");
  if (!isInt(def.costNkap, 0, POWER_LIMITS.costNkap)) push("costNkap", "Prix en Nkap : entier positif.");
  if (!Array.isArray(def.animTags) || def.animTags.some((tag) => !has(POWER_ANIM_TAGS, tag))) push("animTags", "Étiquettes d'animation inconnues.");
  if (def.boosterTier !== undefined && !has(POWER_BOOSTER_TIERS, def.boosterTier)) push("boosterTier", "Palier de livre inconnu.");
  // Format seulement : le client peut recevoir la carte avant le catalogue des modèles V2 (modèle inconnu = vols habituels).
  // L'existence du modèle est vérifiée à la publication, côté serveur.
  if (def.animV2 !== undefined && (typeof def.animV2 !== "string" || !ID.test(def.animV2))) push("animV2", "Modèle V2 : identifiant de 3 à 48 caractères a-z, 0-9 ou _.");
  if (def.sound !== undefined) {
    const sound = obj(def.sound);
    if (!isSoundRef(sound.ref)) push("sound.ref", "Son : préréglage connu ou fichier uploadé.");
    if (sound.volume !== undefined && !isNum(sound.volume, 0, 1)) push("sound.volume", "Volume : 0 à 100 %.");
  }
  if (def.border !== undefined && !isPowerBorderId(def.border)) {
    push("border", "Bordure inconnue.");
  }
  if (def.borderParticles !== undefined && !isPowerBorderParticlesMode(def.borderParticles)) {
    push("borderParticles", "Mode de particules inconnu.");
  }
  return issues;
}

function validateSelector(value: unknown, path: string, issues: PowerValidationIssue[], choiceIds: Set<string>) {
  const selector = obj(value) as CardSelector & Record<string, unknown>;
  if (!has(SELECTOR_KINDS, selector.kind)) { issues.push({ path, message: "Sélecteur de cartes inconnu." }); return; }
  if (selector.kind === "bySuit" && typeof selector.suit !== "string") issues.push({ path: `${path}.suit`, message: "Couleur requise." });
  if (selector.kind === "byValue") {
    if (selector.min !== undefined && !isInt(selector.min, 1, 30)) issues.push({ path: `${path}.min`, message: "Valeur minimale invalide." });
    if (selector.max !== undefined && !isInt(selector.max, 1, 30)) issues.push({ path: `${path}.max`, message: "Valeur maximale invalide." });
  }
  if (selector.kind === "byId" && typeof selector.cardId !== "string") issues.push({ path: `${path}.cardId`, message: "Carte requise." });
  if (selector.kind === "chosen" && !choiceIds.has(String(selector.choiceId))) issues.push({ path: `${path}.choiceId`, message: "Ce choix n'est demandé dans aucune étape précédente ou courante." });
}

function validateZone(value: unknown, path: string, issues: PowerValidationIssue[]) {
  const zone = obj(value) as ZoneRef & Record<string, unknown>;
  if (zone.zone === "hand" || zone.zone === "deposit") {
    if (!has(PLAYER_REFS, zone.player)) issues.push({ path: `${path}.player`, message: "Joueur inconnu." });
  } else if (zone.zone !== "deck" && zone.zone !== "reveal") {
    issues.push({ path, message: "Zone inconnue (main, dépôt, pioche, révélation)." });
  }
}

function validateDuration(value: unknown, path: string, issues: PowerValidationIssue[], optional = false) {
  if (optional && value === undefined) return;
  if (!isInt(value, 0, POWER_LIMITS.durationMs)) issues.push({ path, message: `Durée : 0 à ${POWER_LIMITS.durationMs} ms.` });
}

function validatePlayer(value: unknown, path: string, issues: PowerValidationIssue[]) {
  if (!has(PLAYER_REFS, value)) issues.push({ path, message: "Joueur inconnu." });
}

function validateChoice(value: unknown, path: string, issues: PowerValidationIssue[], choiceIds: Set<string>) {
  const choice = obj(value) as ChoiceRequest & Record<string, unknown>;
  if (typeof choice.id !== "string" || !/^[a-z0-9_]{1,24}$/i.test(choice.id)) issues.push({ path: `${path}.id`, message: "Identifiant du choix invalide." });
  else choiceIds.add(choice.id);
  if (!["hand-self", "reveal", "deposit"].includes(String(choice.surface))) issues.push({ path: `${path}.surface`, message: "Surface de clic inconnue." });
  if (choice.player !== undefined) validatePlayer(choice.player, `${path}.player`, issues);
  if (choice.filter !== undefined) validateSelector(choice.filter, `${path}.filter`, issues, choiceIds);
  if (choice.timeoutMs !== undefined && !isInt(choice.timeoutMs, 1_000, POWER_LIMITS.choiceTimeoutMs)) issues.push({ path: `${path}.timeoutMs`, message: "Délai de choix : 1 à 30 s." });
  if (choice.onTimeout !== "cancel" && choice.onTimeout !== "auto") issues.push({ path: `${path}.onTimeout`, message: "Comportement au délai : annuler ou automatique." });
}

function validateOp(value: unknown, path: string, issues: PowerValidationIssue[], choiceIds: Set<string>) {
  const op = obj(value) as PowerOp & Record<string, unknown>;
  if (!has(OP_KINDS, op.op)) { issues.push({ path, message: "Brique inconnue." }); return; }
  switch (op.op) {
    case "moveCards":
      validateZone(op.from, `${path}.from`, issues);
      validateZone(op.to, `${path}.to`, issues);
      validateSelector(op.select, `${path}.select`, issues, choiceIds);
      if (op.swap) validateSelector(obj(op.swap).incoming, `${path}.swap.incoming`, issues, choiceIds);
      break;
    case "revealHand":
      validatePlayer(op.player, `${path}.player`, issues);
      validateDuration(op.durationMs, `${path}.durationMs`, issues);
      break;
    case "highlightCard":
      validatePlayer(op.player, `${path}.player`, issues);
      validateSelector(op.select, `${path}.select`, issues, choiceIds);
      validateDuration(op.durationMs, `${path}.durationMs`, issues);
      break;
    case "exchangeCards":
      validatePlayer(op.left, `${path}.left`, issues);
      validatePlayer(op.right, `${path}.right`, issues);
      validateSelector(op.leftSelect, `${path}.leftSelect`, issues, choiceIds);
      validateSelector(op.rightSelect, `${path}.rightSelect`, issues, choiceIds);
      break;
    case "blockNextLegalCard":
      validatePlayer(op.player, `${path}.player`, issues);
      validateSelector(op.select, `${path}.select`, issues, choiceIds);
      if (op.minLegalChoices !== undefined && !isInt(op.minLegalChoices, 1, 5)) issues.push({ path: `${path}.minLegalChoices`, message: "Alternatives minimales : 1 à 5." });
      break;
    case "restrictNextPlay":
      validatePlayer(op.player, `${path}.player`, issues);
      if (op.mode !== "forceSelector" && op.mode !== "lockSelector") issues.push({ path: `${path}.mode`, message: "Mode : forcer ou verrouiller." });
      validateSelector(op.select, `${path}.select`, issues, choiceIds);
      break;
    case "timerFreeze":
      validatePlayer(op.player, `${path}.player`, issues);
      validateDuration(op.durationMs, `${path}.durationMs`, issues);
      break;
    case "timerDelta":
      validatePlayer(op.player, `${path}.player`, issues);
      if (!isInt(op.seconds, -POWER_LIMITS.timerSeconds, POWER_LIMITS.timerSeconds) || op.seconds === 0) issues.push({ path: `${path}.seconds`, message: `Secondes : −${POWER_LIMITS.timerSeconds} à +${POWER_LIMITS.timerSeconds}, non nul.` });
      break;
    case "boostNextCard":
      validatePlayer(op.player, `${path}.player`, issues);
      if (op.valueBonus !== undefined && !isInt(op.valueBonus, 1, POWER_LIMITS.valueBonus)) issues.push({ path: `${path}.valueBonus`, message: `Bonus de valeur : 1 à ${POWER_LIMITS.valueBonus}.` });
      if (op.suitOverride !== undefined && op.suitOverride !== "led") issues.push({ path: `${path}.suitOverride`, message: "Seule la couleur demandée est possible." });
      if (op.valueBonus === undefined && op.suitOverride === undefined) issues.push({ path, message: "Bonus de valeur ou couleur imposée requis." });
      break;
    case "potBonus":
      if (!isInt(op.amount, 1, POWER_LIMITS.potBonus)) issues.push({ path: `${path}.amount`, message: `Montant : 1 à ${POWER_LIMITS.potBonus}.` });
      if (op.when !== "now" && op.when !== "winTrick" && op.when !== "winRound") issues.push({ path: `${path}.when`, message: "Moment : maintenant, au pli gagné ou à la manche gagnée." });
      break;
    case "potMultiplier":
      if (!isNum(op.factor, 1.1, POWER_LIMITS.potFactor)) issues.push({ path: `${path}.factor`, message: `Multiplicateur : 1,1 à ${POWER_LIMITS.potFactor}.` });
      if (op.when !== "winTrick" && op.when !== "winRound") issues.push({ path: `${path}.when`, message: "Moment : au pli gagné ou à la manche gagnée." });
      break;
    case "grantShield":
      validatePlayer(op.player, `${path}.player`, issues);
      if (!Array.isArray(op.blocks) || op.blocks.length === 0 || op.blocks.some((tag) => !has(SHIELD_TAGS, tag))) issues.push({ path: `${path}.blocks`, message: "Choisir ce que le bouclier bloque." });
      break;
    case "refundOnLoss":
      validatePlayer(op.player, `${path}.player`, issues);
      if (!isNum(op.ratio, 0.05, POWER_LIMITS.refundRatio)) issues.push({ path: `${path}.ratio`, message: "Part remboursée : 5 % à 100 %." });
      break;
    case "preventDoublePenalty":
      validatePlayer(op.player, `${path}.player`, issues);
      break;
  }
}

function validateCue(value: unknown, path: string, issues: PowerValidationIssue[], choiceIds: Set<string>) {
  const cue = obj(value) as AnimCue & Record<string, unknown>;
  if (!has(CUE_KINDS, cue.cue)) { issues.push({ path, message: "Animation inconnue." }); return; }
  const fx = obj(cue.fx);
  if (cue.fx !== undefined) {
    if (fx.preset !== undefined && !has(FX_PRESETS, fx.preset)) issues.push({ path: `${path}.fx.preset`, message: "Effet inconnu." });
    if (fx.tone !== undefined && !has(POWER_TONES, fx.tone)) issues.push({ path: `${path}.fx.tone`, message: "Teinte inconnue." });
    if (fx.intensity !== undefined && !["subtle", "standard", "spectacular"].includes(String(fx.intensity))) issues.push({ path: `${path}.fx.intensity`, message: "Intensité inconnue." });
  }
  if (cue.afterMs !== undefined) validateDuration(cue.afterMs, `${path}.afterMs`, issues);
  switch (cue.cue) {
    case "flyCards":
      validateZone(cue.from, `${path}.from`, issues);
      validateZone(cue.to, `${path}.to`, issues);
      if (cue.mode !== "move" && cue.mode !== "display") issues.push({ path: `${path}.mode`, message: "Mode : déplacement réel ou affichage." });
      if (typeof cue.cards !== "string") validateSelector(cue.cards, `${path}.cards`, issues, choiceIds);
      break;
    case "revealOverlay":
      validatePlayer(cue.player, `${path}.player`, issues);
      validateDuration(cue.durationMs, `${path}.durationMs`, issues, true);
      if (cue.pick) validateChoice(cue.pick, `${path}.pick`, issues, choiceIds);
      break;
    case "highlightHandCard":
      validatePlayer(cue.player, `${path}.player`, issues);
      if (!["recommend", "swapped", "locked", "boosted"].includes(String(cue.style))) issues.push({ path: `${path}.style`, message: "Style inconnu." });
      validateDuration(cue.durationMs, `${path}.durationMs`, issues, true);
      validateDuration(cue.delayMs, `${path}.delayMs`, issues, true);
      break;
    case "timerFx":
      validatePlayer(cue.player, `${path}.player`, issues);
      if (!["freeze", "gain", "loss"].includes(String(cue.kind))) issues.push({ path: `${path}.kind`, message: "Effet de minuteur inconnu." });
      validateDuration(cue.durationMs, `${path}.durationMs`, issues, true);
      break;
    case "avatarAura":
      validatePlayer(cue.player, `${path}.player`, issues);
      if (!["shield", "mask", "totem", "lucky"].includes(String(cue.style))) issues.push({ path: `${path}.style`, message: "Aura inconnue." });
      break;
    case "toast":
      if (typeof cue.text !== "string" || cue.text.trim().length === 0 || cue.text.length > POWER_LIMITS.toastLength) issues.push({ path: `${path}.text`, message: `Message : 1 à ${POWER_LIMITS.toastLength} caractères.` });
      break;
    default:
      break;
  }
}

/** Toutes les erreurs bloquantes d'une carte (liste vide = publiable). */
export function validatePowerCard(card: Pick<PowerModule, "def" | "script">): PowerValidationIssue[] {
  const issues: PowerValidationIssue[] = [];
  const def = (card.def ?? {}) as PowerCardDef;
  validatePowerDef(def, issues);
  const script = obj(card.script);
  if (script.id !== def.id) issues.push({ path: "script.id", message: "Le script doit porter l'identifiant de la carte." });
  const target = obj(script.target);
  if (!has(TARGET_COUNTS, target.count)) issues.push({ path: "script.target.count", message: "Ciblage inconnu." });
  if (target.chooser !== undefined && target.chooser !== "activator" && target.chooser !== "engine") issues.push({ path: "script.target.chooser", message: "Qui choisit : le joueur ou le jeu." });
  if (target.max !== undefined && !isInt(target.max, 1, POWER_LIMITS.maxTargets)) issues.push({ path: "script.target.max", message: `Cibles : 1 à ${POWER_LIMITS.maxTargets}.` });
  const conditions = Array.isArray(script.conditions) ? script.conditions : [];
  conditions.forEach((condition, index) => {
    if (!has(CONDITION_KINDS, obj(condition).kind)) issues.push({ path: `script.conditions.${index}`, message: "Condition inconnue." });
  });
  const steps = Array.isArray(script.steps) ? script.steps as PowerStep[] : [];
  if (steps.length === 0) issues.push({ path: "script.steps", message: "Au moins une étape." });
  if (steps.length > POWER_LIMITS.steps) issues.push({ path: "script.steps", message: `${POWER_LIMITS.steps} étapes maximum.` });
  const choiceIds = new Set<string>();
  let hasEffect = false;
  steps.forEach((rawStep, index) => {
    const base = `script.steps.${index}`;
    const step = obj(rawStep) as PowerStep & Record<string, unknown>;
    if (step.choice) validateChoice(step.choice, `${base}.choice`, issues, choiceIds);
    const ops = Array.isArray(step.ops) ? step.ops : [];
    const anim = Array.isArray(step.anim) ? step.anim : [];
    if (ops.length > POWER_LIMITS.opsPerStep) issues.push({ path: `${base}.ops`, message: `${POWER_LIMITS.opsPerStep} briques maximum par étape.` });
    if (anim.length > POWER_LIMITS.cuesPerStep) issues.push({ path: `${base}.anim`, message: `${POWER_LIMITS.cuesPerStep} animations maximum par étape.` });
    if (ops.length > 0) hasEffect = true;
    ops.forEach((op, opIndex) => validateOp(op, `${base}.ops.${opIndex}`, issues, choiceIds));
    if (step.choreo !== undefined) issues.push(...validateChoreography(step.choreo, `${base}.choreo`));
    anim.forEach((cue, cueIndex) => validateCue(cue, `${base}.anim.${cueIndex}`, issues, choiceIds));
  });
  if (steps.length > 0 && !hasEffect) issues.push({ path: "script.steps", message: "La carte doit avoir au moins une brique d'effet." });
  if (script.secret !== undefined && typeof script.secret !== "boolean") issues.push({ path: "script.secret", message: "Activation secrète : oui ou non." });
  const beats = obj(script.beats);
  if (beats.introMs !== undefined) validateDuration(beats.introMs, "script.beats.introMs", issues);
  if (beats.stepGapMs !== undefined) validateDuration(beats.stepGapMs, "script.beats.stepGapMs", issues);
  return issues;
}
