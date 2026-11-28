"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { audioEngine, type AudioBus, type SfxPlayOptions } from "../audio/AudioEngine";
import { playGameSound } from "../audio/audioCatalogStore";
import { isGameSoundId, type GameSoundId } from "@/domain/audioCatalog";

export interface ToneSpec {
  /** Emplacement du catalogue audio global (prioritaire, éditable dans Admin → Sons & Audio). */
  soundId?: GameSoundId;
  frequencyHz: number;
  durationMs: number;
  type?: OscillatorType;
  gain?: number;
  delayMs?: number;
  /** Fichier audio pro (prioritaire sur la synthèse de secours). */
  sampleUrl?: string;
  /** Pool de variantes pro (rotation anti-répétition). */
  samplePool?: readonly string[];
  volume?: number;
  pitchJitter?: number;
  pan?: number;
  minGapMs?: number;
  maxPolyphony?: number;
  duckMusicMs?: number;
  duckDepth?: number;
}

export interface ChimeSpec {
  /** Emplacement du catalogue audio global (prioritaire, éditable dans Admin → Sons & Audio). */
  soundId?: GameSoundId;
  notes: readonly ToneSpec[];
  /** Fichier audio pro (prioritaire sur la synthèse de secours). */
  sampleUrl?: string;
  /** Pool de variantes pro (rotation anti-répétition). */
  samplePool?: readonly string[];
  volume?: number;
  pitchJitter?: number;
  pan?: number;
  minGapMs?: number;
  maxPolyphony?: number;
  duckMusicMs?: number;
  duckDepth?: number;
}

export interface AmbientLoopSpec {
  /** Piste musicale stéréo en boucle sans couture (remplace les notes MIDI). */
  trackUrl?: string;
  volume?: number;
  crossfadeMs?: number;
  /** Champs hérités conservés uniquement pour rétrocompatibilité de type. */
  notes?: readonly number[];
  intervalMs?: number;
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
  sfxVolume: number;
  musicVolume: number;
  audioCtx: AudioContext | null;
  canvas: HTMLCanvasElement | null;
}

const runtimeState: GxeRuntimeState = {
  sfxMuted: false,
  musicMuted: false,
  sfxVolume: 0.9,
  musicVolume: 0.55,
  audioCtx: null,
  canvas: null,
};

/** Synthèse de dernier recours (utilisée uniquement si aucun fichier audio n'est fourni ou en échec réseau). */
function playFallbackTone(spec: ToneSpec, bus: AudioBus = "sfx") {
  if (audioEngine.isMuted(bus)) return;
  const target = bus === "sfx" ? audioEngine.getSfxOutput() : audioEngine.getMusicOutput();
  if (!target) return;
  const { ctx, bus: outputBus } = target;
  runtimeState.audioCtx = ctx;

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
    gain.connect(outputBus);
    osc.start(now);
    osc.stop(now + durationSec + 0.01);
  } catch {
    // Ignore audio context timing errors before user gesture
  }
}

function playSpecSample(
  sampleUrl: string,
  meta: {
    samplePool?: readonly string[];
    volume?: number;
    pitchJitter?: number;
    pan?: number;
    minGapMs?: number;
    maxPolyphony?: number;
    duckMusicMs?: number;
    duckDepth?: number;
  },
  fallback?: () => void,
) {
  void audioEngine
    .playSfx({
      url: sampleUrl,
      pool: meta.samplePool,
      volume: meta.volume ?? 1,
      pitchJitter: meta.pitchJitter,
      pan: meta.pan,
      minGapMs: meta.minGapMs,
      maxPolyphony: meta.maxPolyphony,
      duckMusicMs: meta.duckMusicMs,
      duckDepth: meta.duckDepth,
    })
    .then((played) => {
      if (!played && fallback && !audioEngine.isMuted("sfx")) {
        // Ne joue pas de secours si c'était simplement bloqué par minGapMs (anti-spam)
        if (!meta.minGapMs) fallback();
      }
    });
}

const sfxApi = {
  play(spec: ToneSpec) {
    if (audioEngine.isMuted("sfx")) return;
    if (spec.soundId) {
      playGameSound(spec.soundId);
      return;
    }
    if (spec.sampleUrl) {
      playSpecSample(spec.sampleUrl, spec);
      return;
    }
    playFallbackTone(spec, "sfx");
  },
  playChime(spec: ChimeSpec) {
    if (audioEngine.isMuted("sfx")) return;
    if (spec.soundId) {
      playGameSound(spec.soundId);
      return;
    }
    if (spec.sampleUrl) {
      playSpecSample(spec.sampleUrl, spec);
      return;
    }
    for (const note of spec.notes) {
      playFallbackTone(note, "sfx");
    }
  },
  playSample(options: SfxPlayOptions) {
    void audioEngine.playSfx(options);
  },
  playSlot(id: GameSoundId) {
    playGameSound(id);
  },
};

