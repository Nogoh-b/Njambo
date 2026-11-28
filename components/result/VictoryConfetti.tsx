"use client";

import { useEffect, useRef } from "react";
import type { MotionProfile } from "@/lib/motion";

interface VictoryConfettiProps {
  motion: Pick<MotionProfile, "enabled" | "reduced" | "level" | "allowDecorativeLoop">;
  /** "win" : canons de confettis + poussière d'or ; "loss" : fines braises cuivre/émeraude (zéro confetti). */
  outcome?: "win" | "loss";
  /** Booste la salve pour les victoires doublées (3 ×2 / 21 exact / série). */
  emphatic?: boolean;
}

type ConfettiShape = "ribbon" | "rect" | "circle" | "star";

interface Particle {
  kind: "confetti" | "mote" | "ember";
  rain?: boolean;
  shape: ConfettiShape;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vrot: number;
  wobble: number;
  wobbleSpd: number;
  color: string;
  foil: boolean;
  life: number;
  maxLife: number;
  phase: number;
  r: number;
}

const SALON_ROYAL_PALETTE = [
  "#ffcf40",
  "#fff4b8",
  "#1de4be",
  "#3ce078",
  "#ff5c8a",
  "#ff9a2e",
  "#ffffff",
] as const;

const SHAPES: readonly ConfettiShape[] = ["ribbon", "ribbon", "rect", "circle", "star"];

/**
 * Couche canvas au premier plan (pointer-events: none) calibrée sur Blason Chef :
 * - En Victoire : double canon latéral + fontaine haute (rubans, disques, étoiles 4 branches),
 *   seconde salve synchronisée sur les Nkap, pluie festive courte et poussières d'or.
 * - En Défaite : aucun confetti — uniquement de fines braises/lucioles cuivre et émeraude.
 */
