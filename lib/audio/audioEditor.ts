/* ═══════════════ Moteur d'édition audio DSP (Studio Admin NJAMBO) ═══════════════
   Traitement 100 % PCM / WebAudio côté navigateur (zéro dépendance externe) :
   - Découpe précise (Trim) + détection automatique des silences début/fin.
   - Accélération / ralentissement (0.5× .. 2.0×) avec ou sans préservation
     de la hauteur (WSOLA overlap-add propre), et décalage de pitch (-12..+12 st).
   - Fondus d'entrée et de sortie cosinus (zéro clic), gain en dB, normalisation
     crête -1 dBFS, inversion (Reverse) et conversion mono optionnelle.
   - Calcul d'enveloppe waveform pour rendu Canvas haute précision et export WAV 16-bit. */

export interface AudioEditParams {
  trimStartSec: number;
  trimEndSec: number;
  /** Facteur de vitesse : 0.5 (2× plus lent) .. 2.0 (2× plus rapide). */
  speed: number;
  /** Si true, changer la vitesse ne change pas la hauteur (WSOLA). */
  preservePitch: boolean;
  /** Décalage de hauteur en demi-tons (-12 .. +12). */
  pitchSemitones: number;
  /** Gain relatif en dB (-18 .. +12). */
  gainDb: number;
  /** Normalise la crête maximale à -1.0 dBFS après traitement. */
  normalize: boolean;
  /** Fondu d'entrée en ms (0 .. 2000). */
  fadeInMs: number;
  /** Fondu de sortie en ms (0 .. 2000). */
  fadeOutMs: number;
  /** Inverse le sens de lecture de l'extrait découpé. */
  reverse: boolean;
  /** Réduit en mono (moyenne L+R). */
  mono: boolean;
}

export function createDefaultEditParams(durationSec: number): AudioEditParams {
  return {
    trimStartSec: 0,
    trimEndSec: Math.max(0.02, durationSec),
    speed: 1,
    preservePitch: false,
    pitchSemitones: 0,
    gainDb: 0,
    normalize: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    reverse: false,
    mono: false,
  };
}

export function isEditDefault(params: AudioEditParams, durationSec: number): boolean {
  return (
    params.trimStartSec <= 0.002 &&
    Math.abs(params.trimEndSec - durationSec) <= 0.005 &&
    Math.abs(params.speed - 1) < 0.001 &&
    Math.abs(params.pitchSemitones) < 0.01 &&
    Math.abs(params.gainDb) < 0.05 &&
    !params.normalize &&
    params.fadeInMs <= 0 &&
    params.fadeOutMs <= 0 &&
    !params.reverse &&
    !params.mono
  );
}

export function computeOutputDurationSec(params: AudioEditParams): number {
  const trimmed = Math.max(0.02, params.trimEndSec - params.trimStartSec);
  const speed = clamp(params.speed, 0.25, 4);
  return trimmed / speed;
}

function clamp(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
}

/** Extrait les canaux PCM d'un AudioBuffer. */
export function extractChannels(buffer: AudioBuffer): Float32Array[] {
  const out: Float32Array[] = [];
  const count = Math.min(2, Math.max(1, buffer.numberOfChannels));
  for (let c = 0; c < count; c += 1) {
    out.push(new Float32Array(buffer.getChannelData(c)));
  }
  return out;
}

/** Reconstruit un AudioBuffer depuis des tableaux PCM Float32. */
export function audioBufferFromPcm(
  ctx: BaseAudioContext,
  channels: Float32Array[],
  sampleRate: number,
): AudioBuffer {
  const numCh = Math.max(1, channels.length);
  const length = Math.max(1, channels[0]?.length ?? 1);
  const buffer = ctx.createBuffer(numCh, length, sampleRate);
  for (let c = 0; c < numCh; c += 1) {
    const src = channels[c]!;
    const dst = buffer.getChannelData(c);
    dst.set(src.subarray(0, length));
  }
  return buffer;
}

/** Calcule les crêtes absolues par tranche pour dessiner une forme d'onde nette sur Canvas. */
export function computeWaveformPeaks(channels: readonly Float32Array[], buckets: number): Float32Array {
  const count = Math.max(1, Math.floor(buckets));
  const peaks = new Float32Array(count);
  const len = channels[0]?.length ?? 0;
  if (len === 0) return peaks;

  const chCount = channels.length;
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor((i * len) / count);
    const end = Math.max(start + 1, Math.floor(((i + 1) * len) / count));
    let maxVal = 0;
    // Sous-échantillonnage adaptatif pour garder le calcul instantané sur les pistes longues (30 s+)
    const step = Math.max(1, Math.floor((end - start) / 64));
    for (let s = start; s < end; s += step) {
      for (let c = 0; c < chCount; c += 1) {
        const v = Math.abs(channels[c]![s] ?? 0);
        if (v > maxVal) maxVal = v;
      }
    }
    peaks[i] = Math.min(1, maxVal);
  }
  return peaks;
}

