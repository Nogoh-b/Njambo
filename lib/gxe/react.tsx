"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

export interface ToneSpec {
  frequencyHz: number;
  durationMs: number;
  type?: OscillatorType;
  gain?: number;
  delayMs?: number;
}

export interface ChimeSpec {
  notes: readonly ToneSpec[];
}

export interface AmbientLoopSpec {
  notes: readonly number[];
  intervalMs: number;
  durationMs?: number;
  type?: OscillatorType;
  gain?: number;
}

export interface GxeDelegateOptions {
  autoDiscover?: boolean;
  idle?: {
    periodMs?: number;
    rise?: number;
    rest?: number;
  };
}

interface GxeRuntimeState {
  sfxMuted: boolean;
  musicMuted: boolean;
  audioCtx: AudioContext | null;
  canvas: HTMLCanvasElement | null;
}

const runtimeState: GxeRuntimeState = {
  sfxMuted: false,
  musicMuted: false,
  audioCtx: null,
  canvas: null,
};

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!runtimeState.audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      runtimeState.audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (runtimeState.audioCtx.state === "suspended") {
    void runtimeState.audioCtx.resume().catch(() => {});
  }
  return runtimeState.audioCtx;
}

function playSingleTone(spec: ToneSpec, bus: "sfx" | "music" = "sfx") {
  if (bus === "sfx" && runtimeState.sfxMuted) return;
  if (bus === "music" && runtimeState.musicMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime + (spec.delayMs ?? 0) / 1000;
    const durationSec = Math.max(0.01, spec.durationMs / 1000);
    const maxGain = spec.gain ?? 0.05;
    const attackSec = Math.min(0.006, durationSec * 0.25);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.type ?? "sine";
    osc.frequency.setValueAtTime(spec.frequencyHz, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(maxGain, now + attackSec);
    gain.gain.linearRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.01);
  } catch {
    // Ignore audio context timing errors before user gesture
  }
}

const sfxApi = {
  play(spec: ToneSpec) {
    playSingleTone(spec, "sfx");
  },
  playChime(spec: ChimeSpec) {
    if (runtimeState.sfxMuted) return;
    for (const note of spec.notes) {
      playSingleTone(note, "sfx");
    }
  },
};

let musicTimer: ReturnType<typeof setInterval> | null = null;

const musicApi = {
  start(spec: AmbientLoopSpec) {
    musicApi.stop();
    if (!spec.notes.length) return;
    musicTimer = setInterval(() => {
      if (runtimeState.musicMuted) return;
      const freq = spec.notes[Math.floor(Math.random() * spec.notes.length)];
      playSingleTone(
        {
          frequencyHz: freq,
          durationMs: spec.durationMs ?? 600,
          type: spec.type ?? "sine",
          gain: spec.gain ?? 0.025,
        },
        "music",
      );
    }, Math.max(120, spec.intervalMs));
  },
  stop() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  },
};

const fxApi = {
  burst(_preset: string, anchor?: Element | null) {
    const canvas = runtimeState.canvas;
    if (!canvas || typeof window === "undefined") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rect = anchor?.getBoundingClientRect();
    const ox = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const oy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

    const colors = ["#f2bb45", "#19b394", "#ff5d8f", "#fff4d2", "#58a6ff"];
    const particles = Array.from({ length: 28 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 28 + (Math.random() - 0.5) * 0.35;
      const speed = 2.6 + Math.random() * 4.5;
      return {
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.2,
        size: 4 + Math.random() * 4,
        color: colors[i % colors.length],
        alpha: 1,
      };
    });

    let frame = 0;
    const step = () => {
      frame += 1;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.16;
        p.alpha = Math.max(0, 1 - frame / 42);
        if (p.alpha > 0.02) {
          alive = true;
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size * 0.7);
        }
      }
      ctx.globalAlpha = 1;
      if (alive && frame < 45) {
        requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };
    requestAnimationFrame(step);
  },
  ambient() {
    return () => {};
  },
};

const GxeContext = createContext(runtimeState);

export function GxeProvider({
  children,
}: {
  delegate?: GxeDelegateOptions;
  children: ReactNode;
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const unlock = () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", unlock, { passive: true, once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  return <GxeContext.Provider value={runtimeState}>{children}</GxeContext.Provider>;
}

export function useGxeRuntime() {
  return useContext(GxeContext);
}

export function FxLayer({ zIndex = 60 }: { zIndex?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    runtimeState.canvas = ref.current;
    return () => {
      if (runtimeState.canvas === ref.current) {
        runtimeState.canvas = null;
      }
    };
  }, []);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex,
      }}
    />
  );
}

export function useSfx() {
  return sfxApi;
}

export function useMusic() {
  return musicApi;
}

export function useFx() {
  return useMemo(() => fxApi, []);
}

export function useAudioMute(bus: "sfx" | "music", muted: boolean) {
  useEffect(() => {
    if (bus === "sfx") runtimeState.sfxMuted = muted;
    else runtimeState.musicMuted = muted;
  }, [bus, muted]);
}
