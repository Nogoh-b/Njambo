import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firestoreClient", () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/backendCallable", () => ({
  backendCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: {} })),
}));
vi.mock("@/config/gameConfig", () => ({
  GAME_CONFIG: {
    turnSeconds: 15,
    cardsPerPlayer: 5,
    anim: {
      dealPerCard: 175,
      dealFlight: 720,
      replayBotThinkMin: 700,
      replayBotThinkMax: 1_400,
      dropFlight: 340,
      landSettle: 80,
      botAfterPlay: 450,
      trickPause: 2_200,
      powerBeat: 900,
    },
  },
}));

import { AuthoritativeGameSync } from "../sync/AuthoritativeGameSync";
import { backendCallable } from "../lib/backendCallable";
import { onSnapshot } from "../lib/firestoreClient";

describe("AuthoritativeGameSync revanche", () => {
  let sync: AuthoritativeGameSync;

  beforeEach(() => {
    sync = new AuthoritativeGameSync({
      mode: "online",
      uid: "host",
      hostId: "host",
      roomId: "room-1",
      roomPlayers: [],
      profile: { name: "Host", emoji: "host", balance: 1_000 },
      stake: 100,
      botCount: 0,
      onResult: vi.fn(),
    });
  });
  afterEach(() => { sync.destroy(); vi.useRealTimers(); vi.clearAllMocks(); });

  it("un démontage ne quitte jamais une participation d’événement", () => {
    vi.useFakeTimers();
    const eventSync = new AuthoritativeGameSync({ mode: "event", uid: "host", eventRunId: "run-1", profile: { name: "Host", emoji: "host", balance: 1000 }, stake: 0, botCount: 3, onResult: vi.fn() });
    eventSync.destroy();
    vi.advanceTimersByTime(10_000);
    expect(backendCallable).not.toHaveBeenCalled();
  });

  it("ignore une réponse de lancement reçue après le démontage", async () => {
    let resolve!: (response: unknown) => void;
    const pending = new Promise((done) => { resolve = done; });
    vi.mocked(backendCallable).mockReturnValueOnce(vi.fn(() => pending) as never);
    const task = (sync as unknown as { requestStart: () => Promise<void> }).requestStart();
    sync.destroy();
    resolve({ data: { matchId: "late", match: {} } });
    await task;
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("expose la durée de table et le score de la série", () => {
    const internal = sync as unknown as { match: Record<string, unknown>; emitState: () => void };
    const listener = vi.fn(); sync.onStateUpdate(listener);
    internal.match = {
      id: "match-1", status: "between_rounds", rules: { turnSeconds: 37 },
      series: { round: 2, total: 3, winners: ["host", "guest"] },
      participants: [{ uid: "host", name: "Host", emoji: "h", bot: false }, { uid: "guest", name: "Guest", emoji: "g", bot: false }],
      handCounts: {}, deposits: {}, trickPlays: [], trickNumber: 5, leaderIndex: 0, turnIndex: 0, potNkap: 200,
    };
    internal.emitState();
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "trickEnd", turnStartSeconds: 37, series: { round: 2, total: 3, scores: [1, 1], lastWinnerName: "Guest" } }));
  });

  it("redistribue visuellement la manche suivante et restaure la nouvelle main", () => {
    vi.useFakeTimers();
    const card = { id: "new", rank: "10", value: 10, suit: "♠", color: "black" };
    const base = { id: "match-1", status: "between_rounds", series: { round: 1, total: 3, winners: ["host"] }, participants: [{ uid: "host", name: "Host", emoji: "h", bot: false }, { uid: "bot", name: "Bot", emoji: "b", bot: true }], handCounts: { host: 0, bot: 0 }, deposits: {}, trickPlays: [], trickNumber: 5, leaderIndex: 0, turnIndex: 0, potNkap: 200 };
    const internal = sync as unknown as { match: Record<string, unknown>; roundHands: Map<number, unknown[]>; hand: unknown[]; ingestMatch: (match: unknown) => void };
    internal.match = base;
    internal.roundHands.set(2, [card]);
    const listener = vi.fn(); sync.onStateUpdate(listener);
    internal.ingestMatch({ ...base, status: "playing", series: { ...base.series, round: 2 }, handCounts: { host: 5, bot: 5 }, trickNumber: 0 });
    expect(internal.hand).toEqual([card]);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "dealing", series: expect.objectContaining({ round: 2 }) }));
    vi.advanceTimersByTime(2 * 5 * 175 + 720 + 200);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "turns" }));
  });

  it("espace le replay IA avant et après le vol de sa carte", () => {
    vi.useFakeTimers();
    const internal = sync as unknown as { match: unknown; replayQueue: unknown[]; replaying: boolean; pump: () => void };
    internal.match = { id: "match-1", status: "playing", participants: [{ uid: "host", name: "Host", emoji: "h", bot: false }, { uid: "bot", name: "Bot", emoji: "b", bot: true }], handCounts: { host: 1, bot: 1 }, deposits: {}, trickPlays: [], trickNumber: 0, leaderIndex: 1, turnIndex: 1, potNkap: 200 };
    const action = { uid: "bot", card: { id: "bot-card", rank: "3", value: 3, suit: "♠", color: "black" }, playId: "play-1", automatic: true };
    internal.replayQueue = [{ kind: "play", action, delayBefore: 100 }];
    const play = vi.fn(); sync.onPlayCard(play);
    internal.pump();
    vi.advanceTimersByTime(99); expect(play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(play).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(340 + 80 + 450 - 1); expect(internal.replaying).toBe(true);
    vi.advanceTimersByTime(1); expect(internal.replaying).toBe(false);
  });

  it("réévalue le dernier snapshot si les invités étaient déjà prêts", async () => {
    const snapshot = {
      exists: () => true,
      get: vi.fn(),
    };
    const maybeStartRematch = vi.fn().mockResolvedValue(undefined);
    const internal = sync as unknown as {
      consumedMatchId: string | null;
      latestRoomSnapshot: typeof snapshot | null;
      roomUnsub: (() => void) | null;
      maybeStartRematch: (value: typeof snapshot) => Promise<void>;
      startRound: () => Promise<void>;
    };

    internal.consumedMatchId = "match-1";
    internal.latestRoomSnapshot = snapshot;
    internal.roomUnsub = vi.fn();
    internal.maybeStartRematch = maybeStartRematch;

    await internal.startRound();

    expect(maybeStartRematch).toHaveBeenCalledOnce();
    expect(maybeStartRematch).toHaveBeenCalledWith(snapshot);
  });

  it("retire les joueurs éliminés et expose les pouvoirs privés du joueur", () => {
    const internal = sync as unknown as {
      match: Record<string, unknown>;
      hand: Array<Record<string, unknown>>;
      equippedPowers: string[];
      players: () => Array<{ name: string; equippedPowers?: string[] }>;
    };
    internal.hand = [{ id: "card-1", rank: "3", value: 3, suit: "♠", color: "#111" }];
    internal.equippedPowers = ["power-test"];
    internal.match = {
      participants: [
        { uid: "host", name: "Host", emoji: "host", bot: false, crowns: 0 },
        { uid: "left", name: "Parti", emoji: "left", bot: false, crowns: 0 },
        { uid: "guest", name: "Invité", emoji: "guest", bot: false, crowns: 0 },
      ],
      eliminatedUids: ["left"],
      handCounts: { host: 1, left: 0, guest: 2 },
      deposits: {},
    };

    const players = internal.players();

    expect(players.map((player) => player.name)).toEqual(["Host", "Invité"]);
    expect(players[0].equippedPowers).toEqual(["power-test"]);
  });
});
