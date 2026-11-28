import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../config/gameConfig";
import { ACADEMY_TEXTS_FR } from "../data/academy/fr";
import {
  ACADEMY_SCENES,
  CH3_CHALLENGE_SAFE_THREE,
  CH3_CHALLENGE_UNSAFE_THREE,
  CH1_FOLLOW,
  CH2_LEAD,
  CH3_LAST_TRICK,
  CH3_WHAT_IF,
  CH4_CHOICE,
  CH4_DEFENSE,
  CH4_DIRECT,
  CH4_TARGETED,
} from "../data/academy/scenes";
import { BASICS_COURSE, stepScene } from "../data/academy/course";
import { playScene, solutionMove, type MovePolicy, type YourMove } from "../engine/academy/run";
import type { AcademyTable } from "../engine/academy/table";
import { playInOrder, validateScene } from "../engine/academy/validate";
import type { AcademyScene } from "../engine/academy/types";

/** Joue la solution, sauf au coup `actionIndex` où le joueur fait `move`. */
const deviate = (actionIndex: number, move: YourMove): MovePolicy => (expect, table: AcademyTable) =>
  (table.actionIndex === actionIndex ? move : solutionMove(expect, table));

const played = (scene: AcademyScene, seat: number) => playScene(scene).events
  .flatMap(({ event }) => (event.type === "play" && event.play.playerIdx === seat ? [event.play.card.id] : []));

