import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../config/gameConfig";
import { DEFAULT_MOTIFS, DEFAULT_MOTIFS_BY_ID } from "../engine/anim/defaults";
import { MOTIF_GROUPS, SQUASH_MS, motifTotalMs, normalizeMotif, validateMotif, type AnimMotif } from "../engine/anim/motif";
import { cubicBezier, laneValue, motifReactionInstances, motifSchedule, sampleFlight, type FlightGeometry } from "../engine/anim/sample";

const paths = (motif: unknown) => validateMotif(motif, "m").map((issue) => issue.path);
const withPatch = (patch: Record<string, unknown>) => ({ ...JSON.parse(JSON.stringify(DEFAULT_MOTIFS_BY_ID.draw)), ...patch });

describe("modèles par défaut", () => {
  it("les 22 modèles sont valides, uniques et survivent au stockage JSON", () => {
    expect(DEFAULT_MOTIFS).toHaveLength(22);
    expect(new Set(DEFAULT_MOTIFS.map((motif) => motif.id)).size).toBe(22);
    for (const motif of DEFAULT_MOTIFS) {
      expect(validateMotif(motif), motif.id).toEqual([]);
      expect(validateMotif(JSON.parse(JSON.stringify(motif))), motif.id).toEqual([]);
    }
  });

  it("couvrent les 7 trajets et les animations de base de chaque zone", () => {
    const byGroup = (group: keyof typeof MOTIF_GROUPS) => DEFAULT_MOTIFS.filter((motif) => motif.group === group).map((motif) => motif.id);
    expect(byGroup("trajets")).toEqual(["draw", "play", "reveal_on_table", "pickup", "discard", "to_player", "launch_ability"]);
    expect(byGroup("card")).toEqual(["card_flip_show", "card_flip_hide"]);
    expect(byGroup("hand")).toEqual(["hand_focus", "hand_out", "hand_in", "hand_give"]);
    expect(byGroup("deposit")).toEqual(["deposit_glow", "deposit_in", "deposit_eject"]);
    expect(byGroup("center")).toEqual(["center_add", "center_remove"]);
    expect(byGroup("game")).toEqual(["deal", "trick_win_glow", "trick_end_settle", "play_classic"]);
  });

  it("le vol actuel garde la durée de la configuration du jeu", () => {
    expect(DEFAULT_MOTIFS_BY_ID.play_classic.durationMs).toBe(GAME_CONFIG.anim.dropFlight);
  });
});

describe("normalizeMotif", () => {
  it("complète un modèle minimal en modèle valide", () => {
    const motif = normalizeMotif({ id: "mini", name: "Mini", from: { zone: "deck" }, to: { zone: "hand", player: "self" } });
    expect(motif.lanes.scale).toEqual([[0, 1], [1, 1]]);
    expect(motif.lanes.sizeBlend).toBeUndefined();
    expect(motif.face).toEqual({ mode: "lane" });
    expect(validateMotif(motif)).toEqual([]);
  });
});

describe("validateMotif", () => {
  it("refuse zones, joueurs et trajectoires invalides", () => {
    expect(paths(withPatch({
      id: "X",
      from: { zone: "hand", player: "voisin" },
      to: { zone: "offscreen", side: "milieu" },
      path: { easing: [1.5, 0, 1, 1], timing: "parfois", arc: { along: 0, perp: 3 }, smooth: true, via: [
        { t: 0.6, along: 0.5 },
        { t: 0.4, frame: "screen", fx: 0.5, fy: 3, rise: 2, riseMinPx: 90, riseMaxPx: 30 },
      ] },
    }))).toEqual([
      "m.id", "m.from.player", "m.to.side",
      "m.path.easing", "m.path.timing", "m.path.arc.along", "m.path.arc.perp",
      "m.path.via.1.t", "m.path.via.1.fy", "m.path.via.1.rise", "m.path.via.1.riseMaxPx",
    ]);
  });

  it("refuse « chacun » des deux côtés, sauf sur place", () => {
    expect(paths(withPatch({ from: { zone: "deposit", player: "all" }, to: { zone: "hand", player: "all_opponents" } }))).toEqual(["m.to"]);
    expect(paths(withPatch({ from: { zone: "deposit", player: "all" }, to: { zone: "deposit", player: "all_opponents" } }))).toEqual(["m.to"]);
    expect(paths(withPatch({ from: { zone: "deposit", player: "all" }, to: { zone: "deposit", player: "all" } }))).toEqual([]);
  });

  it("refuse des pistes mal formées", () => {
    expect(paths(withPatch({ lanes: {
      ...DEFAULT_MOTIFS_BY_ID.draw.lanes,
      scale: [[0.1, 1], [1, 1]],
      flip: [[0, 0], [0.5, 270], [1, 0]],
      rotate: [[0, 0]],
      glow: [[0, 0, [0, 0, 2, 1]], [1, 0]],
      wobble: [[0, 0], [1, 0]],
    } }))).toEqual(["m.lanes.scale.0.0", "m.lanes.flip.1.1", "m.lanes.rotate", "m.lanes.glow.0.2", "m.lanes.wobble"]);
  });

  it("refuse réactions et aperçu invalides", () => {
    expect(paths(withPatch({
      reactions: [
        { type: "confetti", anchor: "arrival", offsetMs: 0 },
        { type: "nkap", anchor: "arrival", offsetMs: 0, at: "to" },
        { type: "ring", anchor: "quand", offsetMs: 5_000, durationMs: 10, at: { zone: "lune" } },
      ],
      preview: { pick: 30, setup: { "hand:me": ["1♠"], "hand:moon": 2 }, cards: ["7♦", "Z"] },
    }))).toEqual([
      "m.reactions.0.type", "m.reactions.1.at",
      "m.reactions.2.anchor", "m.reactions.2.offsetMs", "m.reactions.2.durationMs", "m.reactions.2.at",
      "m.preview.pick", "m.preview.setup.hand:me", "m.preview.setup.hand:moon", "m.preview.cards",
    ]);
  });

  it("borne la durée totale à 8 s, distribution à chacun comprise", () => {
    expect(paths(withPatch({ durationMs: 5_000 }))).toEqual(["m.durationMs"]);
    expect(paths({ ...DEFAULT_MOTIFS_BY_ID.deal, count: 6, staggerMs: 400 })).toEqual(["m.durationMs"]);
  });
});

