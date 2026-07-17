import { loadGsap } from "@/lib/motion";
import { warmAudio } from "@/lib/sound";

type IdleTask = () => void | Promise<unknown>;

let started = false;

const tasks: IdleTask[] = [
  () => warmAudio(),
  () => loadGsap(),
  () => import("@/components/power/PowerParticles"),
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
