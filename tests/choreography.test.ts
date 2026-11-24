import { describe, expect, it } from "vitest";
import { CODE_POWER_MODULES } from "../config/powers";
import { V2_PRESENT_RISE_MS, audienceSees, choreographyDuration, choreographyFromCues, fillCardPlaceholders, swapDelta, validateChoreography, type Choreography, type V2Track } from "../engine/power/choreography";
import { validatePowerCard } from "../engine/power/validate";
import { bestRecommendation, recommendationReason } from "../engine/power/selectors";

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

describe("pistes « modèle » (atelier d'animations)", () => {
  const motifTrack = (patch: Record<string, unknown> = {}) => ({ id: "m1", kind: "motif", startMs: 0, durationMs: 760, motifId: "hand_give", cards: "resolved:outgoing", mode: "move", ...patch });

  it("accepte un modèle connu, avec ou sans surcharges, et calcule sa durée", async () => {
    const { motifOfTrack } = await import("../engine/power/choreography");
    const choreo = { tracks: [
      motifTrack({ overrides: { from: { zone: "hand", player: "target" }, to: { zone: "hand", player: "self" } } }),
      { id: "fx", kind: "element", startMs: 300, durationMs: 400, target: { element: "card", trackId: "m1" }, effect: "glow" },
      motifTrack({ id: "m2", startMs: 100, durationMs: 600, motifId: "center_add", cards: "ghost", mode: "display" }),
    ] };
    expect(validateChoreography(choreo, "c")).toEqual([]);
    const resolved = motifOfTrack(choreo.tracks[0] as never);
    expect(resolved?.from).toEqual({ zone: "hand", player: "target" });
    expect(resolved?.durationMs).toBe(760);
    // center_add : 3 cartes (décalage 170 ms) + onde de 520 ms à chaque arrivée.
    expect(choreographyDuration(choreo as Choreography)).toBe(100 + 2 * 170 + 600 + 520);
  });

  it("refuse modèle inconnu, carte fantôme en déplacement réel et surcharges invalides", () => {
    expect(paths({ tracks: [
      motifTrack({ motifId: "inconnu" }),
      motifTrack({ id: "m2", cards: "ghost", mode: "move" }),
      motifTrack({ id: "m3", overrides: { from: { zone: "lune" }, staggerMs: -5 } }),
      motifTrack({ id: "m4", durationMs: 5_000 }),
    ] })).toEqual([
      "c.tracks.0.motifId",
      "c.tracks.1.mode",
      "c.tracks.2.overrides.from", "c.tracks.2.overrides.staggerMs",
      "c.tracks.3.overrides.durationMs",
    ]);
  });

  it("refuse un modèle qui déborde des 8 s, décalages et réactions compris", () => {
    expect(paths({ tracks: [motifTrack({ startMs: 7_500 })] })).toEqual(["c.tracks.0.durationMs"]);
    // Le vol tient (7 + 0,6 s) mais pas les 3 cartes décalées ni les ondes d'arrivée.
    expect(paths({ tracks: [motifTrack({ startMs: 7_000, durationMs: 600, motifId: "center_add", cards: "ghost", mode: "display" })] })).toEqual(["c.tracks.0.durationMs"]);
  });
});

