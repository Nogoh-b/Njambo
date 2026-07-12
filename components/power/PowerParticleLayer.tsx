"use client";

import { memo, useMemo, type CSSProperties } from "react";
import { T } from "@/config/theme";
import type {
  PowerFxIntensity,
  PowerFxPreset,
  PowerFxTone,
} from "@/engine/power/types";
import type { MotionLevel } from "@/lib/motion";

export interface PowerParticleBurst {
  id: string;
  preset: PowerFxPreset;
  tone: PowerFxTone;
  intensity: PowerFxIntensity;
  x: number;
  y: number;
  radius: number;
  durationMs: number;
}

interface PowerParticleLayerProps {
  bursts: PowerParticleBurst[];
  motionLevel: MotionLevel;
}

const TONE_COLOR: Record<PowerFxTone, string> = {
  gold: T.gold,
  pink: T.pink,
  teal: T.teal,
  cobalt: T.cobalt,
};

function particleCount(level: MotionLevel, intensity: PowerFxIntensity): number {
  const base = level === "full" ? 26 : level === "balanced" ? 16 : 7;
  const factor = intensity === "spectacular" ? 1.25 : intensity === "subtle" ? 0.65 : 1;
  return Math.max(4, Math.round(base * factor));
}

function seeded(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 91.733 + salt * 37.119) * 43758.5453;
  return value - Math.floor(value);
}

export const PowerParticleLayer = memo(function PowerParticleLayer({
  bursts,
  motionLevel,
}: PowerParticleLayerProps) {
  const rendered = useMemo(
    () => bursts.map((burst) => {
      const count = particleCount(motionLevel, burst.intensity);
      const particles = Array.from({ length: count }, (_, index) => {
        const angle = seeded(index, 1) * Math.PI * 2;
        const distance = burst.radius * (0.45 + seeded(index, 2) * 0.75);
        const drift = (seeded(index, 3) - 0.5) * burst.radius * 0.4;
        const dx = Math.cos(angle) * distance + drift;
        const dy = Math.sin(angle) * distance;
        const size = 2 + seeded(index, 4) * (motionLevel === "full" ? 6 : 4);
        const delay = seeded(index, 5) * Math.min(180, burst.durationMs * 0.16);
        return (
          <span
            key={index}
            style={{
              "--fx-dx": `${dx}px`,
              "--fx-dy": `${dy}px`,
              "--fx-size": `${size}px`,
              "--fx-delay": `${delay}ms`,
              "--fx-spin": `${Math.round(seeded(index, 6) * 300 - 150)}deg`,
            } as CSSProperties}
          />
        );
      });

      return (
        <div
          key={burst.id}
          className={`nj-power-burst nj-power-burst-${burst.preset} nj-power-burst-${motionLevel}`}
          style={{
            left: burst.x,
            top: burst.y,
            "--fx-color": TONE_COLOR[burst.tone],
            "--fx-duration": `${burst.durationMs}ms`,
            "--fx-radius": `${burst.radius}px`,
          } as CSSProperties}
          aria-hidden="true"
        >
          <i className="nj-power-burst-halo" />
          <i className="nj-power-burst-ring" />
          {particles}
        </div>
      );
    }),
    [bursts, motionLevel],
  );

  return <div className="nj-power-particle-layer">{rendered}</div>;
});
