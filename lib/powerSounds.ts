/* ═══════════════ Sons des cartes pouvoir ═══════════════
   Référence de son : « preset:<nom> » (synthèse, aucun fichier) ou URL
   d'un fichier uploadé depuis l'admin (MP3 sur le VPS). Partagé par
   l'orchestrateur (son d'activation), les chorégraphies (pistes son),
   l'admin (écoute) et le chargeur d'assets (préchargement). */

import { playAudioSample, playChimeNow, preloadAudioSample, type ChimeSpec } from "./gxe/react";

const n = (frequencyHz: number, durationMs: number, type: OscillatorType, gain: number, delayMs = 0) => ({ frequencyHz, durationMs, type, gain, delayMs });

export const POWER_SOUND_PRESETS: Record<string, { label: string; spec: ChimeSpec }> = {
  pouvoir: { label: "Pouvoir (son par défaut)", spec: { notes: [n(523, 120, "triangle", 0.07), n(659, 120, "triangle", 0.07, 90), n(784, 220, "triangle", 0.08, 180)] } },
  tambour: { label: "Tambour", spec: { notes: [n(90, 140, "sine", 0.22), n(70, 160, "sine", 0.2, 160), n(110, 120, "sine", 0.18, 300)] } },
  eclair: { label: "Éclair", spec: { notes: [n(1400, 60, "sawtooth", 0.05), n(220, 300, "square", 0.06, 50), n(110, 400, "sawtooth", 0.05, 120)] } },
  vent: { label: "Vent", spec: { notes: [n(300, 500, "sine", 0.04), n(420, 500, "sine", 0.03, 150), n(360, 600, "sine", 0.03, 320)] } },
  givre: { label: "Givre", spec: { notes: [n(1760, 90, "sine", 0.05), n(2093, 90, "sine", 0.05, 70), n(2637, 160, "sine", 0.05, 140), n(3136, 260, "sine", 0.04, 220)] } },
  gong: { label: "Gong", spec: { notes: [n(196, 900, "sine", 0.12), n(392, 700, "sine", 0.05, 10), n(588, 500, "sine", 0.03, 20)] } },
  pieces: { label: "Pièces", spec: { notes: [n(1318, 70, "square", 0.04), n(1568, 70, "square", 0.04, 80), n(2093, 120, "square", 0.04, 160)] } },
  magie: { label: "Magie", spec: { notes: [n(659, 150, "sine", 0.06), n(880, 150, "sine", 0.06, 100), n(1175, 150, "sine", 0.06, 200), n(1568, 300, "sine", 0.06, 300)] } },
  alarme: { label: "Alarme", spec: { notes: [n(880, 120, "square", 0.05), n(660, 120, "square", 0.05, 150), n(880, 120, "square", 0.05, 300), n(660, 120, "square", 0.05, 450)] } },
  sceau: { label: "Sceau", spec: { notes: [n(150, 80, "square", 0.12), n(100, 220, "triangle", 0.12, 60)] } },
  souffle: { label: "Souffle du temps", spec: { notes: [n(523, 400, "sine", 0.05), n(392, 400, "sine", 0.05, 200), n(262, 600, "sine", 0.05, 400)] } },
};

export const isPresetSound = (ref: string) => ref.startsWith("preset:");

export function playPowerSound(ref: string | null | undefined, volume = 1) {
  if (!ref) return;
  if (isPresetSound(ref)) {
    const preset = POWER_SOUND_PRESETS[ref.slice("preset:".length)];
    if (preset) playChimeNow(preset.spec, volume);
    return;
  }
  playAudioSample(ref, volume);
}

/** Préchargement (chargeur d'assets) : rien à faire pour un son de synthèse. */
export function preloadPowerSound(ref: string | null | undefined): Promise<boolean> {
  if (!ref || isPresetSound(ref)) return Promise.resolve(true);
  return preloadAudioSample(ref);
}