describe("scènes de l'Académie", () => {
  it.each(ACADEMY_SCENES.map((scene) => [scene.id, scene] as const))("%s est valide et se gagne avec sa solution", (_, scene) => {
    expect(validateScene(scene, GAME_CONFIG, ACADEMY_TEXTS_FR)).toEqual([]);
    expect(playScene(scene).outcome).toBe(scene.goal === "watch" ? "done" : "success");
  });

  it("chapitre 2 reprend exactement la fin du chapitre 1", () => {
    const tricks = playScene(CH1_FOLLOW).events.flatMap(({ event }) => (event.type === "play" ? [event.play.card.id] : []));
    expect(CH2_LEAD.deal).toEqual(CH1_FOLLOW.deal);
    expect(CH2_LEAD.history?.flat()).toEqual(tricks);
  });

  it("chapitre 1 : une mauvaise carte est refusée avec la bonne réplique", () => {
    expect(playScene(CH1_FOLLOW, GAME_CONFIG, deviate(2, { card: "9♥" })).refusal).toMatchObject({ reason: "wrongCard", coach: "ch1.pli1.wrong9" });
    expect(playScene(CH1_FOLLOW, GAME_CONFIG, deviate(2, { card: "7♦" })).refusal).toMatchObject({ reason: "wrongCard", coach: "ch1.pli1.wrong" });
    expect(playScene(CH1_FOLLOW, GAME_CONFIG, deviate(4, { card: "5♥" })).refusal).toMatchObject({ reason: "wrongCard", coach: "ch1.pli2.wrong5" });
    // Au pli 2, le Cœur est demandé : le 7♦ n'est pas jouable.
    expect(playScene(CH1_FOLLOW, GAME_CONFIG, deviate(4, { card: "7♦" })).refusal).toMatchObject({ reason: "illegal" });
  });

  it("chapitre 2 : seul le 5♥ gagne, les autres couleurs perdent le pli", () => {
    expect(playScene(CH2_LEAD, GAME_CONFIG, deviate(0, { card: "7♦" })).outcome).toBe("failure");
    expect(playScene(CH2_LEAD, GAME_CONFIG, deviate(0, { card: "6♣" })).outcome).toBe("failure");
    expect(played(CH2_LEAD, 1)).toEqual(["7♠"]); // Mado n'a plus de Cœur : elle se défausse
    expect(played(CH2_LEAD, 2)).toEqual(["3♥"]); // Ya doit suivre avec son 3♥
  });

  it("chapitre 3 : le 3 gagne le dernier pli et double ; il fallait suivre au pli 4", () => {
    const run = playScene(CH3_LAST_TRICK);
    expect(run.table.roundEnd).toMatchObject({ winnerIdx: 0, doubles: true, lastCard: { id: "3♣" } });
    expect(playScene(CH3_LAST_TRICK, GAME_CONFIG, deviate(2, { card: "3♣" })).refusal).toMatchObject({ reason: "illegal" });
  });

  it("chapitre 3, « Et si ? » : Mado suit le Trèfle et bat le 3", () => {
    const run = playScene(CH3_WHAT_IF);
    expect(run.outcome).toBe("done");
    expect(run.table.roundEnd).toMatchObject({ winnerIdx: 1, doubles: false, lastCard: { id: "5♣" } });
  });

  it("défi « le 3 passe » : 6♥, 10♦ puis 3♣ gagne doublé ; commencer par le 10♦ perd", () => {
    const run = playScene(CH3_CHALLENGE_SAFE_THREE);
    expect(run.outcome).toBe("success");
    expect(run.table.roundEnd).toMatchObject({ winnerIdx: 0, doubles: true, lastCard: { id: "3♣" } });
    expect(playScene(CH3_CHALLENGE_SAFE_THREE, GAME_CONFIG, playInOrder(["10♦", "6♥", "3♣"])).outcome).toBe("failure");
  });

  it("défi « le 3 ne passe pas » : garder le 10♦ gagne, garder le 3 pour la fin perd", () => {
    const run = playScene(CH3_CHALLENGE_UNSAFE_THREE);
    expect(run.table.roundEnd).toMatchObject({ winnerIdx: 0, lastCard: { id: "10♦" } });
    expect(playScene(CH3_CHALLENGE_UNSAFE_THREE, GAME_CONFIG, playInOrder(["6♥", "10♦", "3♣"])).outcome).toBe("failure");
  });

  it("un défi libre se joue jusqu'au dernier pli, coup par coup", () => {
    const run = playScene(CH3_CHALLENGE_SAFE_THREE);
    const yours = run.events.filter(({ event }) => event.type === "play" && event.play.playerIdx === 0);
    expect(yours.map(({ event }) => (event.type === "play" ? event.play.card.id : ""))).toEqual(["6♥", "10♦", "3♣"]);
    // Chaque coup a son propre numéro : le coach annonce chaque tour du joueur.
    expect(new Set(yours.map(({ actionIndex }) => actionIndex)).size).toBe(3);
  });

  it("le parcours des bases enchaîne des scènes valides, titre en tête de chaque chapitre", () => {
    expect(BASICS_COURSE.map((step) => step.id)).toEqual(["ch1", "ch2", "ch3", "ch3-what-if", "ch3-challenge"]);
    for (const step of BASICS_COURSE) {
      for (const scene of step.scenes) expect(validateScene(scene, GAME_CONFIG, ACADEMY_TEXTS_FR)).toEqual([]);
    }
    expect(BASICS_COURSE.filter((step) => step.title).map((step) => step.title?.kicker)).toEqual(["Chapitre 1", "Chapitre 2", "Chapitre 3", "Défi"]);
    const challenge = BASICS_COURSE[4];
    expect(stepScene(challenge, 0)).toBe(CH3_CHALLENGE_SAFE_THREE);
    expect(stepScene(challenge, 0.99)).toBe(CH3_CHALLENGE_UNSAFE_THREE);
  });

  it("geste 1 : sans l'Éclair, le 8♥ est refusé ; avec, il compte 10 et gagne", () => {
    expect(playScene(CH4_DIRECT, GAME_CONFIG, deviate(2, { card: "8♥" })).refusal).toMatchObject({ reason: "powerFirst", coach: "ch4.direct.wrong" });
    const run = playScene(CH4_DIRECT);
    expect(run.table.state().players[0].deposit[0]).toMatchObject({ id: "8♥", effectiveValue: 10 });
  });

  it("geste 2 : Coupe-Circuit sur Ya l'oblige à jouer son 4♠ ; viser Mado est refusé", () => {
    expect(playScene(CH4_TARGETED, GAME_CONFIG, deviate(0, { power: "coupe_circuit", target: 1 })).refusal)
      .toMatchObject({ reason: "wrongTarget", coach: "ch4.cible.wrongTarget" });
    expect(played(CH4_TARGETED, 2)).toEqual(["4♠"]);
  });

  it("geste 3 : Troc Ciblé échange le 4♦ contre le 10♥ de la pioche ; une autre carte est refusée", () => {
    expect(playScene(CH4_CHOICE, GAME_CONFIG, deviate(2, { power: "troc_cible", choose: { give: ["3♠"] } })).refusal)
      .toMatchObject({ reason: "wrongChoice", coach: "ch4.choix.wrongChoice" });
    expect(played(CH4_CHOICE, 0)).toEqual(["10♥"]);
  });

  it("geste 4 : le Bouclier arrête le Coupe-Circuit de Mado ; sans lui, le 4♠ serait imposé", () => {
    const run = playScene(CH4_DEFENSE);
    const madoPower = run.events.find(({ event }) => event.type === "power" && event.seat === 1)?.event;
    expect(madoPower).toMatchObject({ activation: { cardId: "coupe_circuit", blockedByCardId: "bouclier_village", used: true } });
    expect(played(CH4_DEFENSE, 0)).toEqual(["5♦", "9♠"]);

    const unprotected: AcademyScene = { ...CH4_DEFENSE, actions: CH4_DEFENSE.actions.filter((action) => !("power" in action && action.seat === 0)) };
    expect(validateScene(unprotected)).toEqual([expect.objectContaining({ message: expect.stringContaining("wrongCard") })]);
  });
});
