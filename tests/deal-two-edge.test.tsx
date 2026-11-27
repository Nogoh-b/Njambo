import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dealLaunchesFor, planDealAim, shortestAngleDelta, twoEdgeAim } from "../components/table/zones/deckAim";
import { DeckZone } from "../components/table/zones/DeckZone";
import { DEFAULT_MOTIFS_BY_ID } from "../engine/anim/defaults";
import { motifTotalMs } from "../engine/anim/motif";
import { motifSchedule } from "../engine/anim/sample";

const timing = { perCardMs: 110, rotateMs: 320 };

describe("donne à deux bords : pas de rotation vers la main d'en face", () => {
  it("écart d'angle le plus court, signé", () => {
    expect(shortestAngleDelta(0, 90)).toBe(90);
    expect(shortestAngleDelta(0, 270)).toBe(-90);
    expect(shortestAngleDelta(350, 10)).toBe(20);
    expect(shortestAngleDelta(0, 180)).toBe(180);
  });

  it("garde l'angle et sort par le bord arrière quand la main est en face", () => {
    expect(twoEdgeAim(0, 180)).toEqual({ angle: 0, edge: "back", delta: 0 });
    expect(twoEdgeAim(90, 270)).toEqual({ angle: 90, edge: "back", delta: 0 });
    // Main à 90° : quart de tour par le bord avant.
    expect(twoEdgeAim(0, 90)).toMatchObject({ angle: 90, edge: "front" });
    // Retour vers le joueur local après le bord arrière : pas de rotation non plus.
    expect(twoEdgeAim(0, 0)).toMatchObject({ angle: 0, edge: "front", delta: 0 });
  });

  it("2 joueurs : aucune rotation, cadence courte", () => {
    const plan = planDealAim([0, 180], 5, timing);
    expect(plan.filter((step) => step.turned)).toHaveLength(0);
    expect(plan.map((step) => step.edge)).toEqual(Array.from({ length: 10 }, (_, k) => (k % 2 ? "back" : "front")));
    expect(plan.at(-1)!.launchMs).toBe(9 * (110 + 90));
  });

  it("3 joueurs : la main d'en face (gauche → droite) est servie sans rotation", () => {
    const plan = planDealAim([0, 90, 270], 5, timing);
    expect(plan.slice(0, 4).map((step) => [step.angle, step.edge, step.turned])).toEqual([
      [0, "front", false],
      [90, "front", true],
      [90, "back", false],
      [0, "front", true],
    ]);
    expect(plan.filter((step) => step.turned)).toHaveLength(9);
  });

  it("4 joueurs : chaque main est à 90°, un quart de tour à chaque carte comme avant", () => {
    const plan = planDealAim([0, 90, 180, 270], 5, timing);
    expect(plan.slice(1).every((step) => step.turned && step.edge === "front")).toBe(true);
    expect(plan.at(-1)!.launchMs).toBe(19 * (110 + 320));
  });

  it("donne les départs de chaque joueur, tour par tour", () => {
    const plan = planDealAim([0, 180], 3, timing);
    expect(dealLaunchesFor(plan, 0)).toEqual([0, 400, 800]);
    expect(dealLaunchesFor(plan, 1)).toEqual([200, 600, 1000]);
  });

  it("modèle V1 : les cartes partent au calendrier de la pioche, pas au décalage régulier", () => {
    const motif = { ...DEFAULT_MOTIFS_BY_ID.deal, staggerMs: 430, durationMs: 520 };
    const startsMs = dealLaunchesFor(planDealAim([0, 180], 2, timing), 0)
      .flatMap((_, round) => [round * 400, round * 400 + 200].map((ms) => ms + 5700));
    expect(motifSchedule(motif, 4, startsMs).map((flight) => flight.startMs)).toEqual([5700, 5900, 6100, 6300]);
    expect(motifSchedule(motif, 4).map((flight) => flight.startMs)).toEqual([0, 430, 860, 1290]);
    expect(motifTotalMs(motif, 4, startsMs)).toBeGreaterThanOrEqual(6300 + 520);
  });

  it("DeckZone pousse la carte et le reflet par le bord arrière, sans carte fantôme", () => {
    const render = (launchEdge: "front" | "back") => renderToStaticMarkup(
      <DeckZone deckW={50} pot={500} ledSuit={null} stage="dealing" launchSeq={2} launchEdge={launchEdge} motionEnabled premiumFxAllowed liteMotion={false} />,
    );
    expect(render("back")).toMatch(/stackLayerTopThumbPeekBack/);
    expect(render("back")).toMatch(/leadingEdgeSheenBack/);
    expect(render("front")).toMatch(/topCardFollow/);
    expect(render("front")).not.toMatch(/leadingEdgeSheenBack/);
    // La carte qui vole part elle-même de la pioche : pas de deuxième carte éjectée.
    expect(render("front")).not.toMatch(/eject/i);
  });
});
