import type { ISourceOptions } from "@tsparticles/engine";
import { T } from "../config/theme";

export type ParticleVariant = "confetti" | "power";
export type ParticleTone = "gold" | "pink" | "teal" | "cobalt";
export type ParticleIntensity = "full" | "balanced";

interface ParticleBudget {
  fps: number;
  detectRetina: boolean;
  quantity: number;
  particleLife: number;
  emitterDuration: number;
  teardownMs: number;
}

export const PARTICLE_BUDGETS: Record<ParticleVariant, Record<ParticleIntensity, ParticleBudget>> = {
  power: {
    full: { fps: 45, detectRetina: true, quantity: 38, particleLife: 0.9, emitterDuration: 0.16, teardownMs: 1_200 },
    balanced: { fps: 30, detectRetina: false, quantity: 18, particleLife: 0.72, emitterDuration: 0.1, teardownMs: 900 },
  },
  confetti: {
    full: { fps: 45, detectRetina: true, quantity: 4, particleLife: 2.5, emitterDuration: 1.45, teardownMs: 2_800 },
    balanced: { fps: 30, detectRetina: false, quantity: 2, particleLife: 1.8, emitterDuration: 1, teardownMs: 2_000 },
  },
};

const CONFETTI_COLORS = [T.gold, T.pink, T.teal, T.copper, T.cobalt];
const TONE_HEX: Record<ParticleTone, string> = { gold: T.gold, pink: T.pink, teal: T.teal, cobalt: T.cobalt };

export function particleLifetimeMs(variant: ParticleVariant, intensity: ParticleIntensity): number {
  return PARTICLE_BUDGETS[variant][intensity].teardownMs;
}

export function buildParticleOptions(
  variant: ParticleVariant,
  tone: ParticleTone,
  intensity: ParticleIntensity,
): ISourceOptions {
  const budget = PARTICLE_BUDGETS[variant][intensity];

  if (variant === "power") {
    const hex = TONE_HEX[tone];
    const full = intensity === "full";
    return {
      fullScreen: { enable: false },
      detectRetina: budget.detectRetina,
      fpsLimit: budget.fps,
      pauseOnBlur: true,
      particles: {
        number: { value: 0 },
        color: { value: [hex, T.gold, T.cream] },
        shape: { type: full ? ["circle", "star"] : "circle" },
        opacity: { value: { min: 0.35, max: full ? 0.92 : 0.78 } },
        size: { value: { min: 2, max: full ? 6 : 4 } },
        life: { duration: { sync: false, value: budget.particleLife }, count: 1 },
        move: {
          enable: true,
          speed: { min: 6, max: full ? 19 : 13 },
          direction: "none",
          outModes: { default: "destroy" },
          decay: full ? 0.065 : 0.08,
        },
        rotate: {
          value: { min: 0, max: 360 },
          animation: { enable: full, speed: full ? 30 : 0 },
        },
      },
      emitters: {
        direction: "none",
        life: { count: 1, duration: budget.emitterDuration, delay: 0 },
        rate: { delay: 0.01, quantity: budget.quantity },
        size: { width: 0, height: 0 },
        position: { x: 50, y: 50 },
      },
    };
  }

  const full = intensity === "full";
  return {
    fullScreen: { enable: false },
    detectRetina: budget.detectRetina,
    fpsLimit: budget.fps,
    pauseOnBlur: true,
    particles: {
      number: { value: 0 },
      color: { value: CONFETTI_COLORS },
      shape: { type: ["square", "circle"] },
      opacity: { value: { min: 0.55, max: full ? 0.96 : 0.82 } },
      size: { value: { min: full ? 4 : 3, max: full ? 8 : 6 } },
      life: { duration: { sync: false, value: budget.particleLife }, count: 1 },
      move: {
        enable: true,
        gravity: { enable: true, acceleration: full ? 9 : 10 },
        speed: { min: full ? 18 : 14, max: full ? 34 : 24 },
        direction: "bottom",
        outModes: { default: "destroy", top: "none" },
      },
      rotate: {
        value: { min: 0, max: 360 },
        animation: { enable: full, speed: full ? 22 : 0 },
      },
      tilt: full
        ? { enable: true, value: { min: 0, max: 360 }, animation: { enable: true, speed: 24 } }
        : { enable: false, value: 0, animation: { enable: false, speed: 0 } },
      wobble: full
        ? { enable: true, distance: 9, speed: { min: -6, max: 6 } }
        : { enable: false, distance: 0, speed: { min: 0, max: 0 } },
    },
    emitters: {
      direction: "bottom",
      life: { count: 1, duration: budget.emitterDuration, delay: 0 },
      rate: { delay: full ? 0.11 : 0.16, quantity: budget.quantity },
      size: { width: 100, height: 0 },
      position: { x: 50, y: -5 },
    },
  };
}
