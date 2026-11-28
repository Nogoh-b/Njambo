import { beforeEach, describe, expect, it } from "vitest";
import { ACADEMY_CHAPTERS, BASICS_COURSE, chapterDone } from "../data/academy/course";
import { academyProgress } from "../lib/academy/academyProgress";

describe("hub de l'Académie", () => {
  beforeEach(() => academyProgress.reset());

  it("enchaîne les chapitres jouables dans l'ordre pour « Je découvre »", () => {
    expect(BASICS_COURSE.map((step) => step.id)).toEqual(["ch1", "ch2", "ch3", "ch3-what-if", "ch3-challenge", "final-game"]);
    expect(ACADEMY_CHAPTERS.filter((chapter) => chapter.soon).map((chapter) => chapter.id)).toEqual(["ch4"]);
  });

  it("valide un chapitre seulement quand toutes ses étapes sont finies", () => {
    const ch3 = ACADEMY_CHAPTERS.find((chapter) => chapter.id === "ch3")!;
    academyProgress.stepDone("ch3");
    academyProgress.stepDone("ch3-what-if");
    expect(chapterDone(ch3, academyProgress.getSnapshot().steps)).toBe(false);
    academyProgress.stepDone("ch3-challenge");
    expect(chapterDone(ch3, academyProgress.getSnapshot().steps)).toBe(true);
  });

  it("ne valide jamais un chapitre « bientôt », même vide", () => {
    const ch4 = ACADEMY_CHAPTERS.find((chapter) => chapter.id === "ch4")!;
    expect(chapterDone(ch4, {})).toBe(false);
  });

  it("garde la date de la première fois et prévient le hub", () => {
    let calls = 0;
    const unsubscribe = academyProgress.subscribe(() => { calls += 1; });
    academyProgress.stepDone("ch1");
    const first = academyProgress.getSnapshot().steps.ch1;
    academyProgress.stepDone("ch1");
    expect(academyProgress.getSnapshot().steps.ch1).toBe(first);
    expect(calls).toBe(1);
    unsubscribe();
  });
});
