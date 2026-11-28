/* ═══════════════ Chargeur d'assets ═══════════════
   File unique pour les images (téléchargées puis décodées via decode(), pour
   qu'aucune image n'apparaisse « en retard » pendant une animation) et les sons
   (téléchargés + décodés en WebAudio via preloadPowerSound).

   - Dédoublonnage : un même URL n'est chargé qu'une fois (cache mémoire des
     promesses + références aux images décodées, pour éviter leur éviction).
   - Priorités : "critical" (un écran attend, jusqu'à 6 en parallèle) passe
     devant "background" (préchargement discret, plafonné à 3 pour garder des
     emplacements libres dès qu'un écran critique démarre).
   - Une nouvelle tentative en cas d'échec.
   - Un asset en échec ne bloque jamais : il compte comme « terminé ». */

import { preloadPowerSound, resolvePowerSoundUrl } from "../powerSounds";

export type AssetKind = "image" | "audio";
export interface AssetRef { kind: AssetKind; url: string }
export type AssetPriority = "critical" | "background";

const CONCURRENCY = 6;
const BG_CONCURRENCY = 3;
const RETRY_DELAY_MS = 600;
const FAILED_PREFETCH_COOLDOWN_MS = 30_000;
const MAX_KEPT_IMAGES = 320;

type Entry = { promise: Promise<boolean>; done: boolean; ok: boolean };
type Job = { ref: AssetRef; priority: AssetPriority; resolve: (ok: boolean) => void };

const entries = new Map<string, Entry>();
const failedPrefetchAt = new Map<string, number>();
const keptImages = new Map<string, HTMLImageElement>();
const queue: Job[] = [];
const queued = new Map<string, Job>();
let active = 0;

const keyOf = (ref: AssetRef) => `${ref.kind}:${ref.url}`;

/** Ne garde que les refs exploitables, sans doublon. */
export function normalizeAssets(list: Array<AssetRef | null | undefined | false>): AssetRef[] {
  const seen = new Set<string>();
  const out: AssetRef[] = [];
  for (const ref of list) {
    if (!ref || typeof ref.url !== "string" || !ref.url) continue;
    let normalizedRef: AssetRef = ref;
    if (ref.kind === "audio" && ref.url.startsWith("preset:")) {
      const resolved = resolvePowerSoundUrl(ref.url);
      if (!resolved) continue;
      normalizedRef = { kind: "audio", url: resolved };
    }
    const key = keyOf(normalizedRef);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalizedRef);
  }
  return out;
}

function loadImageOnce(url: string, priority: AssetPriority): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.decoding = "async";
    if ("fetchPriority" in img) {
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = priority === "critical" ? "high" : "low";
    }
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (ok) {
        keptImages.set(url, img);
        if (keptImages.size > MAX_KEPT_IMAGES) keptImages.delete(keptImages.keys().next().value as string);
      }
      resolve(ok);
    };
    img.onload = () => {
      if (typeof img.decode === "function") img.decode().then(() => finish(true), () => finish(true));
      else finish(true);
    };
    img.onerror = () => finish(false);
    img.src = url;
  });
}

async function fetchAsset(ref: AssetRef, priority: AssetPriority): Promise<boolean> {
  const attempt = () => (ref.kind === "image" ? loadImageOnce(ref.url, priority) : preloadPowerSound(ref.url));
  if (await attempt()) return true;
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  return attempt();
}

function pump() {
  while (queue.length) {
    const next = queue[0]!;
    const limit = next.priority === "critical" ? CONCURRENCY : BG_CONCURRENCY;
    if (active >= limit) break;
    const job = queue.shift()!;
    queued.delete(keyOf(job.ref));
    active += 1;
    void fetchAsset(job.ref, job.priority).then((ok) => {
      active -= 1;
      job.resolve(ok);
      pump();
    });
  }
}

