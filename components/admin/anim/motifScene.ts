/* ═══════════════ Scène de l'atelier d'animations (phase G3) ═══════════════
   Table schématique (repère 390 × 800, portrait) où l'atelier rejoue un
   modèle à n'importe quel instant : fonctions PURES, donc on peut parcourir
   l'animation au ralenti ou image par image. Chaque carte est évaluée par
   `sampleFlight` (engine/anim/sample) : exactement le calcul du jeu.

   Les rôles d'un modèle sont placés sur des sièges fixes :
   lanceur = en bas (moi), cible = en haut, gagnant = à droite,
   chaque adversaire = gauche + haut + droite, chacun = tous. */

import { isMultiAnchor, motifTotalMs, sameAnchor, type AnimMotif, type MotifAnchor, type MotifPlayer, type MotifReactionType, PREVIEW_ZONES } from "@/engine/anim/motif";
import { motifReactionInstances, motifSchedule, sampleFlight, type CardFrame, type MotifSlot } from "@/engine/anim/sample";

export const SCENE_W = 390;
export const SCENE_H = 800;
export const CARD_W = 62;
export const CARD_H = 90;

export type Seat = "me" | "top" | "left" | "right";
export type SceneZone =
  | `${"hand" | "deposit" | "avatar"}:${Seat}`
  | "deck" | "pot" | "center" | "reveal"
  | `off:${"top" | "bottom" | "left" | "right"}`;

export const ZONE_POINTS: Record<SceneZone, { x: number; y: number }> = {
  deck: { x: 150, y: 300 }, pot: { x: 262, y: 300 }, center: { x: 195, y: 432 }, reveal: { x: 195, y: 372 },
  "hand:me": { x: 195, y: 738 }, "deposit:me": { x: 195, y: 505 }, "avatar:me": { x: 40, y: 667 },
  "hand:top": { x: 195, y: 166 }, "deposit:top": { x: 195, y: 232 }, "avatar:top": { x: 195, y: 86 },
  "hand:left": { x: 16, y: 352 }, "deposit:left": { x: 82, y: 400 }, "avatar:left": { x: 44, y: 262 },
  "hand:right": { x: 374, y: 352 }, "deposit:right": { x: 308, y: 400 }, "avatar:right": { x: 346, y: 262 },
  "off:top": { x: 195, y: -70 }, "off:bottom": { x: 195, y: 880 }, "off:left": { x: -70, y: 400 }, "off:right": { x: 460, y: 400 },
};

export const ROLE_SEATS: Record<MotifPlayer, Seat[]> = {
  self: ["me"], target: ["top"], winner: ["right"], all: ["left", "top", "right", "me"], all_opponents: ["left", "top", "right"],
};
const SEAT_ROLE: Record<Seat, MotifPlayer> = { me: "self", top: "target", right: "winner", left: "all_opponents" };
export const SEAT_LABELS: Record<Seat, string> = { me: "Lanceur (toi)", top: "Cible", right: "Gagnant", left: "Chaque adversaire" };

const LAYOUT: readonly SceneZone[] = ["hand:top", "hand:left", "hand:right", "deposit:top", "deposit:left", "deposit:right", "center", "deposit:me", "hand:me"];
const isLayout = (zone: SceneZone) => LAYOUT.includes(zone);
const isOppHand = (zone: SceneZone) => zone === "hand:top" || zone === "hand:left" || zone === "hand:right";
const SINKS = (zone: SceneZone) => zone === "deck" || zone === "pot" || zone === "reveal" || zone.startsWith("avatar:") || zone.startsWith("off:");
const DEP_ROT = [-4, 5, -2, 7, -6, 3], CEN_ROT = [-3, 2, -1, 3, -2, 1];
const POOL = ["A♠", "7♦", "Q♣", "5♥", "10♠", "2♦", "K♥", "8♠", "J♣", "6♦", "4♥", "9♣"];
const BASE_SCENE: Record<string, string[] | number> = {
  "hand:me": ["9♥", "10♥", "6♥", "9♠", "8♣"], "hand:top": 4, "hand:left": 4, "hand:right": 4,
  "deposit:top": ["K♠"], "deposit:left": ["4♣"], "deposit:right": ["J♦"], "deposit:me": [], center: [],
};

