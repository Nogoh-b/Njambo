import { beforeEach, describe, expect, it, vi } from "vitest";

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
      trickPause: 2_200,
      powerBeat: 900,
    },
  },
}));

import { AuthoritativeGameSync } from "../sync/AuthoritativeGameSync";

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
