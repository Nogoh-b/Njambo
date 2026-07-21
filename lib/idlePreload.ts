import { loadGsap } from "@/lib/motion";
import { IDLE_PREFETCH_SCENES, preloadScene } from "@/lib/scenePreload";
import { warmAudio } from "@/lib/sound";

type IdleTask = () => void | Promise<unknown>;

let started = false;

/** Assets lourds réutilisés hors du home (dos de carte : pluie de fond + jeu). */
const WARM_IMAGES = [
  "/assets/njambo/books/card-back-128.webp",
];

function warmImage(src: string): void {
  const img = new window.Image();
  img.decoding = "async";
  img.src = src;
}

const tasks: IdleTask[] = [
  () => warmAudio(),
  () => loadGsap(),
  () => import("@/components/power/PowerParticles"),
  // Chunks des scènes les plus visitées depuis le home (une par tâche idle).
  ...IDLE_PREFETCH_SCENES.map((scene) => () => preloadScene(scene)),
  ...WARM_IMAGES.map((src) => () => warmImage(src)),
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