export interface SceneCard { id: string; down: boolean }
export interface SceneSlot extends MotifSlot { faceKnown: boolean }

/** Zones de la table schématique désignées par un repère (plusieurs pour « chacun »). */
export function anchorZones(anchor: MotifAnchor): SceneZone[] {
  if ("player" in anchor) {
    const zone = anchor.zone === "timer" ? "avatar" : anchor.zone;
    return ROLE_SEATS[anchor.player].map((seat) => `${zone}:${seat}` as SceneZone);
  }
  if (anchor.zone === "offscreen") return [`off:${anchor.side}`];
  return [anchor.zone];
}

/** Repère correspondant à une zone de la table (poignée A / B lâchée sur le schéma). */
export function zoneAnchor(zone: SceneZone): MotifAnchor {
  if (zone.startsWith("off:")) return { zone: "offscreen", side: zone.slice(4) as "top" };
  const [kind, seat] = zone.split(":") as [string, Seat | undefined];
  if (seat) return { zone: kind as "hand", player: SEAT_ROLE[seat] };
  return { zone: zone as "deck" };
}

/** Position affichable d'une zone (les bords de l'écran sont ramenés dans le cadre). */
export function zoneDisplay(zone: SceneZone) {
  const point = ZONE_POINTS[zone];
  return { x: Math.max(14, Math.min(SCENE_W - 14, point.x)), y: Math.max(14, Math.min(SCENE_H - 14, point.y)) };
}

/** Emplacements des cartes d'une zone qui en contient n (s = échelle d'une carte de main). */
export function slots(zone: SceneZone, n: number): SceneSlot[] {
  const a = ZONE_POINTS[zone];
  return Array.from({ length: n }, (_, i) => {
    const off = i - (n - 1) / 2;
    if (zone === "hand:me") {
      const sp = n > 1 ? Math.min(46, 230 / (n - 1)) : 0, ang = n > 1 ? Math.min(7, 30 / (n - 1)) : 0;
      return { x: a.x + off * sp, y: a.y + off * off * 2.6, scale: 1, rotate: off * ang, face: 0, faceKnown: true };
    }
    if (zone === "hand:top") return { x: a.x + off * 10, y: a.y + Math.abs(off) * 1.2, scale: 0.48, rotate: 180 - off * 4, face: 180, faceKnown: true };
    if (zone === "hand:left") return { x: a.x + Math.abs(off) * 1.2, y: a.y + off * 12, scale: 0.48, rotate: 90 + off * 4, face: 180, faceKnown: true };
    if (zone === "hand:right") return { x: a.x - Math.abs(off) * 1.2, y: a.y + off * 12, scale: 0.48, rotate: -90 - off * 4, face: 180, faceKnown: true };
    if (zone.startsWith("deposit:")) return { x: a.x + off * 8, y: a.y - i * 3, scale: 0.74, rotate: DEP_ROT[i % DEP_ROT.length], face: 0, faceKnown: true };
    return { x: a.x + off * (n > 3 ? 150 / (n - 1) : 50), y: a.y, scale: 0.74, rotate: CEN_ROT[i % CEN_ROT.length], face: 0, faceKnown: true };
  });
}

function pointSlot(zone: SceneZone): SceneSlot {
  const a = ZONE_POINTS[zone];
  if (zone === "deck") return { x: a.x, y: a.y, scale: 0.74, rotate: -4, face: 180, faceKnown: true };
  if (zone.startsWith("avatar:") || zone === "pot") return { x: a.x, y: a.y, scale: 0.6, rotate: 0, face: 0, faceKnown: true };
  if (zone === "reveal") return { x: a.x, y: a.y, scale: 1, rotate: 0, face: 0, faceKnown: true };
  return { x: a.x, y: a.y, scale: 0.74, rotate: 0, face: 0, faceKnown: false };
}