export function VictoryConfetti({ motion, outcome = "win", emphatic = false }: VictoryConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!motion.enabled || motion.reduced) return undefined;
    if (outcome === "loss" && !motion.allowDecorativeLoop) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const isWin = outcome === "win";
    const isFull = motion.level === "full";
    const isLite = motion.level === "lite";
    const dpr = isFull ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const wave1Count = (isFull ? 92 : isLite ? 38 : 62) + (emphatic ? 22 : 0);
    const wave2Count = isLite ? 0 : (isFull ? 54 : 32);
    const maxActive = isFull ? 165 : isLite ? 60 : 105;

    let width = 0;
    let height = 0;
    const resize = () => {
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const pieces: Particle[] = [];

    const spawnBurst = (count: number, mode: "cannons" | "rain") => {
      for (let i = 0; i < count; i += 1) {
        let x: number;
        let y: number;
        let vx: number;
        let vy: number;

        if (mode === "rain") {
          x = Math.random() * width;
          y = -14 - Math.random() * 36;
          vx = (Math.random() - 0.5) * 1.4;
          vy = 1.3 + Math.random() * 2.2;
        } else {
          const lane = i % 3;
          if (lane === 0) {
            x = -6;
            y = height * (0.28 + Math.random() * 0.28);
            const ang = -0.95 + Math.random() * 0.72;
            const spd = 5.2 + Math.random() * 5.6;
            vx = Math.cos(ang) * spd;
            vy = Math.sin(ang) * spd;
          } else if (lane === 1) {
            x = width + 6;
            y = height * (0.28 + Math.random() * 0.28);
            const ang = Math.PI + 0.95 - Math.random() * 0.72;
            const spd = 5.2 + Math.random() * 5.6;
            vx = Math.cos(ang) * spd;
            vy = Math.sin(ang) * spd;
          } else {
            x = width * 0.5 + (Math.random() - 0.5) * Math.min(180, width * 0.36);
            y = height * 0.16;
            const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.0;
            const spd = 3.4 + Math.random() * 5.4;
            vx = Math.cos(ang) * spd;
            vy = Math.sin(ang) * spd - 1.0;
          }
        }

        pieces.push({
          kind: "confetti",
          rain: mode === "rain",
          shape: SHAPES[i % SHAPES.length],
          x,
          y,
          vx,
          vy,
          w: 6 + Math.random() * 7.5,
          h: 3.5 + Math.random() * 4.5,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.22,
          wobble: Math.random() * Math.PI * 2,
          wobbleSpd: 0.065 + Math.random() * 0.065,
          color: SALON_ROYAL_PALETTE[i % SALON_ROYAL_PALETTE.length],
          foil: i % 4 === 0,
          life: 0,
          maxLife: mode === "rain"
            ? Math.max(300, Math.round(height / 2.1)) + Math.random() * 90
            : 155 + Math.random() * 90,
          phase: 0,
          r: 0,
        });
      }
    };

    let wave2Timer: number | undefined;
    let rainTimer: number | undefined;

    if (isWin) {
      /* Salve 1 : double canon latéral + fontaine haute dès l'ouverture. */
      spawnBurst(wave1Count, "cannons");

      if (motion.allowDecorativeLoop) {
        const moteCount = isFull ? 24 : 12;
        for (let i = 0; i < moteCount; i += 1) {
          pieces.push({
            kind: "mote",
            shape: "circle",
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 0.22,
            vy: -(0.22 + Math.random() * 0.48),
            w: 0,
            h: 0,
            rot: 0,
            vrot: 0,
            wobble: 0,
            wobbleSpd: 0,
            color: i % 3 === 0 ? "#88ffee" : "#ffe688",
            foil: false,
            life: 0,
            maxLife: 0,
            phase: Math.random() * Math.PI * 2,
            r: 1.1 + Math.random() * 2.2,
          });
        }
      }

      /* Salve 2 : second éclat synchronisé sur l'arrivée des Nkap. */
      if (wave2Count > 0) {
        wave2Timer = window.setTimeout(() => {
          if (document.visibilityState === "visible") spawnBurst(wave2Count, "cannons");
        }, 720);
      }

      /* Pluie continue de confettis qui descend du haut tant que l'écran de victoire reste affiché. */
      const rainBatch = isFull ? 6 : isLite ? 3 : 4;
      const rainEveryMs = isFull ? 420 : isLite ? 680 : 520;
      rainTimer = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        if (pieces.length < maxActive) {
          spawnBurst(rainBatch, "rain");
        }
      }, rainEveryMs);
    } else {
      const emberCount = isFull ? 26 : 14;
      for (let i = 0; i < emberCount; i += 1) {
        pieces.push({
          kind: "ember",
          shape: "circle",
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.26,
          vy: -(0.18 + Math.random() * 0.38),
          w: 0,
          h: 0,
          rot: 0,
          vrot: 0,
          wobble: 0,
          wobbleSpd: 0,
          color: i % 3 === 0 ? "#ff9b74" : i % 2 === 0 ? "#5cead0" : "#9dc7c4",
          foil: false,
          life: 0,
          maxLife: 0,
          phase: Math.random() * Math.PI * 2,
          r: 1.2 + Math.random() * 2.4,
        });
      }
    }

    let rafId = 0;
    let paused = document.hidden;

    const tick = () => {
      if (paused) return;
      ctx.clearRect(0, 0, width, height);

      for (let i = pieces.length - 1; i >= 0; i -= 1) {
        const p = pieces[i];
        if (p.kind === "confetti") {
          p.life += 1;
          p.wobble += p.wobbleSpd;
          p.vy = p.rain ? Math.min(3.1, p.vy + 0.036) : Math.min(4.6, p.vy + 0.082);
          p.vx *= 0.986;
          p.x += p.vx + Math.sin(p.wobble) * (p.rain ? 0.72 : 0.55);
          p.y += p.vy;
          p.rot += p.vrot;

          const fadeStart = p.maxLife * 0.68;
          const alpha = Math.max(0, 1 - Math.max(0, p.life - fadeStart) / (p.maxLife - fadeStart));
          const flutter = Math.cos(p.wobble * 1.4);

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.foil && Math.abs(flutter) > 0.72 ? "#fffbe6" : p.color;

          if (p.shape === "circle") {
            ctx.beginPath();
            ctx.arc(0, 0, p.h * 0.65, 0, Math.PI * 2);
            ctx.fill();
          } else if (p.shape === "star") {
            ctx.scale(1, Math.max(0.25, Math.abs(flutter)));
            ctx.beginPath();
            for (let s = 0; s < 4; s += 1) {
              const a = (s * Math.PI) / 2;
              ctx.lineTo(Math.cos(a) * p.w * 0.65, Math.sin(a) * p.w * 0.65);
              ctx.lineTo(Math.cos(a + Math.PI / 4) * p.w * 0.25, Math.sin(a + Math.PI / 4) * p.w * 0.25);
            }
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, Math.max(1.2, p.h * Math.abs(flutter)));
          }
          ctx.restore();

          if (p.life >= p.maxLife || p.y > height + 28) {
            pieces.splice(i, 1);
          }
        } else {
          p.phase += 0.034;
          p.x += p.vx + Math.sin(p.phase) * 0.2;
          p.y += p.vy;
          if (p.y < -12) {
            p.y = height + 12;
            p.x = Math.random() * width;
          }
          const alpha = (p.kind === "mote" ? 0.22 : 0.14) + 0.32 * (0.5 + 0.5 * Math.sin(p.phase * 1.3));
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.shadowBlur = 6;
          ctx.shadowColor = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      if (isWin || pieces.length > 0) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    const onVisibility = () => {
      paused = document.hidden;
      if (!paused) {
        window.cancelAnimationFrame(rafId);
        rafId = window.requestAnimationFrame(tick);
      }
    };

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    if (!paused) rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      if (wave2Timer !== undefined) window.clearTimeout(wave2Timer);
      if (rainTimer !== undefined) window.clearInterval(rainTimer);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [emphatic, motion.allowDecorativeLoop, motion.enabled, motion.level, motion.reduced, outcome]);

  if (!motion.enabled || motion.reduced) return null;
  if (outcome === "loss" && !motion.allowDecorativeLoop) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}
