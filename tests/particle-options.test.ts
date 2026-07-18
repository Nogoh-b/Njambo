import { describe, expect, it } from "vitest";
import {
  PARTICLE_BUDGETS,
  buildParticleOptions,
  particleLifetimeMs,
} from "../lib/particleOptions";

describe("budgets de particules", () => {
  it("réduit réellement le coût du profil balanced", () => {
    expect(PARTICLE_BUDGETS.power.balanced.fps).toBeLessThan(PARTICLE_BUDGETS.power.full.fps);
    expect(PARTICLE_BUDGETS.power.balanced.quantity).toBeLessThan(PARTICLE_BUDGETS.power.full.quantity);
    expect(PARTICLE_BUDGETS.power.balanced.detectRetina).toBe(false);
  });

  it("borne la fréquence et la durée de toutes les couches", () => {
    for (const variants of Object.values(PARTICLE_BUDGETS)) {
      for (const budget of Object.values(variants)) {
        expect(budget.fps).toBeLessThanOrEqual(45);
        expect(budget.teardownMs).toBeLessThanOrEqual(2_800);
      }
    }
  });

  it("supprime les formes et rotations coûteuses en balanced", () => {
    expect(buildParticleOptions("power", "gold", "balanced")).toMatchObject({
      detectRetina: false,
      fpsLimit: 30,
      pauseOnBlur: true,
      particles: {
        shape: { type: "circle" },
        rotate: { animation: { enable: false } },
      },
    });
  });

  it("rend les confettis finis et libère rapidement leur canvas", () => {
    expect(buildParticleOptions("confetti", "gold", "full")).toMatchObject({
      fpsLimit: 45,
      emitters: { life: { count: 1 } },
    });
    expect(particleLifetimeMs("confetti", "full")).toBe(2_800);
  });
});
