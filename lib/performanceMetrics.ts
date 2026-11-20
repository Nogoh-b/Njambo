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

/* ─── Chargeur d'assets : temps d'attente réel et taux d'affichage de l'écran ─── */
export interface GateStats { entries: number; shown: number; timedOut: number; totalWaitMs: number; maxWaitMs: number }
const gateStats = new Map<string, GateStats>();

export function recordGateResult(name: string, result: { waitedMs: number; shown: boolean; timedOut: boolean }) {
  const stats = gateStats.get(name) ?? { entries: 0, shown: 0, timedOut: 0, totalWaitMs: 0, maxWaitMs: 0 };
  stats.entries += 1;
  if (result.shown) stats.shown += 1;
  if (result.timedOut) stats.timedOut += 1;
  stats.totalWaitMs += result.waitedMs;
  stats.maxWaitMs = Math.max(stats.maxWaitMs, result.waitedMs);
  gateStats.set(name, stats);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PERFORMANCE_EVENT));
}

/** Par écran : nombre d'entrées, d'écrans de chargement affichés, de délais dépassés, attente moyenne/max. */
export function getGateStats(): Record<string, GateStats & { avgWaitMs: number; shownRate: number }> {
  const out: Record<string, GateStats & { avgWaitMs: number; shownRate: number }> = {};
  for (const [name, stats] of gateStats) {
    out[name] = { ...stats, avgWaitMs: Math.round(stats.totalWaitMs / stats.entries), shownRate: stats.shown / stats.entries };
  }
  return out;
}