describe("courbes et pistes", () => {
  it("cubicBezier respecte les extrémités et la courbe linéaire", () => {
    const linear = cubicBezier([0, 0, 1, 1]);
    for (const x of [0, 0.25, 0.5, 0.9, 1]) expect(linear(x)).toBeCloseTo(x, 6);
    const smooth = cubicBezier([0.45, 0, 0.25, 1]);
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
    expect(smooth(0.5)).toBeGreaterThan(0.5);
    expect(cubicBezier([0.25, 1.25, 0.5, 1])(0.7)).toBeGreaterThan(1);
  });

  it("laneValue interpole et applique la courbe du point de départ du segment", () => {
    expect(laneValue([[0, 0], [1, 10]], 0.3)).toBeCloseTo(3);
    const ease = cubicBezier([0.22, 0.88, 0.28, 1]);
    expect(laneValue([[0, 0, [0.22, 0.88, 0.28, 1]], [0.5, 10], [1, 20]], 0.25)).toBeCloseTo(10 * ease(0.5));
    expect(laneValue([[0, 0, [0.22, 0.88, 0.28, 1]], [0.5, 10], [1, 20]], 0.75)).toBeCloseTo(15);
  });
});

describe("sampleFlight", () => {
  const geometry: FlightGeometry = { from: { x: 150, y: 300, rotate: -4, scale: 0.74, face: 180 }, to: { x: 195, y: 738, rotate: 0, scale: 1, face: 0 } };

  it("part de la zone de départ et arrive sur la zone d'arrivée", () => {
    const motif = DEFAULT_MOTIFS_BY_ID.draw;
    const start = sampleFlight(motif, geometry, 0), end = sampleFlight(motif, geometry, motif.durationMs);
    expect([start.x, start.y, start.rotate, start.scale, start.flip]).toEqual([150, 300, -4, 0.74, 180]);
    expect(end.x).toBeCloseTo(195);
    expect(end.y).toBeCloseTo(738);
    expect(end.scale).toBeCloseTo(1);
    expect(end.flip).toBe(0);
    expect(sampleFlight(motif, geometry, -10).phase).toBe("waiting");
    expect(sampleFlight(motif, geometry, motif.durationMs + 10).phase).toBe("landed");
  });

  it("écrase la carte juste après l'atterrissage puis la stabilise", () => {
    const motif = DEFAULT_MOTIFS_BY_ID.play;
    const squashed = sampleFlight(motif, geometry, motif.durationMs + SQUASH_MS / 8);
    expect(squashed.scaleX).toBeGreaterThan(1);
    expect(squashed.scaleY).toBeLessThan(1);
    expect(sampleFlight(motif, geometry, motif.durationMs + SQUASH_MS + 1).scaleX).toBe(1);
  });

  it("face automatique : retourne seulement si la face change", () => {
    const deal = DEFAULT_MOTIFS_BY_ID.deal;
    expect(sampleFlight(deal, geometry, deal.durationMs).flip).toBe(0);
    expect(sampleFlight(deal, { ...geometry, to: { ...geometry.to, face: 180 } }, deal.durationMs / 2).flip).toBe(180);
  });
});

/* Référence : calcul exact de components/table/FlyingCard.tsx (images clés Motion,
   courbe rejouée à chaque segment, retournement des cartes adverses). */
