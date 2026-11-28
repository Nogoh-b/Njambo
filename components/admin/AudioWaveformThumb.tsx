"use client";

/* Vignette visuelle de forme d'onde (Canvas 120×26) avec cache mémoire par URL. */

import { useEffect, useRef, useState } from "react";
import { audioEngine } from "@/lib/audio/AudioEngine";
import { computeWaveformPeaks, extractChannels, formatAudioTime } from "@/lib/audio/audioEditor";
import studioStyles from "./AudioStudio.module.css";

interface CachedThumb {
  peaks: Float32Array;
  durationSec: number;
  channels: number;
}

const thumbCache = new Map<string, CachedThumb>();
const pendingThumbs = new Map<string, Promise<CachedThumb | null>>();

async function loadThumb(url: string): Promise<CachedThumb | null> {
  const hit = thumbCache.get(url);
  if (hit) return hit;

  let req = pendingThumbs.get(url);
  if (!req) {
    req = (async () => {
      try {
        const ctx = audioEngine.ensureContext();
        if (!ctx) return null;
        const isLocal = url.startsWith("/");
        const res = await fetch(url, isLocal ? { credentials: "same-origin" } : { mode: "cors", credentials: "omit" });
        if (!res.ok) return null;
        const raw = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(raw.slice(0));
        const channels = extractChannels(decoded);
        const entry: CachedThumb = {
          peaks: computeWaveformPeaks(channels, 60),
          durationSec: decoded.duration,
          channels: decoded.numberOfChannels,
        };
        thumbCache.set(url, entry);
        return entry;
      } catch {
        return null;
      }
    })();
    pendingThumbs.set(url, req);
    void req.finally(() => pendingThumbs.delete(url));
  }
  return req;
}

export function AudioWaveformThumb({
  url,
  accent = "#f2bb45",
  onClick,
}: {
  url: string | null;
  accent?: string;
  onClick?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [info, setInfo] = useState<CachedThumb | null>(() => (url ? thumbCache.get(url) ?? null : null));

  useEffect(() => {
    if (!url) {
      setInfo(null);
      return;
    }
    const cached = thumbCache.get(url);
    if (cached) {
      setInfo(cached);
      return;
    }
    let alive = true;
    void loadThumb(url).then((res) => {
      if (alive) setInfo(res);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const w = 120;
    const h = 26;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Ligne centrale subtile
    ctx.strokeStyle = "rgba(201, 180, 143, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    if (!info) return;
    const { peaks } = info;
    const barW = w / peaks.length;
    ctx.fillStyle = accent;
    for (let i = 0; i < peaks.length; i += 1) {
      const amp = Math.max(0.06, peaks[i]!);
      const barH = Math.max(2, amp * (h - 4));
      const x = i * barW;
      const y = (h - barH) / 2;
      ctx.fillRect(x + 0.3, y, Math.max(1, barW - 0.8), barH);
    }
  }, [info, accent]);

  if (!url) return null;

  return (
    <button
      type="button"
      className={studioStyles.thumbWrap}
      onClick={onClick}
      title="Cliquer pour ouvrir dans le Studio audio"
      style={{ cursor: onClick ? "pointer" : "default", textAlign: "left" }}
    >
      <canvas ref={canvasRef} className={studioStyles.thumbCanvas} />
      <span className={studioStyles.thumbMeta}>
        {info ? `${formatAudioTime(info.durationSec)} · ${info.channels > 1 ? "stéréo" : "mono"}` : "…"}
      </span>
    </button>
  );
}
