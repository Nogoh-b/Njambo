import { describe, expect, it } from "vitest";
import { DEFAULT_ANIMS_V2, DEFAULT_ANIMS_V2_BY_ID } from "../engine/anim/v2/defaults";
import { ANIM_V2_SCHEMA, animV2Timeline, normalizeAnimV2, validateAnimV2, type AnimV2 } from "../engine/anim/v2/model";
import { fanPose, pilePose, stackPose, type ZonePose } from "../engine/anim/v2/pose";
import { animV2Controls, sampleAnimV2, shortestTurn } from "../engine/anim/v2/sample";

const paths = (value: unknown) => validateAnimV2(value, "a").map((issue) => issue.path);
const fluide = DEFAULT_ANIMS_V2_BY_ID.v2_fluide;
const withPatch = (patch: (model: AnimV2) => void) => { const copy = JSON.parse(JSON.stringify(fluide)) as AnimV2; patch(copy); return copy; };

describe("modèle V2", () => {
  it("les 3 modèles par défaut sont valides, uniques et survivent au stockage JSON", () => {
    expect(DEFAULT_ANIMS_V2).toHaveLength(3);
    expect(new Set(DEFAULT_ANIMS_V2.map((model) => model.id)).size).toBe(3);
    for (const model of DEFAULT_ANIMS_V2) {
      expect(validateAnimV2(model), model.id).toEqual([]);
      expect(validateAnimV2(JSON.parse(JSON.stringify(model))), model.id).toEqual([]);
    }
  });

  it("un export du prototype se normalise en modèle valide", () => {
    const exported = {
      schema: "njambo.anim.v2", version: 1, pose: "provided-by-zones",
      motion: { durationMs: 750, curve: 0.25, easing: "smooth" },
      effects: { onLeave: "glow", onEnter: "pulse" }, handReflowMs: 600, facePolicy: "game-visibility",
    };
    const model = normalizeAnimV2(exported, { id: "proto_v2", name: "Prototype" });
    expect(validateAnimV2(model)).toEqual([]);
    expect(model).not.toHaveProperty("pose");
    expect(model.schema).toBe(ANIM_V2_SCHEMA);
  });

  it("les valeurs manquantes prennent celles du prototype", () => {
    const model = normalizeAnimV2({ id: "vide", name: "Vide" });
    expect(model.motion).toEqual({ durationMs: 750, curve: 0.25, easing: "smooth" });
    expect(model.effects).toEqual({ onLeave: "glow", onEnter: "pulse" });
    expect(model.handReflowMs).toBe(600);
  });

  it("refuse les valeurs hors bornes, avec le chemin du champ", () => {
    expect(paths(withPatch((m) => { m.motion.durationMs = 40; }))).toEqual(["a.motion.durationMs"]);
    expect(paths(withPatch((m) => { m.motion.durationMs = 3_500; }))).toEqual(["a.motion.durationMs"]);
    expect(paths(withPatch((m) => { m.motion.curve = 0.9; }))).toEqual(["a.motion.curve"]);
    expect(paths(withPatch((m) => { (m.motion as { easing: string }).easing = "rebond"; }))).toEqual(["a.motion.easing"]);
    expect(paths(withPatch((m) => { (m.effects as { onEnter: string }).onEnter = "feu"; }))).toEqual(["a.effects.onEnter"]);
    expect(paths(withPatch((m) => { m.handReflowMs = 100; }))).toEqual(["a.handReflowMs"]);
    expect(paths(withPatch((m) => { m.id = "X"; }))).toEqual(["a.id"]);
    expect(paths(withPatch((m) => { m.name = ""; }))).toEqual(["a.name"]);
    expect(paths(withPatch((m) => { (m as { schema: string }).schema = "njambo.anim.v1"; }))).toEqual(["a.schema"]);
    expect(paths(withPatch((m) => { (m as { facePolicy: string }).facePolicy = "always-front"; }))).toEqual(["a.facePolicy"]);
  });

  it("calendrier : réorganisation à 14 %, effet d'entrée à 82 %, fin des effets comprise", () => {
    const timeline = animV2Timeline(fluide);
    expect(timeline.leaveFxAt).toBe(0);
    expect(timeline.reflowAt).toBeCloseTo(105, 6);
    expect(timeline.enterFxAt).toBeCloseTo(615, 6);
    expect(timeline.landAt).toBe(750);
    expect(timeline.totalMs).toBeCloseTo(1055, 6);
    const rapide = DEFAULT_ANIMS_V2_BY_ID.v2_rapide;
    expect(animV2Timeline(rapide).totalMs).toBeCloseTo(420 * 0.82 + 440, 6);
    // « Rapide » tient sous le plafond du vol de la carte jouée (0,9 s).
    expect(rapide.motion.durationMs).toBeLessThanOrEqual(900);
  });
});

