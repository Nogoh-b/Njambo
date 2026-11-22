import { afterEach, describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../config/gameConfig";
import { DEFAULT_ANIMS_V2_BY_ID } from "../engine/anim/v2/defaults";
import {
  ANIM_V2_MOMENTS, encodeMomentPreview, isV2Ref, momentAnimV2, momentDurationV2, parseMomentPreview, v2IdOf, v2Ref, validateMoments,
} from "../engine/anim/moments";
import {
  getMomentAnimV2, getMomentMotif, getMotif, getStyledMomentMotif, momentMap, momentPreviewMap, setMomentPreview, setMotifCatalog,
} from "../engine/anim/registry";
import type { AnimV2 } from "../engine/anim/v2/model";

const paths = (map: unknown, lookupV2?: (id: string) => AnimV2 | null) => validateMoments(map, getMotif, lookupV2).map((issue) => issue.path);
const slow: AnimV2 = { ...DEFAULT_ANIMS_V2_BY_ID.v2_arc, id: "v2_lent", motion: { ...DEFAULT_ANIMS_V2_BY_ID.v2_arc.motion, durationMs: 1_200 } };
const withSlow = (id: string) => (id === "v2_lent" ? slow : DEFAULT_ANIMS_V2_BY_ID[id] ?? null);

afterEach(() => {
  setMomentPreview(null);
  setMotifCatalog([], 0, [], {});
});

describe("références V2 dans l'attribution des moments", () => {
  it("préfixe v2: (l'ancien format reste un identifiant V1 seul)", () => {
    expect(v2Ref("v2_fluide")).toBe("v2:v2_fluide");
    expect(isV2Ref("v2:v2_fluide")).toBe(true);
    expect(isV2Ref("play_classic")).toBe(false);
    expect(isV2Ref(undefined)).toBe(false);
    expect(v2IdOf("v2:v2_fluide")).toBe("v2_fluide");
  });

  it("seuls les vrais déplacements (carte jouée, distribution) acceptent la V2", () => {
    expect(ANIM_V2_MOMENTS).toEqual(["play", "deal"]);
    expect(paths({ play: "v2:v2_fluide", deal: "v2:v2_arc" })).toEqual([]);
    expect(paths({ trickWin: "v2:v2_fluide" })).toEqual(["moments.trickWin"]);
    expect(paths({ trickCollect: "v2:v2_fluide" })).toEqual(["moments.trickCollect"]);
    expect(paths({ powerLaunch: "v2:v2_fluide" })).toEqual(["moments.powerLaunch"]);
  });

  it("refuse un modèle V2 inconnu", () => {
    expect(paths({ play: "v2:inexistant" })).toEqual(["moments.play"]);
  });

  it("plafond de la carte jouée (vol ≤ 0,9 s) ; la distribution garde le rythme du jeu", () => {
    expect(paths({ play: "v2:v2_lent" }, withSlow)).toEqual(["moments.play"]);
    expect(paths({ deal: "v2:v2_lent" }, withSlow)).toEqual([]);
    expect(momentDurationV2("deal", slow)).toBe(GAME_CONFIG.anim.dealFlight);
    expect(momentAnimV2("deal", slow).motion.durationMs).toBe(GAME_CONFIG.anim.dealFlight);
    expect(momentAnimV2("play", slow)).toBe(slow);
  });

  it("V1 et V2 se mélangent dans une même attribution", () => {
    expect(paths({ play: "v2:v2_rapide", trickWin: "trick_win_glow", deal: "deal" })).toEqual([]);
  });
});

describe("aperçu dans une partie (?apercuMoments=)", () => {
  it("lit les références V2 et l'ancien format", () => {
    expect(parseMomentPreview("play:v2:v2_fluide,deal:deal")).toEqual({ play: "v2:v2_fluide", deal: "deal" });
    expect(parseMomentPreview("play:play_classic")).toEqual({ play: "play_classic" });
  });

  it("ignore les entrées mal formées", () => {
    expect(parseMomentPreview("play:v2:X!,deal:v2:,inconnu:v2:v2_fluide,trickWin")).toEqual({});
  });

  it("aller-retour avec encodeMomentPreview", () => {
    const map = { play: "v2:v2_fluide", deal: "v2:v2_arc", trickWin: "trick_win_glow" };
    expect(parseMomentPreview(encodeMomentPreview(map))).toEqual(map);
  });
});

describe("registre : bascule origine / V1 / V2", () => {
  it("sans attribution : animation d'origine partout", () => {
    expect(getMomentAnimV2("play")).toBeNull();
    expect(getMomentMotif("play")).toBeNull();
  });

  it("un moment en V2 ne renvoie pas de modèle V1, et inversement", () => {
    setMomentPreview({ play: "v2:v2_fluide", deal: "deal" });
    expect(getMomentAnimV2("play")?.id).toBe("v2_fluide");
    expect(getMomentMotif("play")).toBeNull();
    expect(getMomentAnimV2("deal")).toBeNull();
    expect(getMomentMotif("deal")?.id).toBe("deal");
  });

  it("un joueur stylé ne prend pas le « vol actuel » quand la carte jouée est en V2", () => {
    const style = { trail: "sparks", tone: "pink", impact: "burst" } as const;
    expect(getStyledMomentMotif("play", style)?.id).toBe("play_classic");
    setMomentPreview({ play: "v2:v2_fluide" });
    expect(getStyledMomentMotif("play", style)).toBeNull();
  });

  it("distribution en V2 : vol au rythme du jeu", () => {
    setMomentPreview({ deal: "v2:v2_arc" });
    expect(getMomentAnimV2("deal")?.motion.durationMs).toBe(GAME_CONFIG.anim.dealFlight);
    expect(getMomentAnimV2("deal")?.motion.curve).toBe(DEFAULT_ANIMS_V2_BY_ID.v2_arc.motion.curve);
  });

  it("l'aperçu écarte les entrées refusées (V2 sur un moment sur place, modèle inconnu)", () => {
    expect(setMomentPreview({ play: "v2:v2_fluide", trickWin: "v2:v2_fluide", deal: "v2:inexistant" })).toEqual({ play: "v2:v2_fluide" });
    expect(momentPreviewMap()).toEqual({ play: "v2:v2_fluide" });
  });

  it("catalogue publié : les références V2 valides sont gardées, les autres ignorées", () => {
    setMotifCatalog([], 3, [], { play: "v2:v2_rapide", deal: "v2:inexistant", trickWin: "v2:v2_fluide", trickCollect: "trick_end_settle" });
    expect(momentMap()).toEqual({ play: "v2:v2_rapide", trickCollect: "trick_end_settle" });
    expect(getMomentAnimV2("play")?.id).toBe("v2_rapide");
  });

  it("retour en arrière : la même attribution repasse en V1 sans rechargement", () => {
    setMomentPreview({ play: "v2:v2_fluide" });
    expect(getMomentAnimV2("play")).not.toBeNull();
    setMomentPreview({ play: "play_classic" });
    expect(getMomentAnimV2("play")).toBeNull();
    expect(getMomentMotif("play")?.id).toBe("play_classic");
    setMomentPreview(null);
    expect(getMomentMotif("play")).toBeNull();
  });
});
