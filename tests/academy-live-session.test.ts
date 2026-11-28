import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../config/gameConfig";
import { LiveCoachSession, type CoachContext } from "../engine/academy/liveCoachSession";
import type { Card, GameState, Player, TrickPlay } from "../types/game";

const card = (value: number, suit: string): Card => ({ id: `${value}${suit}`, rank: String(value), value, suit, color: "#1e1e1e" });
const play = (playerIdx: number, value: number, suit: string): TrickPlay => ({ playerIdx, card: card(value, suit) });
const seat = (name: string, hand: Card[], deposit: Card[] = []): Player => ({ name, emoji: "x", balance: 0, isYou: name === "Toi", hand, deposit });

function table(overrides: Partial<GameState> & { hands?: Card[][]; deposits?: Card[][] } = {}): GameState {
  const hands = overrides.hands ?? [[card(9, "♥"), card(4, "♥"), card(7, "♦")], [card(3, "♠"), card(8, "♣")], [card(6, "♠"), card(9, "♣")]];
  const deposits = overrides.deposits ?? [[], [], []];
  return {
    phase: "turns", trickNo: 1, trickPlays: [], leaderIdx: 1, turnIdx: 0, pot: 0, dominantIdx: null, banner: "",
    players: ["Toi", "Mado", "Ya"].map((name, index) => seat(name, hands[index], deposits[index])),
    ...overrides,
  };
}
const guided: CoachContext = { level: "guided", mode: "solo", counters: {} };

describe("coach en direct : une partie suivie état par état", () => {
  it("conseille au tour du joueur, puis juge le conseil sur la carte posée", () => {
    const session = new LiveCoachSession();
    // Mado lance 10♥ : le joueur ne peut pas gagner.
    const turn = table({ trickPlays: [play(1, 10, "♥")], deposits: [[], [card(10, "♥")], []] });
    const said = session.turnReady(turn, guided);
    expect(said.say).toEqual({ key: "live.cannotWin", vars: {} });
    expect(said.records).toEqual([{ key: "cannotWin", event: { shown: true } }]);
    // Le joueur pose son 4♥, la plus petite : conseil appliqué.
    const after = table({
      trickPlays: [play(1, 10, "♥"), play(0, 4, "♥")],
      hands: [[card(9, "♥"), card(7, "♦")], [card(3, "♠"), card(8, "♣")], [card(6, "♠"), card(9, "♣")]],
      deposits: [[card(4, "♥")], [card(10, "♥")], []],
    });
    expect(session.observe(after, guided).records).toContainEqual({ key: "cannotWin", event: { applied: true } });
  });

  it("annonce qui gagne le pli, une seule fois", () => {
    const session = new LiveCoachSession();
    const complete = table({ trickPlays: [play(1, 10, "♥"), play(2, 6, "♥"), play(0, 4, "♥")] });
    expect(session.observe(complete, guided).say).toEqual({ key: "live.trickWon", vars: { name: "Mado", card: "10♥", you: 0 } });
    expect(session.observe(complete, guided).say).toBeUndefined();
  });

  it("valide « gagne l'avant-dernier pli » quand le joueur le gagne", () => {
    const session = new LiveCoachSession();
    const beforeLast = GAME_CONFIG.cardsPerPlayer - 1;
    expect(session.turnReady(table({ trickNo: beforeLast }), guided).say?.key).toBe("live.beforeLast");
    const won = session.observe(table({ trickNo: beforeLast, trickPlays: [play(0, 9, "♥"), play(1, 3, "♠"), play(2, 6, "♠")] }), guided);
    expect(won.records).toContainEqual({ key: "beforeLast", event: { applied: true } });
  });

  it("contre d'autres joueurs : règle courte, jamais de carte conseillée (D10, D11)", () => {
    const session = new LiveCoachSession();
    const turn = table({ trickPlays: [play(1, 8, "♥")] });
    const versus = session.turnReady(turn, { ...guided, mode: "versus" });
    expect(versus.say?.key).toBe("live.mustFollow.short");
    expect(versus.advise).toBeUndefined();
    expect(new LiveCoachSession().turnReady(turn, guided).advise).toBeDefined();
    expect(new LiveCoachSession().turnReady(turn, { ...guided, level: "tips" }).advise).toBeUndefined();
  });

  it("chrono bas : une alerte par tour, jamais sans chrono", () => {
    const session = new LiveCoachSession();
    const turn = table({ trickPlays: [play(1, 8, "♥")] });
    expect(session.timer(turn, 6, { ...guided, unlimited: false }).say).toBeUndefined();
    expect(session.timer(turn, 5, { ...guided, unlimited: false }).say).toEqual({ key: "live.lowTimer", vars: { seconds: 5 } });
    expect(session.timer(turn, 4, { ...guided, unlimited: false }).say).toBeUndefined();
    expect(new LiveCoachSession().timer(turn, 3, { ...guided, unlimited: true }).say).toBeUndefined();
  });

  it("pouvoir subi : ce que fait la carte, compteur propre à la carte", () => {
    const actions = new LiveCoachSession().power({ id: "coupe_circuit", name: "Coupe-Circuit", description: "Force un adversaire à jouer sa carte légale la plus faible." }, "Mado", guided);
    expect(actions.say).toEqual({ key: "live.power", vars: { power: "Coupe-Circuit", name: "Mado", effect: "force un adversaire à jouer sa carte légale la plus faible." } });
    expect(actions.records).toEqual([{ key: "power:coupe_circuit", event: { shown: true } }]);
  });

  it("propose « Conseils » au premier tour après 5 victoires, à la place du conseil", () => {
    const actions = new LiveCoachSession().turnReady(table(), { ...guided, levelUpPending: true, wins: 5 });
    expect(actions).toMatchObject({ say: { key: "live.levelUp", vars: { wins: 5 } }, levelUpSaid: true });
  });

  it("se tait quand le coach est désactivé, et repart de zéro à chaque donne", () => {
    const off = new LiveCoachSession().turnReady(table({ trickPlays: [play(1, 10, "♥")] }), { ...guided, level: "off" });
    expect(off.say).toBeUndefined();
    const session = new LiveCoachSession();
    const complete = table({ trickPlays: [play(1, 10, "♥"), play(2, 6, "♥"), play(0, 4, "♥")] });
    session.observe(complete, guided);
    session.observe(table({ phase: "dealing" }), guided);
    expect(session.observe(complete, guided).say?.key).toBe("live.trickWon");
  });
});
