import { describe, expect, it } from "vitest";
import { TOSS_LIMITS, depositToss, tossOf } from "../engine/depositToss";

const ids = Array.from({ length: 400 }, (_, i) => `c_${["♠", "♥", "♦", "♣"][i % 4]}${3 + (i % 8)}_${i}`);

describe("jeté d'une carte posée", () => {
  it("le même pour une même carte, chez tous les joueurs", () => {
    expect(depositToss("c_♥9_12")).toEqual(depositToss("c_♥9_12"));
  });

  it("reste dans les bornes de l'ancien tirage aléatoire", () => {
    for (const id of ids) {
      const toss = depositToss(id);
      expect(Math.abs(toss.dropRot)).toBeLessThanOrEqual(TOSS_LIMITS.rot);
      expect(Math.abs(toss.dx)).toBeLessThanOrEqual(TOSS_LIMITS.dx);
      expect(Math.abs(toss.dy)).toBeLessThanOrEqual(TOSS_LIMITS.dy);
    }
  });

  it("varie d'une carte à l'autre, dans les deux sens (aspect aléatoire)", () => {
    const rots = ids.map((id) => depositToss(id).dropRot);
    expect(new Set(rots).size).toBeGreaterThan(80);
    expect(rots.filter((rot) => rot < -3).length).toBeGreaterThan(60);
    expect(rots.filter((rot) => rot > 3).length).toBeGreaterThan(60);
    // Inclinaison et décalage ne sont pas liés.
    const flat = ids.filter((id) => Math.abs(depositToss(id).dropRot) < 2);
    expect(new Set(flat.map((id) => Math.sign(depositToss(id).dx))).size).toBeGreaterThan(1);
  });

  it("un jeté fourni par la partie l'emporte (bac à sable, anciennes parties)", () => {
    expect(tossOf({ id: "x", dropRot: 0, dx: 0, dy: 0 })).toEqual({ dropRot: 0, dx: 0, dy: 0 });
    expect(tossOf({ id: "x", dropRot: 5 })).toEqual({ dropRot: 5, dx: 0, dy: 0 });
  });

  it("une carte sans jeté (partie serveur) prend le jeté calculé", () => {
    expect(tossOf({ id: "c_♣7_3" })).toEqual(depositToss("c_♣7_3"));
  });
});
