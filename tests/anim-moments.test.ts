import { afterEach, describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../config/gameConfig";
import { DEFAULT_MOTIFS, DEFAULT_MOTIFS_BY_ID } from "../engine/anim/defaults";
import {
  GAME_MOMENT_KEYS, encodeMomentPreview, momentDurationMs, momentIssuesForMotif, momentMotif, motifFitsMoment, parseMomentPreview, validateMoments,
  type MomentMap,
} from "../engine/anim/moments";
import { motifTotalMs, normalizeMotif, type AnimMotif } from "../engine/anim/motif";
import {
  getMomentMotif, getMotif, momentMap, momentPreviewMap, motifRegistryVersion, setMomentPreview, setMotifCatalog, subscribeMotifCatalog,
} from "../engine/anim/registry";

const motif = (id: string, patch: Partial<AnimMotif> = {}): AnimMotif => normalizeMotif({ ...JSON.parse(JSON.stringify(DEFAULT_MOTIFS_BY_ID[id])), ...patch });
const lookupWith = (...extra: AnimMotif[]) => (id: string) => extra.find((item) => item.id === id) ?? DEFAULT_MOTIFS_BY_ID[id] ?? null;
const paths = (map: unknown, lookup = lookupWith()) => validateMoments(map, lookup).map((issue) => issue.path);

/** Attribution « tout le jeu » avec les modèles par défaut. */
const FULL: MomentMap = { play: "play_classic", deal: "deal", trickWin: "trick_win_glow", trickCollect: "trick_end_settle", powerLaunch: "launch_ability" };

afterEach(() => {
  setMomentPreview(null);
  setMotifCatalog([], 0, [], {});
});

describe("moments du jeu", () => {
  it("chaque moment a au moins un modèle par défaut compatible, et l'attribution complète est valide", () => {
    for (const moment of GAME_MOMENT_KEYS) {
      expect(DEFAULT_MOTIFS.some((item) => motifFitsMoment(moment, item)), moment).toBe(true);
    }
    expect(validateMoments(FULL, getMotif)).toEqual([]);
    expect(validateMoments({}, getMotif)).toEqual([]);
  });

  it("le départ (et l'arrivée) sont imposés par le moment", () => {
    expect(motifFitsMoment("play", DEFAULT_MOTIFS_BY_ID.play)).toBe(true);
    expect(motifFitsMoment("play", DEFAULT_MOTIFS_BY_ID.draw)).toBe(false);
    expect(motifFitsMoment("play", motif("play", { to: { zone: "center" } }))).toBe(false);
    // Fin de pli : sur place, sur chaque dépôt (les règles ne ramassent pas le pli, les cartes restent sur leur pile).
    expect(motifFitsMoment("trickCollect", DEFAULT_MOTIFS_BY_ID.trick_end_settle)).toBe(true);
    expect(motifFitsMoment("trickCollect", motif("trick_end_settle", { to: { zone: "avatar", player: "winner" } }))).toBe(false);
    expect(motifFitsMoment("trickCollect", motif("trick_end_settle", { to: { zone: "offscreen", side: "top" } }))).toBe(false);
    expect(motifFitsMoment("trickCollect", DEFAULT_MOTIFS_BY_ID.deposit_eject)).toBe(false);
  });

  it("la durée qui compte : vol d'une carte, ou animation entière (une carte par joueur en fin de pli)", () => {
    const play = motif("play", { durationMs: 610 });
    expect(momentDurationMs("play", play)).toBe(610);
    const collect = DEFAULT_MOTIFS_BY_ID.trick_end_settle;
    expect(momentDurationMs("trickCollect", collect)).toBe(motifTotalMs(collect, 4));
    expect(momentDurationMs("trickCollect", collect)).toBeGreaterThan(collect.durationMs);
  });

  it("la distribution garde le rythme du jeu, les autres moments celui du modèle", () => {
    const deal = momentMotif("deal", motif("deal", { staggerMs: 300, durationMs: 1200 }));
    expect(deal.staggerMs).toBe(GAME_CONFIG.anim.dealPerCard);
    expect(deal.durationMs).toBe(GAME_CONFIG.anim.dealFlight);
    const play = DEFAULT_MOTIFS_BY_ID.play;
    expect(momentMotif("play", play)).toBe(play);
  });

  it("refuse une attribution mal formée, avec le chemin du moment", () => {
    expect(paths([])).toEqual(["moments"]);
    expect(paths(null)).toEqual(["moments"]);
    expect(paths({ pioche: "draw" })).toEqual(["moments.pioche"]);
    expect(paths({ play: 12 })).toEqual(["moments.play"]);
    expect(paths({ play: "modele_inexistant" })).toEqual(["moments.play"]);
    expect(paths({ play: "draw" })).toEqual(["moments.play"]);
    expect(paths({ powerLaunch: "play" })).toEqual(["moments.powerLaunch"]);
  });

  it("refuse un modèle trop long pour son moment", () => {
    const slow = motif("play", { id: "vol_lent", durationMs: 1200 });
    const issues = validateMoments({ play: "vol_lent" }, lookupWith(slow));
    expect(issues.map((issue) => issue.path)).toEqual(["moments.play"]);
    expect(issues[0].message).toContain("900 ms");
    const longLaunch = motif("launch_ability", { id: "lancer_lent", count: 3, staggerMs: 600, durationMs: 800 });
    expect(paths({ powerLaunch: "lancer_lent" }, lookupWith(longLaunch))).toEqual(["moments.powerLaunch"]);
  });

  it("pli gagné puis fin de pli doivent tenir ensemble dans la pause de fin de pli", () => {
    const longWin = motif("trick_win_glow", { id: "eclat_long", durationMs: 500, reactions: [] });
    const lookup = lookupWith(longWin);
    expect(momentDurationMs("trickWin", longWin)).toBeLessThanOrEqual(GAME_CONFIG.anim.trickPause);
    expect(paths({ trickWin: "eclat_long" }, lookup)).toEqual([]);
    expect(paths({ trickCollect: "trick_end_settle" }, lookup)).toEqual([]);
    expect(paths({ trickWin: "eclat_long", trickCollect: "trick_end_settle" }, lookup)).toEqual(["moments.trickCollect"]);
    // Les deux modèles par défaut tiennent ensemble.
    expect(momentDurationMs("trickWin", DEFAULT_MOTIFS_BY_ID.trick_win_glow) + momentDurationMs("trickCollect", DEFAULT_MOTIFS_BY_ID.trick_end_settle)).toBeLessThanOrEqual(GAME_CONFIG.anim.trickPause);
  });
});

describe("publication d'un modèle attribué à un moment", () => {
  it("signale la nouvelle version qui ne convient plus au moment", () => {
    const map: MomentMap = { play: "play_classic" };
    expect(momentIssuesForMotif(map, motif("play_classic", { durationMs: 420 }), getMotif)).toEqual([]);
    const slow = momentIssuesForMotif(map, motif("play_classic", { durationMs: 1000 }), getMotif);
    expect(slow.map((issue) => issue.path)).toEqual(["moments.play"]);
    expect(slow[0].message).toMatch(/^Moment « Carte jouée » : /);
    const moved = momentIssuesForMotif(map, motif("play_classic", { from: { zone: "deck" } }), getMotif);
    expect(moved.map((issue) => issue.path)).toEqual(["moments.play"]);
  });

  it("ignore un modèle qu'aucun moment n'utilise", () => {
    expect(momentIssuesForMotif({ play: "play_classic" }, motif("play", { durationMs: 2000 }), getMotif)).toEqual([]);
    expect(momentIssuesForMotif({}, motif("play_classic", { durationMs: 2000 }), getMotif)).toEqual([]);
  });

  it("vérifie la pause de fin de pli quand l'un des deux modèles du pli change", () => {
    const map: MomentMap = { trickWin: "trick_win_glow", trickCollect: "trick_end_settle" };
    const issues = momentIssuesForMotif(map, motif("trick_win_glow", { durationMs: 500, reactions: [] }), getMotif);
    expect(issues.map((issue) => issue.path)).toEqual(["moments.trickCollect"]);
  });
});

describe("aperçu « Essayer dans une partie »", () => {
  it("l'attribution passe dans l'URL et revient à l'identique", () => {
    expect(parseMomentPreview(encodeMomentPreview(FULL))).toEqual(FULL);
    expect(encodeMomentPreview({ deal: "deal", play: "play" })).toBe("play:play,deal:deal");
    expect(encodeMomentPreview({})).toBe("");
    expect(parseMomentPreview("")).toEqual({});
  });

  it("la lecture ignore les moments inconnus et les identifiants mal formés", () => {
    expect(parseMomentPreview("play:play,pioche:draw,deal:Deal!,trickWin:,powerLaunch:launch_ability:x")).toEqual({ play: "play", powerLaunch: "launch_ability" });
  });
});

describe("registre des moments", () => {
  it("garde seulement les moments dont le modèle existe et convient", () => {
    setMotifCatalog([], 1, [], { play: "draw", deal: "deal", trickWin: "modele_inexistant" } as MomentMap);
    expect(momentMap()).toEqual({ deal: "deal" });
    expect(getMomentMotif("play")).toBeNull();
    expect(getMomentMotif("trickWin")).toBeNull();
    const deal = getMomentMotif("deal");
    expect(deal?.id).toBe("deal");
    expect(deal?.staggerMs).toBe(GAME_CONFIG.anim.dealPerCard);
  });

  it("un modèle publié peut être attribué", () => {
    const custom = motif("play", { id: "jouer_feu", name: "Jouer · feu", group: "custom", trail: "sparks" });
    setMotifCatalog([custom], 2, [], { play: "jouer_feu" });
    expect(getMomentMotif("play")?.trail).toBe("sparks");
  });

  it("l'aperçu remplace l'attribution publiée sur cet appareil, puis s'efface", () => {
    setMotifCatalog([], 3, [], { deal: "deal" });
    const calls: number[] = [];
    const unsubscribe = subscribeMotifCatalog(() => calls.push(motifRegistryVersion()));
    const kept = setMomentPreview({ play: "play", trickWin: "draw" } as MomentMap);
    expect(kept).toEqual({ play: "play" });
    expect(momentPreviewMap()).toEqual({ play: "play" });
    expect(getMomentMotif("play")?.id).toBe("play");
    // L'aperçu est une attribution complète : la distribution n'y est pas, elle garde l'animation actuelle.
    expect(getMomentMotif("deal")).toBeNull();
    expect(momentMap()).toEqual({ deal: "deal" });
    setMomentPreview(null);
    expect(getMomentMotif("deal")?.id).toBe("deal");
    expect(getMomentMotif("play")).toBeNull();
    unsubscribe();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBeGreaterThan(calls[0]);
  });

  it("l'aperçu applique les mêmes plafonds que le serveur", () => {
    const slow = motif("play", { id: "vol_lent", durationMs: 1200 });
    setMotifCatalog([slow], 4);
    expect(setMomentPreview({ play: "vol_lent", deal: "deal" })).toEqual({ deal: "deal" });
    expect(getMomentMotif("play")).toBeNull();
  });
});
