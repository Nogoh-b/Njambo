import { describe, expect, it } from "vitest";
import { fanPose, fanRestLift, pilePose, rectPose, rotateVector, scaleFromBox, stackPose, type FanLayout } from "../engine/anim/v2/pose";

const close = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 6);

describe("rotation et échelle", () => {
  it("tourne dans le sens de CSS rotate (y vers le bas)", () => {
    const v = rotateVector(10, 0, 90);
    close(v.x, 0);
    close(v.y, 10);
  });

  it("retrouve l'échelle d'un élément, tourné ou non", () => {
    close(scaleFromBox(200, 100, 50, 0), 2);
    close(scaleFromBox(100, 100, 50, 90), 2);
    // Boîte d'un élément 100×50 tourné de 30°, à l'échelle 1,5.
    const box = 1.5 * (100 * Math.cos(Math.PI / 6) + 50 * Math.sin(Math.PI / 6));
    close(scaleFromBox(box, 100, 50, -30), 1.5);
  });
});

describe("main (éventail de Fan)", () => {
  const layout: FanLayout = { center: { x: 200, y: 600 }, axis: 0, cardWidth: 60, step: 30, rotStep: 8, face: 0 };

  it("place les cartes de part et d'autre du centre, 8° par carte", () => {
    const poses = Array.from({ length: 5 }, (_, i) => fanPose(layout, i, 5));
    expect(poses.map((pose) => pose.x)).toEqual([140, 170, 200, 230, 260]);
    expect(poses.map((pose) => pose.rotate)).toEqual([-16, -8, 0, 8, 16]);
    expect(poses.map((pose) => pose.z)).toEqual([0, 1, 2, 3, 4]);
    expect(poses.every((pose) => pose.y === 600 && pose.width === 60 && pose.face === 0)).toBe(true);
  });

  it("une main de 1 à 5 cartes reste centrée", () => {
    for (let n = 1; n <= 5; n++) {
      const xs = Array.from({ length: n }, (_, i) => fanPose(layout, i, n).x);
      close(xs.reduce((sum, x) => sum + x, 0) / n, 200);
    }
  });

  it("la place d'une carte qui arrive est celle de la main suivante", () => {
    const arrival = fanPose(layout, 4, 5);
    expect(arrival.x).toBe(260);
    expect(arrival.rotate).toBe(16);
    // Les cartes déjà là se décalent vers la gauche.
    expect(fanPose(layout, 0, 4).x).toBe(155);
    expect(fanPose(layout, 0, 5).x).toBe(140);
  });

  it("suit la rotation du siège", () => {
    const side = { ...layout, axis: 90 };
    const pose = fanPose(side, 4, 5);
    close(pose.x, 200);
    close(pose.y, 660);
    expect(pose.rotate).toBe(106);
  });

  it("soulève la carte le long de son propre axe", () => {
    const lifted = fanPose({ ...layout, lift: () => -10 }, 2, 5);
    close(lifted.x, 200);
    close(lifted.y, 590);
    const tilted = fanPose({ ...layout, lift: () => -10 }, 4, 5);
    close(tilted.x, 260 + 10 * Math.sin((16 * Math.PI) / 180));
    close(tilted.y, 600 - 10 * Math.cos((16 * Math.PI) / 180));
  });

  it("le soulèvement au repos reproduit celui de Fan", () => {
    expect(fanRestLift(2, 5)).toBe(0);
    close(fanRestLift(0, 5), Math.pow(2, 1.5) * 4);
    close(fanRestLift(4, 5), fanRestLift(0, 5));
  });

  it("une main de dos (adversaire) le dit", () => {
    expect(fanPose({ ...layout, face: 180 }, 0, 5).face).toBe(180);
  });
});

describe("dépôt (pile jetée)", () => {
  const layout = { center: { x: 100, y: 100 }, cardWidth: 40, scale: 2 };

  it("applique le jeté décidé par le jeu, à l'échelle", () => {
    const pose = pilePose(layout, 1, { dx: 3, dy: -2, dropRot: 7 });
    expect(pose).toEqual({ x: 106, y: 96, rotate: 7, width: 40, face: 0, z: 1 });
  });

  it("une carte pas encore posée vise le centre, à plat", () => {
    expect(pilePose(layout, 3)).toEqual({ x: 100, y: 100, rotate: 0, width: 40, face: 0, z: 3 });
  });
});

describe("pioche (paquet)", () => {
  const layout = { center: { x: 50, y: 50 }, rotate: -6, cardWidth: 40, depth: { x: 2, y: -2 }, layers: 3 };

  it("la dernière carte est sur le dessus, de dos et inclinée", () => {
    expect(stackPose(layout, 9, 10)).toEqual({ x: 50, y: 50, rotate: -6, width: 40, face: 180, z: 9 });
  });

  it("les cartes du dessous sont décalées, au plus de deux épaisseurs", () => {
    expect(stackPose(layout, 8, 10)).toMatchObject({ x: 52, y: 48 });
    expect(stackPose(layout, 0, 10)).toMatchObject({ x: 54, y: 46 });
  });
});

describe("repli sur le rectangle", () => {
  it("centre, à plat, carte qui tient dans la zone", () => {
    expect(rectPose({ left: 10, top: 20, width: 100, height: 87 })).toEqual({ x: 60, y: 63.5, rotate: 0, width: 60, face: 0, z: 0 });
  });

  it("une zone qui avale la carte (avatar, pot) le signale", () => {
    expect(rectPose({ left: 0, top: 0, width: 40, height: 40 }, { sink: true }).sink).toBe(true);
    expect(rectPose({ left: 0, top: 0, width: 40, height: 40 }).sink).toBeUndefined();
  });
});
