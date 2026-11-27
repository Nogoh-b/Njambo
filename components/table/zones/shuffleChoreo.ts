/* ═══════════════ Chorégraphie du mélange : queue d'aronde puis paquets ═══════════════
   Fonctions pures (sans DOM) qui calculent, pour chaque carte de la pioche, les keyframes
   WAAPI du mélange joué au centre du plateau avant la donne :
   1. Queue d'aronde : coupe en deux, entrelacement carte par carte, pont, cascade, égalisation ;
   2. Paquets (optionnel) : paquets pris par-dessous et reposés sur le dessus, à partir de
      l'ordre obtenu par l'aronde (aucun retour au paquet initial).
   Les positions sont relatives à la pioche (0, 0 = carte posée), transform + z-index seulement. */

export type ShuffleBeatKind = "tick" | "flick" | "swish" | "tap";

export interface ShuffleBeat {
  /** Instant du son, en fraction de la durée totale du mélange (0–1). */
  at: number;
  kind: ShuffleBeatKind;
}

export interface ShuffleKeyframe {
  offset: number;
  transform: string;
  zIndex: number;
}

export interface ShufflePlan {
  /** Keyframes de chaque carte (index 0 = carte du dessous au départ). */
  cards: ShuffleKeyframe[][];
  beats: ShuffleBeat[];
  /** Fraction de la durée totale occupée par la queue d'aronde. */
  riffleShare: number;
}

export interface ShufflePlanOptions {
  cardW: number;
  cardH: number;
  /** Nombre de cartes animées (pair, ≥ 4). */
  count: number;
  riffleMs: number;
  packetsMs: number;
  /** Nombre d'images échantillonnées par carte. */
  frames?: number;
}

/** Point-clé : [t, x, y, rotation°, échelle, z-index] — t relatif à la phase. */
type Pt = [number, number, number, number, number, number];

const PACKET_SHAPE = [4, 3, 5, 3, 4];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function sampleTrack(pts: Pt[], t: number): Pt {
  if (t <= pts[0][0]) return pts[0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (t <= b[0]) {
      const u = easeInOut((t - a[0]) / (b[0] - a[0] || 1));
      return [t, lerp(a[1], b[1], u), lerp(a[2], b[2], u), lerp(a[3], b[3], u), lerp(a[4], b[4], u), u < 1 ? a[5] : b[5]];
    }
  }
  return pts[pts.length - 1];
}

/** Tailles des paquets successifs, proportionnelles au nombre de cartes. */
export function packetSizes(count: number): number[] {
  return PACKET_SHAPE.map((size) => Math.max(1, Math.round((size * count) / 14)));
}

/** Ordre de la pioche (du dessous au dessus) après l'entrelacement de la queue d'aronde. */
export function riffleOrder(count: number): number[] {
  const half = count / 2;
  const order: number[] = [];
  for (let i = 0; i < count; i++) {
    const h = i < half ? i : i - half;
    order[i < half ? 2 * h : 2 * h + 1] = i;
  }
  return order;
}