function enqueue(ref: AssetRef, priority: AssetPriority): Promise<boolean> {
  const key = keyOf(ref);
  const existing = entries.get(key);
  if (existing) {
    // Promotion : un préchargement en attente devient prioritaire si un écran l'attend.
    const job = queued.get(key);
    if (job && priority === "critical" && job.priority === "background") {
      job.priority = "critical";
      queue.splice(queue.indexOf(job), 1);
      const firstBackground = queue.findIndex((item) => item.priority === "background");
      queue.splice(firstBackground === -1 ? queue.length : firstBackground, 0, job);
      pump();
    }
    return existing.promise;
  }
  let resolveJob!: (ok: boolean) => void;
  const entry: Entry = { done: false, ok: false, promise: new Promise<boolean>((resolve) => { resolveJob = resolve; }) };
  entries.set(key, entry);
  void entry.promise.then((ok) => {
    entry.done = true;
    entry.ok = ok;
    if (ok) {
      failedPrefetchAt.delete(key);
    } else {
      entries.delete(key); // nouvel essai possible plus tard
      failedPrefetchAt.set(key, Date.now());
    }
  });
  const job: Job = { ref, priority, resolve: resolveJob };
  queued.set(key, job);
  if (priority === "critical") {
    const firstBackground = queue.findIndex((item) => item.priority === "background");
    queue.splice(firstBackground === -1 ? queue.length : firstBackground, 0, job);
  } else {
    queue.push(job);
  }
  pump();
  return entry.promise;
}

/** Vrai si l'asset est déjà chargé (et décodé) dans cette session. */
export function isAssetReady(ref: AssetRef): boolean {
  const entry = entries.get(keyOf(ref));
  return Boolean(entry?.done && entry.ok);
}

/** Vrai si l'image correspondant à cette URL est déjà décodée en mémoire. */
export function isImageUrlReady(url: string | null | undefined): boolean {
  if (!url) return false;
  return isAssetReady({ kind: "image", url });
}

/** Marque une image comme chargée dans le cache session (ex. onLoad direct). */
export function markImageUrlReady(url: string | null | undefined): void {
  if (!url) return;
  const key = keyOf({ kind: "image", url });
  if (!entries.has(key)) {
    entries.set(key, { done: true, ok: true, promise: Promise.resolve(true) });
  }
}

export function areAssetsReady(list: AssetRef[]): boolean {
  return normalizeAssets(list).every(isAssetReady);
}

export interface LoadProgress { loaded: number; total: number }

/** Charge une liste en priorité ; résout quand tout est terminé (succès ou échec). */
export function loadAssets(
  list: Array<AssetRef | null | undefined | false>,
  options: { priority?: AssetPriority; onProgress?: (progress: LoadProgress) => void } = {},
): Promise<LoadProgress & { failed: number }> {
  const refs = normalizeAssets(list);
  if (typeof window === "undefined" || refs.length === 0) return Promise.resolve({ loaded: refs.length, total: refs.length, failed: 0 });
  let loaded = 0;
  let failed = 0;
  options.onProgress?.({ loaded, total: refs.length });
  return Promise.all(refs.map((ref) => enqueue(ref, options.priority ?? "critical").then((ok) => {
    loaded += 1;
    if (!ok) failed += 1;
    options.onProgress?.({ loaded, total: refs.length });
  }))).then(() => ({ loaded, total: refs.length, failed }));
}

/** Préchargement discret (priorité basse, démarré au repos du navigateur). */
export function prefetchAssets(list: Array<AssetRef | null | undefined | false>): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const refs = normalizeAssets(list).filter((ref) => {
    const key = keyOf(ref);
    if (entries.has(key)) return false;
    const failedAt = failedPrefetchAt.get(key);
    return failedAt === undefined || now - failedAt >= FAILED_PREFETCH_COOLDOWN_MS;
  });
  if (!refs.length) return;
  const start = () => { for (const ref of refs) void enqueue(ref, "background"); };
  const requestIdle = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (requestIdle) requestIdle.call(window, start, { timeout: 2000 });
  else setTimeout(start, 200);
}

export const imageAsset = (url: string | null | undefined): AssetRef | null => (url ? { kind: "image", url } : null);
export const audioAsset = (url: string | null | undefined): AssetRef | null => (url ? { kind: "audio", url } : null);

/** Tests uniquement. */
export function __resetAssetLoader() {
  entries.clear();
  failedPrefetchAt.clear();
  keptImages.clear();
  queue.length = 0;
  queued.clear();
  active = 0;
}
