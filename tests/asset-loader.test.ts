import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eventDetailManifest, menuManifest, sceneManifest } from "../lib/assets/manifests";

it("précharge le décor, les boss et les récompenses avant le parcours", () => {
  const manifest = eventDetailManifest({ imageUrl: "https://assets.example/event.webp", stages: [{ boss: { avatarUrl: "https://assets.example/boss.webp" }, reward: [{ type: "nkap", amount: 100 }] }] });
  expect(manifest.critical.map((asset) => asset.url)).toEqual(expect.arrayContaining(["https://assets.example/event.webp", "https://assets.example/boss.webp", "/assets/njambo/economy/nkap-stack-64.webp"]));
});

it("déclare les manifestes critiques de l'accueil, de la boutique, des mini-jeux et du hub Jouer", () => {
  expect(menuManifest().critical.map((a) => a.url)).toEqual(expect.arrayContaining([
    "/assets/njambo/ui/brand/njambo-mark-256.webp",
    "/assets/njambo/economy/nkap-stack-64.webp",
    "/assets/njambo/economy/loyalty-wheel-128.webp",
  ]));
  expect(sceneManifest("shop").critical.map((a) => a.url)).toEqual(expect.arrayContaining([
    "/assets/njambo/economy/pack-mboa-256.webp",
    "/assets/njambo/books/book-normal-256.webp",
  ]));
  expect(sceneManifest("minigames").critical.map((a) => a.url)).toEqual(expect.arrayContaining([
    "/assets/njambo/economy/loyalty-wheel-128.webp",
    "/assets/njambo/tickets/ticket-bronze-128.webp",
  ]));
  expect(sceneManifest("play").critical.map((a) => a.url)).toEqual(expect.arrayContaining([
    "/assets/njambo/ui/icons/bot-64.webp",
    "/assets/njambo/books/card-back-128.webp",
  ]));
});

/* Faux navigateur minimal : Image dont le chargement est piloté par le test. */
const pending: Array<{ src: string; img: FakeImage }> = [];
const failOnce = new Set<string>();
class FakeImage {
  decoding = "auto";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";
  set src(value: string) { this._src = value; pending.push({ src: value, img: this }); }
  get src() { return this._src; }
  decode() { return Promise.resolve(); }
}

function settle(src: string) {
  const index = pending.findIndex((item) => item.src === src);
  const [{ img }] = pending.splice(index, 1);
  if (failOnce.has(src)) { failOnce.delete(src); img.onerror?.(); } else img.onload?.();
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("AssetLoader", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { Image: FakeImage, setTimeout, requestIdleCallback: (cb: () => void) => setTimeout(cb, 0) });
    pending.length = 0;
  });
  afterEach(async () => {
    const loader = await import("../lib/assets/AssetLoader");
    loader.__resetAssetLoader();
    vi.unstubAllGlobals();
  });

  it("dédoublonne, ignore les sons de synthèse et les entrées vides", async () => {
    const { normalizeAssets } = await import("../lib/assets/AssetLoader");
    const list = normalizeAssets([
      { kind: "image", url: "/a.webp" }, { kind: "image", url: "/a.webp" }, null, false,
      { kind: "audio", url: "preset:gong" }, { kind: "audio", url: "/s.mp3" }, { kind: "image", url: "" },
    ]);
    expect(list).toEqual([{ kind: "image", url: "/a.webp" }, { kind: "audio", url: "/s.mp3" }]);
  });

  it("limite la concurrence critique à 6 et suit la progression", async () => {
    const { loadAssets, isAssetReady, isImageUrlReady } = await import("../lib/assets/AssetLoader");
    const urls = ["/1.webp", "/2.webp", "/3.webp", "/4.webp", "/5.webp", "/6.webp", "/7.webp", "/8.webp"];
    const progress: number[] = [];
    const done = loadAssets(urls.map((url) => ({ kind: "image", url })), { onProgress: (p) => progress.push(p.loaded) });
    expect(pending.map((item) => item.src)).toEqual(urls.slice(0, 6));
    for (const url of urls.slice(0, 6)) settle(url);
    await flush(); await flush();
    expect(pending.map((item) => item.src)).toEqual(urls.slice(6));
    settle("/7.webp"); settle("/8.webp");
    const result = await done;
    expect(result).toEqual({ loaded: 8, total: 8, failed: 0 });
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(8);
    expect(isAssetReady({ kind: "image", url: "/3.webp" })).toBe(true);
    expect(isImageUrlReady("/3.webp")).toBe(true);
  });

  it("un asset critique démarre immédiatement devant le préchargement en arrière-plan", async () => {
    const { loadAssets, prefetchAssets } = await import("../lib/assets/AssetLoader");
    prefetchAssets(["/b1", "/b2", "/b3", "/b4", "/b5", "/b6"].map((url) => ({ kind: "image" as const, url })));
    await flush();
    // Le préchargement en arrière-plan est plafonné à 3 pour garder des créneaux libres.
    expect(pending).toHaveLength(3);
    const critical = loadAssets([{ kind: "image", url: "/c1" }, { kind: "image", url: "/b6" }]);
    // Les créneaux libres (4..6) prennent immédiatement les assets critiques (y compris /b6 promu).
    expect(pending.map((item) => item.src)).toContain("/c1");
    expect(pending.map((item) => item.src)).toContain("/b6");
    expect(pending.map((item) => item.src)).not.toContain("/b4");
    for (const src of ["/b1", "/b2", "/b3", "/c1", "/b6"]) settle(src);
    await flush(); await flush();
    await critical;
  });

  it("refait une tentative après un échec, puis ne bloque jamais", async () => {
    vi.useFakeTimers();
    const { loadAssets, isAssetReady } = await import("../lib/assets/AssetLoader");
    failOnce.add("/x.webp");
    const done = loadAssets([{ kind: "image", url: "/x.webp" }]);
    settle("/x.webp");
    await vi.advanceTimersByTimeAsync(700);
    settle("/x.webp");
    await vi.runAllTimersAsync();
    expect((await done).failed).toBe(0);
    expect(isAssetReady({ kind: "image", url: "/x.webp" })).toBe(true);
    vi.useRealTimers();
  });
});