export function buildShufflePlan({ cardW, cardH, count, riffleMs, packetsMs, frames = 120 }: ShufflePlanOptions): ShufflePlan {
  const n = Math.max(4, count - (count % 2));
  const half = n / 2;
  const total = Math.max(1, riffleMs + Math.max(0, packetsMs));
  const RF = packetsMs > 0 ? riffleMs / total : 1;
  const depth = cardW * 0.006;
  const sx = (k: number) => -k * depth;
  const sy = (k: number) => -k * depth * 1.5;
  const rest = (k: number, t = 0): Pt => [t, sx(k), sy(k), 0, 1, k];

  /* ── 1. Queue d'aronde (t local 0–1, ramené à [0, RF]) ── */
  const tracks: Pt[][] = [];
  for (let i = 0; i < n; i++) {
    const side = i < half ? -1 : 1;
    const h = i < half ? i : i - half;
    const k = side < 0 ? 2 * h : 2 * h + 1;
    const hx = side * cardW * 0.78 + sx(h), hy = sy(h) - 4;
    const tk = 0.2 + k * (0.36 / n);
    const u = k / (n - 1), A = cardH * 0.3, span = cardW * 1.15;
    const slope = (-A * Math.PI * Math.cos(Math.PI * u)) / span;
    const bx = (u - 0.5) * span, by = -Math.sin(Math.PI * u) * A - 10, br = (Math.atan(slope) * 180) / Math.PI;
    const tc = 0.76 + k * (0.12 / n);
    const local: Pt[] = [
      rest(i),
      [0.15, hx, hy, side * -7, 1.02, 20 + h],
      [Math.max(0.16, tk - 0.03), hx - side * 3, hy - 3, side * -12, 1.03, 20 + h],
      [tk, hx * 0.35, sy(k) - 6, side * -4, 1.01, 40 + k],
      [tk + 0.03, sx(k), sy(k), 0, 1, k],
      [0.6, sx(k), sy(k), 0, 1, k],
      [0.7, bx, by, br, 1.04, k],
      [tc, bx, by - 2, br, 1.04, k],
      [tc + 0.05, sx(k), sy(k), 0, 1, k],
      [0.93, sx(k), sy(k) + 1, 0, 1.035, k],
      [1, sx(k), sy(k), 0, 1, k],
    ];
    tracks[i] = local.map(([t, ...rest]) => [t * RF, ...rest] as Pt);
  }

  const beats: ShuffleBeat[] = [{ at: 0.02 * RF, kind: "swish" }];
  for (let k = 0; k < n; k += 2) beats.push({ at: (0.2 + k * (0.36 / n) + 0.02) * RF, kind: "tick" });
  beats.push({ at: 0.62 * RF, kind: "swish" });
  for (let k = 0; k < 4; k++) beats.push({ at: (0.77 + k * 0.03) * RF, kind: "tick" });
  beats.push({ at: 0.95 * RF, kind: "tap" });

  /* ── 2. Paquets pris par-dessous, reposés sur le dessus ── */
  let order = riffleOrder(n);
  if (RF < 1) {
    const P0 = RF + 0.01, END = 0.96;
    const sizes = packetSizes(n);
    const L = (END - P0) / sizes.length;
    sizes.forEach((m, p) => {
      const ps = P0 + p * L;
      const moving = order.slice(0, m), next = order.slice(m).concat(moving);
      const side = p % 2 ? -1 : 1;
      order.forEach((id, idx) => tracks[id].push([ps, sx(idx), sy(idx), 0, 1, moving.includes(id) ? 60 + idx : idx]));
      moving.forEach((id, j) => {
        const to = next.indexOf(id);
        tracks[id].push([ps + L * 0.42, side * cardW * 0.16 + sx(j), -cardH * 0.82 + sy(j), side * 7, 1.04, 60 + j]);
        tracks[id].push([ps + L * 0.72, sx(to), -cardH * 0.16 + sy(to), side * 2, 1.02, 60 + j]);
      });
      next.forEach((id, idx) => tracks[id].push([ps + L * 0.95, sx(idx), sy(idx), 0, 1, idx]));
      beats.push({ at: ps + L * 0.15, kind: "flick" }, { at: ps + L * 0.9, kind: "tap" });
      order = next;
    });
    order.forEach((id, idx) => tracks[id].push([END, sx(idx), sy(idx) + 1, 0, 1.035, idx], [1, sx(idx), sy(idx), 0, 1, idx]));
    beats.push({ at: 0.97, kind: "tap" });
  }

  const cards = tracks.map((pts) => {
    const kf: ShuffleKeyframe[] = [];
    for (let f = 0; f <= frames; f++) {
      const t = f / frames;
      const [, x, y, r, s, z] = sampleTrack(pts, t);
      kf.push({
        offset: t,
        transform: `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${r.toFixed(2)}deg) scale(${s.toFixed(3)})`,
        zIndex: Math.round(z),
      });
    }
    return kf;
  });

  return { cards, beats: beats.sort((a, b) => a.at - b.at), riffleShare: RF };
}

/** Répartit la durée totale d'une partie entre aronde et paquets selon le réglage admin (même proportion). */
export function splitShuffleMs(totalMs: number, configTotalMs: number, configPacketsMs: number): { riffleMs: number; packetsMs: number } {
  if (totalMs <= 0) return { riffleMs: 0, packetsMs: 0 };
  const share = configTotalMs > 0 ? Math.min(0.75, Math.max(0, configPacketsMs / configTotalMs)) : 0;
  const packetsMs = Math.round(totalMs * share);
  return { riffleMs: totalMs - packetsMs, packetsMs };
}