const parseCard = (label: string): SceneCard => ({ id: label.replace("*", ""), down: label.endsWith("*") });
const zBase = (zone: SceneZone) => (zone === "hand:me" ? 300 : isOppHand(zone) ? 20 : zone === "center" ? 80 : 60);

export interface SceneFlight {
  k: number;
  key: string;
  card: SceneCard;
  fromZone: SceneZone;
  toZone: SceneZone;
  from: SceneSlot;
  to: SceneSlot;
  startMs: number;
  endMs: number;
  zBefore: number;
  zAfter: number;
}

export interface ScenePlan {
  motif: AnimMotif;
  scene: Record<string, SceneCard[]>;
  inPlace: boolean;
  flights: SceneFlight[];
  /** Index des cartes qui partent, par zone de départ. */
  picks: Map<SceneZone, number[]>;
  before: Map<SceneZone, SceneSlot[]>;
  after: Map<SceneZone, SceneSlot[]>;
  closeAt: Map<SceneZone, number>;
  spreadWindow: Map<SceneZone, [number, number]>;
  totalMs: number;
}

/** Plan d'une animation sur la table schématique (calculé une fois, lu à chaque image). */
export function buildScenePlan(motif: AnimMotif): ScenePlan {
  const scene: Record<string, SceneCard[]> = {};
  for (const zone of LAYOUT) {
    const value = motif.preview?.setup?.[zone as (typeof PREVIEW_ZONES)[number]] ?? BASE_SCENE[zone];
    scene[zone] = typeof value === "number"
      ? Array.from({ length: value }, (_, i) => ({ id: POOL[(i + 5) % POOL.length], down: true }))
      : (value ?? []).map(parseCard);
  }
  const fromZones = anchorZones(motif.from), toZones = anchorZones(motif.to);
  const inPlace = sameAnchor(motif.from, motif.to);
  const perSide = Math.max(1, motif.count);
  const total = perSide * (isMultiAnchor(motif.from) ? fromZones.length : isMultiAnchor(motif.to) ? toZones.length : 1);
  const sourceOf = (k: number) => fromZones[isMultiAnchor(motif.from) ? k % fromZones.length : 0];
  const destOf = (k: number) => inPlace ? sourceOf(k) : toZones[isMultiAnchor(motif.to) ? k % toZones.length : 0];

  // Cartes prises dans les zones de départ.
  const picks = new Map<SceneZone, number[]>();
  const takenCount = new Map<SceneZone, number>();
  for (let k = 0; k < total; k++) takenCount.set(sourceOf(k), (takenCount.get(sourceOf(k)) ?? 0) + 1);
  for (const [zone, n] of takenCount) {
    if (!isLayout(zone)) continue;
    const cards = scene[zone];
    while (cards.length < n) cards.push({ id: POOL[(cards.length + 3) % POOL.length], down: isOppHand(zone) });
    const start = motif.preview?.pick != null && zone === fromZones[0] ? Math.max(0, Math.min(cards.length - n, motif.preview.pick)) : cards.length - n;
    picks.set(zone, Array.from({ length: n }, (_, i) => start + i));
  }
  const before = new Map<SceneZone, SceneSlot[]>(), after = new Map<SceneZone, SceneSlot[]>();
  for (const zone of LAYOUT) before.set(zone, slots(zone, scene[zone].length));
  for (const [zone, indexes] of picks) if (!inPlace) after.set(zone, slots(zone, scene[zone].length - indexes.length));
  const arrivals = new Map<SceneZone, number>();
  if (!inPlace) for (let k = 0; k < total; k++) if (isLayout(destOf(k))) arrivals.set(destOf(k), (arrivals.get(destOf(k)) ?? 0) + 1);
  for (const [zone, n] of arrivals) after.set(zone, slots(zone, scene[zone].length + n));

  const schedule = motifSchedule(motif, total);
  const usedPerZone = new Map<SceneZone, number>(), arrivedPerZone = new Map<SceneZone, number>();
  const flights: SceneFlight[] = [];
  for (let k = 0; k < total; k++) {
    const fromZone = sourceOf(k), toZone = destOf(k);
    let card: SceneCard, from: SceneSlot, key: string, zBefore: number;
    if (isLayout(fromZone)) {
      const order = usedPerZone.get(fromZone) ?? 0;
      usedPerZone.set(fromZone, order + 1);
      const index = picks.get(fromZone)![order];
      card = scene[fromZone][index];
      const slot = before.get(fromZone)![index];
      from = { ...slot, face: card.down ? 180 : slot.face };
      key = `${fromZone}#${index}`;
      zBefore = zBase(fromZone) + index;
    } else {
      const labels = motif.preview?.cards ?? POOL;
      card = parseCard(labels[k % labels.length]);
      const slot = pointSlot(fromZone);
      from = { ...slot, face: slot.faceKnown ? slot.face : 180 };
      key = `gen#${k}`;
      zBefore = 650 + k;
    }
    let to: SceneSlot, zAfter = zBefore;
    if (inPlace) to = { ...from };
    else if (isLayout(toZone)) {
      const order = arrivedPerZone.get(toZone) ?? 0;
      arrivedPerZone.set(toZone, order + 1);
      const index = scene[toZone].length + order;
      to = { ...after.get(toZone)![index] };
      zAfter = zBase(toZone) + index;
    } else {
      const slot = pointSlot(toZone);
      to = { ...slot, face: slot.faceKnown ? slot.face : from.face };
    }
    flights.push({ k, key, card, fromZone, toZone, from, to, startMs: schedule[k].startMs, endMs: schedule[k].endMs, zBefore, zAfter });
  }

  const closeAt = new Map<SceneZone, number>(), spreadWindow = new Map<SceneZone, [number, number]>();
  for (const zone of picks.keys()) closeAt.set(zone, Math.min(...flights.filter((flight) => flight.fromZone === zone).map((flight) => flight.startMs)));
  for (const zone of arrivals.keys()) {
    const ends = flights.filter((flight) => flight.toZone === zone).map((flight) => flight.endMs);
    spreadWindow.set(zone, [Math.min(...ends) - 340, Math.max(...ends)]);
  }
  return { motif, scene, inPlace, flights, picks, before, after, closeAt, spreadWindow, totalMs: Math.max(300, motifTotalMs(motif, total)) };
}

