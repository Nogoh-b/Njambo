import { describe, expect, it } from "vitest";
import {
  computeWaveformPeaks,
  createDefaultEditParams,
  detectTrimBounds,
  encodeWav16,
  processPcmChannels,
} from "../lib/audio/audioEditor";
import { createZip, readZip } from "../lib/audio/audioZip";
import {
  exportAudioPackZip,
  importAudioPackZip,
  inspectAudioPackZip,
} from "../lib/audio/audioPack";
import { CODE_POWER_MODULES } from "../config/powers";
import type { AudioCatalogConfig } from "../domain/audioCatalog";

function makeSine(freqHz: number, durationSec: number, sampleRate = 44100, amp = 0.5): Float32Array {
  const n = Math.round(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  }
  return out;
}

describe("moteur DSP Audio Studio (audioEditor)", () => {
  it("détecte et supprime automatiquement les silences en début et fin de piste", () => {
    const sr = 44100;
    const total = sr * 2; // 2 s : silence 0..0.4s, son 0.4..1.2s, silence 1.2..2.0s
    const ch = new Float32Array(total);
    for (let i = Math.round(0.4 * sr); i < Math.round(1.2 * sr); i += 1) {
      ch[i] = 0.6 * Math.sin((2 * Math.PI * 440 * i) / sr);
    }
    const bounds = detectTrimBounds([ch], sr);
    expect(bounds.startSec).toBeGreaterThanOrEqual(0.38);
    expect(bounds.startSec).toBeLessThanOrEqual(0.41);
    expect(bounds.endSec).toBeGreaterThanOrEqual(1.2);
    expect(bounds.endSec).toBeLessThanOrEqual(1.26);
  });

  it("applique découpe, vitesse (avec et sans préservation de pitch), fondus, normalisation, mono et WAV 16-bit", () => {
    const sr = 44100;
    const left = makeSine(440, 1.0, sr, 0.25);
    const right = makeSine(660, 1.0, sr, 0.25);

    // 1. Vitesse 2x classique (durée divisée par 2)
    const fast = processPcmChannels([left, right], sr, {
      ...createDefaultEditParams(1.0),
      trimStartSec: 0.1,
      trimEndSec: 0.9,
      speed: 2.0,
      preservePitch: false,
    });
    expect(fast.channels.length).toBe(2);
    expect(fast.durationSec).toBeCloseTo(0.4, 2);

    // 2. Ralentissement 0.5x avec préservation de hauteur (WSOLA) + normalisation + mono + fondus + reverse
    const slow = processPcmChannels([left, right], sr, {
      ...createDefaultEditParams(1.0),
      trimStartSec: 0.2,
      trimEndSec: 0.7,
      speed: 0.5,
      preservePitch: true,
      normalize: true,
      fadeInMs: 30,
      fadeOutMs: 40,
      reverse: true,
      mono: true,
    });
    expect(slow.channels.length).toBe(1);
    expect(slow.durationSec).toBeCloseTo(1.0, 1);
    expect(slow.peak).toBeGreaterThan(0.75);
    expect(slow.peak).toBeLessThanOrEqual(0.99);
    // Début et fin atténués par les fondus
    expect(Math.abs(slow.channels[0]![0]!)).toBeLessThan(0.01);
    expect(Math.abs(slow.channels[0]![slow.channels[0]!.length - 1]!)).toBeLessThan(0.02);

    // 3. Encodage WAV 16-bit valide
    const wav = encodeWav16(slow.channels, sr);
    expect(Buffer.from(wav.subarray(0, 4)).toString("ascii")).toBe("RIFF");
    expect(Buffer.from(wav.subarray(8, 12)).toString("ascii")).toBe("WAVE");
    expect(wav.length).toBe(44 + slow.channels[0]!.length * 2);

    // 4. Forme d'onde
    const peaks = computeWaveformPeaks(slow.channels, 64);
    expect(peaks.length).toBe(64);
    expect(Math.max(...peaks)).toBeGreaterThan(0.5);
  });
});