/* ── Échantillons audio (sons IA du jeu + sons uploadés depuis l'admin) ── */

/** Précharge (télécharge + décode) un son ; renvoie true s'il est prêt. */
export function preloadAudioSample(url: string): Promise<boolean> {
  return audioEngine.preloadSample(url);
}

/** Joue un son préchargé (ou le charge puis le joue). Volume 0-1. Retourne true si joué. */
export function playAudioSample(
  url: string,
  volume = 1,
  options: Omit<SfxPlayOptions, "url" | "volume"> = {},
): Promise<boolean> {
  if (!url || audioEngine.isMuted("sfx")) return Promise.resolve(false);
  return audioEngine.playSfx({ url, volume, ...options });
}

/** Abaisse temporairement la musique de fond pour laisser ressortir un événement fort. */
export function duckMusic(durationMs: number, depth?: number) {
  audioEngine.duckMusic(durationMs, depth);
}

/** Joue un carillon (sample pro prioritaire, sinon synthèse de secours) hors React. */
export function playChimeNow(spec: ChimeSpec, volume = 1) {
  if (audioEngine.isMuted("sfx")) return;
  const scaled = Math.max(0, Math.min(1.5, volume));
  if (spec.sampleUrl) {
    void audioEngine.playSfx({
      url: spec.sampleUrl,
      volume: (spec.volume ?? 1) * scaled,
      pitchJitter: spec.pitchJitter,
      pan: spec.pan,
      minGapMs: spec.minGapMs,
      maxPolyphony: spec.maxPolyphony,
      duckMusicMs: spec.duckMusicMs,
      duckDepth: spec.duckDepth,
    });
    return;
  }
  for (const note of spec.notes) {
    playFallbackTone({ ...note, gain: (note.gain ?? 0.05) * Math.min(1, scaled) }, "sfx");
  }
}

const musicApi = {
  start(spec: AmbientLoopSpec) {
    if (spec.trackUrl) {
      audioEngine.playMusic(spec.trackUrl, {
        volume: spec.volume ?? 0.78,
        crossfadeMs: spec.crossfadeMs ?? 1200,
      });
    }
  },
  stop(fadeMs?: number) {
    audioEngine.stopMusic(fadeMs);
  },
  duck(durationMs: number, depth?: number) {
    audioEngine.duckMusic(durationMs, depth);
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
    audioEngine.bindLifecycle();
    if (typeof document === "undefined") return;

    // Délégation sonore globale des interactions UI (hors console /admin) :
    // tout bouton/onglet/switch joue automatiquement le son réglé dans Admin → Sons & Audio.
    // Un composant spécialisé peut poser `data-sound="off"` (muet) ou `data-sound="<GameSoundId>"`.
    const onUiClick = (event: MouseEvent) => {
      if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const custom = target.closest<HTMLElement>("[data-sound]");
      if (custom) {
        const value = custom.dataset.sound;
        if (!value || value === "off") return;
        if (isGameSoundId(value)) {
          playGameSound(value);
          return;
        }
      }
      const control = target.closest<HTMLElement>('button, [role="tab"], [role="switch"], [role="button"]');
      if (!control) return;
      if ((control as HTMLButtonElement).disabled || control.getAttribute("aria-disabled") === "true") return;
      const role = control.getAttribute("role");
      if (role === "switch") {
        playGameSound("ui_toggle");
      } else if (role === "tab") {
        playGameSound("ui_tab");
      } else {
        playGameSound("ui_button");
      }
    };

    document.addEventListener("click", onUiClick, { passive: true });
    return () => document.removeEventListener("click", onUiClick);
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

export function useAudioMute(bus: AudioBus, muted: boolean) {
  useEffect(() => {
    if (bus === "sfx") runtimeState.sfxMuted = muted;
    else runtimeState.musicMuted = muted;
    audioEngine.setMuted(bus, muted);
  }, [bus, muted]);
}

export function useAudioVolume(bus: AudioBus, volume: number) {
  useEffect(() => {
    const clamped = Math.max(0, Math.min(1, volume));
    if (bus === "sfx") runtimeState.sfxVolume = clamped;
    else runtimeState.musicVolume = clamped;
    audioEngine.setVolume(bus, clamped);
  }, [bus, volume]);
}
