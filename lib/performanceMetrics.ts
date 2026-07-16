export const PERFORMANCE_EVENT = "njambo:performance-update";

let boardRenderCount = 0;

export function markPerformance(name: string) {
  if (typeof performance === "undefined") return;
  performance.mark(`njambo:${name}`);
}

export function measurePerformance(name: string, startMark: string, endMark?: string) {
  if (typeof performance === "undefined") return;
  try {
    performance.measure(
      `njambo:${name}`,
      `njambo:${startMark}`,
      endMark ? `njambo:${endMark}` : undefined,
    );
  } catch {
    // A measurement is optional when a mark belongs to a previous navigation.
  }
}

export function recordBoardRender() {
  boardRenderCount += 1;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PERFORMANCE_EVENT));
}

export function getBoardRenderCount() {
  return boardRenderCount;
}