/* ─────────────── Image à un instant donné ─────────────── */

export interface SceneItem {
  key: string;
  card: SceneCard;
  frame: Pick<CardFrame, "x" | "y" | "rotate" | "scale" | "scaleX" | "scaleY" | "flip" | "opacity" | "glow" | "lift">;
  z: number;
  dim: number;
}

export interface SceneEffect {
  type: MotifReactionType;
  x: number;
  y: number;
  /** Avancée de l'effet (0 → 1). */
  q: number;
}

const smooth = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
const lerpSlot = (a: SceneSlot, b: SceneSlot, u: number): SceneSlot => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, rotate: a.rotate + (b.rotate - a.rotate) * u, scale: a.scale + (b.scale - a.scale) * u, face: b.face, faceKnown: true });
const restFrame = (slot: SceneSlot, card: SceneCard, lift = 0) => ({ x: slot.x, y: slot.y, rotate: slot.rotate, scale: slot.scale, scaleX: 1, scaleY: 1, flip: card.down ? 180 : slot.face, opacity: 1, glow: 0, lift });

function reactionPoint(plan: ScenePlan, type: MotifReactionType, at: unknown, flight: SceneFlight) {
  if (type === "avatarPulse" || type === "nkap") {
    const zone = at && typeof at === "object" ? anchorZones(at as MotifAnchor)[0] : at === "from" ? flight.fromZone : flight.toZone;
    return ZONE_POINTS[zone.startsWith("avatar:") ? zone : "avatar:me"];
  }
  if (type === "deckShake") return ZONE_POINTS.deck;
  if (at && typeof at === "object") return zoneDisplay(anchorZones(at as MotifAnchor)[0]);
  const slot = at === "from" ? flight.from : flight.to;
  return { x: slot.x, y: slot.y };
}

