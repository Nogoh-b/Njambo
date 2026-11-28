import { afterEach, describe, expect, it, vi } from "vitest";
import { GAME_CONFIG } from "../config/gameConfig";
import { ACADEMY_TEXTS_FR } from "../data/academy/fr";
import { CoachDirector, HINT_DELAY_MS, readingMs, TITLE_MS, type CoachControls } from "../lib/academy/coachDirector";
import { placeBubble, type Box } from "../lib/academy/placement";
import { coachText, coachValues } from "../lib/academy/texts";
import type { YourExpectation } from "../engine/academy/types";

afterEach(() => vi.useRealTimers());

function setup() {
  vi.useFakeTimers();
  const holds: boolean[] = [];
  const controls: CoachControls = {
    cfg: GAME_CONFIG,
    hold: (on) => holds.push(on),
    retry: vi.fn(),
    skip: vi.fn(),
    finish: vi.fn(),
  };
  const director = new CoachDirector();
  director.start(controls);
  return { director, controls, holds, view: () => director.getSnapshot() };
}

const expectCard: YourExpectation = {
  kind: "card",
  card: "4♥",
  coach: { before: ["ch1.pli1.tendance", "ch1.pli1.defausse"], wrong: { "9♥": "ch1.pli1.wrong9" } },
};

describe("textes du coach", () => {
  it("insère les valeurs de la partie au lieu de chiffres en dur", () => {
    expect(coachText("ch3.pli4.gagne", GAME_CONFIG)).toBe(`Gagne ce pli : tu lanceras le ${GAME_CONFIG.cardsPerPlayer}e.`);
    expect(coachText("ch3.pli4.pourquoi", { ...GAME_CONFIG, cardsPerPlayer: 4 })).toContain("Les 3 premiers plis");
  });

  it("n'utilise que des valeurs connues", () => {
    const known = Object.keys(coachValues(GAME_CONFIG));
    for (const text of Object.values(ACADEMY_TEXTS_FR)) {
      for (const [, name] of text.matchAll(/\{(\w+)\}/g)) expect(known).toContain(name);
    }
  });
});

describe("placement de la bulle", () => {
  const view = { width: 375, height: 812 };
  const size = { width: 340, height: 80 };
  const intersects = (a: Box, b: Box) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

  it("se place au-dessus de la cible, dans l'écran", () => {
    const target = { left: 150, top: 700, width: 60, height: 90 };
    const box = placeBubble(view, size, [target]);
    expect(intersects(box, target)).toBe(false);
    expect(box.top + box.height).toBeLessThanOrEqual(target.top);
    expect(box.left).toBeGreaterThanOrEqual(12);
    expect(box.left + box.width).toBeLessThanOrEqual(view.width - 12);
  });

  it("ne cache ni la cible ni la main, et laisse libre le haut de l'écran", () => {
    const card = { left: 150, top: 700, width: 60, height: 90 };
    const hand = { left: 90, top: 690, width: 200, height: 110 };
    const box = placeBubble(view, size, [card, hand], 12, 92);
    expect(intersects(box, card) || intersects(box, hand)).toBe(false);
    expect(box.top).toBeGreaterThanOrEqual(92);
  });

  it("passe dessous quand la cible est en haut de l'écran", () => {
    const deposit = { left: 40, top: 100, width: 80, height: 110 };
    const box = placeBubble(view, size, [deposit], 12, 92);
    expect(box.top).toBeGreaterThanOrEqual(deposit.top + deposit.height);
  });
});

