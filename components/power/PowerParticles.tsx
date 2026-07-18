"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Particles, ParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { Container, Engine } from "@tsparticles/engine";
import {
  buildParticleOptions,
  particleLifetimeMs,
  type ParticleIntensity,
  type ParticleTone,
  type ParticleVariant,
} from "@/lib/particleOptions";

interface PowerParticlesProps {
  variant?: ParticleVariant;
  /** Teinte dominante pour la variante "power". */
  tone?: ParticleTone;
  /** z-index de la couche (au-dessus du feutre, sous les panneaux). */
  zIndex?: number;
  intensity?: ParticleIntensity;
}

const engineInitializations = new WeakMap<Engine, Promise<void>>();

/** Enregistre le moteur slim une seule fois par instance tsparticles. */
async function initEngine(engine: Engine): Promise<void> {
  let initialization = engineInitializations.get(engine);
  if (!initialization) {
    initialization = loadSlim(engine);
    engineInitializations.set(engine, initialization);
  }
  await initialization;
}

export default function PowerParticles({
  variant = "confetti",
  tone = "gold",
  zIndex = 1,
  intensity = "full",
}: PowerParticlesProps) {
  const reactId = useId();
  const particleId = `nj-particles-${variant}-${reactId.replaceAll(":", "")}`;
  const containerRef = useRef<Container | null>(null);
  const [active, setActive] = useState(true);
  const options = useMemo(() => buildParticleOptions(variant, tone, intensity), [intensity, tone, variant]);
  const style = useMemo(
    () => ({ position: "absolute" as const, inset: 0, zIndex, pointerEvents: "none" as const }),
    [zIndex],
  );

  const handleLoaded = useCallback((container?: Container) => {
    containerRef.current = container ?? null;
    if (document.hidden) container?.pause();
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      const container = containerRef.current;
      if (!container || container.destroyed) return;
      if (document.hidden) container.pause();
      else container.play();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setActive(false), particleLifetimeMs(variant, intensity));
    return () => clearTimeout(timer);
  }, [intensity, variant]);

  if (!active) return null;

  return (
    <ParticlesProvider init={initEngine}>
      <Particles
        id={particleId}
        options={options}
        particlesLoaded={handleLoaded}
        style={style}
      />
    </ParticlesProvider>
  );
}
