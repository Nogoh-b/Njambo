import { prefetchAssets } from "@/lib/assets/AssetLoader";
import { menuManifest } from "@/lib/assets/manifests";
import { loadGsap } from "@/lib/motion";
import { IDLE_PREFETCH_SCENES, loadPowerParticles, preloadScene } from "@/lib/scenePreload";
import { sysAsset } from "@/lib/assetPack";

type IdleTask = () => void | Promise<unknown>;

let started = false;

/** Assets lourds réutilisés hors du home (dos de carte : pluie de fond + jeu). */
const WARM_IMAGES = [
  sysAsset("/assets/njambo/books/card-back-128.webp"),
];

function warmImage(src: string): void {
  const img = new window.Image();
  img.decoding = "async";
  img.src = src;
}

const tasks: IdleTask[] = [
  // Plus de warmAudio() : GXE arme l'unlock de son AudioContext tout seul,
  // sur le premier geste réel (pointerdown/keydown), sans tâche idle dédiée.
  () => prefetchAssets(menuManifest().background),
  () => loadGsap(),
  loadPowerParticles,
  // Chunks + assets critiques des scènes les plus visitées depuis le home (une par tâche idle).
  ...IDLE_PREFETCH_SCENES.map((scene) => () => preloadScene(scene)),
];

function scheduleIdle(task: () => void): void {
  const requestIdle = (window as unknown as {
    requestIdleCallback?: Window["requestIdleCallback"];
  }).requestIdleCallback;
  if (requestIdle) {
    requestIdle.call(window, task);
    return;
  }
  setTimeout(task, 400);
}

/** Précharge, une ressource à la fois, après la sortie du splash. */
export function schedulePostSplashPreload(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  let index = 0;
  const runNext = () => {
    const task = tasks[index++];
    if (!task) return;
    Promise.resolve(task()).finally(() => scheduleIdle(runNext));
  };

  scheduleIdle(runNext);
}
