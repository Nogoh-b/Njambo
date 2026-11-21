/* Horloge de lecture de l'atelier : temps courant, lecture / pause, vitesse,
   boucle. Un petit magasin externe (useSyncExternalStore) : seuls les
   composants qui affichent le temps se redessinent à chaque image. */

import { useSyncExternalStore } from "react";

export interface MotifClock {
  subscribe(listener: () => void): () => void;
  time(): number;
  state(): { playing: boolean; speed: number; loop: boolean; total: number };
  setTotal(totalMs: number): void;
  toggle(): void;
  play(fromStart?: boolean): void;
  pause(): void;
  seek(ms: number): void;
  setSpeed(speed: number): void;
  setLoop(loop: boolean): void;
  dispose(): void;
}

const HOLD_MS = 700;

export function createMotifClock(): MotifClock {
  let t = 0, playing = true, speed = 1, loop = true, total = 1000, last = 0, frame = 0;
  let snapshot = { playing, speed, loop, total };
  const listeners = new Set<() => void>();
  const emit = () => { snapshot = { playing, speed, loop, total }; listeners.forEach((listener) => listener()); };
  const tick = (now: number) => {
    const dt = last ? Math.min(64, now - last) : 0;
    last = now;
    if (playing) {
      t += dt * speed;
      if (t > total + HOLD_MS) {
        if (loop) t = 0;
        else { t = total; playing = false; }
      }
      emit();
    }
    frame = requestAnimationFrame(tick);
  };
  if (typeof window !== "undefined") frame = requestAnimationFrame(tick);
  return {
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    time: () => Math.min(t, total),
    state: () => snapshot,
    setTotal: (totalMs) => { total = Math.max(1, totalMs); if (t > total + HOLD_MS) t = 0; emit(); },
    toggle: () => { if (!playing && t >= total) t = 0; playing = !playing; emit(); },
    play: (fromStart = false) => { if (fromStart) t = 0; playing = true; emit(); },
    pause: () => { playing = false; emit(); },
    seek: (ms) => { t = Math.max(0, Math.min(total, ms)); playing = false; emit(); },
    setSpeed: (next) => { speed = next; emit(); },
    setLoop: (next) => { loop = next; emit(); },
    dispose: () => cancelAnimationFrame(frame),
  };
}

export function useClockTime(clock: MotifClock): number {
  return useSyncExternalStore(clock.subscribe, clock.time, () => 0);
}

export function useClockState(clock: MotifClock) {
  return useSyncExternalStore(clock.subscribe, clock.state, clock.state);
}
