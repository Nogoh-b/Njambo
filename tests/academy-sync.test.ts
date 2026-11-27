import { afterEach, describe, expect, it, vi } from "vitest";
import { GAME_CONFIG } from "../config/gameConfig";
import { CH1_FOLLOW, CH4_DIRECT } from "../data/academy/scenes";
import { AcademyGameSync, type AcademySceneEvent } from "../sync/AcademyGameSync";
import type { AcademyScene } from "../engine/academy/types";
import type { Card, GameState, PowerCardActivation } from "../types/game";

afterEach(() => vi.useRealTimers());

function setup(scene: AcademyScene) {
  vi.useFakeTimers();
  const cfg = structuredClone(GAME_CONFIG);
  cfg.anim.replayBotThinkMin = cfg.anim.replayBotThinkMax = 100;
  const events: AcademySceneEvent[] = [];
  const states: GameState[] = [];
  const plays: { playerIdx: number; card: Card }[] = [];
  const powers: PowerCardActivation[] = [];
  const sync = new AcademyGameSync({
    scene, cfg, profile: { name: "Amina", emoji: "amina", balance: 1234 },
    onBanner: vi.fn(), onSceneEvent: (event) => events.push(event),
  });
  sync.onStateUpdate((state) => states.push(state));
  sync.onPlayCard((play) => plays.push(play));
  sync.onPowerActivated((activation) => powers.push(activation));
  const last = () => states[states.length - 1];
  const handIdx = (id: string) => last().players[0].hand.findIndex((card) => card.id === id);
  /** Laisse les bots jouer jusqu'au prochain coup attendu du joueur (ou la fin). */
  const settle = () => vi.advanceTimersByTime(20_000);
  return { sync, cfg, events, states, plays, powers, last, handIdx, settle };
}

describe("partie de l'Académie (AcademyGameSync)", () => {
  it("démarre mains servies, sans donne, sans chrono ni mise", () => {
    const { sync, states } = setup(CH1_FOLLOW);
    sync.start();
    expect(states.some((state) => state.phase === "dealing")).toBe(false);
    expect(states[0]).toMatchObject({ phase: "turns", trickNo: 1, turnIdx: 1, pot: 0, unlimitedTurns: true });
    expect(states[0].players[0]).toMatchObject({ name: "Amina", emoji: "amina", balance: 1234, isYou: true });
    expect(states[0].players.map((player) => player.hand.length)).toEqual([5, 5, 5]);
    sync.destroy();
  });

  it("joue le chapitre 1 : bots au rythme du jeu, refus expliqué, pli gagné", () => {
    const { sync, cfg, events, plays, last, handIdx, settle } = setup(CH1_FOLLOW);
    sync.start();
    vi.advanceTimersByTime(99);
    expect(plays).toHaveLength(0); // Mado réfléchit
    settle();
    expect(plays.map((play) => play.card.id)).toEqual(["8♠", "10♠"]);
    expect(events.at(-1)).toMatchObject({ type: "awaitYou", expect: { kind: "card", card: "4♥" } });

    sync.playCard(handIdx("9♥"));
    expect(plays).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: "refused", reason: "wrongCard", coach: "ch1.pli1.wrong9", message: undefined });

    sync.playCard(handIdx("4♥"));
    expect(plays.at(-1)?.card.id).toBe("4♥");
    expect(last()).toMatchObject({ phase: "trickEnd", dominantIdx: 2 });
    // Comme LocalGameSync : le pli reste affiché le temps de la plus longue des deux pauses.
    const { trickPause, dropFlight, landSettle, botAfterPlay } = cfg.anim;
    vi.advanceTimersByTime(Math.max(trickPause, dropFlight + landSettle + botAfterPlay) - 1);
    expect(events).not.toContainEqual({ type: "trickEnd", winnerIdx: 2 });
    vi.advanceTimersByTime(1);
    expect(events).toContainEqual({ type: "trickEnd", winnerIdx: 2 });

    settle();
    sync.playCard(handIdx("9♥"));
    settle();
    expect(events).toContainEqual({ type: "coach", key: "ch1.pli2.madoDefausse" });
    expect(events.at(-1)).toMatchObject({ type: "end", outcome: "success", coach: "ch1.success" });
    sync.destroy();
  });

  it("ignore le joueur pendant que sa carte atterrit", () => {
    const { sync, plays, handIdx, settle } = setup(CH1_FOLLOW);
    sync.start();
    settle();
    sync.playCard(handIdx("4♥"));
    sync.playCard(0);
    expect(plays.map((play) => play.card.id)).toEqual(["8♠", "10♠", "4♥"]);
    sync.destroy();
  });

  it("active le pouvoir du joueur puis lui laisse poser sa carte (geste 1)", () => {
    const { sync, events, powers, last, handIdx, settle } = setup(CH4_DIRECT);
    sync.start();
    settle();
    sync.playCard(handIdx("8♥"));
    expect(events.at(-1)).toMatchObject({ type: "refused", reason: "powerFirst", coach: "ch4.direct.wrong" });
    sync.usePowerCard("eclair_mfoundi");
    expect(powers).toEqual([expect.objectContaining({ cardId: "eclair_mfoundi", activatedByUid: "local", used: true })]);
    expect(events.at(-1)).toMatchObject({ type: "awaitYou", expect: { kind: "card", card: "8♥" } });
    sync.playCard(handIdx("8♥"));
    settle();
    expect(last().players[0].deposit[0]).toMatchObject({ id: "8♥", effectiveValue: 10 });
    expect(events.at(-1)).toMatchObject({ type: "end", outcome: "success" });
    sync.destroy();
  });

  it("rejoue la scène depuis son état figé", () => {
    const { sync, last, handIdx, settle } = setup(CH1_FOLLOW);
    sync.start();
    settle();
    sync.playCard(handIdx("4♥"));
    settle();
    sync.nextRound();
    expect(last()).toMatchObject({ trickNo: 1, turnIdx: 1, trickPlays: [] });
    expect(last().players[0].hand.map((card) => card.id)).toEqual(CH1_FOLLOW.deal[0]);
    sync.destroy();
  });
});
