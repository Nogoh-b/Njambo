import { afterEach, describe, expect, it, vi } from "vitest";
import { CODE_POWER_MODULES } from "../config/powers";
import { createSandboxTable, runSandboxActivation } from "../engine/power/sandbox";
import type { PowerScript } from "../engine/power/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const needsTarget = (script: PowerScript) => (script.target.count === "one" || script.target.count === "many") && script.target.chooser !== "engine";

/** Math.random reproductible (sélecteurs « au hasard », cible aléatoire). */
function seededRandom(seed: number) {
  let value = seed;
  return () => { value = (value * 16807) % 2147483647; return (value - 1) / 2147483646; };
}

afterEach(() => vi.restoreAllMocks());

describe("bac à sable des cartes de pouvoir", () => {
  it("donne reproductible : même graine, même table", () => {
    expect(createSandboxTable({ seed: 7 })).toEqual(createSandboxTable({ seed: 7 }));
    expect(createSandboxTable({ seed: 7 }).state.players[0].hand).not.toEqual(createSandboxTable({ seed: 8 }).state.players[0].hand);
  });

  it("active chacune des 21 cartes du code sans erreur, sans muter la table d'origine", () => {
    for (const entry of Object.values(CODE_POWER_MODULES)) {
      for (const seed of [1, 2, 3]) {
        const table = createSandboxTable({ seed });
        const snapshot = clone(table);
        const outcome = runSandboxActivation(table, entry.script, { requestedTarget: needsTarget(entry.script) ? 1 : undefined });
        expect(table, entry.def.id).toEqual(snapshot);
        expect(outcome.refusal === null || typeof outcome.refusal === "string").toBe(true);
        if (outcome.impact) expect(outcome.log.length, entry.def.id).toBe(outcome.plan.length);
      }
    }
  });

  it("migration : la version stockée (JSON) d'une carte se comporte exactement comme le code", () => {
    for (const entry of Object.values(CODE_POWER_MODULES)) {
      const run = (script: PowerScript) => {
        vi.spyOn(Math, "random").mockImplementation(seededRandom(42));
        const outcome = runSandboxActivation(createSandboxTable({ seed: 5 }), script, { requestedTarget: needsTarget(script) ? 2 : undefined });
        vi.restoreAllMocks();
        return { refusal: outcome.refusal, impact: outcome.impact, plan: outcome.plan, after: { ...outcome.after, frozen: Object.keys(outcome.after.frozen) } };
      };
      expect(run(clone(entry.script)), entry.def.id).toEqual(run(entry.script));
    }
  });

  it("« pli entamé » : la carte qui exige une couleur demandée devient jouable", () => {
    const script = CODE_POWER_MODULES.pagne_changeant.script;
    expect(runSandboxActivation(createSandboxTable(), script).refusal).not.toBeNull();
    const tables = Array.from({ length: 40 }, (_, seed) => createSandboxTable({ seed: seed + 1, trickStarted: true }));
    expect(tables[0].state.trickPlays).toHaveLength(1);
    expect(tables[0].state.turnIdx).toBe(0);
    const outcomes = tables.map((table) => runSandboxActivation(table, script));
    // Refus du jeu quand on a la couleur demandée, effet réel sinon.
    expect(outcomes.some((outcome) => outcome.refusal === "Tu as déjà la tendance en main.")).toBe(true);
    expect(outcomes.some((outcome) => outcome.refusal === null && outcome.impact)).toBe(true);
  });

  it("refuse une carte ciblée sans cible, avec le message du jeu", () => {
    const script = CODE_POWER_MODULES.oeil_sorcier.script;
    const outcome = runSandboxActivation(createSandboxTable(), script, {});
    expect(outcome.refusal).toBe("Cette carte nécessite une cible.");
    expect(outcome.impact).toBe(false);
  });

  it("un bouclier sur la cible contre la carte (consommée, sans effet)", () => {
    const script = CODE_POWER_MODULES.oeil_sorcier.script;
    const outcome = runSandboxActivation(createSandboxTable(), script, { requestedTarget: 1, targetShield: true });
    expect(outcome.blocked).toBe(true);
    expect(outcome.plan).toEqual([]);
  });

  it("applique vraiment les effets : minuteur, pot", () => {
    const timerCard = Object.values(CODE_POWER_MODULES).find((entry) => entry.script.steps.some((step) => step.ops?.some((op) => op.op === "timerDelta" && op.player === "self")));
    if (timerCard) {
      const outcome = runSandboxActivation(createSandboxTable(), timerCard.script, { requestedTarget: needsTarget(timerCard.script) ? 1 : undefined });
      if (outcome.impact) expect(outcome.after.timers[0]).not.toBe(outcome.before.timers[0]);
    }
    const potCard = Object.values(CODE_POWER_MODULES).find((entry) => entry.script.steps.some((step) => step.ops?.some((op) => op.op === "potBonus" && op.when === "now")));
    if (potCard) {
      const outcome = runSandboxActivation(createSandboxTable(), potCard.script, { requestedTarget: needsTarget(potCard.script) ? 1 : undefined });
      expect(outcome.after.state.pot).toBeGreaterThan(outcome.before.state.pot);
    }
  });
});
