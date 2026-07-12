/* Point d'entrée du moteur générique des cartes pouvoir. */

export * from "./types";
export type { PlayRestriction, PowerApplyMeta, PowerStateAdapter } from "./adapter";
export { applyResolvedOps } from "./apply";
export { canActivatePower } from "./canActivate";
export { checkConditions } from "./conditions";
export { deriveScriptTags, effectBlocks, findBlockingEffect } from "./blocking";
export { interpretPowerScript, type ResolvedOp } from "./interpret";
export { PowerRuntimeState } from "./runtimeState";
export { applyTrickPowerRewards, consumeNextCardModifiers } from "./rewards";
export {
  bestRecommendation,
  selectInDeck,
  selectInHand,
  weakestCardIndex,
} from "./selectors";
export { resolvePlayerRef, resolveTargets } from "./targets";