describe("textes selon qui regarde et verdict d'un échange", () => {
  const card = (rank: string, value: number, suit: "♥" | "♦" = "♥") => ({ id: `${rank}${suit}`, rank, value, suit, color: "#c00" }) as never;
  it("remplit les cartes de l'échange et l'écart de valeur", () => {
    expect(fillCardPlaceholders("{outgoing} → {incoming} {delta}", card("3", 3), card("8", 8, "♦"))).toBe("3♥ → 8♦ +5");
    expect(fillCardPlaceholders("{delta}", card("9", 9), card("4", 4))).toBe("−5");
    expect(fillCardPlaceholders("{delta}", card("7", 7), card("7", 7, "♦"))).toBe("=");
    expect(swapDelta(card("3", 3), null)).toBeNull();
  });
  it("efface les cartes inconnues au lieu de les trahir", () => {
    expect(fillCardPlaceholders("{outgoing} → {incoming} {delta}", null, null)).toBe("→");
    expect(fillCardPlaceholders("Échange {delta}", null, null)).toBe("Échange");
  });
  it("valide le public et la teinte du verdict", () => {
    const text = (extra: object) => ({ tracks: [{ id: "t", kind: "text", startMs: 0, durationMs: 800, text: "x", at: { kind: "screen", at: "center" }, ...extra }] });
    expect(paths(text({ audience: "others", verdictTone: true }))).toEqual([]);
    expect(paths(text({ audience: "tous" }))).toEqual(["c.tracks.0.audience"]);
    expect(paths(text({ verdictTone: "oui" }))).toEqual(["c.tracks.0.verdictTone"]);
  });
  it("piste V2 : zones, modèle, présentation et réorganisation validés ; durée = vol + montée + pause", () => {
    const v2 = (extra: object) => ({ tracks: [{ id: "t", kind: "v2", startMs: 100, durationMs: 690, cards: "resolved:incoming", from: { zone: "deck" }, to: { zone: "hand", player: "self" }, ...extra }] });
    expect(paths(v2({ present: { holdMs: 600, dy: -14, scale: 1.4 }, reflow: false, model: "v2_fluide" }))).toEqual([]);
    expect(paths(v2({ cards: "ghost" }))).toEqual(["c.tracks.0.cards"]);
    expect(paths(v2({ to: { zone: "timer", player: "self" } }))).toEqual(["c.tracks.0.to.zone"]);
    expect(paths(v2({ from: { zone: "hand", player: "personne" } }))).toEqual(["c.tracks.0.from.player"]);
    expect(paths(v2({ present: { holdMs: 5000, scale: 9 } }))).toEqual(["c.tracks.0.present.holdMs", "c.tracks.0.present.scale"]);
    expect(paths(v2({ model: "Pas Bon!" }))).toEqual(["c.tracks.0.model"]);
    expect(choreographyDuration(v2({}) as Choreography)).toBe(790);
    expect(choreographyDuration(v2({ present: { holdMs: 600 } }) as Choreography)).toBe(100 + 690 + 420 + 600);
  });
  it("Marché de Nuit : étal, choix en V2, verdict ; textes du lanceur et des autres", () => {
    const marche = CODE_POWER_MODULES.marche_nuit;
    expect(validatePowerCard({ def: marche.def, script: marche.script } as never)).toEqual([]);
    const choreo = marche.script.steps[0].choreo!;
    expect(choreographyDuration(choreo)).toBeLessThanOrEqual(6_000);
    expect(choreo.tracks.filter((track) => track.kind === "v2").map((track) => track.id)).toEqual(["depart", "choix"]);
    expect(choreo.tracks.filter((track) => track.kind === "cardPath" && track.cards === "ghost")).toHaveLength(4);
    expect(marche.def.activationTextOthers).toContain("{activator}");
  });
  it("Vent du Nord : la mise en scène en 4 temps est valide et tient en 5 s", () => {
    const vent = CODE_POWER_MODULES.vent_nord;
    expect(validatePowerCard({ def: vent.def, script: vent.script } as never)).toEqual([]);
    expect(vent.def.activationTextOthers).toContain("{activator}");
    const choreo = vent.script.steps[0].choreo!;
    expect(choreographyDuration(choreo)).toBeLessThanOrEqual(5_000);
    expect(choreo.tracks.filter((track) => track.kind === "text").map((track) => (track as { audience?: string }).audience)).toEqual(["activator", "others"]);
    // Vrais déplacements en V2, sans réorganisation (échange en place).
    expect(choreo.tracks.filter((track) => track.kind === "v2").map((track) => [track.id, (track as { reflow?: boolean }).reflow])).toEqual([["depart", false], ["tirage", false]]);
  });
  it("plusieurs cartes : listes, somme des écarts et nombre de cartes", () => {
    expect(fillCardPlaceholders("{outgoing} → {incoming} {delta}", [card("3", 3), card("5", 5)], [card("9", 9, "♦"), card("10", 10, "♦")])).toBe("3♥ 5♥ → 9♦ 10♦ +11");
    expect(fillCardPlaceholders("X t'a pris {cards}", null, null, 2)).toBe("X t'a pris 2 cartes");
    expect(fillCardPlaceholders("X t'a pris {cards}", null, null, 1)).toBe("X t'a pris 1 carte");
    expect(swapDelta([card("3", 3)], [])).toBeNull();
  });
  it("publics : la cible et les autres joueurs se distinguent", () => {
    expect(audienceSees("others", "target")).toBe(true);
    expect(audienceSees("others", "bystander")).toBe(true);
    expect(audienceSees("target", "bystander")).toBe(false);
    expect(audienceSees("bystanders", "target")).toBe(false);
    expect(audienceSees("activator", "target")).toBe(false);
    const text = (audience: string) => ({ tracks: [{ id: "t", kind: "text", startMs: 0, durationMs: 800, text: "x", at: { kind: "screen", at: "center" }, audience }] });
    expect(paths(text("target"))).toEqual([]);
    expect(paths(text("bystanders"))).toEqual([]);
  });
  it("piste V2 : présentation au centre de la table et échange en place validés", () => {
    const v2 = (extra: object) => ({ tracks: [{ id: "t", kind: "v2", startMs: 0, durationMs: 690, cards: "resolved:outgoing", from: { zone: "hand", player: "self" }, to: { zone: "hand", player: "target" }, ...extra }] });
    expect(paths(v2({ present: { holdMs: 900, at: "tableCenter" }, inPlace: true }))).toEqual([]);
    expect(paths(v2({ present: { holdMs: 900, at: "plafond" }, inPlace: "oui" }))).toEqual(["c.tracks.0.present.at", "c.tracks.0.inPlace"]);
  });
  it("Main du Griot : la raison suit le choix de la carte conseillée", () => {
    const c = (rank: string, value: number, suit: string) => ({ id: `${rank}${suit}`, rank, value, suit, color: "#000" });
    const state = (hand: object[], plays: object[]) => ({ players: [{ hand }], trickPlays: plays.map((card) => ({ playerIdx: 1, card })) }) as never;
    const hand = [c("3", 3, "♣"), c("9", 9, "♣"), c("5", 5, "♥")];
    // J'ouvre : la plus faible.
    expect(bestRecommendation(state(hand, []), 0)).toBe(0);
    expect(recommendationReason(state(hand, []), 0, 0)).toBe("Tu ouvres : joue petit, garde tes fortes");
    // Je peux battre le 7♣ : le 9♣, au plus juste.
    expect(bestRecommendation(state(hand, [c("7", 7, "♣")]), 0)).toBe(1);
    expect(recommendationReason(state(hand, [c("7", 7, "♣")]), 0, 1)).toBe("Bats le 7♣ au plus juste");
    // Le 10♣ est trop fort : mon plus petit trèfle.
    expect(recommendationReason(state(hand, [c("10", 10, "♣")]), 0, 0)).toBe("Le 10♣ est trop fort : joue petit");
    // Pas de carreau : défausse.
    expect(recommendationReason(state(hand, [c("4", 4, "♦")]), 0, 0)).toBe("Pas de ♦ : défausse ta plus faible");
  });
  it("Main du Griot : lecture, conseil retardé et raison ; script valide", () => {
    const griot = CODE_POWER_MODULES.main_griot;
    expect(validatePowerCard({ def: griot.def, script: griot.script } as never)).toEqual([]);
    const choreo = griot.script.steps[0].choreo!;
    expect(choreographyDuration(choreo)).toBeLessThanOrEqual(8_000);
    const effects = choreo.tracks.flatMap((track) => (track.kind === "element" ? [[track.effect, track.startMs]] : []));
    expect(effects).toEqual([["read", 0], ["advise", 1400]]);
    // La surbrillance du jeu arrive avec le conseil, pas avant la lecture.
    const cue = griot.script.steps[0].anim!.find((item) => item.cue === "highlightHandCard") as { delayMs?: number };
    expect(cue.delayMs).toBe(1400);
    expect(choreo.tracks.some((track) => track.kind === "text" && track.text === "{reason}" && track.audience === "activator")).toBe(true);
  });
  it("Éclair du Mfoundi : foudre sur la main, textes du lanceur et des autres ; script valide", () => {
    const eclair = CODE_POWER_MODULES.eclair_mfoundi;
    expect(validatePowerCard({ def: eclair.def, script: eclair.script } as never)).toEqual([]);
    expect(eclair.def.activationTextOthers).toContain("{activator}");
    const choreo = eclair.script.steps[0].choreo!;
    expect(choreographyDuration(choreo)).toBeLessThanOrEqual(3_000);
    expect(choreo.tracks.some((track) => track.kind === "element" && track.effect === "strike" && "player" in track.target && track.target.player === "self")).toBe(true);
    expect(new Set(choreo.tracks.flatMap((track) => (track.kind === "text" ? [track.audience] : [])))).toEqual(new Set(["activator", "others"]));
    // La règle reste : +2 sur la prochaine carte.
    expect(eclair.script.steps[0].ops).toEqual([{ op: "boostNextCard", player: "self", valueBonus: 2 }]);
  });
  it("Pagne Changeant : pagne sur la main, couleur demandée ; script valide, règle inchangée", () => {
    const pagne = CODE_POWER_MODULES.pagne_changeant;
    expect(validatePowerCard({ def: pagne.def, script: pagne.script } as never)).toEqual([]);
    expect(pagne.def.activationTextOthers).toContain("{activator}");
    const choreo = pagne.script.steps[0].choreo!;
    expect(choreographyDuration(choreo)).toBeLessThanOrEqual(3_500);
    expect(choreo.tracks.some((track) => track.kind === "element" && track.effect === "dye")).toBe(true);
    expect(choreo.tracks.filter((track) => track.kind === "text").every((track) => (track as { text: string }).text.includes("{suit}"))).toBe(true);
    expect(pagne.script.steps[0].ops).toEqual([{ op: "boostNextCard", player: "self", suitOverride: "led" }]);
    expect(pagne.script.conditions).toEqual([{ kind: "ledSuitKnown" }, { kind: "activatorLacksLedSuit" }]);
  });
  it("Coupe-Circuit et Filet du Pêcheur : plus faible contre plus forte ; arc sur la main de la cible", () => {
    const coupe = CODE_POWER_MODULES.coupe_circuit;
    const filet = CODE_POWER_MODULES.filet_pecheur;
    for (const card of [coupe, filet]) expect(validatePowerCard({ def: card.def, script: card.script } as never)).toEqual([]);
    const selectOf = (card: typeof coupe) => (card.script.steps[0].ops?.[0] as { select: { kind: string } }).select.kind;
    expect(selectOf(coupe)).toBe("weakest");
    expect(selectOf(filet)).toBe("strongest");
    const choreo = coupe.script.steps[0].choreo!;
    expect(choreographyDuration(choreo)).toBeLessThanOrEqual(3_000);
    expect(choreo.tracks.some((track) => track.kind === "element" && track.effect === "cut" && "player" in track.target && track.target.player === "target")).toBe(true);
    expect(new Set(choreo.tracks.flatMap((track) => (track.kind === "text" ? [track.audience] : [])))).toEqual(new Set(["activator", "target", "bystanders"]));
    // Filet : plus de filet ; un éclat sur la main de la cible (le projecteur sur la carte imposée vient de la couche
    // « prochaine carte », chez la cible seulement).
    const net = filet.script.steps[0].choreo!;
    expect(choreographyDuration(net)).toBeLessThanOrEqual(3_000);
    expect(net.tracks.some((track) => track.kind === "element" && track.effect === "net")).toBe(false);
    expect(net.tracks.some((track) => track.kind === "element" && track.effect === "glow" && "player" in track.target && track.target.player === "target")).toBe(true);
    expect(filet.def.activationTextOthers).toContain("{target}");
  });
  it("Sceau d'Entrave : sceau sur la carte, surbrillance retardée ; script valide, règle inchangée", () => {
    const sceau = CODE_POWER_MODULES.sceau_entrave;
    expect(validatePowerCard({ def: sceau.def, script: sceau.script } as never)).toEqual([]);
    expect(sceau.def.activationTextOthers).toContain("{target}");
    const choreo = sceau.script.steps[0].choreo!;
    expect(choreographyDuration(choreo)).toBeLessThanOrEqual(3_500);
    expect(choreo.tracks.some((track) => track.kind === "element" && track.effect === "stamp" && "player" in track.target && track.target.player === "target")).toBe(true);
    expect(new Set(choreo.tracks.flatMap((track) => (track.kind === "text" ? [track.audience] : [])))).toEqual(new Set(["activator", "target", "bystanders"]));
    const cue = sceau.script.steps[0].anim!.find((item) => item.cue === "highlightHandCard") as { delayMs?: number };
    expect(cue.delayMs).toBeGreaterThan(0);
    expect(sceau.script.steps[0].ops).toEqual([{ op: "blockNextLegalCard", player: "target", select: { kind: "random" }, minLegalChoices: 2 }]);
  });
  it("Pacte des Mains : croisement au centre, textes du lanceur, de la cible et des autres", () => {
    const pacte = CODE_POWER_MODULES.pacte_mains;
    expect(validatePowerCard({ def: pacte.def, script: pacte.script } as never)).toEqual([]);
    expect(pacte.def.activationTextOthers).toContain("{target}");
    const choreo = pacte.script.steps[0].choreo!;
    expect(choreographyDuration(choreo)).toBeLessThanOrEqual(5_000);
    const v2 = choreo.tracks.filter((track) => track.kind === "v2") as V2Track[];
    expect(v2.map((track) => [track.id, track.present?.at, track.inPlace])).toEqual([["offrande", "tableCenter", true], ["tribut", "tableCenter", true]]);
    // Les deux rangées repartent du centre au même moment : elles se croisent.
    const leaves = v2.map((track) => track.startMs + V2_PRESENT_RISE_MS + track.present!.holdMs);
    expect(leaves[0]).toBe(leaves[1]);
    expect(new Set(choreo.tracks.flatMap((track) => (track.kind === "text" ? [track.audience] : [])))).toEqual(new Set(["activator", "target", "bystanders"]));
  });
});
