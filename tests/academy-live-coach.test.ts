import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_CONFIG } from "../config/gameConfig";
import { ACADEMY_TEXTS_FR } from "../data/academy/fr";
import {
  adviceAllowed,
  advisedCard,
  finalLine,
  LIVE_TIPS,
  pickTip,
  playerView,
  RETIRE_AFTER,
  tipTextKey,
  trickWonSituation,
  turnSituations,
  updateCounter,
  voids,
  type CoachMode,
  type LiveTipId,
  type Situation,
} from "../engine/academy/liveCoach";
import { legalCards } from "../engine/rules";
import { CoachDirector, readingMs } from "../lib/academy/coachDirector";
import { coachPrefs, LEVEL_UP_WINS } from "../lib/academy/coachPrefs";
import { finalGameConfig } from "../lib/academy/finalGame";
import { matchCountFor } from "../domain/gameplayConfig";
import type { Card, GameState, Player, TrickPlay } from "../types/game";

afterEach(() => vi.useRealTimers());

const card = (value: number, suit: string): Card => ({ id: `${value}${suit}`, rank: String(value), value, suit, color: "#1e1e1e" });
const player = (hand: Card[], deposit: Card[] = [], isYou = false): Player => ({ name: isYou ? "Toi" : "Bot", emoji: "x", balance: 0, isYou, hand, deposit });
const play = (playerIdx: number, value: number, suit: string): TrickPlay => ({ playerIdx, card: card(value, suit) });

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
const ids = (situations: Situation[]) => situations.map((situation) => situation.id);
const pick = (situations: Situation[], level: "guided" | "tips" | "off", mode: CoachMode, counters = {}) => pickTip(situations, { level, mode, counters })?.id ?? null;

describe("coach en direct : ce que voit le joueur", () => {
  it("ne garde que la main du joueur et les cartes posées, jamais les mains adverses", () => {
    const view = playerView(state({ trickPlays: [play(2, 8, "♥")] }));
    expect(view.hand.map((c) => c.id)).toEqual(["9♥", "4♥", "7♦"]);
    expect(JSON.stringify(view)).not.toContain("10♥"); // main de Mado
    expect(view).toMatchObject({ ledSuit: "♥", bestInTrick: 8, yourTurn: true, players: 3 });
  });

  it("ne voit pas son tour quand le pli est complet ou que c'est à un autre", () => {
    expect(playerView(state({ turnIdx: 1 })).yourTurn).toBe(false);
    expect(playerView(state({ phase: "trickEnd" })).yourTurn).toBe(false);
  });

  it("repère qui n'a plus une couleur, d'après les plis vus", () => {
    const history = [[play(0, 4, "♣"), play(1, 3, "♠"), play(2, 5, "♦")], [play(1, 9, "♠"), play(2, 8, "♠"), play(0, 7, "♠")]];
    const known = voids(history);
    expect(known.get(1)?.get("♣")).toBe(1);
    expect(known.get(2)?.get("♣")).toBe(1);
    expect(known.get(0)).toBeUndefined();
  });
});

