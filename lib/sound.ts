/* ═══════════════ FILE: lib/sound.js ═══════════════ */
export interface SoundApi {
  card: () => void;
  deal: () => void;
  roundStart: () => void;
  dealSweep: () => void;
  turnStart: () => void;
  dominance: () => void;
  tick: () => void;
  win: () => void;
  lose: () => void;
  startMusic: () => void;
  stopMusic: () => void;
}

export function createSound(): SoundApi {
  let ctx: AudioContext | null = null;
  let musicTimer: ReturnType<typeof setInterval> | null = null;

  const ensure = (): AudioContext => {
    if (!ctx) {
      const AC: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  };

  const tone = (freq: number, dur = 0.12, type: OscillatorType = "sine", gain = 0.08) => {
    try {
      const c = ensure();
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(gain, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g).connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur);
    } catch {
      /* noop */
    }
  };

  const PENTA = [261.6, 293.7, 329.6, 392.0, 440.0, 523.2];
  const sequence = (
    notes: Array<{ f: number; delay: number; dur?: number; type?: OscillatorType; gain?: number }>,
  ) => {
    notes.forEach((n) => {
      setTimeout(() => tone(n.f, n.dur ?? 0.12, n.type ?? "sine", n.gain ?? 0.06), n.delay);
    });
  };

  return {
    card: () => tone(180, 0.1, "triangle", 0.1),
    deal: () => tone(330, 0.05, "square", 0.035),
    roundStart: () =>
      sequence([
        { f: 196, delay: 0, dur: 0.18, type: "triangle", gain: 0.055 },
        { f: 261.6, delay: 90, dur: 0.2, type: "sine", gain: 0.055 },
        { f: 392, delay: 210, dur: 0.28, type: "triangle", gain: 0.065 },
      ]),
    dealSweep: () =>
      sequence([
        { f: 330, delay: 0, dur: 0.06, type: "square", gain: 0.03 },
        { f: 392, delay: 70, dur: 0.06, type: "square", gain: 0.03 },
        { f: 523.2, delay: 140, dur: 0.08, type: "triangle", gain: 0.04 },
      ]),
    turnStart: () =>
      sequence([
        { f: 659, delay: 0, dur: 0.06, type: "sine", gain: 0.035 },
        { f: 880, delay: 80, dur: 0.08, type: "triangle", gain: 0.035 },
      ]),
    dominance: () =>
      sequence([
        { f: 220, delay: 0, dur: 0.1, type: "triangle", gain: 0.045 },
        { f: 440, delay: 95, dur: 0.14, type: "triangle", gain: 0.055 },
        { f: 660, delay: 180, dur: 0.16, type: "sine", gain: 0.045 },
      ]),
    tick: () => tone(880, 0.05, "sine", 0.05),
    win: () =>
      [523, 659, 784, 1046].forEach((f, i) =>
        setTimeout(() => tone(f, 0.22, "triangle", 0.09), i * 110)
      ),
    lose: () =>
      [300, 240, 180].forEach((f, i) =>
        setTimeout(() => tone(f, 0.25, "sawtooth", 0.05), i * 140)
      ),
    startMusic() {
      if (musicTimer) return;
      musicTimer = setInterval(
        () => tone(PENTA[Math.floor(Math.random() * PENTA.length)], 0.6, "sine", 0.025),
        700
      );
    },
    stopMusic() {
      if (musicTimer) clearInterval(musicTimer);
      musicTimer = null;
    },
  };
}
