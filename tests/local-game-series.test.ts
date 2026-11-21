import { afterEach, describe, expect, it, vi } from "vitest";
import { GAME_CONFIG } from "../config/gameConfig";
import { LocalGameSync } from "../sync/LocalGameSync";
import { BOTS } from "../data/mock";
import type { GameState, Player, WinInfo } from "../types/game";

vi.mock("@/config/devConfig", () => ({ DEV: { unlimitedTime: false, unlimitedPowers: false, enabled: false } }));

afterEach(() => vi.useRealTimers());
const card = (value: number) => ({ id: `${value}♠`, value, rank: String(value), suit: "♠", color: "black" });

function setup(total = 3) {
  vi.useFakeTimers();
  const cfg = structuredClone(GAME_CONFIG);
  cfg.instantWin.enabled = false;
  cfg.matchesByMode.bot[2] = total;
  cfg.anim.replayBotThinkMin = cfg.anim.replayBotThinkMax = 100;
  const onResult = vi.fn();
  const sync = new LocalGameSync({ cfg, profile: { name: "Toi", emoji: "you", balance: 5000, equippedPowers: [] }, bots: BOTS, mise: 100, initialBotCount: 1, difficulty: "easy", onResult, onBanner: vi.fn(), onUpdateBalance: vi.fn() });
  const internal = sync as unknown as { players: Player[]; phase: string; turnIdx: number; seriesRound: number; resolveWin: (players: Player[], winner: number, info: WinInfo) => void; stopAllTimers: () => void; scheduleBotTurn: () => void };
  sync.start();
  return { sync, internal, onResult, cfg };
}

describe("séries locales", () => {
  it("redistribue sans redébiter et règle le pot une fois pour le gagnant de la série", () => {
    const { sync, internal, onResult } = setup();
    const info: WinInfo = { type: "lastTrick", winnerIdx: 0, doubles: false, lastCard: card(10) };
    internal.resolveWin(internal.players, 0, info);
    expect(onResult).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2200);
    expect(internal.seriesRound).toBe(2);
    expect(internal.players[0].balance).toBe(4900);
    expect(internal.players.every((player) => player.hand.length === 5)).toBe(true);
    internal.resolveWin(internal.players, 0, info);
    vi.advanceTimersByTime(2200);
    internal.resolveWin(internal.players, 1, { ...info, winnerIdx: 1 });
    expect(onResult).toHaveBeenCalledOnce();
    expect(onResult.mock.calls[0][0]).toMatchObject({ winnerIdx: 0, gain: 200, series: { total: 3, scores: [2, 1] } });
    expect(internal.players[0].balance).toBe(5100);
    sync.destroy();
  });
  it("attend avant le coup IA et laisse la carte atterrir avant le prochain tour", () => {
    const { sync, internal, cfg } = setup(1);
    internal.stopAllTimers();
    internal.phase = "turns"; internal.turnIdx = 1;
    internal.players[1].hand = [card(3)];
    const play = vi.fn(); const states: GameState[] = [];
    sync.onPlayCard(play); sync.onStateUpdate((state) => states.push(state));
    internal.scheduleBotTurn();
    vi.advanceTimersByTime(99);
    expect(play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(play).toHaveBeenCalledOnce();
    expect(states.at(-1)?.phase).toBe("trickEnd");
    vi.advanceTimersByTime(cfg.anim.dropFlight + cfg.anim.landSettle + cfg.anim.botAfterPlay - 1);
    expect(states.at(-1)?.phase).toBe("trickEnd");
    vi.advanceTimersByTime(1);
    expect(states.at(-1)?.phase).toBe("turns");
    sync.destroy();
  });
});