describe("coach en direct : situations du tour", () => {
  it("tu dois suivre et tu peux gagner, au plus juste", () => {
    const situations = turnSituations(playerView(state({ trickPlays: [play(2, 8, "♥")] })), "solo");
    expect(ids(situations)).toEqual(["canWin", "mustFollow"]);
    expect(situations[0].vars.card).toBe("9♥");
    expect(situations[1].vars).toMatchObject({ suit: "♥", suitName: "Cœur" });
  });

  it("tu ne peux pas gagner : appliqué si la plus petite carte part", () => {
    const situations = turnSituations(playerView(state({ trickPlays: [play(2, 10, "♥")] })), "solo");
    expect(ids(situations)).toEqual(["cannotWin", "mustFollow"]);
    expect(situations[0].applied?.(card(4, "♥"))).toBe(true);
    expect(situations[0].applied?.(card(9, "♥"))).toBe(false);
  });

  it("tu lances ; avant-dernier et dernier pli", () => {
    expect(ids(turnSituations(playerView(state()), "solo"))).toEqual(["leading"]);
    expect(ids(turnSituations(playerView(state({ trickNo: GAME_CONFIG.cardsPerPlayer - 1 })), "solo"))[0]).toBe("beforeLast");
    expect(ids(turnSituations(playerView(state({ trickNo: GAME_CONFIG.cardsPerPlayer })), "solo"))[0]).toBe("lastTrick");
  });

  it("dernier pli avec un 3 : seulement si les deux adversaires ont montré qu'ils n'ont plus sa couleur", () => {
    const last = GAME_CONFIG.cardsPerPlayer;
    const base = state({ trickNo: last, players: [player([card(3, "♣")], [], true), player([card(9, "♦")]), player([card(8, "♠")])] });
    const bothVoid = [[play(0, 4, "♣"), play(1, 3, "♠"), play(2, 5, "♦")], [play(1, 9, "♠"), play(2, 7, "♣"), play(0, 7, "♠")]];
    const safe = turnSituations(playerView(base, GAME_CONFIG, bothVoid), "solo");
    expect(safe[0]).toMatchObject({ id: "threeSafe", vars: { card: "3♣", suitName: "Trèfle", trick: 1 } });
    // Ya a suivi le Trèfle au 2e pli : rien ne prouve qu'elle n'en a plus.
    const oneVoid = [[play(0, 4, "♣"), play(1, 3, "♠"), play(2, 5, "♣")]];
    expect(ids(turnSituations(playerView(base, GAME_CONFIG, oneVoid), "solo"))).not.toContain("threeSafe");
  });

  it("fin de pli : qui gagne, avec quelle carte", () => {
    const won = trickWonSituation([play(1, 8, "♠"), play(2, 10, "♠"), play(0, 4, "♥")], ["Toi", "Mado", "Ya"]);
    expect(won).toMatchObject({ id: "trickWon", vars: { name: "Ya", card: "10♠", you: 0 } });
    expect(tipTextKey(won!, "solo")).toBe("live.trickWon");
    const mine = trickWonSituation([play(0, 9, "♥"), play(1, 3, "♦")], ["Toi", "Mado"]);
    expect(tipTextKey(mine!, "solo")).toBe("live.trickWon.you");
  });
});