describe("directeur du coach", () => {
  it("dit les répliques en pause, puis ouvre le coup avec le projecteur sur la carte", () => {
    const { director, holds, view } = setup();
    director.dispatch({ type: "awaitYou", expect: expectCard, trick: [1, 2] });
    expect(holds.at(-1)).toBe(true);
    expect(view()).toMatchObject({ veil: true, focus: ["deposit:1", "deposit:2"], line: { blocking: true, text: ACADEMY_TEXTS_FR["ch1.pli1.tendance"] } });

    director.next(); // « Suivant »
    expect(view().line?.text).toBe(ACADEMY_TEXTS_FR["ch1.pli1.defausse"]);
    vi.advanceTimersByTime(readingMs(ACADEMY_TEXTS_FR["ch1.pli1.defausse"]));

    expect(holds.at(-1)).toBe(false);
    expect(view()).toMatchObject({ focus: ["card:4♥"], line: { blocking: false, text: ACADEMY_TEXTS_FR["ch1.pli1.defausse"] } });
  });

  it("fait trembler la carte refusée et explique, puis s'efface quand le coup est accepté", () => {
    const { director, view } = setup();
    director.dispatch({ type: "awaitYou", expect: { kind: "card", card: "4♥" }, trick: [] });
    director.dispatch({ type: "refused", reason: "wrongCard", coach: "ch1.pli1.wrong9", cardId: "9♥" });
    expect(view()).toMatchObject({ shake: { cardId: "9♥" }, line: { text: ACADEMY_TEXTS_FR["ch1.pli1.wrong9"], blocking: false } });
    const firstShake = view().shake?.nonce;
    director.dispatch({ type: "refused", reason: "wrongCard", coach: "ch1.pli1.wrong9", cardId: "9♥" });
    expect(view().shake?.nonce).not.toBe(firstShake);

    director.dispatch({ type: "accepted" });
    expect(view()).toMatchObject({ line: null, focus: [], veil: false });
  });

  it("montre l'indice si le joueur hésite", () => {
    const { director, view } = setup();
    director.dispatch({ type: "awaitYou", expect: { kind: "free", solution: "5♥", coach: { hint: "ch2.hint" } }, trick: [] });
    expect(view().focus).toEqual(["hand"]);
    vi.advanceTimersByTime(HINT_DELAY_MS - 1);
    expect(view().line).toBeNull();
    vi.advanceTimersByTime(1);
    expect(view().line?.text).toBe(ACADEMY_TEXTS_FR["ch2.hint"]);
  });

  it("dit une réplique liée à un coup en regardant le dépôt du joueur, puis rend la main à la scène", () => {
    const { director, holds, view } = setup();
    director.dispatch({ type: "coach", key: "ch1.pli2.madoDefausse", seat: 1, source: "play" });
    expect(view()).toMatchObject({ focus: ["deposit:1"], line: { blocking: true } });
    vi.advanceTimersByTime(readingMs(ACADEMY_TEXTS_FR["ch1.pli2.madoDefausse"]));
    expect(holds).toEqual([true, false]);
    expect(view()).toMatchObject({ line: null, veil: false });
  });

  it("propose « Réessayer ce pli » après un défi raté, « Continuer » après une réussite", () => {
    const { director, controls, view } = setup();
    director.dispatch({ type: "end", outcome: "failure", roundEnd: null, coach: "ch2.failure" });
    expect(view()).toMatchObject({ end: { outcome: "failure" }, line: { text: ACADEMY_TEXTS_FR["ch2.failure"] } });
    director.retry();
    expect(controls.retry).toHaveBeenCalledOnce();
    expect(view()).toMatchObject({ active: true, end: null, line: null });

    director.dispatch({ type: "end", outcome: "success", roundEnd: null, coach: "ch2.success" });
    director.finish();
    expect(controls.finish).toHaveBeenCalledWith("success");
  });

  it("ouvre un chapitre par son titre, scène en pause, puis laisse parler la scène", () => {
    vi.useFakeTimers();
    const holds: boolean[] = [];
    const director = new CoachDirector();
    director.start({ cfg: GAME_CONFIG, hold: (on) => holds.push(on), retry: vi.fn(), skip: vi.fn(), finish: vi.fn() }, { title: { kicker: "Chapitre 1", title: "Suis la tendance" } });
    expect(director.getSnapshot()).toMatchObject({ title: { kicker: "Chapitre 1" }, veil: true, line: null });
    expect(holds).toEqual([true]);
    director.dispatch({ type: "coach", key: "ch3.recap" });
    expect(director.getSnapshot().line).toBeNull(); // la réplique attend la fin du titre
    vi.advanceTimersByTime(TITLE_MS);
    expect(director.getSnapshot()).toMatchObject({ title: null, line: { text: ACADEMY_TEXTS_FR["ch3.recap"] } });
  });

  it("disparaît quand la scène quitte l'écran", () => {
    const { director, view } = setup();
    director.dispatch({ type: "awaitYou", expect: expectCard, trick: [] });
    director.stop();
    expect(view()).toMatchObject({ active: false, line: null });
    director.dispatch({ type: "coach", key: "ch1.success" });
    expect(view().active).toBe(false);
  });
});
