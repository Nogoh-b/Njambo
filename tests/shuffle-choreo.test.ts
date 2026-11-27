import { describe, expect, it } from "vitest";
import { buildShufflePlan, packetSizes, riffleOrder, splitShuffleMs } from "../components/table/zones/shuffleChoreo";

const restOf = (kf: { transform: string; zIndex: number }) => ({ transform: kf.transform, zIndex: kf.zIndex });

describe("chorégraphie du mélange (queue d'aronde puis paquets)", () => {
  it("entrelace les deux moitiés une carte sur deux", () => {
    expect(riffleOrder(6)).toEqual([0, 3, 1, 4, 2, 5]);
    expect([...riffleOrder(14)].sort((a, b) => a - b)).toEqual(Array.from({ length: 14 }, (_, i) => i));
  });

  it("taille les paquets selon le nombre de cartes", () => {
    expect(packetSizes(14)).toEqual([4, 3, 5, 3, 4]);
    expect(packetSizes(8).every((size) => size >= 1 && size < 8)).toBe(true);
  });

  it("produit des keyframes ordonnées qui partent et reviennent au paquet posé", () => {
    const plan = buildShufflePlan({ cardW: 50, cardH: 72, count: 14, riffleMs: 3400, packetsMs: 2300, frames: 60 });
    expect(plan.cards).toHaveLength(14);
    expect(plan.riffleShare).toBeCloseTo(3400 / 5700, 5);
    const finals = new Set<number>();
    for (const kf of plan.cards) {
      expect(kf).toHaveLength(61);
      expect(kf[0].offset).toBe(0);
      expect(kf.at(-1)!.offset).toBe(1);
      for (let i = 1; i < kf.length; i++) expect(kf[i].offset).toBeGreaterThan(kf[i - 1].offset);
      expect(kf.every((frame) => !frame.transform.includes("NaN"))).toBe(true);
      expect(kf.at(-1)!.transform).toContain("rotate(0.00deg) scale(1.000)");
      finals.add(kf.at(-1)!.zIndex);
    }
    // Chaque carte finit à une place distincte du paquet : 0 → 13.
    expect([...finals].sort((a, b) => a - b)).toEqual(Array.from({ length: 14 }, (_, i) => i));
  });

  it("mélange réellement : l'ordre final diffère de l'ordre de départ", () => {
    const plan = buildShufflePlan({ cardW: 50, cardH: 72, count: 14, riffleMs: 3400, packetsMs: 2300, frames: 20 });
    const finalOrder = plan.cards.map((kf) => kf.at(-1)!.zIndex);
    expect(finalOrder).not.toEqual(plan.cards.map((kf) => restOf(kf[0]).zIndex));
  });

  it("aronde seule quand les paquets sont désactivés", () => {
    const plan = buildShufflePlan({ cardW: 50, cardH: 72, count: 8, riffleMs: 3200, packetsMs: 0, frames: 30 });
    expect(plan.riffleShare).toBe(1);
    expect(plan.beats.some((beat) => beat.kind === "flick")).toBe(false);
    expect(plan.cards.map((kf) => kf.at(-1)!.zIndex)).toEqual(
      plan.cards.map((_, id) => riffleOrder(8).indexOf(id)),
    );
  });

  it("place les sons dans la durée du mélange, dans l'ordre", () => {
    const { beats } = buildShufflePlan({ cardW: 1, cardH: 1, count: 14, riffleMs: 3400, packetsMs: 2300, frames: 1 });
    expect(beats.length).toBeGreaterThan(10);
    expect(beats.every((beat) => beat.at > 0 && beat.at < 1)).toBe(true);
    for (let i = 1; i < beats.length; i++) expect(beats[i].at).toBeGreaterThanOrEqual(beats[i - 1].at);
    expect(beats.filter((beat) => beat.kind === "flick")).toHaveLength(5);
  });

  it("applique à la durée de la partie la proportion aronde / paquets du réglage", () => {
    expect(splitShuffleMs(5700, 5700, 2300)).toEqual({ riffleMs: 3400, packetsMs: 2300 });
    expect(splitShuffleMs(3200, 5700, 2300)).toEqual({ riffleMs: 3200 - Math.round(3200 * (2300 / 5700)), packetsMs: Math.round(3200 * (2300 / 5700)) });
    expect(splitShuffleMs(3200, 3200, 0)).toEqual({ riffleMs: 3200, packetsMs: 0 });
    expect(splitShuffleMs(0, 5700, 2300)).toEqual({ riffleMs: 0, packetsMs: 0 });
  });
});
