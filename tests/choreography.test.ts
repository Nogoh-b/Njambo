import { describe, expect, it } from "vitest";
import { CODE_POWER_MODULES } from "../config/powers";
import { choreographyDuration, choreographyFromCues, validateChoreography, type Choreography } from "../engine/power/choreography";
import { validatePowerCard } from "../engine/power/validate";

const paths = (choreo: unknown) => validateChoreography(choreo, "c").map((issue) => issue.path);

const spectacular: Choreography = { tracks: [
  { id: "vol", kind: "cardPath", startMs: 0, durationMs: 900, cards: "resolved:outgoing", mode: "move", easing: "back", arc: 40, trail: "wind",
    waypoints: [
      { at: { kind: "zone", zone: "hand", player: "target" } },
      { at: { kind: "screen", at: "center" }, holdMs: 400, scale: 2, face: "up", rotate: 360 },
      { at: { kind: "zone", zone: "hand", player: "self" }, scale: 1 },
    ] },
  { id: "fente", kind: "element", startMs: 900, durationMs: 500, target: { element: "card", trackId: "vol" }, effect: "crack", intensity: 3 },
  { id: "gel", kind: "element", startMs: 300, durationMs: 1500, target: { element: "timer", player: "target" }, effect: "freeze", tone: "cobalt" },
  { id: "pioche", kind: "element", startMs: 300, durationMs: 800, target: { element: "deck" }, effect: "shake", intensity: 2 },
  { id: "titre", kind: "text", startMs: 100, durationMs: 1200, text: "VOLÉE !", at: { kind: "screen", at: "top", dy: 10 }, size: "l" },
  { id: "eclair", kind: "screen", startMs: 0, durationMs: 300, effect: "flash", tone: "gold" },
] };

describe("validateChoreography", () => {
  it("accepte une chorégraphie complète (l'exemple du plan)", () => {
    expect(validateChoreography(spectacular, "c")).toEqual([]);
    expect(choreographyDuration(spectacular)).toBe(1800);
  });

  it("refuse repères, effets et références invalides", () => {
    expect(paths({ tracks: [
      { id: "a", kind: "cardPath", startMs: 0, durationMs: 500, cards: "ghost", mode: "move", easing: "smooth", waypoints: [{ at: { kind: "screen", at: "lune" } }] },
      { id: "b", kind: "element", startMs: 0, durationMs: 500, target: { element: "timer", player: "self" }, effect: "coinRain" },
      { id: "c", kind: "element", startMs: 0, durationMs: 500, target: { element: "card", trackId: "inconnue" }, effect: "glow" },
      { id: "d", kind: "text", startMs: 7900, durationMs: 500, text: "x", at: { kind: "screen", at: "center", dx: 90 } },
    ] })).toEqual([
      "c.tracks.0.mode", "c.tracks.0.waypoints", "c.tracks.0.waypoints.0.at.at",
      "c.tracks.1.effect", "c.tracks.2.target.trackId", "c.tracks.3.durationMs", "c.tracks.3.at.dx",
    ]);
  });

  it("s'intègre à la validation des cartes", () => {
    const card = JSON.parse(JSON.stringify(CODE_POWER_MODULES.vent_nord));
    card.script.steps[0].choreo = { tracks: [] };
    expect(validatePowerCard(card).map((issue) => issue.path)).toContain("script.steps.0.choreo.tracks");
  });
});

describe("choreographyFromCues", () => {
  it("convertit les cues visuels des 21 cartes en chorégraphies valides", () => {
    for (const card of Object.values(CODE_POWER_MODULES)) {
      card.script.steps.forEach((step, index) => {
        const choreo = choreographyFromCues((step.anim ?? []) as never);
        expect(validateChoreography(choreo, `${card.def.id}.${index}`), card.def.id).toEqual([]);
      });
    }
  });

  it("garde l'ordre et la nature des vols", () => {
    const choreo = choreographyFromCues(CODE_POWER_MODULES.pacte_mains.script.steps[0].anim as never);
    const paths = choreo.tracks.filter((track) => track.kind === "cardPath");
    expect(paths).toHaveLength(2);
    expect(paths[1].startMs).toBeGreaterThan(paths[0].startMs);
  });
});

describe("sons des cartes", () => {
  it("les préréglages validés existent dans la bibliothèque sonore", async () => {
    const { SOUND_PRESET_NAMES, isSoundRef } = await import("../engine/power/validate");
    const { POWER_SOUND_PRESETS } = await import("../lib/powerSounds");
    expect([...SOUND_PRESET_NAMES].sort()).toEqual(Object.keys(POWER_SOUND_PRESETS).sort());
    expect(isSoundRef("preset:tambour")).toBe(true);
    expect(isSoundRef("preset:inconnu")).toBe(false);
    expect(isSoundRef("https://api.exemple.com/uploads/audio/abc.mp3")).toBe(true);
    expect(isSoundRef("javascript:alert(1)")).toBe(false);
  });
});