describe("codec ZIP minimaliste (audioZip)", () => {
  it("écrit et relit des fichiers binaires et UTF-8 avec vérification CRC-32", async () => {
    const payload = new Uint8Array([0, 1, 2, 3, 42, 128, 255, 7, 9]);
    const jsonBytes = new TextEncoder().encode(JSON.stringify({ nom: "Éclair du Mfoundi", ok: true }));
    const archive = createZip([
      { name: "manifest.json", data: jsonBytes },
      { name: "audio/éclair-test.mp3", data: payload },
    ]);

    const files = await readZip(archive);
    expect(files.size).toBe(2);
    expect(Array.from(files.get("audio/éclair-test.mp3")!)).toEqual(Array.from(payload));
    expect(JSON.parse(new TextDecoder().decode(files.get("manifest.json")!))).toEqual({
      nom: "Éclair du Mfoundi",
      ok: true,
    });
  });

  it("rejette une archive corrompue", async () => {
    await expect(readZip(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/invalide/i);
  });
});

describe("export / import de pack audio complet (audioPack)", () => {
  it("déduplique les sons partagés, embarque catalogue + cartes pouvoir et réimporte proprement", async () => {
    const sharedBytes = new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const musicBytes = new Uint8Array([0x49, 0x44, 0x33, 99, 98, 97, 96, 95, 94, 93, 92, 91]);
    const powerBytes = new Uint8Array([0x49, 0x44, 0x33, 55, 56, 57, 58, 59, 60, 61, 62, 63]);

    const fakeFetch = async (url: string) => {
      if (url.includes("music")) return { bytes: musicBytes, ext: "mp3" };
      if (url.includes("feu")) return { bytes: powerBytes, ext: "mp3" };
      return { bytes: sharedBytes, ext: "mp3" };
    };

    const catalog: AudioCatalogConfig = {
      slots: {
        music_table: { url: "https://api.example/uploads/audio/music-table.mp3", volume: 0.65 },
        ui_button: { url: "https://api.example/uploads/audio/click.mp3", volume: 0.7 },
        ui_tab: { url: "https://api.example/uploads/audio/click.mp3", volume: 0.5 }, // même fichier partagé
        ui_error: { enabled: false },
      },
    };

    const feuCamp = {
      def: { ...CODE_POWER_MODULES.feu_camp.def, sound: { ref: "https://api.example/uploads/audio/feu.mp3", volume: 0.9 } },
      script: CODE_POWER_MODULES.feu_camp.script,
    };

    const exported = await exportAudioPackZip({
      catalog,
      powerCards: [feuCamp],
      includeDefaults: false,
      includePowerCards: true,
      fetchAudio: fakeFetch,
    });

    // 3 fichiers uniques malgré 4 références (ui_button et ui_tab partagent click.mp3)
    expect(exported.fileCount).toBe(3);
    expect(exported.warnings).toEqual([]);

    const inspection = await inspectAudioPackZip(exported.zipBytes);
    expect(inspection.slotIds.sort()).toEqual(["music_table", "ui_button", "ui_error", "ui_tab"]);
    expect(inspection.powerCardIds).toEqual(["feu_camp"]);
    expect(inspection.audioFiles.length).toBe(3);

    // Réimport simulé
    const uploadedRoles: Array<{ name: string; role: "sfx" | "music" }> = [];
    let counter = 0;
    const imported = await importAudioPackZip({
      inspection,
      currentCatalog: { slots: { card_play: { url: "https://old.example/card.mp3" } } },
      mode: "merge",
      importPowerCards: true,
      uploadAudio: async (file, role) => {
        uploadedRoles.push({ name: file.name, role });
        counter += 1;
        return { url: `https://new.example/uploads/audio/u${counter}.mp3` };
      },
    });

    expect(imported.uploadedCount).toBe(3);
    expect(uploadedRoles.some((u) => u.role === "music")).toBe(true);
    // En mode merge, card_play existant est conservé, ui_button et ui_tab pointent vers la même nouvelle URL
    expect(imported.nextCatalog.slots.card_play?.url).toBe("https://old.example/card.mp3");
    expect(imported.nextCatalog.slots.ui_button?.url).toBe(imported.nextCatalog.slots.ui_tab?.url);
    expect(imported.nextCatalog.slots.ui_error?.enabled).toBe(false);
    expect(imported.powerCardPatches.length).toBe(1);
    expect(imported.powerCardPatches[0]!.cardId).toBe("feu_camp");
    expect(imported.powerCardPatches[0]!.sound?.volume).toBe(0.9);
  });
});
