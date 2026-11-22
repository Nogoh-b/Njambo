import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ANIMS_V2, DEFAULT_ANIMS_V2_BY_ID } from "../engine/anim/v2/defaults";
import { momentIssuesForAnimV2, validateMoments } from "../engine/anim/moments";
import { getMomentAnimV2, getMotif, momentMap, setMotifCatalog } from "../engine/anim/registry";
import type { AnimV2 } from "../engine/anim/v2/model";
import { getAnimV2, isAnimV2Archived, listAnimsV2, setAnimV2Catalog } from "../engine/anim/v2/registry";

const custom: AnimV2 = { ...DEFAULT_ANIMS_V2_BY_ID.v2_fluide, id: "v2_maison", name: "Maison" };
const withMotion = (model: AnimV2, durationMs: number): AnimV2 => ({ ...model, motion: { ...model.motion, durationMs } });

afterEach(() => {
  setAnimV2Catalog([]);
  setMotifCatalog([], 0, [], {});
});

describe("registre des modèles V2 (catalogue publié)", () => {
  it("sans catalogue : les modèles par défaut", () => {
    expect(listAnimsV2().map((model) => model.id)).toEqual(DEFAULT_ANIMS_V2.map((model) => model.id));
  });

  it("le catalogue complète les modèles par défaut et en remplace un de même identifiant", () => {
    setAnimV2Catalog([custom, withMotion(DEFAULT_ANIMS_V2_BY_ID.v2_rapide, 380)]);
    expect(getAnimV2("v2_maison")?.name).toBe("Maison");
    expect(getAnimV2("v2_rapide")?.motion.durationMs).toBe(380);
    expect(getAnimV2("v2_arc")).not.toBeNull();
  });

  it("un modèle archivé sort de la bibliothèque mais reste jouable", () => {
    setAnimV2Catalog([custom], ["v2_maison"]);
    expect(isAnimV2Archived("v2_maison")).toBe(true);
    expect(listAnimsV2().some((model) => model.id === "v2_maison")).toBe(false);
    expect(listAnimsV2({ includeArchived: true }).some((model) => model.id === "v2_maison")).toBe(true);
    expect(getAnimV2("v2_maison")).not.toBeNull();
  });

  it("un moment peut viser un modèle V2 publié (chargé avant l'attribution)", () => {
    expect(validateMoments({ play: "v2:v2_maison" }, getMotif).map((issue) => issue.path)).toEqual(["moments.play"]);
    setAnimV2Catalog([custom]);
    expect(validateMoments({ play: "v2:v2_maison" }, getMotif)).toEqual([]);
    setMotifCatalog([], 1, [], { play: "v2:v2_maison" });
    expect(momentMap()).toEqual({ play: "v2:v2_maison" });
    expect(getMomentAnimV2("play")?.name).toBe("Maison");
  });

  it("catalogue chargé dans le mauvais ordre : la référence est écartée (animation d'origine)", () => {
    setMotifCatalog([], 1, [], { play: "v2:v2_maison" });
    expect(momentMap()).toEqual({});
  });
});

describe("publication d'un modèle V2 attribué à un moment", () => {
  it("une version trop longue pour « Carte jouée » est signalée, avec le nom du moment", () => {
    const issues = momentIssuesForAnimV2({ play: "v2:v2_fluide" }, withMotion(DEFAULT_ANIMS_V2_BY_ID.v2_fluide, 1_200));
    expect(issues.map((issue) => issue.path)).toEqual(["moments.play"]);
    expect(issues[0].message).toContain("Carte jouée");
  });

  it("la distribution garde le rythme du jeu : aucune durée n'y est refusée", () => {
    expect(momentIssuesForAnimV2({ deal: "v2:v2_fluide" }, withMotion(DEFAULT_ANIMS_V2_BY_ID.v2_fluide, 1_200))).toEqual([]);
  });

  it("un modèle que personne n'utilise, ou une version qui tient, passe", () => {
    expect(momentIssuesForAnimV2({ play: "v2:v2_rapide" }, withMotion(DEFAULT_ANIMS_V2_BY_ID.v2_fluide, 1_200))).toEqual([]);
    expect(momentIssuesForAnimV2({ play: "v2:v2_fluide" }, withMotion(DEFAULT_ANIMS_V2_BY_ID.v2_fluide, 880))).toEqual([]);
  });

  it("les autres moments de l'attribution ne sont pas mis en cause", () => {
    const issues = momentIssuesForAnimV2({ play: "v2:v2_fluide", trickWin: "inconnu", deal: "v2:inexistant" }, withMotion(DEFAULT_ANIMS_V2_BY_ID.v2_fluide, 600));
    expect(issues).toEqual([]);
  });
});
