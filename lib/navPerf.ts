/* ═══════════════ Mesure des navigations sur l'appareil réel ═══════════════
   Active seulement avec `?perf=1` dans l'adresse (mémorisé pour la session ; `?perf=0` coupe).
   Pour chaque changement d'écran : appui → montage → 1re image → écran complet, pire image,
   images lentes, et pour les images trop longues (API Long Animation Frames de Chrome) la part
   JavaScript / mise en page et le script responsable. Affiché par PerformanceHud. */

export const NAV_PERF_EVENT = "njambo:nav-perf";

export interface NavFrameCost {
  /** Durée de l'image (ms). */
  duration: number;
  /** Temps passé dans le JavaScript (ms). */
  script: number;
  /** Temps de recalcul de style + mise en page (ms). */
  layout: number;
  /** Script principal responsable : fichier:fonction. */
  source: string;
}

export interface NavSample {
  id: number;
  from: string;
  to: string;
  start: number;
  commit?: number;
  painted?: number;
  done?: number;
  worstFrame: number;
  slowFrames: number;
  frames: NavFrameCost[];
}

interface LoafScript {
  duration: number;
  sourceURL?: string;
  sourceFunctionName?: string;
  invoker?: string;
}

interface LoafEntry extends PerformanceEntry {
  styleAndLayoutStart?: number;
  scripts?: LoafScript[];
}

const MAX_SAMPLES = 6;
const SESSION_KEY = "njambo-perf";

let enabledCache: boolean | null = null;
let seq = 0;
let current: NavSample | null = null;
let doneOnPaint = false;
const samples: NavSample[] = [];
const loafs: LoafEntry[] = [];
let observing = false;

export function navPerfEnabled(): boolean {
  if (enabledCache !== null) return enabledCache;
  if (typeof window === "undefined") return false;
  try {
    const flag = new URLSearchParams(window.location.search).get("perf");
    if (flag === "1") sessionStorage.setItem(SESSION_KEY, "1");
    if (flag === "0") sessionStorage.removeItem(SESSION_KEY);
    enabledCache = sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    enabledCache = false;
  }
  return enabledCache;
}

export function getNavSamples(): readonly NavSample[] {
  return samples;
}

function observeLongFrames() {
  if (observing || typeof PerformanceObserver === "undefined") return;
  observing = true;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) loafs.push(entry as LoafEntry);
      if (loafs.length > 200) loafs.splice(0, loafs.length - 200);
    }).observe({ type: "long-animation-frame", buffered: false });
  } catch {
    // Navigateur sans Long Animation Frames : on garde les mesures d'images (rAF).
  }
}

function shortName(url?: string): string {
  if (!url) return "?";
  const file = url.split("/").pop() ?? url;
  return file.split("?")[0].slice(0, 22);
}

function frameCost(entry: LoafEntry): NavFrameCost {
  const end = entry.startTime + entry.duration;
  const scripts = entry.scripts ?? [];
  const script = scripts.reduce((sum, item) => sum + item.duration, 0);
  const layout = entry.styleAndLayoutStart ? Math.max(0, end - entry.styleAndLayoutStart) : 0;
  const top = [...scripts].sort((left, right) => right.duration - left.duration)[0];
  const source = top
    ? `${shortName(top.sourceURL)}${top.sourceFunctionName ? `:${top.sourceFunctionName.slice(0, 16)}` : ""}`
    : "rendu (style/peinture)";
  return { duration: Math.round(entry.duration), script: Math.round(script), layout: Math.round(layout), source };
}

function finalize(sample: NavSample) {
  if (current === sample) current = null;
  const end = (sample.done ?? sample.painted ?? performance.now()) + 300;
  sample.frames = loafs
    .filter((entry) => entry.startTime + entry.duration >= sample.start && entry.startTime <= end)
    .sort((left, right) => right.duration - left.duration)
    .slice(0, 2)
    .map(frameCost);
  samples.unshift(sample);
  if (samples.length > MAX_SAMPLES) samples.length = MAX_SAMPLES;
  window.dispatchEvent(new Event(NAV_PERF_EVENT));
}

/** Début d'une navigation (appelé au changement d'écran demandé). */
export function navStart(from: string, to: string) {
  if (from === to || !navPerfEnabled()) return;
  observeLongFrames();
  if (current) finalize(current);
  const sample: NavSample = { id: ++seq, from, to, start: performance.now(), worstFrame: 0, slowFrames: 0, frames: [] };
  current = sample;
  doneOnPaint = false;
  let last = sample.start;
  const tick = (now: number) => {
    if (current !== sample) return;
    const delta = now - last;
    last = now;
    sample.worstFrame = Math.max(sample.worstFrame, Math.round(delta));
    if (delta > 50) sample.slowFrames += 1;
    const finished = sample.done !== undefined && now > sample.done + 300;
    if (finished || now - sample.start > 4000) {
      finalize(sample);
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Le nouvel écran est validé par React (layout effect). `instant` : pas de fondu à attendre. */
export function navCommitted(scene: string, instant: boolean) {
  const sample = current;
  if (!sample || sample.to !== scene || sample.commit !== undefined) return;
  sample.commit = performance.now();
  doneOnPaint = instant;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (current !== sample) return;
    sample.painted = performance.now();
    if (doneOnPaint && sample.done === undefined) sample.done = sample.painted;
  }));
}

/** Le fondu de la navigation est terminé (écran complet). */
export function navDone(scene: string) {
  const sample = current;
  if (!sample || sample.to !== scene || sample.done !== undefined) return;
  sample.done = performance.now();
}
