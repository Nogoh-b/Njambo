import { describe, expect, it } from "vitest";
import { anchorZones, buildScenePlan, sceneFrame, zoneAnchor, ZONE_POINTS, type SceneZone } from "../components/admin/anim/motifScene";
import { DEFAULT_MOTIFS, DEFAULT_MOTIFS_BY_ID } from "../engine/anim/defaults";

describe("scène de l'atelier : rôles et zones", () => {
  it("chaque zone de la table redonne un repère qui y ramène", () => {
    for (const zone of Object.keys(ZONE_POINTS) as SceneZone[]) {
      expect(anchorZones(zoneAnchor(zone)), zone).toContain(zone);
    }
  });

  it("« chacun » couvre les quatre sièges, « chaque adversaire » trois", () => {
    expect(anchorZones({ zone: "hand", player: "all" })).toEqual(["hand:left", "hand:top", "hand:right", "hand:me"]);
    expect(anchorZones({ zone: "hand", player: "all_opponents" })).toHaveLength(3);
    expect(anchorZones({ zone: "timer", player: "self" })).toEqual(["avatar:me"]);
  });
});

describe("scène de l'atelier : plan et images", () => {
  it("tous les modèles par défaut se rejouent du début à la fin sans erreur", () => {
    for (const motif of DEFAULT_MOTIFS) {
      const plan = buildScenePlan(motif);
      expect(plan.flights.length, motif.id).toBeGreaterThan(0);
      for (const t of [0, plan.totalMs / 3, plan.totalMs / 2, plan.totalMs]) {
        const { items } = sceneFrame(plan, t);
        expect(items.every((item) => Number.isFinite(item.frame.x) && Number.isFinite(item.frame.y)), `${motif.id} à ${t}`).toBe(true);
      }
    }
  });

  it("la distribution donne 2 cartes à chacun des 4 joueurs", () => {
    const plan = buildScenePlan(DEFAULT_MOTIFS_BY_ID.deal);
    expect(plan.flights).toHaveLength(8);
    expect(new Set(plan.flights.map((flight) => flight.toZone))).toEqual(new Set(["hand:left", "hand:top", "hand:right", "hand:me"]));
    const end = sceneFrame(plan, plan.totalMs).items;
    expect(end.filter((item) => item.key.startsWith("gen#"))).toHaveLength(8);
  });

  it("la fin de pli anime sur place la carte de chacun des 4 dépôts", () => {
    const plan = buildScenePlan(DEFAULT_MOTIFS_BY_ID.trick_end_settle);
    expect(plan.flights).toHaveLength(4);
    expect(new Set(plan.flights.map((flight) => flight.fromZone))).toEqual(new Set(["deposit:left", "deposit:top", "deposit:right", "deposit:me"]));
    for (const flight of plan.flights) expect(flight.toZone, flight.key).toBe(flight.fromZone);
    // Chaque carte finit là où elle a commencé : rien ne quitte les dépôts.
    const end = sceneFrame(plan, plan.totalMs).items;
    for (const flight of plan.flights) {
      const item = end.find((entry) => entry.key === flight.key);
      expect(item?.frame.x, flight.key).toBeCloseTo(flight.from.x);
      expect(item?.frame.y, flight.key).toBeCloseTo(flight.from.y);
    }
  });

  it("une carte défaussée disparaît dans la pioche, une carte piochée reste dans la main", () => {
    const discard = buildScenePlan(DEFAULT_MOTIFS_BY_ID.discard);
    expect(sceneFrame(discard, discard.totalMs).items.some((item) => item.key === discard.flights[0].key)).toBe(false);
    expect(sceneFrame(discard, 0).items.some((item) => item.key === discard.flights[0].key)).toBe(true);
    const draw = buildScenePlan(DEFAULT_MOTIFS_BY_ID.draw);
    const landed = sceneFrame(draw, draw.totalMs).items.find((item) => item.key === draw.flights[0].key)!;
    expect(landed.frame.flip).toBe(0);
    expect(landed.frame.x).toBeCloseTo(draw.flights[0].to.x);
    // La main s'est écartée : 6 cartes à l'arrivée.
    expect(sceneFrame(draw, draw.totalMs).items.filter((item) => item.key.startsWith("hand:me") || item.key.startsWith("gen#"))).toHaveLength(6);
  });

  it("les réactions apparaissent au bon moment (couronne gardée jusqu'à la fin)", () => {
    const plan = buildScenePlan(DEFAULT_MOTIFS_BY_ID.play);
    const arrival = plan.flights[0].endMs;
    expect(sceneFrame(plan, arrival - 20).effects.map((effect) => effect.type)).toEqual([]);
    expect(sceneFrame(plan, arrival + 30).effects.map((effect) => effect.type).sort()).toEqual(["flash", "ring"]);
    expect(sceneFrame(plan, plan.totalMs).effects.map((effect) => effect.type)).toContain("crown");
  });
});