/** Détecte automatiquement les bornes utiles (supprime les silences début/fin typiques d'ElevenLabs). */
export function detectTrimBounds(
  channels: readonly Float32Array[],
  sampleRate: number,
  thresholdDb = -42,
  padStartMs = 3,
  padEndMs = 35,
): { startSec: number; endSec: number } {
  const len = channels[0]?.length ?? 0;
  if (len === 0 || sampleRate <= 0) return { startSec: 0, endSec: 0 };

  // Mesure le pic global afin d'adapter le seuil aux sons très doux
  let globalPeak = 0;
  for (let c = 0; c < channels.length; c += 1) {
    const ch = channels[c]!;
    for (let i = 0; i < len; i += 4) {
      const v = Math.abs(ch[i]!);
      if (v > globalPeak) globalPeak = v;
    }
  }
  if (globalPeak < 1e-5) return { startSec: 0, endSec: len / sampleRate };

  const relThreshold = globalPeak * 10 ** (thresholdDb / 20);
  const threshold = Math.max(0.002, relThreshold);

  let first = 0;
  outerFirst: for (let i = 0; i < len; i += 1) {
    for (let c = 0; c < channels.length; c += 1) {
      if (Math.abs(channels[c]![i]!) >= threshold) {
        first = i;
        break outerFirst;
      }
    }
  }

  let last = len - 1;
  outerLast: for (let i = len - 1; i >= first; i -= 1) {
    for (let c = 0; c < channels.length; c += 1) {
      if (Math.abs(channels[c]![i]!) >= threshold) {
        last = i;
        break outerLast;
      }
    }
  }

  const padStart = Math.round((padStartMs / 1000) * sampleRate);
  const padEnd = Math.round((padEndMs / 1000) * sampleRate);
  const startSample = Math.max(0, first - padStart);
  const endSample = Math.min(len, Math.max(startSample + Math.round(0.03 * sampleRate), last + padEnd));

  return {
    startSec: Math.round((startSample / sampleRate) * 1000) / 1000,
    endSec: Math.round((endSample / sampleRate) * 1000) / 1000,
  };
}

/** Rééchantillonnage propre par interpolation cubique (Hermite 4 points) : change vitesse + hauteur ensemble. */
export function resampleChannel(input: Float32Array, ratio: number): Float32Array {
  const safeRatio = clamp(ratio, 0.2, 5);
  if (Math.abs(safeRatio - 1) < 1e-5 || input.length < 4) return new Float32Array(input);
  const outLen = Math.max(16, Math.round(input.length / safeRatio));
  const out = new Float32Array(outLen);
  const lastIdx = input.length - 1;

  for (let i = 0; i < outLen; i += 1) {
    const pos = i * safeRatio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const y0 = input[Math.max(0, idx - 1)]!;
    const y1 = input[Math.min(lastIdx, idx)]!;
    const y2 = input[Math.min(lastIdx, idx + 1)]!;
    const y3 = input[Math.min(lastIdx, idx + 2)]!;
    // Interpolation cubique Catmull-Rom
    const a0 = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
    const a1 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
    const a2 = -0.5 * y0 + 0.5 * y2;
    const a3 = y1;
    out[i] = ((a0 * frac + a1) * frac + a2) * frac + a3;
  }
  return out;
}

/** Time-stretch WSOLA (Waveform Similarity Overlap-Add) : modifie la durée SANS modifier la hauteur.
 *  `rate > 1` accélère (raccourcit la durée), `rate < 1` ralentit (allonge la durée). */