describe("coach en direct : qui dit quoi", () => {
  const follow = turnSituations(playerView(state({ trickPlays: [play(2, 10, "♥")] })), "solo"); // cannotWin, mustFollow

  it("« Accompagné » dit tout, « Conseils » seulement l'important, « Désactivé » rien", () => {
    expect(pick(follow, "guided", "solo")).toBe("cannotWin");
    expect(pick(turnSituations(playerView(state()), "solo"), "tips", "solo")).toBeNull(); // « tu lances » : Accompagné seulement
    expect(pick(follow, "tips", "solo")).toBe("cannotWin");
    expect(pick(follow, "off", "solo")).toBeNull();
  });

  it("contre d'autres joueurs : règles seulement, en version courte (D10)", () => {
    expect(pick(follow, "guided", "versus")).toBe("mustFollow");
    const chosen = pickTip(follow, { level: "guided", mode: "versus", counters: {} })!;
    expect(tipTextKey(chosen, "versus")).toBe("live.mustFollow.short");
    for (const [id, spec] of Object.entries(LIVE_TIPS)) {
      if (spec.versus) expect(["mustFollow", "leading", "power", "lowTimer"]).toContain(id);
    }
  });

  it("se retire : 3 applications de suite pour un conseil d'action, 3 affichages pour une information (D12)", () => {
    let counter = updateCounter(undefined, { applied: true });
    counter = updateCounter(counter, { applied: true });
    expect(pick(follow, "guided", "solo", { cannotWin: counter })).toBe("cannotWin");
    expect(updateCounter(counter, { applied: false }).streak).toBe(0);
    counter = updateCounter(counter, { applied: true });
    expect(counter.streak).toBe(RETIRE_AFTER);
    expect(pick(follow, "guided", "solo", { cannotWin: counter })).toBe("mustFollow");
    expect(pick(follow, "guided", "solo", { cannotWin: counter, mustFollow: { shown: RETIRE_AFTER, streak: 0 } })).toBeNull();
  });

  it("carte conseillée seulement en partie de fin et en Solo IA « Accompagné » (D11)", () => {
    expect(adviceAllowed("guided", "academy")).toBe(true);
    expect(adviceAllowed("guided", "solo")).toBe(true);
    expect(adviceAllowed("tips", "solo")).toBe(false);
    expect(adviceAllowed("guided", "versus")).toBe(false);
  });

  it("conseille comme l'IA « hard » du jeu, avec les seules cartes vues, et rien quand ce n'est pas au joueur", () => {
    const trick = { trickPlays: [play(2, 8, "♥")] };
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
});

describe("coach en direct : textes", () => {
  it("a une phrase pour chaque conseil, et une version courte (10 mots au plus) contre d'autres joueurs", () => {
    for (const [id, spec] of Object.entries(LIVE_TIPS) as [LiveTipId, (typeof LIVE_TIPS)[LiveTipId]][]) {
      expect(ACADEMY_TEXTS_FR).toHaveProperty(`live.${id}`);
      if (spec.versus) {
        const short = ACADEMY_TEXTS_FR[`live.${id}.short` as keyof typeof ACADEMY_TEXTS_FR];
        expect(short).toBeDefined();
        expect(short.split(/\s+/).length).toBeLessThanOrEqual(10);
      }
    }
    expect(ACADEMY_TEXTS_FR).toHaveProperty("live.trickWon.you");
    expect(ACADEMY_TEXTS_FR).toHaveProperty("live.levelUp");
  });

  it("choisit la réplique de fin selon le résultat", () => {
    expect(finalLine({ type: "lastTrick", winnerIdx: 0, doubles: false })).toBe("final.win");
    expect(finalLine({ type: "lastTrick", winnerIdx: 0, doubles: true })).toBe("final.winDouble");
    expect(finalLine({ type: "lastTrick", winnerIdx: 2, doubles: false })).toBe("final.lose");
    expect(finalLine({ type: "instant", winnerIdx: 0, doubles: true, reason: "exact21" })).toBe("final.instant.win.exact21");
    expect(finalLine({ type: "instant", winnerIdx: 1, doubles: false, reason: "flush" })).toBe("final.instant.lose");
  });
});

describe("préférences du coach", () => {
  beforeEach(() => coachPrefs.reset());

  it("un joueur sans réglage commence en « Conseils » ; l'Académie le passe en « Accompagné »", () => {
    expect(coachPrefs.getSnapshot().level).toBe("tips");
    coachPrefs.guideNewcomer();
    expect(coachPrefs.getSnapshot().level).toBe("guided");
  });

  it("respecte le choix du joueur", () => {
    coachPrefs.setLevel("off");
    coachPrefs.guideNewcomer();
    expect(coachPrefs.getSnapshot()).toMatchObject({ level: "off", chosen: true });
  });

  it("propose « Conseils » une fois, après 5 parties gagnées en « Accompagné »", () => {
    coachPrefs.guideNewcomer();
    for (let win = 1; win < LEVEL_UP_WINS; win += 1) coachPrefs.win();
    expect(coachPrefs.getSnapshot().levelUp).toBe("none");
    coachPrefs.win();
    expect(coachPrefs.getSnapshot()).toMatchObject({ wins: LEVEL_UP_WINS, levelUp: "pending" });
    coachPrefs.levelUpSaid();
    coachPrefs.win();
    expect(coachPrefs.getSnapshot().levelUp).toBe("said");
  });

  it("compte les affichages et les applications de chaque conseil", () => {
    coachPrefs.record("cannotWin", { shown: true });
    coachPrefs.record("cannotWin", { applied: true });
    expect(coachPrefs.getSnapshot().counters.cannotWin).toEqual({ shown: 1, streak: 1 });
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
    coach.start(controls, { live: true });
    return { coach, controls };
  }

  it("donne un conseil avec ses valeurs, sans voile ni pause, qui s'efface seul", () => {
    const { coach, controls } = director();
    expect(coach.getSnapshot().live).toBe(true);
    coach.tip("live.mustFollow", { suit: "♥", suitName: "Cœur" });
    const text = "Tendance ♥ : tu dois jouer du Cœur.";
    expect(coach.getSnapshot()).toMatchObject({ veil: false, line: { blocking: false, text } });
    expect(controls.hold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(readingMs(text));
    expect(coach.getSnapshot().line).toBeNull();
  });

  it("finit la partie de l'Académie : résultat, puis ce qui change en vraie partie avec « Rejouer » et « Continuer »", () => {
    const { coach } = director();
    coach.finale("final.win", "final.realGame");
    expect(coach.getSnapshot()).toMatchObject({ line: { text: ACADEMY_TEXTS_FR["final.win"], blocking: true }, end: null });
    coach.next();
    expect(coach.getSnapshot()).toMatchObject({ end: { outcome: "done" }, line: { text: expect.stringContaining(`${GAME_CONFIG.turnSeconds} s par tour`) } });
    coach.tip("live.leading"); // plus de conseil une fois la partie finie
    expect(coach.getSnapshot().line?.text).toContain("par tour");
  });
});
