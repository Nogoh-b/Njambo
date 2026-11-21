/* ═══════════════ Évaluation d'un modèle d'animation ═══════════════
   Fonctions PURES : l'état d'une carte à un instant donné ne dépend que du
   modèle, de la géométrie (emplacements de départ et d'arrivée) et du temps.
   Le lecteur en jeu, l'atelier de l'admin et les tests s'en servent ; on
   peut donc parcourir une animation au ralenti ou image par image. */

import { MOTIF_REACTIONS, SQUASH_MS, sameAnchor, type AnimMotif, type Bezier, type LanePoint, type MotifReaction, type MotifWaypoint } from "./motif";

export interface Point { x: number; y: number }
/** Emplacement d'une carte : centre, rotation (°), échelle et face (0 visible, 180 dos). */
export interface MotifSlot extends Point { rotate: number; scale: number; face: 0 | 180 }
export interface FlightGeometry { from: MotifSlot; to: MotifSlot }

export interface CardFrame extends Point {
  phase: "waiting" | "flying" | "landed";
  rotate: number;
  scale: number;
  /** Écrasement à l'atterrissage (multiplie `scale` sur chaque axe). */
  scaleX: number;
  scaleY: number;
  /** Angle du retournement : 0 face visible, 180 dos. */
  flip: number;
  opacity: number;
  glow: number;
  lift: number;
  /** Avancée sur la trajectoire (0 départ, 1 arrivée ; peut déborder avec un rebond). */
  progress: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ─────────────── Courbes ─────────────── */

const bezierCache = new Map<string, (x: number) => number>();

/** Courbe de Bézier cubique façon CSS `cubic-bezier(x1, y1, x2, y2)`. */
export function cubicBezier(curve: Bezier): (x: number) => number {
  const key = curve.join(",");
  const cached = bezierCache.get(key);
  if (cached) return cached;
  const [x1, y1, x2, y2] = curve;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const fn = (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-7) return sampleY(t);
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 60; i++) {
      const value = sampleX(t);
      if (Math.abs(value - x) < 1e-7) break;
      if (value < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
  bezierCache.set(key, fn);
  return fn;
}

/** Valeur d'une piste au temps t (0–1) ; la courbe d'un point s'applique jusqu'au point suivant. */
export function laneValue(points: LanePoint[], t: number): number {
  if (points.length === 0) return 0;
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (t > x1) continue;
    const [x0, y0, curve] = points[i - 1];
    if (x1 === x0) return y1;
    const u = (t - x0) / (x1 - x0);
    return y0 + (y1 - y0) * (curve ? cubicBezier(curve)(u) : u);
  }
  return points[points.length - 1][1];
}

/* ─────────────── Trajectoire ─────────────── */

export function waypointPosition(point: MotifWaypoint, from: Point, to: Point): Point {
  const dx = to.x - from.x, dy = to.y - from.y, distance = Math.hypot(dx, dy);
  let x: number, y: number;
  if (point.frame === "screen") {
    x = from.x + point.fx * dx;
    y = from.y + point.fy * dy;
  } else {
    const nx = distance ? -dy / distance : 0, ny = distance ? dx / distance : 0, perp = (point.perp ?? 0) * distance;
    x = from.x + point.along * dx + nx * perp;
    y = from.y + point.along * dy + ny * perp;
  }
  if (point.rise) {
    let rise = Math.abs(point.rise) * distance;
    if (point.riseMinPx !== undefined) rise = Math.max(rise, point.riseMinPx);
    if (point.riseMaxPx !== undefined) rise = Math.min(rise, point.riseMaxPx);
    y -= Math.sign(point.rise) * rise;
  }
  return { x, y };
}

/** Point de contrôle du bombé (courbe de Bézier quadratique sans point de passage). */
export function arcControl(from: Point, to: Point, arc: AnimMotif["path"]["arc"]): Point {
  const dx = to.x - from.x, dy = to.y - from.y, distance = Math.hypot(dx, dy);
  if (distance < 1e-6) return { x: from.x, y: from.y };
  const nx = -dy / distance, ny = dx / distance;
  return { x: from.x + dx * arc.along + nx * arc.perp * distance, y: from.y + dy * arc.along + ny * arc.perp * distance };
}

const quadratic = (a: Point, c: Point, b: Point, t: number): Point => {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
};

function segmentPoint(points: Point[], index: number, u: number, smooth: boolean): Point {
  const p1 = points[index], p2 = points[index + 1];
  if (!smooth) return { x: lerp(p1.x, p2.x, u), y: lerp(p1.y, p2.y, u) };
  const p0 = points[index - 1] ?? p1, p3 = points[index + 2] ?? p2;
  const u2 = u * u, u3 = u2 * u;
  const axis = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
  return { x: axis(p0.x, p1.x, p2.x, p3.x), y: axis(p0.y, p1.y, p2.y, p3.y) };
}

/** Position sur la trajectoire au temps p (0–1 du vol) et avancée correspondante. */
export function pathAt(motif: AnimMotif, from: Point, to: Point, p: number): { point: Point; progress: number } {
  const { path } = motif;
  const ease = cubicBezier(path.easing);
  if (path.via.length === 0) {
    const q = clamp(ease(p), -0.25, 1.25);
    return { point: quadratic(from, arcControl(from, to, path.arc), to, q), progress: q };
  }
  const points = [from, ...path.via.map((point) => waypointPosition(point, from, to)), to];
  const times = [0, ...path.via.map((point) => point.t), 1];
  const last = times.length - 2;
  const segmentOf = (value: number) => {
    if (value < 0) return 0;
    for (let i = 0; i < last; i++) if (value < times[i + 1]) return i;
    return last;
  };
  let segment: number, u: number;
  if (path.timing === "perSegment") {
    segment = segmentOf(p);
    u = ease((p - times[segment]) / (times[segment + 1] - times[segment]));
  } else {
    const q = ease(p);
    segment = segmentOf(q);
    u = (q - times[segment]) / (times[segment + 1] - times[segment]);
  }
  u = clamp(u, -0.3, 1.3);
  return { point: segmentPoint(points, segment, u, path.smooth), progress: times[segment] + u * (times[segment + 1] - times[segment]) };
}

/* ─────────────── État d'une carte ─────────────── */

function flipAt(motif: AnimMotif, geometry: FlightGeometry, p: number): number {
  const { face } = motif;
  if (face.mode === "lane") return laneValue(motif.lanes.flip, p);
  const a = geometry.from.face, b = geometry.to.face;
  if (a === b) return a;
  const [start, end] = face.window;
  return lerp(a, b, cubicBezier(face.easing)(clamp01((p - start) / (end - start))));
}

/** État d'une carte `elapsedMs` après SON départ (négatif : pas encore partie). */
export function sampleFlight(motif: AnimMotif, geometry: FlightGeometry, elapsedMs: number): CardFrame {
  const raw = elapsedMs / motif.durationMs;
  const phase = raw < 0 ? "waiting" : raw > 1 ? "landed" : "flying";
  const p = clamp01(raw);
  const { from, to } = geometry;
  const { point, progress } = pathAt(motif, from, to, p);
  const k = clamp01(progress);
  const { lanes } = motif;
  const sizeK = lanes.sizeBlend ? laneValue(lanes.sizeBlend, p) : k;
  const turnK = lanes.turnBlend ? laneValue(lanes.turnBlend, p) : k;
  let scaleX = 1, scaleY = 1;
  const sinceArrival = elapsedMs - motif.durationMs;
  if (motif.squash && phase === "landed" && sinceArrival < SQUASH_MS && !sameAnchor(motif.from, motif.to)) {
    const q = sinceArrival / SQUASH_MS, squash = Math.sin(q * Math.PI * 2) * (1 - q) * 0.16;
    scaleX = 1 + squash;
    scaleY = 1 - squash;
  }
  return {
    phase, x: point.x, y: point.y,
    rotate: lerp(from.rotate, to.rotate, turnK) + laneValue(lanes.rotate, p),
    scale: lerp(from.scale, to.scale, sizeK) * laneValue(lanes.scale, p),
    scaleX, scaleY,
    flip: flipAt(motif, geometry, p),
    opacity: laneValue(lanes.opacity, p),
    glow: laneValue(lanes.glow, p),
    lift: laneValue(lanes.lift, p),
    progress,
  };
}

/* ─────────────── Calendrier : vols et réactions ─────────────── */

export interface FlightTiming { index: number; startMs: number; endMs: number }

export function motifSchedule(motif: AnimMotif, flights: number): FlightTiming[] {
  return Array.from({ length: Math.max(1, flights) }, (_, index) => {
    const startMs = index * motif.staggerMs;
    return { index, startMs, endMs: startMs + motif.durationMs };
  });
}

export interface ReactionInstance {
  reaction: MotifReaction;
  /** Index de la réaction dans le modèle. */
  reactionIndex: number;
  /** Vol de référence (pour « départ » / « arrivée »). */
  flight: number;
  atMs: number;
  durationMs: number;
}

/** Réactions à jouer : une par carte si « pour chaque carte », sinon départ de la première / arrivée de la dernière. */
export function motifReactionInstances(motif: AnimMotif, flights: number): ReactionInstance[] {
  const schedule = motifSchedule(motif, flights);
  const out: ReactionInstance[] = [];
  motif.reactions.forEach((reaction, reactionIndex) => {
    const def = MOTIF_REACTIONS[reaction.type];
    if (!def) return;
    const refs = reaction.each ? schedule : [reaction.anchor === "start" ? schedule[0] : schedule[schedule.length - 1]];
    for (const ref of refs) {
      out.push({
        reaction, reactionIndex, flight: ref.index,
        atMs: (reaction.anchor === "start" ? ref.startMs : ref.endMs) + reaction.offsetMs,
        durationMs: reaction.durationMs ?? def.durationMs,
      });
    }
  });
  return out;
}
