import { describe, expect, it } from "vitest";
import { resolveTargets } from "../engine/power/targets";

/* Ciblage « un joueur » : choisi par le lanceur (cible demandée) ou par le jeu (adversaire au hasard). */
describe("resolveTargets", () => {
  it("prend la cible demandée par le lanceur", () => {
    expect(resolveTargets({ count: "one", chooser: "activator" }, { activatedBy: 0, playerCount: 3, requested: 2 })).toEqual([2]);
  });
  it("sans cible demandée, le lanceur n'a rien choisi : aucune cible", () => {
    expect(resolveTargets({ count: "one", chooser: "activator" }, { activatedBy: 0, playerCount: 3 })).toEqual([]);
  });
  it("quand le jeu choisit, il prend un adversaire au hasard (jamais le lanceur)", () => {
    for (let i = 0; i < 20; i++) {
      const [seat] = resolveTargets({ count: "one", chooser: "engine" }, { activatedBy: 1, playerCount: 3 });
      expect([0, 2]).toContain(seat);
    }
  });
});