export function timeStretchChannel(input: Float32Array, sampleRate: number, rate: number): Float32Array {
  const safeRate = clamp(rate, 0.35, 3);
  if (Math.abs(safeRate - 1) < 1e-4) return new Float32Array(input);

  const inLen = input.length;
  const winSize = Math.max(256, Math.min(2048, Math.round(sampleRate * 0.028)));
  if (inLen <= winSize * 2) {
    // Très court (< 60 ms) : un simple fondu/recadrage évite d'écraser le transitoire
    return resampleChannel(input, safeRate);
  }

  const outLen = Math.max(winSize, Math.round(inLen / safeRate));
  const synHop = Math.floor(winSize / 2);
  const searchRadius = Math.floor(winSize / 3);

  // Fenêtre de Hann (somme = 1 pour un chevauchement de 50 %)
  const win = new Float32Array(winSize);
  for (let i = 0; i < winSize; i += 1) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (winSize - 1)));
  }

  const out = new Float32Array(outLen);
  const norm = new Float32Array(outLen);

  // Copie la toute première fenêtre intacte (préserve l'attaque 0 ms)
  for (let i = 0; i < winSize && i < outLen && i < inLen; i += 1) {
    out[i] += input[i]! * win[i]!;
    norm[i] += win[i]!;
  }

  let prevInPos = 0;
  let outPos = synHop;

  while (outPos < outLen) {
    const nominalIn = Math.round(outPos * safeRate);
    if (nominalIn >= inLen - 1) break;

    // Position attendue en continuité naturelle de la fenêtre précédente
    const natPos = prevInPos + synHop;
    let bestOffset = 0;

    if (natPos + winSize < inLen) {
      let bestScore = -Infinity;
      const minDelta = Math.max(-searchRadius, -nominalIn);
      const maxDelta = Math.min(searchRadius, inLen - winSize - nominalIn);
      // Recherche de corrélation croisée par pas de 4 échantillons pour rester ultra-rapide
      for (let delta = minDelta; delta <= maxDelta; delta += 4) {
        const cand = nominalIn + delta;
        let dot = 0;
        let energy = 1e-9;
        for (let j = 0; j < synHop; j += 4) {
          const a = input[natPos + j]!;
          const b = input[cand + j]!;
          dot += a * b;
          energy += b * b;
        }
        const score = dot / Math.sqrt(energy);
        if (score > bestScore) {
          bestScore = score;
          bestOffset = delta;
        }
      }
    }

    const chosenIn = Math.max(0, Math.min(inLen - 1, nominalIn + bestOffset));
    const copyLen = Math.min(winSize, inLen - chosenIn, outLen - outPos);
    for (let i = 0; i < copyLen; i += 1) {
      const w = win[i]!;
      out[outPos + i] += input[chosenIn + i]! * w;
      norm[outPos + i] += w;
    }

    prevInPos = chosenIn;
    outPos += synHop;
  }

  for (let i = 0; i < outLen; i += 1) {
    if (norm[i]! > 1e-4) out[i] /= norm[i]!;
  }
  return out;
}

export interface ProcessedAudioResult {
  channels: Float32Array[];
  sampleRate: number;
  durationSec: number;
  peak: number;
}