const CLASSIC = cubicBezier([0.22, 0.88, 0.28, 1]);
const FLIP = cubicBezier([0.25, 0.85, 0.35, 1]);
interface ClassicCase { from: [number, number]; to: [number, number]; startScale: number; startRot: number; dropRot: number; opponent: boolean }
function flyingCardAt(c: ClassicCase, t: number) {
  const dx = c.to[0] - c.from[0], dy = c.to[1] - c.from[1];
  const arc = -Math.min(76, Math.max(28, Math.hypot(dx, dy) * 0.16));
  const keyframes = (values: [number, number, number]) => {
    const segment = t < 0.46 ? 0 : 1, start = segment === 0 ? 0 : 0.46, end = segment === 0 ? 0.46 : 1;
    return values[segment] + (values[segment + 1] - values[segment]) * CLASSIC((t - start) / (end - start));
  };
  return {
    x: c.from[0] + keyframes([0, dx * 0.52, dx]),
    y: c.from[1] + keyframes([0, dy * 0.44 + arc, dy]),
    rotate: keyframes([c.startRot - 8, (c.startRot + c.dropRot) * 0.5, c.dropRot]),
    scale: keyframes([c.startScale * 1.04, 1.08, 1]),
    flip: c.opponent ? 180 - 180 * FLIP(Math.min(1, Math.max(0, (t - 0.14) / 0.62))) : 0,
  };
}

describe("play_classic reproduit le vol actuel (FlyingCard)", () => {
  const cases: Record<string, ClassicCase> = {
    "toi : main → dépôt": { from: [195, 738], to: [195, 505], startScale: 0.97, startRot: 7, dropRot: -4, opponent: false },
    "adversaire proche (arc mini 28 px)": { from: [16, 352], to: [82, 400], startScale: 0.74, startRot: 92, dropRot: 5, opponent: true },
    "adversaire en face": { from: [195, 166], to: [195, 232], startScale: 0.74, startRot: 178, dropRot: -2, opponent: true },
    "très long vol (arc maxi 76 px)": { from: [20, 700], to: [380, 200], startScale: 0.6, startRot: -20, dropRot: 7, opponent: true },
  };
  const motif = DEFAULT_MOTIFS_BY_ID.play_classic;

  for (const [label, c] of Object.entries(cases)) {
    it(label, () => {
      const geometry: FlightGeometry = {
        from: { x: c.from[0], y: c.from[1], rotate: c.startRot, scale: c.startScale, face: c.opponent ? 180 : 0 },
        to: { x: c.to[0], y: c.to[1], rotate: c.dropRot, scale: 1, face: 0 },
      };
      for (let step = 0; step <= 100; step++) {
        const t = step / 100;
        const ours = sampleFlight(motif, geometry, t * motif.durationMs), ref = flyingCardAt(c, t);
        expect(ours.x, `x à ${t}`).toBeCloseTo(ref.x, 6);
        expect(ours.y, `y à ${t}`).toBeCloseTo(ref.y, 6);
        expect(ours.rotate, `rotation à ${t}`).toBeCloseTo(ref.rotate, 6);
        expect(ours.flip, `face à ${t}`).toBeCloseTo(ref.flip, 6);
        // Taille : produit de deux fondus au lieu d'un, écart ≤ 1 % de (1 − taille de départ).
        expect(Math.abs(ours.scale - ref.scale), `taille à ${t}`).toBeLessThanOrEqual(0.01 * (1 - c.startScale) + 1e-9);
      }
    });
  }
});

describe("calendrier", () => {
  it("décale les cartes et place les réactions au départ ou à l'arrivée", () => {
    const motif = DEFAULT_MOTIFS_BY_ID.center_add;
    expect(motifSchedule(motif, 3).map((flight) => [flight.startMs, flight.endMs])).toEqual([[0, 600], [170, 770], [340, 940]]);
    expect(motifReactionInstances(motif, 3).map((instance) => instance.atMs)).toEqual([600, 770, 940]);
    const ability = DEFAULT_MOTIFS_BY_ID.launch_ability;
    expect(motifReactionInstances(ability, 1).map((instance) => [instance.reaction.type, instance.atMs])).toEqual([["avatarPulse", 0], ["flash", 0], ["flash", 430], ["ring", 430]]);
  });

  it("motifTotalMs = fin du dernier vol ou de la dernière réaction", () => {
    const totalFromInstances = (motif: AnimMotif, flights: number) => Math.max(
      ...motifSchedule(motif, flights).map((flight) => flight.endMs + (motif.squash && JSON.stringify(motif.from) !== JSON.stringify(motif.to) ? SQUASH_MS : 0)),
      ...motifReactionInstances(motif, flights).map((instance) => instance.atMs + instance.durationMs),
    );
    for (const motif of DEFAULT_MOTIFS) for (const flights of [1, 3, 8]) {
      expect(motifTotalMs(motif, flights), `${motif.id} × ${flights}`).toBe(totalFromInstances(motif, flights));
    }
  });
});
