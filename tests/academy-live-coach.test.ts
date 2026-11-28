import { afterEach, describe, expect, it, vi } from "vitest";
import { GAME_CONFIG } from "../config/gameConfig";
import { ACADEMY_TEXTS_FR } from "../data/academy/fr";
import { advisedCard, finalLine, liveTip, playerView } from "../engine/academy/liveCoach";
import { legalCards } from "../engine/rules";
import { CoachDirector, readingMs } from "../lib/academy/coachDirector";
import { finalGameConfig } from "../lib/academy/finalGame";
import { matchCountFor } from "../domain/gameplayConfig";
import type { Card, GameState, Player } from "../types/game";

afterEach(() => vi.useRealTimers());

const card = (value: number, suit: string): Card => ({ id: `${value}${suit}`, rank: String(value), value, suit, color: "#1e1e1e" });
const player = (hand: Card[], deposit: Card[] = [], isYou = false): Player => ({ name: isYou ? "Toi" : "Bot", emoji: "x", balance: 0, isYou, hand, deposit });

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: "turns", trickNo: 1, trickPlays: [], leaderIdx: 0, turnIdx: 0, pot: 0, dominantIdx: null, banner: "",
    players: [
      player([card(9, "♥"), card(4, "♥"), card(7, "♦")], [], true),
      player([card(10, "♥"), card(3, "♠"), card(8, "♣")]),
      player([card(5, "♥"), card(6, "♠"), card(9, "♣")]),
    ],
    ...overrides,
  };
}

describe("coach en direct : ce que voit le joueur", () => {
  it("ne garde que la main du joueur et les cartes posées, jamais les mains adverses", () => {
    const view = playerView(state({ trickPlays: [{ playerIdx: 2, card: card(8, "♥") }], turnIdx: 0 }));
    expect(view.hand.map((c) => c.id)).toEqual(["9♥", "4♥", "7♦"]);
    expect(JSON.stringify(view)).not.toContain("10♥"); // main de Mado
    expect(view).toMatchObject({ ledSuit: "♥", bestInTrick: 8, yourTurn: true });
  });

  it("ne voit pas son tour quand le pli est complet ou que c'est à un autre", () => {
    expect(playerView(state({ turnIdx: 1 })).yourTurn).toBe(false);
    expect(playerView(state({ phase: "trickEnd" })).yourTurn).toBe(false);
  });

  it("dit chaque conseil une fois : au début, à l'avant-dernier pli, au dernier", () => {
    const said = new Set<string>();
    const at = (trickNo: number) => {
      const tip = liveTip(playerView(state({ trickNo })), said);
      if (tip) said.add(tip);
      return tip;
    };
    expect(at(1)).toBe("live.start");
    expect(at(2)).toBeNull();
    expect(at(GAME_CONFIG.cardsPerPlayer - 1)).toBe("live.beforeLast");
    expect(at(GAME_CONFIG.cardsPerPlayer)).toBe("live.lastTrick");
    expect(at(GAME_CONFIG.cardsPerPlayer)).toBeNull();
    for (const key of said) expect(ACADEMY_TEXTS_FR).toHaveProperty(key);
  });

  it("conseille comme l'IA « hard » du jeu, avec les seules cartes vues, et rien quand ce n'est pas au joueur", () => {
    const trick = { trickPlays: [{ playerIdx: 2, card: card(8, "♥") }] };
    // Le 10♥ n'est pas encore sorti : le 9♥ n'est pas sûr de gagner, on garde sa carte et on joue bas.
    const unsure = playerView(state(trick));
    expect(legalCards(unsure.hand, "♥")).toContain(advisedCard(unsure));
    expect(unsure.hand[advisedCard(unsure)!].id).toBe("4♥");
    // Le 10♥ est déjà tombé (dépôt visible) : le 9♥ est imbattable, il prend le pli.
    const base = state(trick);
    base.players[2] = { ...base.players[2], deposit: [card(10, "♥")] };
    const sure = playerView(base);
    expect(sure.hand[advisedCard(sure)!].id).toBe("9♥");
    expect(advisedCard(playerView(state({ turnIdx: 1 })))).toBeNull();
  });

  it("choisit la réplique de fin selon le résultat", () => {
    expect(finalLine({ type: "lastTrick", winnerIdx: 0, doubles: false })).toBe("final.win");
    expect(finalLine({ type: "lastTrick", winnerIdx: 0, doubles: true })).toBe("final.winDouble");
    expect(finalLine({ type: "lastTrick", winnerIdx: 2, doubles: false })).toBe("final.lose");
    expect(finalLine({ type: "instant", winnerIdx: 0, doubles: true, reason: "exact21" })).toBe("final.instant.win.exact21");
    expect(finalLine({ type: "instant", winnerIdx: 1, doubles: false, reason: "flush" })).toBe("final.instant.lose");
    for (const key of ["final.instant.win.under21", "final.instant.win.exact21", "final.instant.win.flush", "final.realGame"]) {
      expect(ACADEMY_TEXTS_FR).toHaveProperty(key);
    }
  });
});

describe("partie de fin d'Académie", () => {
  it("se joue en une manche, sans chrono, quels que soient les réglages", () => {
    const series = structuredClone(GAME_CONFIG);
    series.matchesByMode.bot[3] = 3;
    const cfg = finalGameConfig(series);
    expect(cfg.unlimitedTurnsBot).toBe(true);
    expect(matchCountFor(cfg, "bot", 3)).toBe(1);
    expect(series.matchesByMode.bot[3]).toBe(3); // la config du jeu n'est pas touchée
  });
});

describe("directeur du coach en vraie partie", () => {
  function director() {
    vi.useFakeTimers();
    const coach = new CoachDirector();
    const controls = { cfg: GAME_CONFIG, hold: vi.fn(), retry: vi.fn(), skip: vi.fn(), finish: vi.fn() };
    coach.start(controls);
    return { coach, controls };
  }

  it("donne un conseil sans voile ni pause, qui s'efface seul", () => {
    const { coach, controls } = director();
    coach.tip("live.beforeLast");
    expect(coach.getSnapshot()).toMatchObject({ veil: false, line: { blocking: false, text: ACADEMY_TEXTS_FR["live.beforeLast"] } });
    expect(controls.hold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(readingMs(ACADEMY_TEXTS_FR["live.beforeLast"]));
    expect(coach.getSnapshot().line).toBeNull();
  });

  it("finit la partie : résultat, puis ce qui change en vraie partie avec « Rejouer » et « Continuer »", () => {
    const { coach } = director();
    coach.finale("final.win", "final.realGame");
    expect(coach.getSnapshot()).toMatchObject({ line: { text: ACADEMY_TEXTS_FR["final.win"], blocking: true }, end: null });
    coach.next();
    expect(coach.getSnapshot()).toMatchObject({ end: { outcome: "done" }, line: { text: expect.stringContaining(`${GAME_CONFIG.turnSeconds} s par tour`) } });
    coach.tip("live.start"); // plus de conseil une fois la partie finie
    expect(coach.getSnapshot().line?.text).toContain("par tour");
  });
});
