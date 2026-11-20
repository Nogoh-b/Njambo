import { describe, expect, it } from "vitest";
import { DEFAULT_EVENTS } from "../domain";
import { resolveEventOutcome } from "../lib/eventOutcome";

const mboa = DEFAULT_EVENTS.find((event) => event.eventId === "defi_du_mboa")!;

describe("resolveEventOutcome", () => {
  it("détecte une table validée et donne la récompense de la table franchie", () => {
    const outcome = resolveEventOutcome(mboa, { stageIndex: 1, losses: 0 }, { status: "active", stageIndex: 2, losses: 0 });
    expect(outcome).toEqual({ kind: "advance", stageIndex: 1, losses: 0, rewards: mboa.stages[1].reward });
  });

  it("détecte une vie perdue sans perte de progression", () => {
    const outcome = resolveEventOutcome(mboa, { stageIndex: 2, losses: 1 }, { status: "active", stageIndex: 2, losses: 2 });
    expect(outcome).toEqual({ kind: "life_lost", stageIndex: 2, losses: 2 });
  });

  it("détecte l'élimination", () => {
    const outcome = resolveEventOutcome(mboa, { stageIndex: 2, losses: 2 }, { status: "eliminated", stageIndex: 2, losses: 3 });
    expect(outcome?.kind).toBe("eliminated");
  });

  it("détecte le grand prix avec récompense de table + récompense finale", () => {
    const last = mboa.stages.length - 1;
    const outcome = resolveEventOutcome(mboa, { stageIndex: last, losses: 1 }, { status: "completed", stageIndex: last, losses: 1 });
    expect(outcome).toEqual({ kind: "completed", stageIndex: last, losses: 1, rewards: [...mboa.stages[last].reward, ...mboa.finalReward] });
  });

  it("ne renvoie rien tant que le serveur n'a pas réglé la partie", () => {
    expect(resolveEventOutcome(mboa, { stageIndex: 1, losses: 1 }, { status: "active", stageIndex: 1, losses: 1 })).toBeNull();
    expect(resolveEventOutcome(mboa, { stageIndex: 1, losses: 1 }, { status: "matchmaking", stageIndex: 1, losses: 1 })).toBeNull();
  });
});

describe("points de classement dans les conséquences", () => {
  it("expose les points gagnés quand le run porte un score", () => {
    const outcome = resolveEventOutcome(mboa, { stageIndex: 1, losses: 0, score: 100 }, { status: "active", stageIndex: 2, losses: 0, score: 200 });
    expect(outcome).toMatchObject({ kind: "advance", pointsGained: 100 });
  });
  it("n'invente pas de points sans classement", () => {
    const outcome = resolveEventOutcome(mboa, { stageIndex: 1, losses: 0 }, { status: "active", stageIndex: 2, losses: 0 });
    expect(outcome && "pointsGained" in outcome).toBe(false);
  });
});

describe("parcours parfait dans les conséquences", () => {
  it("ajoute le bonus parfait et marque la variante", () => {
    const event = { ...mboa, perfectRun: { reward: [{ type: "cauris" as const, amount: 33 }] } };
    const last = event.stages.length - 1;
    const outcome = resolveEventOutcome(event, { stageIndex: last, losses: 0 }, { status: "completed", stageIndex: last, losses: 0, perfect: true });
    expect(outcome).toMatchObject({ kind: "completed", perfect: true });
    expect(outcome && "rewards" in outcome ? outcome.rewards.at(-1) : null).toEqual({ type: "cauris", amount: 33 });
  });
});
