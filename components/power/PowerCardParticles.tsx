"use client";

/* ═══════════════ Particules de bordure des cartes Pouvoir (Canvas partagé) ═══════════════
   Une seule boucle `requestAnimationFrame` sert toutes les cartes visibles à l'écran :
   - Pause automatique hors écran (`IntersectionObserver`), onglet masqué (`document.hidden`),
     `prefers-reduced-motion: reduce`, ou ancêtre `[data-motion-level="off"]`.
   - Mode `contained` (inset: 0) pour les cartes dans des conteneurs `overflow: hidden`
     (Ma collection, Boutique, Hub Jouer, Profil) et mode débordant pour `PowerCardView`.
   - 8 comportements dédiés : poussière & étoiles d'or (`orfevre`), braises (`braise`),
     éclats prismatiques (`prisme`), lucioles orbitales Ndop (`ndop_energy`), spores bokeh
     (`relique`), micro-arcs électriques (`foudre`), éclats métalliques sur biseau plein
     (`monolithe`) et comètes solaires à traînée lumineuse (`solaire`). */

import { memo, useEffect, useRef } from "react";
import type { PowerBorderId, PowerBorderParticlesMode } from "@/domain/powerBorders";
import type { PowerCategory, PowerRarity } from "@/types/game";
import { CATEGORY_MOTIF_PALETTE, RARITY_METAL_PALETTE } from "./PowerCardMotif";

interface PowerCardParticlesProps {
  border: Exclude<PowerBorderId, "classique">;
  category: PowerCategory;
  rarity: PowerRarity;
  mode: PowerBorderParticlesMode;
  compact?: boolean;
  /** True si le canvas reste inscrit dans la carte (`inset: 0`) plutôt que débordant. */
  contained?: boolean;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  age: number;
  life: number;
  phase: number;
  star?: boolean;
  rot?: number;
  vrot?: number;
  t?: number;
  speed?: number;
  offset?: number;
  corner?: number;
}

interface LightningBolt {
  pts: Array<{ x: number; y: number }>;
  age: number;
  life: number;
}

interface Runner {
  step(dt: number, time: number): void;
}

/* ── Boucle rAF unique partagée par toutes les cartes visibles ── */
const activeRunners = new Set<Runner>();
let rafId: number | null = null;
let lastFrameTs = 0;
let visibilityBound = false;

function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function tick(now: number) {
  rafId = null;
  if (activeRunners.size === 0 || (typeof document !== "undefined" && document.hidden)) return;
  const dt = lastFrameTs > 0 ? Math.min(0.05, (now - lastFrameTs) / 1000) : 0.016;
  lastFrameTs = now;
  const time = now / 1000;
  for (const runner of activeRunners) {
    runner.step(dt, time);
  }
  if (activeRunners.size > 0) {
    rafId = requestAnimationFrame(tick);
  }
}

function startLoop() {
  if (typeof window === "undefined" || rafId !== null || activeRunners.size === 0) return;
  if (typeof document !== "undefined" && document.hidden) return;
  if (!visibilityBound && typeof document !== "undefined") {
    visibilityBound = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopLoop();
      } else if (activeRunners.size > 0) {
        lastFrameTs = performance.now();
        startLoop();
      }
    });
  }
  lastFrameTs = performance.now();
  rafId = requestAnimationFrame(tick);
}

function registerRunner(runner: Runner) {
  activeRunners.add(runner);
  startLoop();
}

function unregisterRunner(runner: Runner) {
  activeRunners.delete(runner);
  if (activeRunners.size === 0) stopLoop();
}

/* ── Géométrie du périmètre de la carte dans le canvas ── */
function spawnBorderPoint(w: number, h: number, pad: number) {
  const rw = Math.max(12, w - pad * 2);
  const rh = Math.max(16, h - pad * 2);
  const perim = 2 * (rw + rh);
  let d = Math.random() * perim;
  if (d < rw) return { x: pad + d, y: pad, nx: 0, ny: -1 };
  d -= rw;
  if (d < rh) return { x: pad + rw, y: pad + d, nx: 1, ny: 0 };
  d -= rh;
  if (d < rw) return { x: pad + rw - d, y: pad + rh, nx: 0, ny: 1 };
  d -= rw;
  return { x: pad, y: pad + rh - d, nx: -1, ny: 0 };
}

