"use client";

import { useMemo } from "react";
import { Particles, ParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { Engine, ISourceOptions } from "@tsparticles/engine";
import { T } from "@/config/theme";

/* ═══════════════ FILE: components/power/PowerParticles.tsx ═══════════════
   Couche de particules tsparticles, réutilisable et chargée en lazy (ssr:false
   côté appelant). Le moteur `slim` n'est initialisé qu'UNE fois pour toute l'app.
   - variant "confetti" : pluie de pièces/confettis (célébration de victoire)
   - variant "power"    : éclat radial teinté (activation d'une carte pouvoir) */

type Variant = "confetti" | "power";
type Tone = "gold" | "pink" | "teal" | "cobalt";

interface PowerParticlesProps {
  variant?: Variant;
  /** Teinte dominante pour la variante "power". */
  tone?: Tone;
  /** z-index de la couche (au-dessus du feutre, sous les panneaux). */
  zIndex?: number;
}

/* Enregistre le moteur `slim` (idempotent — tsparticles ignore les doublons). */
async function initEngine(engine: Engine): Promise<void> {
  await loadSlim(engine);
}

const CONFETTI_COLORS = [T.gold, T.pink, T.teal, T.copper, T.cobalt];
const TONE_HEX: Record<Tone, string> = { gold: T.gold, pink: T.pink, teal: T.teal, cobalt: T.cobalt };

function buildOptions(variant: Variant, tone: Tone): ISourceOptions {
  if (variant === "power") {
    const hex = TONE_HEX[tone];
    return {
      fullScreen: { enable: false },
      detectRetina: true,
      fpsLimit: 60,
      particles: {
        number: { value: 0 },
        color: { value: [hex, T.gold, T.cream] },
        shape: { type: ["circle", "star"] },
        opacity: { value: { min: 0.4, max: 0.95 } },
        size: { value: { min: 2, max: 6 } },
        life: { duration: { sync: false, value: 1.1 }, count: 1 },
        move: {
          enable: true,
          speed: { min: 6, max: 22 },
          direction: "none",
          outModes: { default: "destroy" },
          decay: 0.06,
        },
        rotate: { value: { min: 0, max: 360 }, animation: { enable: true, speed: 40 } },
      },
      emitters: {
        direction: "none",
        life: { count: 1, duration: 0.35, delay: 0 },
        rate: { delay: 0, quantity: 60 },
        size: { width: 0, height: 0 },
        position: { x: 50, y: 50 },
      },
    };
  }

  /* confetti : pluie continue depuis le haut de l'écran */
  return {
    fullScreen: { enable: false },
    detectRetina: true,
    fpsLimit: 60,
    particles: {
      number: { value: 0 },
      color: { value: CONFETTI_COLORS },
      shape: { type: ["square", "circle"] },
      opacity: { value: { min: 0.6, max: 1 } },
      size: { value: { min: 4, max: 9 } },
      life: { duration: { sync: false, value: 6 }, count: 1 },
      move: {
        enable: true,
        gravity: { enable: true, acceleration: 9 },
        speed: { min: 18, max: 42 },
        direction: "bottom",
        outModes: { default: "destroy", top: "none" },
      },
      rotate: { value: { min: 0, max: 360 }, animation: { enable: true, speed: 26 } },
      tilt: { enable: true, value: { min: 0, max: 360 }, animation: { enable: true, speed: 30 } },
      wobble: { enable: true, distance: 12, speed: { min: -8, max: 8 } },
    },
    emitters: {
      direction: "bottom",
      life: { count: 0, duration: 0.2, delay: 0.1 },
      rate: { delay: 0.09, quantity: 5 },
      size: { width: 100, height: 0 },
      position: { x: 50, y: -5 },
    },
  };
}

export default function PowerParticles({ variant = "confetti", tone = "gold", zIndex = 1 }: PowerParticlesProps) {
  const options = useMemo(() => buildOptions(variant, tone), [variant, tone]);

  return (
    <ParticlesProvider init={initEngine}>
      <Particles
        id={`nj-particles-${variant}`}
        options={options}
        style={{ position: "absolute", inset: 0, zIndex, pointerEvents: "none" }}
      />
    </ParticlesProvider>
  );
}
