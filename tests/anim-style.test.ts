import { afterEach, describe, expect, it } from "vitest";
import { equippedCopy, readPlayerCosmetics, validateCosmetic, type CosmeticDefinition } from "../domain";
import { DEFAULT_MOTIFS, DEFAULT_MOTIFS_BY_ID } from "../engine/anim/defaults";
import { momentDurationMs, styleMomentMotif } from "../engine/anim/moments";
import { MOTIF_REACTIONS, motifTotalMs, normalizeMotif, validateMotif, type AnimMotif } from "../engine/anim/motif";
import { getMomentMotif, getStyledMomentMotif, setMomentPreview, setMotifCatalog, setStylePreview, stylePreviewOf } from "../engine/anim/registry";
import { applyAnimStyle, encodeAnimStyle, parseAnimStyle, readAnimStyle, validateAnimStyle, type AnimStyle } from "../engine/anim/style";

const FULL: AnimStyle = { trail: "sparks", trailIntensity: 3, tone: "pink", glow: 0.8, impact: "burst" };
const paths = (value: unknown) => validateAnimStyle(value).map((issue) => issue.path);
const peak = (motif: AnimMotif) => Math.max(...motif.lanes.glow.map((point) => point[1]));
/** Tout ce qui règle le temps et le trajet : un style n'y touche jamais. */
const timing = (motif: AnimMotif) => JSON.stringify([motif.from, motif.to, motif.count, motif.staggerMs, motif.durationMs, motif.path, motif.face, motif.squash, motif.lanes.scale, motif.lanes.rotate, motif.lanes.lift, motif.lanes.flip, motif.lanes.opacity]);

afterEach(() => {
  setStylePreview(null);
  setMomentPreview(null);
  setMotifCatalog([], 0, [], {});
});

describe("style d'animation : liste blanche", () => {
  it("accepte les réglages de la liste blanche", () => {
    expect(validateAnimStyle(FULL)).toEqual([]);
    expect(validateAnimStyle({ glow: 0 })).toEqual([]);
  });

  it("refuse tout réglage qui touche au temps ou au trajet", () => {
    expect(paths({ ...FULL, durationMs: 200, staggerMs: 0, path: {} })).toEqual(["style.durationMs", "style.staggerMs", "style.path"]);
  });

  it("refuse les valeurs hors bornes, un style vide ou mal formé", () => {
    expect(paths({ trail: "fumée", trailIntensity: 4, tone: "vert", glow: 1.5, impact: "shake" })).toEqual(["style.trail", "style.trailIntensity", "style.tone", "style.glow", "style.impact"]);
    expect(paths({})).toEqual(["style"]);
    expect(paths(null)).toEqual(["style"]);
    expect(paths([])).toEqual(["style"]);
  });

  it("la lecture tolérante ne garde que les réglages valides", () => {
    expect(readAnimStyle({ trail: "light", durationMs: 10, tone: "vert", glow: 0.5 })).toEqual({ trail: "light", glow: 0.5 });
    expect(readAnimStyle({ durationMs: 10 })).toBeNull();
    expect(readAnimStyle("sparks")).toBeNull();
  });

  it("passe dans l'URL et revient à l'identique", () => {
    expect(encodeAnimStyle(FULL)).toBe("trail:sparks,trailIntensity:3,tone:pink,glow:0.8,impact:burst");
    expect(parseAnimStyle(encodeAnimStyle(FULL))).toEqual(FULL);
    expect(parseAnimStyle("trail:sparks,durationMs:9000,glow:2")).toEqual({ trail: "sparks" });
    expect(parseAnimStyle("")).toBeNull();
  });
});

describe("style d'animation : application", () => {
  it("sans style, le modèle est inchangé", () => {
    const motif = DEFAULT_MOTIFS_BY_ID.play;
    expect(applyAnimStyle(motif, null)).toBe(motif);
  });

  it("change la traînée, la teinte des réactions, la lueur et ajoute l'impact à l'arrivée", () => {
    const base = DEFAULT_MOTIFS_BY_ID.play;
    const styled = applyAnimStyle(base, FULL, () => Infinity);
    expect(styled.trail).toBe("sparks");
    expect(styled.trailIntensity).toBe(3);
    expect(styled.reactions.every((reaction) => reaction.tone === "pink")).toBe(true);
    expect(peak(styled)).toBeCloseTo(0.8);
    const impact = styled.reactions[styled.reactions.length - 1];
    expect(impact).toMatchObject({ type: "burst", anchor: "arrival", offsetMs: 0, at: "to", tone: "pink", durationMs: MOTIF_REACTIONS.burst.durationMs });
    expect(styled.reactions).toHaveLength(base.reactions.length + 1);
    // Le modèle d'origine n'est pas modifié.
    expect(base.reactions.some((reaction) => reaction.tone === "pink")).toBe(false);
  });

  it("une piste de lueur éteinte devient un éclat à mi-vol", () => {
    const classic = DEFAULT_MOTIFS_BY_ID.play_classic;
    expect(peak(classic)).toBe(0);
    expect(applyAnimStyle(classic, { glow: 0.5 }).lanes.glow).toEqual([[0, 0], [0.5, 0.5], [1, 0]]);
  });

  it("ne touche jamais au temps ni au trajet, n'allonge jamais l'animation, et le modèle reste valide", () => {
    for (const motif of DEFAULT_MOTIFS) {
      const styled = applyAnimStyle(motif, FULL);
      expect(timing(styled), motif.id).toBe(timing(motif));
      expect(motifTotalMs(styled), motif.id).toBeLessThanOrEqual(motifTotalMs(motif));
      expect(validateMotif(styled), motif.id).toEqual([]);
    }
  });

  it("un impact sans place est retiré, un impact qui dépasse est raccourci", () => {
    // Vol actuel : pas de réaction, l'animation finit à l'atterrissage → pas de place.
    const classic = DEFAULT_MOTIFS_BY_ID.play_classic;
    expect(applyAnimStyle(classic, { impact: "flash" }).reactions).toHaveLength(0);
    // Une réaction tardive laisse un peu de place après l'atterrissage.
    const roomy = normalizeMotif({ ...classic, reactions: [{ type: "glow", anchor: "arrival", offsetMs: 0, durationMs: 300 }] });
    const styled = applyAnimStyle(roomy, { impact: "burst" });
    expect(styled.reactions[1].durationMs).toBe(300);
    expect(motifTotalMs(styled)).toBe(motifTotalMs(roomy));
  });
});

