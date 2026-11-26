"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionProfile } from "@/lib/motion";
import { getBoardRenderCount, PERFORMANCE_EVENT } from "@/lib/performanceMetrics";
import { getNavSamples, NAV_PERF_EVENT, navPerfEnabled, type NavSample } from "@/lib/navPerf";

function deviceLine(): string {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ? "tactile" : "souris";
  return `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio.toFixed(1)} · ${nav.hardwareConcurrency ?? "?"} cœurs · ${nav.deviceMemory ?? "?"} Go · ${coarse}`;
}

function navLine(sample: NavSample): string {
  const total = Math.round((sample.done ?? sample.painted ?? sample.start) - sample.start);
  const mount = sample.commit !== undefined ? Math.round(sample.commit - sample.start) : "?";
  const paint = sample.painted !== undefined ? Math.round(sample.painted - sample.start) : "?";
  return `${sample.from}→${sample.to} ${total} ms (monté ${mount} · 1re image ${paint}) · pire ${sample.worstFrame} ms · ${sample.slowFrames} lente(s)`;
}

interface HudMetrics {
  fps: number;
  p95: number;
  longTasks: number;
  boardRenders: number;
}

export function PerformanceHud() {
  const motion = useMotionProfile();
  const [enabled, setEnabled] = useState(false);
  const [metrics, setMetrics] = useState<HudMetrics>({ fps: 0, p95: 0, longTasks: 0, boardRenders: 0 });
  const longTasksRef = useRef(0);

  const [navSamples, setNavSamples] = useState<readonly NavSample[]>([]);
  const [device, setDevice] = useState("");

  useEffect(() => {
    setEnabled(navPerfEnabled());
    setDevice(deviceLine());
    const onNav = () => setNavSamples([...getNavSamples()]);
    window.addEventListener(NAV_PERF_EVENT, onNav);
    return () => window.removeEventListener(NAV_PERF_EVENT, onNav);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let lastFrameAt = performance.now();
    let sampleStartedAt = lastFrameAt;
    let animationFrame = 0;
    let frameDurations: number[] = [];

    const onBoardRender = () => {
      setMetrics((current) => ({ ...current, boardRenders: getBoardRenderCount() }));
    };
    window.addEventListener(PERFORMANCE_EVENT, onBoardRender);

    const observer = typeof PerformanceObserver !== "undefined"
      ? new PerformanceObserver((list) => {
          longTasksRef.current += list.getEntries().filter((entry) => entry.duration > 50).length;
        })
      : null;
    try {
      observer?.observe({ entryTypes: ["longtask"] });
    } catch {
      observer?.disconnect();
    }

    const tick = (now: number) => {
      frame += 1;
      frameDurations.push(now - lastFrameAt);
      lastFrameAt = now;
      if (now - sampleStartedAt >= 1000) {
        const sorted = [...frameDurations].sort((left, right) => left - right);
        const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
        setMetrics({
          fps: Math.round(frame * 1000 / (now - sampleStartedAt)),
          p95: Math.round(p95 * 10) / 10,
          longTasks: longTasksRef.current,
          boardRenders: getBoardRenderCount(),
        });
        frame = 0;
        frameDurations = [];
        sampleStartedAt = now;
      }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.removeEventListener(PERFORMANCE_EVENT, onBoardRender);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <aside className="nj-performance-hud" aria-label="Mesures de performance">
      <strong>{metrics.fps} FPS · p95 {metrics.p95} ms · longues {metrics.longTasks} · profil {motion.mode} · plateau {metrics.boardRenders}</strong>
      <span>{device}</span>
      {navSamples.slice(0, 4).map((sample) => (
        <span key={sample.id} className="nj-performance-hud-nav">
          {navLine(sample)}
          {sample.frames.map((frame, index) => (
            <em key={index}>  image {frame.duration} ms : JS {frame.script} · mise en page {frame.layout} · {frame.source}</em>
          ))}
        </span>
      ))}
    </aside>
  );
}