/** Applique toute la chaîne d'édition (Trim → Reverse → Vitesse/Pitch → Mono → Fondus → Gain/Normalisation). */
export function processPcmChannels(
  inputChannels: readonly Float32Array[],
  sampleRate: number,
  params: AudioEditParams,
): ProcessedAudioResult {
  const srcLen = inputChannels[0]?.length ?? 0;
  if (srcLen === 0 || sampleRate <= 0) {
    return { channels: [new Float32Array(1)], sampleRate: sampleRate || 44100, durationSec: 0, peak: 0 };
  }

  const totalSec = srcLen / sampleRate;
  const startSec = clamp(params.trimStartSec, 0, Math.max(0, totalSec - 0.02));
  const endSec = clamp(params.trimEndSec, Math.min(totalSec, startSec + 0.02), totalSec);
  const startIdx = Math.floor(startSec * sampleRate);
  const endIdx = Math.max(startIdx + 16, Math.min(srcLen, Math.ceil(endSec * sampleRate)));

  const speed = clamp(params.speed, 0.5, 2.0);
  const pitchSemis = clamp(params.pitchSemitones, -12, 12);
  const pitchFactor = 2 ** (pitchSemis / 12);
  const pitchMult = params.preservePitch ? pitchFactor : speed * pitchFactor;
  const stretchRate = speed / pitchMult;

  // 1. Découpe + inversion + vitesse/pitch canal par canal
  let working: Float32Array[] = inputChannels.map((ch) => {
    let slice: Float32Array = ch.slice(startIdx, endIdx);
    if (params.reverse) slice.reverse();
    if (Math.abs(stretchRate - 1) > 0.002) {
      slice = timeStretchChannel(slice, sampleRate, stretchRate);
    }
    if (Math.abs(pitchMult - 1) > 0.001) {
      slice = resampleChannel(slice, pitchMult);
    }
    return slice;
  });

  // Harmonise les longueurs entre canaux
  const outLen = Math.min(...working.map((c) => c.length));
  working = working.map((c) => (c.length === outLen ? c : c.subarray(0, outLen)));

  // 2. Conversion mono optionnelle
  if (params.mono && working.length > 1) {
    const mono = new Float32Array(outLen);
    const inv = 1 / working.length;
    for (let i = 0; i < outLen; i += 1) {
      let sum = 0;
      for (let c = 0; c < working.length; c += 1) sum += working[c]![i]!;
      mono[i] = sum * inv;
    }
    working = [mono];
  }

  // 3. Fondus entrée / sortie (courbe cosinus douce anti-clic)
  const fadeInSamples = Math.min(Math.floor(outLen * 0.48), Math.round((clamp(params.fadeInMs, 0, 5000) / 1000) * sampleRate));
  const fadeOutSamples = Math.min(Math.floor(outLen * 0.48), Math.round((clamp(params.fadeOutMs, 0, 5000) / 1000) * sampleRate));

  if (fadeInSamples > 1) {
    for (let i = 0; i < fadeInSamples; i += 1) {
      const w = 0.5 * (1 - Math.cos((Math.PI * i) / fadeInSamples));
      for (let c = 0; c < working.length; c += 1) working[c]![i] *= w;
    }
  }
  if (fadeOutSamples > 1) {
    const offset = outLen - fadeOutSamples;
    for (let i = 0; i < fadeOutSamples; i += 1) {
      const w = 0.5 * (1 + Math.cos((Math.PI * i) / fadeOutSamples));
      for (let c = 0; c < working.length; c += 1) working[c]![offset + i] *= w;
    }
  }

  // 4. Gain + normalisation crête optionnelle + limiteur doux anti-écrêtage
  const userGain = 10 ** (clamp(params.gainDb, -24, 18) / 20);
  let rawPeak = 0;
  for (let c = 0; c < working.length; c += 1) {
    const ch = working[c]!;
    for (let i = 0; i < outLen; i += 1) {
      const v = Math.abs(ch[i]!);
      if (v > rawPeak) rawPeak = v;
    }
  }

  let totalGain = userGain;
  if (params.normalize && rawPeak > 1e-5) {
    const targetPeak = 10 ** (-1.0 / 20); // -1.0 dBFS
    totalGain = (targetPeak / rawPeak) * userGain;
  }

  let finalPeak = 0;
  for (let c = 0; c < working.length; c += 1) {
    const ch = working[c]!;
    for (let i = 0; i < outLen; i += 1) {
      let s = ch[i]! * totalGain;
      if (Math.abs(s) > 0.96) {
        // Saturation analogique douce au-dessus de -0.35 dB
        s = Math.tanh(s * 1.04) / Math.tanh(1.04);
      }
      s = Math.max(-0.99, Math.min(0.99, s));
      ch[i] = s;
      const a = Math.abs(s);
      if (a > finalPeak) finalPeak = a;
    }
  }

  return {
    channels: working,
    sampleRate,
    durationSec: outLen / sampleRate,
    peak: finalPeak,
  };
}

/** Encode des canaux Float32 (-1..+1) en fichier RIFF WAV PCM 16 bits signé. */
export function encodeWav16(channels: readonly Float32Array[], sampleRate: number): Uint8Array {
  const numChannels = Math.max(1, Math.min(2, channels.length));
  const numFrames = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataBytes = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i += 1) {
    for (let c = 0; c < numChannels; c += 1) {
      const s = Math.max(-1, Math.min(1, channels[c]![i] ?? 0));
      view.setInt16(offset, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}

/** Charge et décode un fichier local (File/Blob) ou une URL distante/locale en AudioBuffer. */
export async function decodeAudioSource(
  source: File | Blob | string,
  ctx: AudioContext,
): Promise<{ buffer: AudioBuffer; name: string }> {
  let bytes: ArrayBuffer;
  let name: string;

  if (typeof source === "string") {
    const isLocal = source.startsWith("/");
    const res = await fetch(source, isLocal ? { credentials: "same-origin" } : { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error(`Impossible de charger l'audio (HTTP ${res.status}).`);
    bytes = await res.arrayBuffer();
    name = decodeURIComponent(source.split("/").pop() ?? "audio.mp3").split("?")[0]!;
  } else {
    bytes = await source.arrayBuffer();
    name = source instanceof File && source.name ? source.name : "audio.wav";
  }

  const buffer = await ctx.decodeAudioData(bytes.slice(0));
  return { buffer, name };
}

/** Formate un temps court en millisecondes ou secondes lisibles (ex. `0.42 s`, `125 ms`, `1:04.2`). */
export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0.00 s";
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds - mins * 60;
  return `${mins}:${rem.toFixed(1).padStart(4, "0")}`;
}