describe("style d'animation : moments du jeu", () => {
  it("carte jouée : le vol garde sa durée et l'impact se joue en entier après l'atterrissage", () => {
    const classic = DEFAULT_MOTIFS_BY_ID.play_classic;
    const styled = styleMomentMotif("play", classic, { impact: "flash" });
    expect(momentDurationMs("play", styled)).toBe(classic.durationMs);
    expect(styled.reactions).toEqual([expect.objectContaining({ type: "flash", durationMs: MOTIF_REACTIONS.flash.durationMs })]);
  });

  it("pli gagné et pouvoir lancé : la durée qui compte ne s'allonge pas", () => {
    for (const [moment, id] of [["trickWin", "trick_win_glow"], ["powerLaunch", "launch_ability"]] as const) {
      const base = DEFAULT_MOTIFS_BY_ID[id];
      expect(momentDurationMs(moment, styleMomentMotif(moment, base, FULL)), moment).toBeLessThanOrEqual(momentDurationMs(moment, base));
    }
  });

  it("sans modèle attribué, seule la carte jouée d'un joueur stylé prend le vol actuel", () => {
    expect(getMomentMotif("play")).toBeNull();
    expect(getStyledMomentMotif("play", null)).toBeNull();
    const styled = getStyledMomentMotif("play", { trail: "sparks", tone: "teal" });
    expect(styled?.id).toBe("play_classic");
    expect(styled?.trail).toBe("sparks");
    expect(getStyledMomentMotif("trickWin", FULL)).toBeNull();
    expect(getStyledMomentMotif("powerLaunch", FULL)).toBeNull();
  });

  it("avec un modèle attribué, le style s'y applique ; la distribution et la fin de pli restent neutres", () => {
    setMotifCatalog([], 1, [], { play: "play", trickWin: "trick_win_glow", deal: "deal", trickCollect: "trick_end_settle" });
    expect(getStyledMomentMotif("play", FULL)?.id).toBe("play");
    expect(getStyledMomentMotif("play", FULL)?.trail).toBe("sparks");
    expect(getStyledMomentMotif("trickWin", FULL)?.reactions.every((reaction) => reaction.tone === "pink")).toBe(true);
    expect(getStyledMomentMotif("deal", FULL)).toEqual(getMomentMotif("deal"));
    expect(getStyledMomentMotif("trickCollect", FULL)).toEqual(getMomentMotif("trickCollect"));
  });

  it("l'aperçu d'un style se pose et s'efface", () => {
    setStylePreview(FULL);
    expect(stylePreviewOf()).toEqual(FULL);
    setStylePreview(null);
    expect(stylePreviewOf()).toBeNull();
  });
});

describe("cosmétique « Style d'animation »", () => {
  const STYLE: CosmeticDefinition = { id: "style_braise", type: "anim_style", name: "Braise", rarity: "epique", published: true, style: { trail: "sparks", tone: "pink" } };

  it("se valide sans image, avec un style de la liste blanche", () => {
    expect(validateCosmetic(STYLE)).toEqual([]);
    expect(validateCosmetic({ ...STYLE, style: undefined }).map((issue) => issue.path)).toEqual(["style"]);
    expect(validateCosmetic({ ...STYLE, style: { durationMs: 100 } as AnimStyle }).map((issue) => issue.path)).toEqual(["style.durationMs", "style"]);
  });

  it("seul un style d'animation porte des réglages", () => {
    const back: CosmeticDefinition = { id: "dos_ndop", type: "card_back", name: "Ndop", rarity: "rare", published: true, imageUrl: "/assets/dos.webp" };
    expect(validateCosmetic(back)).toEqual([]);
    expect(validateCosmetic({ ...back, style: { trail: "light" } }).map((issue) => issue.path)).toEqual(["style"]);
    expect(equippedCopy({ ...back, style: { trail: "light" } })).not.toHaveProperty("style");
  });

  it("le style équipé est copié pour la table, et relu de façon tolérante", () => {
    expect(equippedCopy(STYLE)).toEqual({ id: "style_braise", name: "Braise", rarity: "epique", style: { trail: "sparks", tone: "pink" } });
    const read = readPlayerCosmetics({
      animStyle: { id: "style_braise", name: "Braise", rarity: "epique", style: { trail: "sparks", durationMs: 50, tone: "vert" } },
      badge: { id: "badge_x", name: "X", rarity: "rare", style: { trail: "light" } },
    });
    expect(read.animStyle?.style).toEqual({ trail: "sparks" });
    expect(read.badge).not.toHaveProperty("style");
  });
});