/** Cartes et effets de la scène au temps t (ms depuis le début). */
export function sceneFrame(plan: ScenePlan, t: number): { items: SceneItem[]; effects: SceneEffect[] } {
  const { motif } = plan;
  const effects: SceneEffect[] = [];
  let dim = 0;
  for (const instance of motifReactionInstances(motif, plan.flights.length)) {
    const q = (t - instance.atMs) / instance.durationMs;
    const flight = plan.flights[instance.flight] ?? plan.flights[0];
    const point = reactionPoint(plan, instance.reaction.type, instance.reaction.at, flight);
    if (instance.reaction.type === "crown") { if (q >= 0) effects.push({ type: "crown", x: point.x, y: point.y - 46 * (flight.to.scale || 0.74), q: Math.min(1, q) }); continue; }
    if (q < 0 || q > 1) continue;
    if (instance.reaction.type === "dim") dim = Math.max(dim, smooth(q * 5) * smooth((1 - q) * 5));
    effects.push({ type: instance.reaction.type, x: point.x, y: point.y, q });
  }

  const items: SceneItem[] = [];
  for (const zone of LAYOUT) {
    const cards = plan.scene[zone];
    if (!cards.length) continue;
    const picked = plan.picks.get(zone) ?? [];
    const beforeSlots = plan.before.get(zone)!;
    if (picked.length && !plan.inPlace) {
      const progress = smooth((t - (plan.closeAt.get(zone) ?? 0) - 40) / 360), afterSlots = plan.after.get(zone)!;
      let j = 0;
      cards.forEach((card, i) => { if (!picked.includes(i)) items.push({ key: `${zone}#${i}`, card, frame: restFrame(lerpSlot(beforeSlots[i], afterSlots[j++], progress), card, zone === "hand:me" ? 0.15 : 0), z: zBase(zone) + i, dim: 0 }); });
    } else if (plan.spreadWindow.has(zone)) {
      const [a, b] = plan.spreadWindow.get(zone)!, progress = smooth((t - a) / Math.max(1, b - a)), afterSlots = plan.after.get(zone)!;
      cards.forEach((card, i) => items.push({ key: `${zone}#${i}`, card, frame: restFrame(lerpSlot(beforeSlots[i], afterSlots[i], progress), card, zone === "hand:me" ? 0.15 : 0), z: zBase(zone) + i, dim: 0 }));
    } else {
      cards.forEach((card, i) => {
        if (plan.inPlace && picked.includes(i)) return;
        items.push({ key: `${zone}#${i}`, card, frame: restFrame(beforeSlots[i], card, zone === "hand:me" ? 0.15 : 0), z: zBase(zone) + i, dim: picked.length ? dim : 0 });
      });
    }
  }
  for (const flight of plan.flights) {
    const local = t - flight.startMs;
    const frame = sampleFlight(motif, { from: flight.from, to: flight.to }, local);
    if (frame.phase === "waiting" && !isLayout(flight.fromZone)) continue;
    if (frame.phase === "landed" && !plan.inPlace && SINKS(flight.toZone)) continue;
    if (frame.phase === "landed" && plan.inPlace && !isLayout(flight.fromZone)) continue;
    const z = plan.inPlace ? flight.zBefore + 60 : frame.phase === "landed" ? flight.zAfter : frame.phase === "waiting" ? flight.zBefore : 700 + flight.k;
    items.push({ key: flight.key, card: flight.card, frame, z, dim: 0 });
  }
  return { items, effects };
}

/** Trajectoire échantillonnée d'un vol (schéma) : points à intervalles de temps égaux. */
export function flightSamples(plan: ScenePlan, flight: SceneFlight, steps = 16) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const frame = sampleFlight(plan.motif, { from: flight.from, to: flight.to }, (i / steps) * plan.motif.durationMs);
    return { x: frame.x, y: frame.y, flip: frame.flip };
  });
}