describe("vol V2", () => {
  const deck = stackPose({ center: { x: 200, y: 300 }, rotate: -6, cardWidth: 45, depth: { x: 0, y: 0 }, layers: 1 }, 0, 1);
  const handArrival = fanPose({ center: { x: 200, y: 700 }, axis: 0, cardWidth: 80, step: 40, rotStep: 8, face: 0 }, 5, 6);
  const handOut = fanPose({ center: { x: 200, y: 700 }, axis: 0, cardWidth: 80, step: 40, rotStep: 8, face: 0 }, 2, 5);
  const deposit = pilePose({ center: { x: 200, y: 520 }, cardWidth: 60, scale: 1 }, 0);
  const side = fanPose({ center: { x: 40, y: 400 }, axis: 270, cardWidth: 50, step: 25, rotStep: 8, face: 180 }, 2, 5);

  it("part exactement de la pose de départ et arrive exactement sur celle d'arrivée", () => {
    for (const model of DEFAULT_ANIMS_V2) {
      for (const [from, to] of [[deck, handArrival], [handOut, deposit], [deposit, handArrival], [side, deposit]] as Array<[ZonePose, ZonePose]>) {
        const start = sampleAnimV2(model, from, to, 0);
        const end = sampleAnimV2(model, from, to, model.motion.durationMs);
        expect(start.x).toBeCloseTo(from.x, 6);
        expect(start.y).toBeCloseTo(from.y, 6);
        expect(start.width).toBeCloseTo(from.width, 6);
        expect(start.flip).toBe(from.face);
        expect(start.pop).toBeCloseTo(1, 6);
        expect(end.x).toBeCloseTo(to.x, 6);
        expect(end.y).toBeCloseTo(to.y, 6);
        expect(end.width).toBeCloseTo(to.width, 6);
        expect(end.flip).toBe(to.face);
        expect(end.phase).toBe("landed");
        expect(((end.rotate - to.rotate) % 360 + 360) % 360).toBeCloseTo(0, 6);
      }
    }
  });

  it("phases : en attente avant le décollage, en vol, posée", () => {
    expect(sampleAnimV2(fluide, deck, handArrival, -10).phase).toBe("waiting");
    expect(sampleAnimV2(fluide, deck, handArrival, 300).phase).toBe("flying");
    expect(sampleAnimV2(fluide, deck, handArrival, 2000).phase).toBe("landed");
  });

  it("se retourne seulement si la face change (pioche de dos → main face visible)", () => {
    const mid = sampleAnimV2(fluide, deck, handArrival, 375);
    expect(mid.flip).toBeGreaterThan(0);
    expect(mid.flip).toBeLessThan(180);
    expect(sampleAnimV2(fluide, handOut, deposit, 375).flip).toBe(0);
  });

  it("grossit à mi-vol, de 10 % au plus", () => {
    expect(sampleAnimV2(fluide, deck, handArrival, 375).pop).toBeCloseTo(1.1, 6);
  });

  it("la courbure bombe le trajet sur le côté choisi ; 0 = ligne droite", () => {
    const below = { ...handArrival, x: 200 };
    const flat = withPatch((m) => { m.motion.curve = 0; });
    for (const at of [100, 375, 600]) expect(sampleAnimV2(flat, deck, below, at).x).toBeCloseTo(200, 6);
    const [c1] = animV2Controls(fluide, deck, below);
    // Vers le bas : la normale pointe vers la gauche (x négatif) ; courbure positive → bombé à gauche.
    expect(c1.x).toBeLessThan(200);
    const mirrored = withPatch((m) => { m.motion.curve = -0.25; });
    expect(animV2Controls(mirrored, deck, below)[0].x).toBeGreaterThan(200);
  });

  it("la courbure est plafonnée sur les longs trajets", () => {
    const far = { ...handArrival, x: 200, y: 5_300 };
    const wide = withPatch((m) => { m.motion.curve = 0.7; });
    const [c1] = animV2Controls(wide, deck, far);
    expect(Math.abs(c1.x - 200)).toBeCloseTo(0.7 * 245, 6);
  });

  it("tourne par le plus court chemin (siège latéral à 270° → dépôt à 0°)", () => {
    expect(shortestTurn(270, 0)).toBe(90);
    expect(shortestTurn(-16, 16)).toBe(32);
    expect(shortestTurn(10, 350)).toBe(-20);
    const end = sampleAnimV2(fluide, side, deposit, fluide.motion.durationMs);
    expect(end.rotate).toBeCloseTo(side.rotate + 90, 6);
  });

  it("un même modèle est valide sur tous les trajets (la pose ne fait pas partie du modèle)", () => {
    expect(Object.keys(fluide).sort()).toEqual(["description", "effects", "facePolicy", "handReflowMs", "id", "motion", "name", "schema", "version"]);
  });
});
