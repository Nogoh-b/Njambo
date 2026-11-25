import { describe, expect, it } from "vitest";
import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import { powerScriptOf } from "@/config/powers";
import { POWER_SCRIPT_BUDGET_CAP_MS, powerAnimationBudgetMs, powerScriptAnimMs } from "@/engine/power/animBudget";
import type { PowerCardId } from "@/types/game";

const ANNOUNCE = 2200;

describe("budget d'animation des cartes pouvoir", () => {
  const ids = Object.keys(POWER_CARDS_BY_ID) as PowerCardId[];

  it("couvre l'annonce puis toute la mise en scène, sans dépasser le plafond", () => {
    for (const id of ids) {
      const script = powerScriptOf(id);
      const scriptMs = powerScriptAnimMs(script);
      expect(scriptMs, id).toBeGreaterThan(0);
      expect(scriptMs, id).toBeLessThanOrEqual(POWER_SCRIPT_BUDGET_CAP_MS);
      expect(powerAnimationBudgetMs(script, ANNOUNCE), id).toBe(ANNOUNCE + scriptMs);
    }
  });

  it("laisse bien plus que l'ancien beat de 420 ms à chaque pouvoir", () => {
    for (const id of ids) expect(powerAnimationBudgetMs(powerScriptOf(id), ANNOUNCE), id).toBeGreaterThanOrEqual(ANNOUNCE + 900);
  });

  it("sans script connu : seulement l'annonce", () => {
    expect(powerAnimationBudgetMs(undefined, ANNOUNCE)).toBe(ANNOUNCE);
  });
});
