export type PlaySyncPhase = "predicted" | "animated" | "confirmed" | "rejected";

export interface TrackedPlay {
  playId: string;
  phase: PlaySyncPhase;
  predictedAt: number;
  animatedAt?: number;
  confirmedAt?: number;
  rejectedAt?: number;
}

/**
 * Petit automate pur utilisé par FirestoreGameSync. Il garantit qu'un coup
 * n'est animé qu'une fois, quelle que soit l'ordre d'arrivée entre l'événement
 * léger, pendingPlay et lastPlay.
 */
export class PlaySyncTracker {
  private plays = new Map<string, TrackedPlay>();

  predict(playId: string, at = Date.now()): TrackedPlay {
    const existing = this.plays.get(playId);
    if (existing) return existing;
    const tracked: TrackedPlay = { playId, phase: "predicted", predictedAt: at };
    this.plays.set(playId, tracked);
    return tracked;
  }

  animate(playId: string, at = Date.now()): boolean {
    const tracked = this.predict(playId, at);
    if (tracked.animatedAt != null || tracked.phase === "rejected") return false;
    tracked.animatedAt = at;
    if (tracked.phase !== "confirmed") tracked.phase = "animated";
    return true;
  }

  confirm(playId: string, at = Date.now()): TrackedPlay {
    const tracked = this.predict(playId, at);
    tracked.phase = "confirmed";
    tracked.confirmedAt = at;
    return tracked;
  }

  reject(playId: string, at = Date.now()): TrackedPlay {
    const tracked = this.predict(playId, at);
    tracked.phase = "rejected";
    tracked.rejectedAt = at;
    return tracked;
  }

  get(playId: string): TrackedPlay | undefined {
    return this.plays.get(playId);
  }

  isConfirmed(playId: string): boolean {
    return this.plays.get(playId)?.phase === "confirmed";
  }

  clear(): void {
    this.plays.clear();
  }

  delete(playId: string): void {
    this.plays.delete(playId);
  }
}