function pointAtPerimeter(t: number, w: number, h: number, pad: number) {
  const rw = Math.max(12, w - pad * 2);
  const rh = Math.max(16, h - pad * 2);
  const perim = 2 * (rw + rh);
  let d = (((t % 1) + 1) % 1) * perim;
  if (d < rw) return { x: pad + d, y: pad };
  d -= rw;
  if (d < rh) return { x: pad + rw, y: pad + d };
  d -= rh;
  if (d < rw) return { x: pad + rw - d, y: pad + rh };
  d -= rw;
  return { x: pad, y: pad + rh - d };
}

const MODE_SCALE: Record<PowerBorderParticlesMode, number> = {
  off: 0,
  subtle: 0.5,
  normal: 1,
  intense: 1.6,
};

const RARITY_SCALE: Record<PowerRarity, number> = {
  common: 0.65,
  rare: 0.9,
  epic: 1.2,
  legendary: 1.5,
};

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.lineTo(x + Math.cos(a) * r * 1.9, y + Math.sin(a) * r * 1.9);
    ctx.lineTo(x + Math.cos(a + Math.PI / 4) * r * 0.45, y + Math.sin(a + Math.PI / 4) * r * 0.45);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export const PowerCardParticles = memo(function PowerCardParticles({
  border,
  category,
  rarity,
  mode,
  compact = false,
  contained = false,
  className,
}: PowerCardParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode === "off" || typeof window === "undefined") return;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (reducedMotion) return;

    if (canvas.closest?.(".nj-animations-disabled")) return;

    const motionHost = canvas.closest?.("[data-motion-level]") as HTMLElement | null;
    const motionLevel = motionHost?.dataset.motionLevel;
    if (motionLevel === "off") return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pal = CATEGORY_MOTIF_PALETTE[category];
    const rar = RARITY_METAL_PALETTE[rarity];
    const pad = contained ? (compact ? 3 : 6) : (compact ? 8 : 18);
    const baseCount =
      border === "foudre"
        ? 16
        : border === "braise"
          ? 24
          : border === "solaire"
            ? 14
            : border === "eclipse"
              ? 18
              : 20;
    const liteFactor = motionLevel === "lite" ? 0.5 : 1;
    const compactFactor = compact ? 0.45 : 1;
    const count = Math.max(
      compact ? 4 : 6,
      Math.round(baseCount * RARITY_SCALE[rarity] * MODE_SCALE[mode] * compactFactor * liteFactor),
    );

    const particles: Particle[] = [];
    let bolts: LightningBolt[] = [];
    let lastW = 0;
    let lastH = 0;
    let visible = true;

    const spawnOne = (w: number, h: number): Particle => {
      const pt = spawnBorderPoint(w, h, pad);
      const sizeMul = compact ? 0.68 : 1;
      const speedMul = compact ? 0.65 : 1;
      const driftSign = contained ? -1 : 1;
      const life = 0.75 + Math.random() * 1.35;

      if (border === "orfevre") {
        return {
          x: pt.x + (Math.random() - 0.5) * 5,
          y: pt.y + (Math.random() - 0.5) * 5,
          vx: ((Math.random() - 0.5) * 9 + pt.nx * 3 * driftSign) * speedMul,
          vy: -(9 + Math.random() * 17) * speedMul,
          size: (1.3 + Math.random() * 2.2) * sizeMul,
          star: Math.random() < 0.36,
          age: Math.random() * life,
          life,
          phase: Math.random() * Math.PI * 2,
        };
      }
      if (border === "braise") {
        const fromBottom = Math.random() < 0.45;
        return {
          x: fromBottom ? pad + Math.random() * Math.max(10, w - pad * 2) : pt.x + (Math.random() - 0.5) * 6,
          y: fromBottom ? h - pad - Math.random() * 12 : pt.y + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 16 * speedMul,
          vy: -(18 + Math.random() * 30) * speedMul,
          size: (1.4 + Math.random() * 2.5) * sizeMul,
          age: Math.random() * life,
          life: 0.55 + Math.random() * 1.05,
          phase: Math.random() * Math.PI * 2,
        };
      }
      if (border === "prisme") {
        return {
          x: pt.x + pt.nx * (1.5 + Math.random() * 4) * driftSign,
          y: pt.y + pt.ny * (1.5 + Math.random() * 4) * driftSign,
          vx: (pt.nx * (4 + Math.random() * 6) * driftSign + (Math.random() - 0.5) * 5) * speedMul,
          vy: (pt.ny * (4 + Math.random() * 6) * driftSign - 3) * speedMul,
          size: (2 + Math.random() * 3.1) * sizeMul,
          rot: Math.random() * Math.PI,
          vrot: (Math.random() - 0.5) * 2.5,
          age: Math.random() * life,
          life: 1.05 + Math.random() * 1.25,
          phase: Math.random() * Math.PI * 2,
        };
      }
      if (border === "ndop_energy") {
        return {
          x: pt.x,
          y: pt.y,
          vx: 0,
          vy: 0,
          t: Math.random(),
          speed: (0.07 + Math.random() * 0.085) * (Math.random() < 0.5 ? 1 : -1),
          offset: (Math.random() - 0.5) * (compact ? 4 : 8),
          size: (1.5 + Math.random() * 2) * sizeMul,
          age: Math.random() * 2,
          life: 1.5 + Math.random() * 1.5,
          phase: Math.random() * Math.PI * 2,
        };
      }
      if (border === "relique") {
        return {
          x: pt.x + pt.nx * (Math.random() * 5) * driftSign,
          y: pt.y + pt.ny * (Math.random() * 5) * driftSign,
          vx: (Math.random() - 0.5) * 11 * speedMul,
          vy: -(6.5 + Math.random() * 13) * speedMul,
          size: (2 + Math.random() * 3.3) * sizeMul,
          age: Math.random() * life,
          life: 1.3 + Math.random() * 1.5,
          phase: Math.random() * Math.PI * 2,
        };
      }
      if (border === "monolithe") {
        const isCornerSpark = Math.random() < 0.34;
        if (isCornerSpark) {
          const corner = Math.floor(Math.random() * 4);
          const inset = contained ? (compact ? 5 : 9) : pad + (compact ? 3 : 6);
          const cx = corner % 2 === 0 ? inset : w - inset;
          const cy = corner < 2 ? inset : h - inset;
          return {
            x: cx + (Math.random() - 0.5) * 5,
            y: cy + (Math.random() - 0.5) * 5,
            vx: 0,
            vy: -3 * speedMul,
            size: (2 + Math.random() * 2.4) * sizeMul,
            star: true,
            corner,
            age: Math.random() * 1.1,
            life: 0.7 + Math.random() * 0.8,
            phase: Math.random() * Math.PI * 2,
          };
        }
        return {
          x: pt.x,
          y: pt.y,
          vx: 0,
          vy: 0,
          t: Math.random(),
          speed: (0.045 + Math.random() * 0.055) * (Math.random() < 0.5 ? 1 : -1),
          offset: (Math.random() - 0.5) * (compact ? 3 : 5),
          size: (1.3 + Math.random() * 1.9) * sizeMul,
          star: Math.random() < 0.3,
          age: Math.random() * 1.4,
          life: 1.1 + Math.random() * 1.2,
          phase: Math.random() * Math.PI * 2,
        };
      }
      if (border === "solaire") {
        const isComet = Math.random() < 0.38;
        if (isComet) {
          return {
            x: pt.x,
            y: pt.y,
            vx: 0,
            vy: 0,
            t: Math.random(),
            speed: (0.14 + Math.random() * 0.1) * (Math.random() < 0.7 ? 1 : -1),
            size: (1.7 + Math.random() * 1.4) * sizeMul,
            star: true,
            age: Math.random() * 2.2,
            life: 1.8 + Math.random() * 1.5,
            phase: Math.random() * Math.PI * 2,
          };
        }
        return {
          x: pt.x + (Math.random() - 0.5) * 4,
          y: pt.y + (Math.random() - 0.5) * 4,
          vx: (pt.nx * (7 + Math.random() * 12) * driftSign + (Math.random() - 0.5) * 8) * speedMul,
          vy: (pt.ny * (7 + Math.random() * 12) * driftSign - 5) * speedMul,
          size: (1.3 + Math.random() * 2.1) * sizeMul,
          star: Math.random() < 0.4,
          age: Math.random() * life,
          life: 0.7 + Math.random() * 1.0,
          phase: Math.random() * Math.PI * 2,
        };
      }
      if (border === "kente") {
        return {
          x: pt.x + (Math.random() - 0.5) * 5,
          y: pt.y + (Math.random() - 0.5) * 5,
          vx: ((Math.random() - 0.5) * 10 + pt.nx * 3.5 * driftSign) * speedMul,
          vy: -(8 + Math.random() * 14) * speedMul,
          size: (2 + Math.random() * 2.4) * sizeMul,
          rot: Math.random() * Math.PI,
          vrot: (Math.random() - 0.5) * 2.2,
          star: Math.random() < 0.28,
          age: Math.random() * life,
          life: 1.0 + Math.random() * 1.2,
          phase: Math.random() * Math.PI * 2,
        };
      }
      if (border === "eclipse") {
        return {
          x: pt.x,
          y: pt.y,
          vx: 0,
          vy: 0,
          t: Math.random(),
          speed: (0.04 + Math.random() * 0.05) * (Math.random() < 0.7 ? 1 : -1),
          offset: (Math.random() - 0.5) * (compact ? 3 : 6),
          size: (1.4 + Math.random() * 2.2) * sizeMul,
          star: Math.random() < 0.34,
          age: Math.random() * 1.8,
          life: 1.3 + Math.random() * 1.4,
          phase: Math.random() * Math.PI * 2,
        };
      }
      /* foudre */
      return {
        x: pt.x,
        y: pt.y,
        vx: (pt.nx * (14 + Math.random() * 22) * driftSign + (Math.random() - 0.5) * 16) * speedMul,
        vy: (pt.ny * (14 + Math.random() * 22) * driftSign + (Math.random() - 0.5) * 16) * speedMul,
        size: (1.1 + Math.random() * 1.6) * sizeMul,
        age: Math.random() * 0.5,
        life: 0.24 + Math.random() * 0.36,
        phase: Math.random() * Math.PI * 2,
      };
    };

    const runner: Runner = {
      step(dt, time) {
        if (!visible) return;
        const rect = canvas.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        if (w < 16 || h < 16) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (w !== lastW || h !== lastH) {
          lastW = w;
          lastH = h;
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        ctx.clearRect(0, 0, w, h);
        while (particles.length < count) particles.push(spawnOne(w, h));

        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i]!;
          p.age += dt;
          if (p.age >= p.life) {
            const next = spawnOne(w, h);
            next.age = 0;
            particles[i] = next;
            continue;
          }
          const alpha = Math.sin((p.age / p.life) * Math.PI);

          if (border === "orfevre") {
            p.x += (p.vx + Math.sin(time * 2.4 + p.phase) * 6) * dt;
            p.y += p.vy * dt;
            const col = p.star ? rar.metalBright : rar.metal;
            if (p.star) {
              drawStar(ctx, p.x, p.y, p.size, col, alpha * 0.92);
            } else {
              ctx.globalAlpha = alpha * 0.84;
              ctx.fillStyle = col;
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (border === "braise") {
            p.x += (p.vx + Math.sin(time * 4.8 + p.phase) * 14) * dt;
            p.y += p.vy * dt;
            const r = p.size * 2.5;
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            grad.addColorStop(0, "#fff8d6");
            grad.addColorStop(0.42, pal.secondary);
            grad.addColorStop(1, "rgba(255, 60, 20, 0)");
            ctx.globalAlpha = alpha * 0.94;
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
          } else if (border === "prisme") {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot = (p.rot ?? 0) + (p.vrot ?? 0) * dt;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.globalAlpha = alpha * 0.86;
            ctx.fillStyle = i % 2 === 0 ? "#e8fbff" : pal.secondary;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            ctx.moveTo(0, -p.size);
            ctx.lineTo(p.size * 0.62, 0);
            ctx.lineTo(0, p.size);
            ctx.lineTo(-p.size * 0.62, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          } else if (border === "ndop_energy") {
            p.t = (p.t ?? 0) + (p.speed ?? 0.08) * dt;
            const pos = pointAtPerimeter(p.t, w, h, pad);
            const px = pos.x + Math.cos(time * 3 + p.phase) * (p.offset ?? 0) * 0.5;
            const py = pos.y + Math.sin(time * 3 + p.phase) * (p.offset ?? 0) * 0.5;
            const r = p.size * 3.1;
            const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
            grad.addColorStop(0, "#ffffff");
            grad.addColorStop(0.4, i % 2 === 0 ? pal.secondary : rar.metal);
            grad.addColorStop(1, "rgba(0, 0, 0, 0)");
            ctx.globalAlpha = alpha * 0.88;
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
          } else if (border === "relique") {
            p.x += (p.vx + Math.sin(time * 1.8 + p.phase) * 9) * dt;
            p.y += p.vy * dt;
            const r = p.size * 2.1;
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            grad.addColorStop(0, "#e9fff6");
            grad.addColorStop(0.45, i % 3 === 0 ? "#ffd966" : "#32e8b5");
            grad.addColorStop(1, "rgba(50, 232, 181, 0)");
            ctx.globalAlpha = alpha * 0.72;
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
          } else if (border === "monolithe") {
            if (p.corner !== undefined) {
              p.y += p.vy * dt;
              drawStar(ctx, p.x, p.y, p.size, rar.metalBright, alpha * 0.96);
            } else {
              p.t = (p.t ?? 0) + (p.speed ?? 0.05) * dt;
              const bevelPad = contained ? (compact ? 4 : 7) : pad + (compact ? 2 : 5);
              const pos = pointAtPerimeter(p.t, w, h, bevelPad);
              const px = pos.x + Math.cos(time * 2 + p.phase) * (p.offset ?? 0) * 0.35;
              const py = pos.y + Math.sin(time * 2 + p.phase) * (p.offset ?? 0) * 0.35;
              if (p.star) {
                drawStar(ctx, px, py, p.size, i % 2 === 0 ? rar.metalBright : pal.secondary, alpha * 0.92);
              } else {
                const r = p.size * 2.3;
                const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
                grad.addColorStop(0, "#ffffff");
                grad.addColorStop(0.45, i % 2 === 0 ? rar.metal : pal.primary);
                grad.addColorStop(1, "rgba(0, 0, 0, 0)");
                ctx.globalAlpha = alpha * 0.85;
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(px, py, r, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          } else if (border === "solaire") {
            if (p.t !== undefined && p.speed !== undefined) {
              p.t += p.speed * dt;
              const head = pointAtPerimeter(p.t, w, h, pad);
              const dir = Math.sign(p.speed);
              for (let s = 5; s >= 1; s--) {
                const trailPt = pointAtPerimeter(p.t - dir * s * 0.011, w, h, pad);
                const frac = 1 - s / 6;
                ctx.globalAlpha = alpha * frac * 0.65;
                ctx.fillStyle = s <= 2 ? rar.metalBright : pal.secondary;
                ctx.beginPath();
                ctx.arc(trailPt.x, trailPt.y, Math.max(0.7, p.size * frac), 0, Math.PI * 2);
                ctx.fill();
              }
              drawStar(ctx, head.x, head.y, p.size * 1.1, "#ffffff", alpha * 0.96);
            } else {
              p.x += p.vx * dt;
              p.y += p.vy * dt;
              if (p.star) {
                drawStar(ctx, p.x, p.y, p.size, pal.secondary, alpha * 0.9);
              } else {
                ctx.globalAlpha = alpha * 0.8;
                ctx.fillStyle = rar.metalBright;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          } else if (border === "kente") {
            p.x += (p.vx + Math.sin(time * 2.2 + p.phase) * 7) * dt;
            p.y += p.vy * dt;
            p.rot = (p.rot ?? 0) + (p.vrot ?? 0) * dt;
            if (p.star) {
              drawStar(ctx, p.x, p.y, p.size * 0.85, "#ffe48a", alpha * 0.92);
            } else {
              ctx.save();
              ctx.translate(p.x, p.y);
              ctx.rotate(p.rot);
              ctx.globalAlpha = alpha * 0.88;
              ctx.fillStyle = i % 3 === 0 ? "#ffd95e" : i % 3 === 1 ? pal.primary : "#1fd9a7";
              ctx.beginPath();
              ctx.moveTo(0, -p.size);
              ctx.lineTo(p.size * 0.72, 0);
              ctx.lineTo(0, p.size);
              ctx.lineTo(-p.size * 0.72, 0);
              ctx.closePath();
              ctx.fill();
              ctx.restore();
            }
          } else if (border === "eclipse") {
            p.t = (p.t ?? 0) + (p.speed ?? 0.045) * dt;
            const pos = pointAtPerimeter(p.t, w, h, pad);
            const px = pos.x + Math.cos(time * 2.2 + p.phase) * (p.offset ?? 0) * 0.45;
            const py = pos.y + Math.sin(time * 2.2 + p.phase) * (p.offset ?? 0) * 0.45;
            if (p.star) {
              drawStar(ctx, px, py, p.size * 0.9, rar.metalBright, alpha * 0.92);
            } else {
              const r = p.size * 2.6;
              const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
              grad.addColorStop(0, "#ffffff");
              grad.addColorStop(0.38, i % 2 === 0 ? pal.primary : rar.metal);
              grad.addColorStop(1, "rgba(0, 0, 0, 0)");
              ctx.globalAlpha = alpha * 0.76;
              ctx.fillStyle = grad;
              ctx.beginPath();
              ctx.arc(px, py, r, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            /* foudre */
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = compact ? 1 : 1.35;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 0.08, p.y - p.vy * 0.08);
            ctx.stroke();
          }
        }

        if (border === "foudre") {
          const boltChance = 0.13 * MODE_SCALE[mode] * compactFactor * liteFactor;
          if (Math.random() < boltChance) {
            const t1 = Math.random();
            const span = 0.04 + Math.random() * 0.07;
            const p1 = pointAtPerimeter(t1, w, h, pad);
            const p2 = pointAtPerimeter(t1 + span, w, h, pad);
            const pts = [p1];
            const jitter = compact ? 5 : 10;
            for (let s = 1; s < 4; s++) {
              const f = s / 4;
              pts.push({
                x: p1.x + (p2.x - p1.x) * f + (Math.random() - 0.5) * jitter,
                y: p1.y + (p2.y - p1.y) * f + (Math.random() - 0.5) * jitter,
              });
            }
            pts.push(p2);
            bolts.push({ pts, age: 0, life: 0.15 + Math.random() * 0.14 });
          }
          bolts = bolts.filter((b) => {
            b.age += dt;
            if (b.age >= b.life) return false;
            const a = 1 - b.age / b.life;
            ctx.globalAlpha = a * 0.88;
            ctx.strokeStyle = pal.secondary;
            ctx.lineWidth = compact ? 1.8 : 2.5;
            ctx.beginPath();
            b.pts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
            ctx.stroke();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = compact ? 0.8 : 1.05;
            ctx.stroke();
            return true;
          });
        }

        ctx.restore();
      },
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          visible = entries.some((entry) => entry.isIntersecting);
          if (visible) registerRunner(runner);
          else unregisterRunner(runner);
        },
        { rootMargin: "40px" },
      );
      observer.observe(canvas);
    }

    registerRunner(runner);

    return () => {
      observer?.disconnect();
      unregisterRunner(runner);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [border, category, rarity, mode, compact, contained]);

  if (mode === "off") return null;
  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
});
