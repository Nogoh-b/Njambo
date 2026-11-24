import { describe, expect, it } from "vitest";
import { applyTrickPowerRewards } from "../engine/power/rewards";
import type { ActivePowerEffect } from "../types/game";

/* Bonus de pot « si tu gagnes la manche » (Bénédiction du Chef, Pluie d'Étoiles) :
   le pot ne revient qu'au vainqueur de la manche, le bonus ne doit donc compter que pour lui. */
const blessing = (activatedBy: number, extra: Partial<ActivePowerEffect> = {}): ActivePowerEffect =>
  ({ cardId: "benediction_chef", activatedBy, scopeTrickNo: 2, scoreMultiplier: 2, untilRoundEnd: true, ...extra }) as ActivePowerEffect;
const stars = (activatedBy: number): ActivePowerEffect =>
  ({ cardId: "pluie_etoiles", activatedBy, scopeTrickNo: 2, potBonus: 200, conditionalPotBonus: true, untilRoundEnd: true }) as ActivePowerEffect;

describe("bonus de pot jusqu'à la fin de la manche", () => {
  it("ne compte pas avant le dernier pli, même si l'activateur gagne le pli joué", () => {
    const result = applyTrickPowerRewards([blessing(0)], 2, 0, 750);
    expect(result.pot).toBe(750);
    expect(result.effects).toHaveLength(1);
  });
  it("double le pot au dernier pli si l'activateur le gagne (il rafle le pot)", () => {
    const result = applyTrickPowerRewards([blessing(0)], 5, 0, 750, true);
    expect(result.pot).toBe(1500);
    expect(result.effects).toHaveLength(0);
  });
  it("disparaît sans effet si un autre joueur gagne la manche", () => {
    const result = applyTrickPowerRewards([blessing(0), stars(0)], 5, 1, 750, true);
    expect(result.pot).toBe(750);
    expect(result.effects).toHaveLength(0);
  });
  it("bonus fixe d'abord, multiplicateur ensuite", () => {
    const result = applyTrickPowerRewards([blessing(0), stars(0)], 5, 0, 750, true);
    expect(result.pot).toBe((750 + 200) * 2);
  });
  it("les bonus « pli gagné » gardent leur comportement", () => {
    const trick = { cardId: "benediction_chef", activatedBy: 0, scopeTrickNo: 2, scoreMultiplier: 2 } as ActivePowerEffect;
    expect(applyTrickPowerRewards([trick], 2, 0, 750).pot).toBe(1500);
    expect(applyTrickPowerRewards([trick], 2, 1, 750).effects).toHaveLength(0);
  });
});
