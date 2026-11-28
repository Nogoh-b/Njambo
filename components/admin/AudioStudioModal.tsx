"use client";

/* ═══════════════ Studio d'édition audio visuel (Admin NJAMBO) ═══════════════
   Permet d'importer un son (sélection, glisser-déposer, Ctrl+V) ou d'ouvrir le
   son actif d'un emplacement, de visualiser sa forme d'onde interactive, de
   découper (poignées + auto-trim silences), d'accélérer/ralentir (avec ou sans
   changement de pitch), d'ajuster hauteur, fondus, gain, normalisation, reverse,
   puis de pré-écouter (résultat / original / boucle) avant d'envoyer au serveur. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioEngine } from "@/lib/audio/AudioEngine";
import {
  audioBufferFromPcm,
  computeOutputDurationSec,
  computeWaveformPeaks,
  createDefaultEditParams,
  decodeAudioSource,
  detectTrimBounds,
  encodeWav16,
  extractChannels,
  formatAudioTime,
  isEditDefault,
  processPcmChannels,
  type AudioEditParams,
} from "@/lib/audio/audioEditor";
import styles from "./AdminConsole.module.css";
import studioStyles from "./AudioStudio.module.css";

export interface AudioStudioApplyPayload {
  file: File;
  edited: boolean;
  rawGain: boolean;
  label: string;
}

export interface AudioStudioModalProps {
  title: string;
  subtitle?: string;
  role: "sfx" | "music";
  initialSource: File | string | null;
  onApply: (payload: AudioStudioApplyPayload) => Promise<void>;
  onClose: () => void;
}

type DragMode = "none" | "start" | "end" | "scrub";

const SPEED_PRESETS = [0.65, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75];

function isAudioFile(file: File): boolean {
  return (
    file.type.startsWith("audio/") ||
    /\.(wav|mp3|ogg|m4a|aac)$/i.test(file.name)
  );
}

export function AudioStudioModal({
  title,
  subtitle,
  role,
  initialSource,
  onApply,
  onClose,
}: AudioStudioModalProps) {
  const [sourceName, setSourceName] = useState<string>("");
  const [sourceFile, setSourceFile] = useState<File | null>(initialSource instanceof File ? initialSource : null);
  const [channels, setChannels] = useState<Float32Array[] | null>(null);
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [params, setParams] = useState<AudioEditParams>(() => createDefaultEditParams(1));

  const [zoom, setZoom] = useState<number>(1);
  const [loopPlay, setLoopPlay] = useState<boolean>(role === "music");
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [playingMode, setPlayingMode] = useState<"none" | "edited" | "original">("none");
  const [playProgress, setPlayProgress] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const dragModeRef = useRef<DragMode>("none");

  const stopPlayback = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.onended = null;
        activeSourceRef.current.stop();
        activeSourceRef.current.disconnect();
      } catch {
        // Déjà arrêté
      }
      activeSourceRef.current = null;
    }
    setPlayingMode("none");
    setPlayProgress(0);
  }, []);

  const loadSource = useCallback(async (src: File | string) => {
    stopPlayback();
    setLoading(true);
    setError(null);
    try {
      const ctx = audioEngine.ensureContext();
      if (!ctx) throw new Error("Moteur WebAudio indisponible dans ce navigateur.");
      const { buffer, name } = await decodeAudioSource(src, ctx);
      const ch = extractChannels(buffer);
      setChannels(ch);
      setSampleRate(buffer.sampleRate);
      setDurationSec(buffer.duration);
      setSourceName(name);
      setSourceFile(src instanceof File ? src : null);
      setParams(createDefaultEditParams(buffer.duration));
      setZoom(1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de lire ce fichier audio.");
    } finally {
      setLoading(false);
    }
  }, [stopPlayback]);

  useEffect(() => {
    if (initialSource) void loadSource(initialSource);
    return () => stopPlayback();
  }, [initialSource, loadSource, stopPlayback]);

  // Ctrl+V dans la modale pour coller un fichier audio depuis l'Explorateur
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = event.clipboardData?.files;
      if (!files || files.length === 0) return;
      const audio = Array.from(files).find(isAudioFile);
      if (audio) {
        event.preventDefault();
        void loadSource(audio);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        stopPlayback();
        onClose();
      }
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [loadSource, onClose, stopPlayback]);

  const peaks = useMemo(() => {
    if (!channels) return null;
    const buckets = Math.max(240, Math.min(2400, Math.round(480 * zoom)));
    return computeWaveformPeaks(channels, buckets);
  }, [channels, zoom]);

  const outputDurationSec = useMemo(() => computeOutputDurationSec(params), [params]);
  const edited = useMemo(() => (durationSec > 0 ? !isEditDefault(params, durationSec) : false), [params, durationSec]);
  const sfxTooLong = role === "sfx" && outputDurationSec > 5.02;

  // Rendu de la forme d'onde interactive sur Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || durationSec <= 0) return;
    const baseWidth = 780;
    const cssWidth = Math.round(baseWidth * zoom);
    const cssHeight = 152;
    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;

    canvas.style.width = `${cssWidth}px`;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const rulerH = 20;
    const waveTop = rulerH;
    const waveH = cssHeight - rulerH;
    const midY = waveTop + waveH / 2;

    // Règle temporelle en haut
    ctx.fillStyle = "#130d09";
    ctx.fillRect(0, 0, cssWidth, rulerH);
    ctx.strokeStyle = "#2d2115";
    ctx.beginPath();
    ctx.moveTo(0, rulerH);
    ctx.lineTo(cssWidth, rulerH);
    ctx.stroke();

    const targetTicks = Math.max(6, Math.round(cssWidth / 90));
    const rawStep = durationSec / targetTicks;
    const niceSteps = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10];
    const step = niceSteps.find((s) => s >= rawStep) ?? 10;
    ctx.fillStyle = "#9b8562";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    for (let t = 0; t <= durationSec + 0.0001; t += step) {
      const x = (t / durationSec) * cssWidth;
      ctx.strokeStyle = "rgba(201, 180, 143, 0.14)";
      ctx.beginPath();
      ctx.moveTo(x, rulerH);
      ctx.lineTo(x, cssHeight);
      ctx.stroke();
      if (x < cssWidth - 24) {
        ctx.fillText(t < 1 ? `${Math.round(t * 1000)}ms` : `${t.toFixed(step < 1 ? 1 : 0)}s`, x + 3, rulerH / 2);
      }
    }

    const startX = (params.trimStartSec / durationSec) * cssWidth;
    const endX = (params.trimEndSec / durationSec) * cssWidth;

    // Zone sélectionnée surlignée
    ctx.fillStyle = "rgba(242, 187, 69, 0.09)";
    ctx.fillRect(startX, waveTop, Math.max(1, endX - startX), waveH);

    // Ligne zéro
    ctx.strokeStyle = "rgba(201, 180, 143, 0.18)";
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(cssWidth, midY);
    ctx.stroke();

    // Barres de la forme d'onde
    const barW = cssWidth / peaks.length;
    const gainVisual = params.normalize ? 1 : Math.min(2.2, 10 ** (params.gainDb / 20));
    for (let i = 0; i < peaks.length; i += 1) {
      const x = i * barW;
      const inSelection = x + barW >= startX && x <= endX;
      const amp = Math.min(1, peaks[i]! * (inSelection ? gainVisual : 1));
      const h = Math.max(2, amp * (waveH - 14));
      ctx.fillStyle = inSelection ? "#f2bb45" : "rgba(143, 122, 88, 0.35)";
      ctx.fillRect(x, midY - h / 2, Math.max(1, barW - 0.5), h);
    }

    // Zones coupées (voile sombre)
    ctx.fillStyle = "rgba(5, 4, 3, 0.56)";
    if (startX > 0) ctx.fillRect(0, waveTop, startX, waveH);
    if (endX < cssWidth) ctx.fillRect(endX, waveTop, cssWidth - endX, waveH);

    // Enveloppes de fondu visuelles (fade-in / fade-out)
    const trimmedDur = Math.max(0.01, params.trimEndSec - params.trimStartSec);
    if (params.fadeInMs > 0) {
      const fadeW = Math.min(endX - startX, ((params.fadeInMs / 1000) * params.speed / durationSec) * cssWidth);
      ctx.strokeStyle = "#6fd39a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, waveTop + waveH - 2);
      ctx.lineTo(startX + fadeW, waveTop + 4);
      ctx.stroke();
    }
    if (params.fadeOutMs > 0) {
      const fadeW = Math.min(endX - startX, ((params.fadeOutMs / 1000) * params.speed / durationSec) * cssWidth);
      ctx.strokeStyle = "#6fd39a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(endX - fadeW, waveTop + 4);
      ctx.lineTo(endX, waveTop + waveH - 2);
      ctx.stroke();
    }

    // Poignées Début / Fin
    const drawHandle = (x: number, align: "left" | "right") => {
      ctx.strokeStyle = "#ffd76a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, waveTop);
      ctx.lineTo(x, cssHeight);
      ctx.stroke();
      ctx.fillStyle = "#f2bb45";
      const tabW = 10;
      const tabX = align === "left" ? x : x - tabW;
      ctx.fillRect(tabX, waveTop, tabW, 18);
      ctx.fillStyle = "#241405";
      ctx.font = "bold 10px system-ui, sans-serif";
      ctx.fillText(align === "left" ? "▸" : "◂", tabX + 2, waveTop + 9);
    };
    drawHandle(startX, "left");
    drawHandle(endX, "right");

    // Curseur de lecture animé
    if (playingMode !== "none") {
      const playSec =
        playingMode === "original"
          ? playProgress * durationSec
          : params.reverse
            ? params.trimEndSec - playProgress * trimmedDur
            : params.trimStartSec + playProgress * trimmedDur;
      const playX = (playSec / durationSec) * cssWidth;
      ctx.strokeStyle = "#7ab8ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, cssHeight);
      ctx.stroke();
    }
  }, [peaks, durationSec, zoom, params, playingMode, playProgress]);

  // Gestion interactive des poignées de découpe sur le Canvas
  const timeFromPointer = (event: React.PointerEvent<HTMLCanvasElement>): number => {
    const canvas = canvasRef.current;
    if (!canvas || durationSec <= 0) return 0;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    return ratio * durationSec;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!channels || durationSec <= 0) return;
    const t = timeFromPointer(event);
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const pxPerSec = rect ? rect.width / durationSec : 100;
    const distStartPx = Math.abs((t - params.trimStartSec) * pxPerSec);
    const distEndPx = Math.abs((t - params.trimEndSec) * pxPerSec);

    if (distStartPx <= 16 && distStartPx <= distEndPx) {
      dragModeRef.current = "start";
    } else if (distEndPx <= 16) {
      dragModeRef.current = "end";
    } else if (Math.abs(t - params.trimStartSec) < Math.abs(t - params.trimEndSec)) {
      dragModeRef.current = "start";
      setParams((prev) => ({
        ...prev,
        trimStartSec: Math.min(t, prev.trimEndSec - 0.02),
      }));
    } else {
      dragModeRef.current = "end";
      setParams((prev) => ({
        ...prev,
        trimEndSec: Math.max(t, prev.trimStartSec + 0.02),
      }));
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragModeRef.current === "none" || durationSec <= 0) return;
    const t = timeFromPointer(event);
    if (dragModeRef.current === "start") {
      setParams((prev) => ({
        ...prev,
        trimStartSec: Math.round(Math.max(0, Math.min(t, prev.trimEndSec - 0.02)) * 1000) / 1000,
      }));
    } else if (dragModeRef.current === "end") {
      setParams((prev) => ({
        ...prev,
        trimEndSec: Math.round(Math.min(durationSec, Math.max(t, prev.trimStartSec + 0.02)) * 1000) / 1000,
      }));
    }
  };

  const handlePointerUp = () => {
    dragModeRef.current = "none";
  };

  // Pré-écoute instantanée (résultat modifié OU original A/B)
  const playPreview = useCallback((mode: "edited" | "original") => {
    if (!channels) return;
    stopPlayback();

    const out = audioEngine.getSfxOutput();
    if (!out) return;
    audioEngine.setMuted("sfx", false);
    const { ctx, bus } = out;

    const audioBuffer =
      mode === "original"
        ? audioBufferFromPcm(ctx, channels, sampleRate)
        : (() => {
            const processed = processPcmChannels(channels, sampleRate, params);
            return audioBufferFromPcm(ctx, processed.channels, processed.sampleRate);
          })();

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.loop = loopPlay;
    src.connect(bus);

    const startedAt = ctx.currentTime;
    const playDur = Math.max(0.02, audioBuffer.duration);
    activeSourceRef.current = src;
    setPlayingMode(mode);

    src.onended = () => {
      if (activeSourceRef.current === src) {
        stopPlayback();
      }
    };

    const tick = () => {
      if (activeSourceRef.current !== src) return;
      const elapsed = ctx.currentTime - startedAt;
      const prog = loopPlay ? (elapsed % playDur) / playDur : Math.min(1, elapsed / playDur);
      setPlayProgress(prog);
      if (loopPlay || elapsed < playDur) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    src.start(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [channels, loopPlay, params, sampleRate, stopPlayback]);

  const handleAutoTrim = () => {
    if (!channels) return;
    const bounds = detectTrimBounds(channels, sampleRate);
    setParams((prev) => ({
      ...prev,
      trimStartSec: bounds.startSec,
      trimEndSec: bounds.endSec,
    }));
  };

  const buildRenderedWavFile = (): File => {
    if (!channels) throw new Error("Aucun audio chargé.");
    const processed = processPcmChannels(channels, sampleRate, params);
    const wavBytes = encodeWav16(processed.channels, processed.sampleRate);
    const copy = new Uint8Array(wavBytes.length);
    copy.set(wavBytes);
    const baseName = (sourceName || "audio").replace(/\.\w+$/, "");
    return new File([copy], `${baseName}-edite.wav`, { type: "audio/wav" });
  };

  const handleDownloadLocal = () => {
    try {
      const file = buildRenderedWavFile();
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export impossible.");
    }
  };

  const handleApply = async () => {
    if (!channels) return;
    stopPlayback();
    setSaving(true);
    setError(null);
    try {
      let fileToSend: File;
      if (!edited && sourceFile) {
        // Aucune retouche : on garde le fichier d'origine intact
        fileToSend = sourceFile;
      } else {
        fileToSend = buildRenderedWavFile();
      }
      const rawGain = edited && (Math.abs(params.gainDb) > 0.1 || params.normalize);
      await onApply({
        file: fileToSend,
        edited,
        rawGain,
        label: sourceName || fileToSend.name,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d'envoyer l'audio.");
      setSaving(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = Array.from(event.dataTransfer.files).find(isAudioFile);
    if (file) void loadSource(file);
  };

  return (
    <div className={studioStyles.backdrop} role="dialog" aria-modal="true" aria-label={`Studio audio — ${title}`}>
      <div
        className={studioStyles.modal}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className={studioStyles.head}>
          <div>
            <h2>Studio audio — {title}</h2>
            <p className={studioStyles.subtitle}>
              {subtitle ?? (role === "music" ? "Piste musicale en boucle (stéréo)" : "Effet sonore court (5 s max recommandé)")}
            </p>
          </div>
          <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => { stopPlayback(); onClose(); }}>
            ✕ Fermer
          </button>
        </div>

        {/* Zone import / drag-drop / Ctrl+V */}
        <div className={`${studioStyles.dropZone} ${dragOver ? studioStyles.dropZoneActive : ""}`}>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 13 }}>
              {sourceName ? `Fichier chargé : ${sourceName}` : "Aucun fichier chargé"}
            </strong>
            <div className={styles.hint}>
              Glisse-dépose un `.wav` / `.mp3` ici, fais <strong>Ctrl+V</strong> pour coller un fichier copié, ou choisis-en un :
            </div>
          </div>
          <div className={styles.row}>
            <button
              type="button"
              className={`${styles.btn} ${styles.small} ${styles.primary}`}
              onClick={() => fileInputRef.current?.click()}
            >
              Importer un fichier…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/mpeg,audio/ogg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.ogg,.wav,.m4a"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void loadSource(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {error && <div className={`${styles.notice} ${styles.error}`} style={{ marginBottom: 0 }}>{error}</div>}

        {loading ? (
          <div className={studioStyles.wavePanel}>
            <p className={styles.empty}>Décodage de la forme d&apos;onde…</p>
          </div>
        ) : channels ? (
          <>
            {/* Visualiseur Waveform + Poignées de coupe */}
            <div className={studioStyles.wavePanel}>
              <div className={studioStyles.waveMeta}>
                <div className={styles.row} style={{ gap: 10 }}>
                  <span>Original : <strong>{formatAudioTime(durationSec)}</strong> ({channels.length > 1 ? "stéréo" : "mono"}, {Math.round(sampleRate / 100) / 10} kHz)</span>
                  <span>→ Résultat : <strong>{formatAudioTime(outputDurationSec)}</strong></span>
                  {sfxTooLong ? (
                    <span className={studioStyles.badgeWarn}>⚠ SFX &gt; 5 s (sera coupé à 5 s au serveur)</span>
                  ) : (
                    <span className={studioStyles.badgeOk}>✓ Durée OK</span>
                  )}
                </div>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span>Zoom {zoom.toFixed(1)}×</span>
                  <input
                    type="range"
                    min={1}
                    max={8}
                    step={0.5}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    style={{ width: 92, accentColor: "#f2bb45" }}
                  />
                </label>
              </div>

              <div className={studioStyles.waveScroll}>
                <canvas
                  ref={canvasRef}
                  className={studioStyles.waveCanvas}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                />
              </div>

              {/* Barre de transport + actions 1-clic */}
              <div className={studioStyles.transport}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.small} ${styles.primary}`}
                  onClick={() => (playingMode === "edited" ? stopPlayback() : playPreview("edited"))}
                >
                  {playingMode === "edited" ? "■ Stop" : "▶ Écouter le résultat"}
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.small}`}
                  onClick={() => (playingMode === "original" ? stopPlayback() : playPreview("original"))}
                >
                  {playingMode === "original" ? "■ Stop original" : "▶ Original (A/B)"}
                </button>
                <label className={styles.check} style={{ fontSize: 12 }}>
                  <input type="checkbox" checked={loopPlay} onChange={(e) => setLoopPlay(e.target.checked)} />
                  Boucle
                </label>
                <span className={styles.spacer} />
                <button type="button" className={`${styles.btn} ${styles.small}`} onClick={handleAutoTrim} title="Coupe automatiquement les silences au début et à la fin">
                  ✂ Auto-trim silences
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.small}`}
                  onClick={() => setParams(createDefaultEditParams(durationSec))}
                  disabled={!edited}
                >
                  ↺ Réinitialiser
                </button>
              </div>
            </div>

            {/* Panneaux de réglages */}
            <div className={studioStyles.controlsGrid}>
              {/* 1. Découpe (Trim) & Fondus */}
              <div className={studioStyles.controlCard}>
                <h3>Découpe &amp; Fondus</h3>
                <div className={studioStyles.sliderRow}>
                  <div className={studioStyles.sliderHead}>
                    <span>Début (Trim In)</span>
                    <strong>{formatAudioTime(params.trimStartSec)}</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, params.trimEndSec - 0.02)}
                    step={0.005}
                    value={params.trimStartSec}
                    onChange={(e) => setParams((prev) => ({ ...prev, trimStartSec: Number(e.target.value) }))}
                  />
                </div>
                <div className={studioStyles.sliderRow}>
                  <div className={studioStyles.sliderHead}>
                    <span>Fin (Trim Out)</span>
                    <strong>{formatAudioTime(params.trimEndSec)}</strong>
                  </div>
                  <input
                    type="range"
                    min={Math.min(durationSec, params.trimStartSec + 0.02)}
                    max={durationSec}
                    step={0.005}
                    value={params.trimEndSec}
                    onChange={(e) => setParams((prev) => ({ ...prev, trimEndSec: Number(e.target.value) }))}
                  />
                </div>
                <div className={studioStyles.sliderRow}>
                  <div className={studioStyles.sliderHead}>
                    <span>Fondu d&apos;entrée (Fade-in)</span>
                    <strong>{params.fadeInMs} ms</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.min(1500, Math.round(outputDurationSec * 450))}
                    step={5}
                    value={params.fadeInMs}
                    onChange={(e) => setParams((prev) => ({ ...prev, fadeInMs: Number(e.target.value) }))}
                  />
                </div>
                <div className={studioStyles.sliderRow}>
                  <div className={studioStyles.sliderHead}>
                    <span>Fondu de sortie (Fade-out)</span>
                    <strong>{params.fadeOutMs} ms</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.min(1500, Math.round(outputDurationSec * 450))}
                    step={5}
                    value={params.fadeOutMs}
                    onChange={(e) => setParams((prev) => ({ ...prev, fadeOutMs: Number(e.target.value) }))}
                  />
                </div>
              </div>

              {/* 2. Vitesse, Pitch & Niveau */}
              <div className={studioStyles.controlCard}>
                <h3>Vitesse, Hauteur &amp; Volume</h3>
                <div className={studioStyles.sliderRow}>
                  <div className={studioStyles.sliderHead}>
                    <span>Vitesse (ralentir / accélérer)</span>
                    <strong>{params.speed.toFixed(2)}×</strong>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={params.speed}
                    onChange={(e) => setParams((prev) => ({ ...prev, speed: Number(e.target.value) }))}
                  />
                  <div className={studioStyles.presetChips}>
                    {SPEED_PRESETS.map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        className={`${studioStyles.presetChip} ${Math.abs(params.speed - sp) < 0.01 ? studioStyles.presetChipActive : ""}`}
                        onClick={() => setParams((prev) => ({ ...prev, speed: sp }))}
                      >
                        {sp}×
                      </button>
                    ))}
                  </div>
                </div>

                <label className={styles.check} style={{ fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={params.preservePitch}
                    onChange={(e) => setParams((prev) => ({ ...prev, preservePitch: e.target.checked }))}
                  />
                  Conserver la hauteur (ne pas rendre aigu/grave en changeant la vitesse)
                </label>

                <div className={studioStyles.sliderRow}>
                  <div className={studioStyles.sliderHead}>
                    <span>Hauteur (Pitch)</span>
                    <strong>{params.pitchSemitones > 0 ? `+${params.pitchSemitones}` : params.pitchSemitones} st</strong>
                  </div>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={0.5}
                    value={params.pitchSemitones}
                    onChange={(e) => setParams((prev) => ({ ...prev, pitchSemitones: Number(e.target.value) }))}
                  />
                </div>

                <div className={studioStyles.sliderRow}>
                  <div className={studioStyles.sliderHead}>
                    <span>Gain</span>
                    <strong>{params.gainDb > 0 ? `+${params.gainDb}` : params.gainDb} dB</strong>
                  </div>
                  <input
                    type="range"
                    min={-18}
                    max={12}
                    step={0.5}
                    value={params.gainDb}
                    onChange={(e) => setParams((prev) => ({ ...prev, gainDb: Number(e.target.value) }))}
                  />
                </div>

                <div className={styles.row} style={{ gap: 14 }}>
                  <label className={styles.check} style={{ fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={params.normalize}
                      onChange={(e) => setParams((prev) => ({ ...prev, normalize: e.target.checked }))}
                    />
                    Normaliser (-1 dB)
                  </label>
                  <label className={styles.check} style={{ fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={params.reverse}
                      onChange={(e) => setParams((prev) => ({ ...prev, reverse: e.target.checked }))}
                    />
                    Inverser (Reverse)
                  </label>
                  {channels.length > 1 && (
                    <label className={styles.check} style={{ fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={params.mono}
                        onChange={(e) => setParams((prev) => ({ ...prev, mono: e.target.checked }))}
                      />
                      Forcer Mono
                    </label>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className={studioStyles.wavePanel}>
            <p className={styles.empty}>Glisse un fichier `.wav` ou `.mp3` ci-dessus (ou fais Ctrl+V) pour commencer à l&apos;éditer.</p>
          </div>
        )}

        <div className={studioStyles.footer}>
          <div className={styles.row}>
            {channels && (
              <button type="button" className={`${styles.btn} ${styles.small}`} onClick={handleDownloadLocal}>
                ⬇ Télécharger WAV
              </button>
            )}
          </div>
          <div className={styles.row}>
            <button type="button" className={styles.btn} disabled={saving} onClick={() => { stopPlayback(); onClose(); }}>
              Annuler
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.primary}`}
              disabled={!channels || saving}
              onClick={() => void handleApply()}
            >
              {saving ? "Envoi & conversion…" : edited ? "Appliquer les modifs & envoyer" : "Utiliser ce fichier"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
