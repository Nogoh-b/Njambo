"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionProfile } from "@/lib/motion";
import { getBoardRenderCount, PERFORMANCE_EVENT } from "@/lib/performanceMetrics";

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

  useEffect(() => {
    setEnabled(new URLSearchParams(window.location.search).get("perf") === "1");
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
      <strong>{metrics.fps} FPS</strong>
      <span>p95 {metrics.p95} ms</span>
      <span>longues {metrics.longTasks}</span>
      <span>plateau {metrics.boardRenders}</span>
      <span>profil {motion.level}</span>
    </aside>
  );
}
