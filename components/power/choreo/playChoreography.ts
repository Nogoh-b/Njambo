/* ═══════════════ Lecteur de chorégraphies ═══════════════
   Joue une `Choreography` (engine/power/choreography.ts) sur la table réelle
   ou sur la table de démonstration de l'admin : mêmes repères (zones du
   registre + écran), mêmes pistes. Uniquement transform / opacity / filter
   (composité GPU) via la Web Animations API ; aucune dépendance au moteur.
   Animations désactivées → les pistes sont sautées (les effets réels du jeu
   ne dépendent jamais de la mise en scène). */

import type { ZoneRegistry } from "@/components/table/zones/ZoneRegistry";
import { zonePoseOf, type ZoneRef } from "@/components/table/zones/zonePose";
import { DEFAULT_ANIMS_V2 } from "@/engine/anim/v2/defaults";
import type { ZonePose } from "@/engine/anim/v2/pose";
import { getAnimV2 } from "@/engine/anim/v2/registry";
import { DEFAULT_V2_MODEL, V2_PRESENT_RISE_MS, audienceSees, motifOfTrack, type Anchor, type ChoreoViewer, type ChoreoTrack, type Choreography, type ElementTarget, type Easing, type MotifTrack, type V2Track, type V2ZoneAnchor, type Waypoint } from "@/engine/power/choreography";
import type { PlayerRef, PowerFxIntensity, PowerFxPreset, PowerFxTone } from "@/engine/power/types";
import type { Card } from "@/types/game";
import type { ChoreoLayerHandle } from "./ChoreoLayer";
import { motifPlayersUi, playMotif } from "./playMotif";
import { playAnimV2, type AnimV2Move } from "./playAnimV2";
import { backOut, drawChain, drawPadlock, drawRing, drawRune, easeOut, jolt, sealCorners, seg, sineInOut, spring } from "./sealArt";

/** Pistes qui font voler des cartes (trajectoire libre, modèle de l'atelier ou modèle V2). */
export type MovingTrack = ChoreoTrack & { kind: "cardPath" | "motif" | "v2" };

export interface ChoreoCards {
  ids: string[];
  snapshots: Card[];
  fromIndexes: number[];
  toIndexes: number[];
}

export interface ChoreoContext {
  registry: ZoneRegistry;
  layer: ChoreoLayerHandle;
  /** Joueur abstrait → index(es) UI. */
  resolveRefUi(ref: PlayerRef): number[];
  /** Cartes calculées par le moteur pour une piste. */
  cardsOf(ref: "resolved:outgoing" | "resolved:incoming" | "resolved:highlight"): ChoreoCards;
  /** Carte à montrer face visible (null = dos). */
  visibleCard(cardId: string, index: number, cards: ChoreoCards): Card | null;
  /** Rect d'une carte précise dans une main, si connue. */
  handCardRect?(ui: number, cardIndex: number): DOMRect | null;
  burst(preset: PowerFxPreset, rect: DOMRect | null, tone: PowerFxTone, intensity: PowerFxIntensity, durationMs: number): void;
  impactShake(intensity?: number): void;
  playSound?(sound: string, volume: number): void;
  defaultTone: PowerFxTone;
  /** Zone de référence des repères d'écran (défaut : la fenêtre). La table de démonstration de l'admin passe son cadre. */
  viewport?(): DOMRect;
  motionEnabled: boolean;
  lite: boolean;
  /** Gagnant du pli / de la manche (rôle « winner » des modèles) ; défaut : le lanceur. */
  winnerUi?(): number | null;
  /** Appelé quand une piste « move » démarre / se termine (masquage de la source, voir `moveSourceUi`). */
  onMoveStart?(track: MovingTrack, cards: ChoreoCards): void;
  onMoveEnd?(track: MovingTrack): void;
  /** Qui regarde : le lanceur, la cible ou un autre joueur (textes réservés). Défaut : le lanceur. */
  viewer?: ChoreoViewer;
  /** Écart de valeur de l'échange (carte reçue − carte donnée), pour les textes « verdict ». */
  verdict?: number | null;
  /** Modèle V2 de la carte (onglet Animation) : celui des pistes V2 qui n'en choisissent pas. */
  animV2?: string;
}

/** Main (index UI) d'où partent les cartes d'une piste, ou null si elles ne partent pas d'une main. */
export function moveSourceUi(ctx: ChoreoContext, track: MovingTrack): number | null {
  if (track.kind === "v2") return "player" in track.from && track.from.zone === "hand" ? ctx.resolveRefUi(track.from.player)[0] ?? null : null;
  if (track.kind === "cardPath") {
    const first = track.waypoints[0]?.at;
    return first?.kind === "zone" && first.zone === "hand" ? ctx.resolveRefUi(first.player)[0] ?? null : null;
  }
  const from = motifOfTrack(track)?.from;
  return from?.zone === "hand" ? motifPlayersUi(ctx, from.player)[0] ?? null : null;
}

const cardsOfTrack = (ctx: ChoreoContext, track: MovingTrack): ChoreoCards =>
  track.kind !== "v2" && track.cards === "ghost" ? { ids: [], snapshots: [], fromIndexes: [], toIndexes: [] } : ctx.cardsOf(track.cards as "resolved:outgoing");

const TONE_COLORS: Record<PowerFxTone, string> = { gold: "#f2bb45", teal: "#1de4be", pink: "#ff5b82", cobalt: "#6fa8ff" };
const EASING_CSS: Record<Easing, string> = {
  linear: "linear",
  smooth: "cubic-bezier(.45,0,.25,1)",
  accelerate: "cubic-bezier(.55,0,1,.45)",
  decelerate: "cubic-bezier(0,.55,.45,1)",
  back: "cubic-bezier(.34,1.56,.64,1)",
  elastic: "cubic-bezier(.5,1.8,.5,.8)",
  bounce: "cubic-bezier(.22,1.6,.36,1)",
};
const INTENSITY: Record<1 | 2 | 3, PowerFxIntensity> = { 1: "subtle", 2: "standard", 3: "spectacular" };
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const finished = (animation: Animation) => animation.finished.then(() => undefined, () => undefined);

/* ─────────────── Repères ─────────────── */

function viewportOf(ctx: ChoreoContext): DOMRect {
  return ctx.viewport?.() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

function screenRect(at: string, view: DOMRect): DOMRect {
  const w = view.width;
  const h = view.height;
  const point = (x: number, y: number) => new DOMRect(view.left + x - 1, view.top + y - 1, 2, 2);
  switch (at) {
    case "center": return point(w / 2, h / 2);
    case "tableCenter": return point(w / 2, h * 0.46);
    case "top": return point(w / 2, h * 0.12);
    case "bottom": return point(w / 2, h * 0.88);
    case "left": return point(w * 0.1, h / 2);
    case "right": return point(w * 0.9, h / 2);
    case "offTop": return point(w / 2, -h * 0.25);
    case "offBottom": return point(w / 2, h * 1.25);
    case "offLeft": return point(-w * 0.25, h / 2);
    case "offRight": return point(w * 1.25, h / 2);
    default: return point(w / 2, h / 2);
  }
}

function zoneRect(ctx: ChoreoContext, zone: string, player?: PlayerRef): DOMRect | null {
  const ui = player ? ctx.resolveRefUi(player)[0] : undefined;
  switch (zone) {
    case "hand": return ui === undefined ? null : ctx.registry.hand(ui)?.getRect() ?? null;
    case "deposit": return ui === undefined ? null : ctx.registry.deposit(ui)?.getRect() ?? null;
    case "timer": return ui === undefined ? null : ctx.registry.timer(ui)?.getRect() ?? null;
    case "deck": return ctx.registry.deck()?.getRect() ?? null;
    case "pot": return ctx.registry.pot()?.getRect() ?? null;
    case "reveal": return ctx.registry.reveal()?.getRect() ?? screenRect("center", viewportOf(ctx));
    default: return null;
  }
}

/** Centre (x, y) d'un repère ; `current` = position actuelle de la carte (repère « card »). */
export function anchorPoint(ctx: ChoreoContext, anchor: Anchor, current?: { x: number; y: number }, cardRect?: DOMRect | null): { x: number; y: number } {
  const view = viewportOf(ctx);
  let x = view.left + view.width / 2;
  let y = view.top + view.height / 2;
  if (anchor.kind === "card" && current) ({ x, y } = current);
  else {
    const rect = anchor.kind === "screen" ? screenRect(anchor.at, view)
      : anchor.kind === "zone" ? (cardRect ?? zoneRect(ctx, anchor.zone, "player" in anchor ? anchor.player : undefined)) : null;
    if (rect) { x = rect.left + rect.width / 2; y = rect.top + rect.height / 2; }
  }
  return { x: x + ((anchor.dx ?? 0) / 100) * view.width, y: y + ((anchor.dy ?? 0) / 100) * view.height };
}

/* ─────────────── Pistes ─────────────── */

async function playCardPath(ctx: ChoreoContext, track: ChoreoTrack & { kind: "cardPath" }, spriteEls: Map<string, HTMLElement[]>) {
  const cards: ChoreoCards = track.cards === "ghost" ? { ids: ["ghost"], snapshots: [], fromIndexes: [], toIndexes: [] } : ctx.cardsOf(track.cards);
  if (cards.ids.length === 0) return;
  if (track.mode === "move") ctx.onMoveStart?.(track, cards);
  const els: HTMLElement[] = [];
  spriteEls.set(track.id, els);
  try {
    await Promise.all(cards.ids.map(async (cardId, index) => {
      if (track.staggerMs && index > 0) await sleep(track.staggerMs * index);
      // Point de départ précis : la carte dans la main si on la connaît.
      const first = track.waypoints[0];
      const firstHandUi = first.at.kind === "zone" && first.at.zone === "hand" ? ctx.resolveRefUi(first.at.player)[0] : undefined;
      const startCardRect = firstHandUi !== undefined && cards.fromIndexes[index] !== undefined ? ctx.handCardRect?.(firstHandUi, cards.fromIndexes[index]) ?? null : null;
      const lastPoint = track.waypoints[track.waypoints.length - 1];
      const lastHandUi = lastPoint.at.kind === "zone" && lastPoint.at.zone === "hand" ? ctx.resolveRefUi(lastPoint.at.player)[0] : undefined;
      const endCardRect = lastHandUi !== undefined && cards.toIndexes[index] !== undefined ? ctx.handCardRect?.(lastHandUi, cards.toIndexes[index]) ?? null : null;
      // Place exacte dans l'éventail (centre, largeur sans rotation, inclinaison) : la carte part de sa place
      // et s'y range à l'identique, même si elle a volé en grand entre-temps.
      // La pose V2 (celle de l'éventail, soulèvement compris) est la plus juste ; sinon la place mesurée.
      const slotOf = (ui: number | undefined, cardIdx: number | undefined) => {
        if (ui === undefined || cardIdx === undefined) return null;
        const hand = ctx.registry.hand(ui);
        return hand?.poseOf?.(cardIdx) ?? hand?.getCardSlot?.(cardIdx) ?? null;
      };
      const startSlot = slotOf(firstHandUi, cards.fromIndexes[index]);
      const endSlot = slotOf(lastHandUi, cards.toIndexes[index]);
      const width = Math.max(40, Math.min(96, startSlot?.width ?? startCardRect?.width ?? 62));
      const spriteId = `${track.id}_${index}_${Math.random().toString(36).slice(2, 7)}`;
      const card = track.cards === "ghost" ? null : ctx.visibleCard(cardId, index, cards);
      const nodes = await ctx.layer.spawnCard({ id: spriteId, card, width });
      if (!nodes) return;
      els.push(nodes.root);
      const height = width * 1.45;

      // Points absolus (centres), en tenant compte de la position courante.
      let current: { x: number; y: number } | undefined;
      const lastIndex = track.waypoints.length - 1;
      const slotRect = (slot: typeof startSlot) => (slot ? new DOMRect(slot.x - slot.width / 2, slot.y - slot.width * 0.725, slot.width, slot.width * 1.45) : null);
      const points = track.waypoints.map((point: Waypoint, pointIndex) => {
        const rect = pointIndex === 0 ? slotRect(startSlot) ?? startCardRect : pointIndex === lastIndex ? slotRect(endSlot) ?? endCardRect : null;
        current = anchorPoint(ctx, point.at, current, rect);
        return { ...current, point };
      });
      // Échelle et inclinaison d'un point : sur une place de l'éventail, relatives à cette place.
      const slotAt = (pointIndex: number) => (pointIndex === 0 ? startSlot : pointIndex === lastIndex ? endSlot : null);
      const scaleAt = (pointIndex: number, inherited: number) => {
        const slot = slotAt(pointIndex);
        const own = points[pointIndex].point.scale;
        return slot ? (own ?? 1) * (slot.width / width) : own ?? inherited;
      };
      const rotateAt = (pointIndex: number, inherited: number) => {
        const slot = slotAt(pointIndex);
        const own = points[pointIndex].point.rotate;
        return slot ? (own ?? 0) + slot.rotate : own ?? inherited;
      };
      // Temps : durée répartie au prorata des distances, + pauses.
      const distances = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y) || 1);
      const totalDistance = distances.reduce((sum, d) => sum + d, 0);
      const holds = points.map((p) => p.point.holdMs ?? 0);
      const totalMs = track.durationMs + holds.reduce((sum, h) => sum + h, 0);
      const frames: Keyframe[] = [];
      let t = 0;
      // Carte inconnue de ce joueur : elle reste de dos, même si le trajet la retourne (sinon une face vide trahit le tirage).
      const hiddenFace = !card && track.cards !== "ghost";
      let face = hiddenFace ? "down" : points[0].point.face ?? (card ? "up" : "down");
      let scale = scaleAt(0, 1);
      let rotate = rotateAt(0, 0);
      const frame = (x: number, y: number, offset: number, extra: Partial<Keyframe> = {}) => frames.push({
        offset: Math.min(1, Math.max(0, offset)),
        transform: `translate3d(${x - width / 2}px, ${y - height / 2}px, 0) rotate(${rotate}deg) scale(${scale})`,
        easing: EASING_CSS[track.easing] ?? EASING_CSS.smooth,
        opacity: 1,
        ...extra,
      });
      const flipFrames: Keyframe[] = [];
      const flipFrame = (offset: number) => flipFrames.push({ offset: Math.min(1, Math.max(0, offset)), transform: `rotateY(${face === "up" ? 0 : 180}deg)` });
      frame(points[0].x, points[0].y, 0, { opacity: 0 });
      frame(points[0].x, points[0].y, 0.04 * (track.durationMs / totalMs));
      flipFrame(0);
      t += holds[0];
      if (holds[0]) { frame(points[0].x, points[0].y, t / totalMs); flipFrame(t / totalMs); }
      points.slice(1).forEach((p, i) => {
        const segMs = (distances[i] / totalDistance) * track.durationMs;
        const prev = points[i];
        // Bombé : point de contrôle perpendiculaire au milieu du segment.
        if (track.arc) {
          const mx = (prev.x + p.x) / 2;
          const my = (prev.y + p.y) / 2;
          const nx = -(p.y - prev.y) / distances[i];
          const ny = (p.x - prev.x) / distances[i];
          const bulge = (track.arc / 100) * distances[i] * 0.5;
          frame(mx + nx * bulge, my + ny * bulge, (t + segMs / 2) / totalMs);
        }
        t += segMs;
        scale = scaleAt(i + 1, scale);
        rotate = rotateAt(i + 1, rotate);
        const nextFace = hiddenFace ? "down" : p.point.face ?? face;
        if (nextFace !== face) { flipFrame((t - segMs) / totalMs); face = nextFace; flipFrame(t / totalMs); }
        frame(p.x, p.y, t / totalMs);
        if (holds[i + 1]) { t += holds[i + 1]; frame(p.x, p.y, t / totalMs); }
      });
      frames[frames.length - 1].opacity = track.mode === "move" ? 1 : 0.95;
      flipFrame(1);
      frames.sort((a, b) => Number(a.offset) - Number(b.offset));
      flipFrames.sort((a, b) => Number(a.offset) - Number(b.offset));
      const fromRect = new DOMRect(points[0].x - width / 2, points[0].y - height / 2, width, height);
      if (track.trail) ctx.burst(track.trail, fromRect, ctx.defaultTone, "standard", Math.min(900, totalMs));
      const move = nodes.root.animate(frames, { duration: totalMs, fill: "forwards" });
      const flip = nodes.flipper.animate(flipFrames, { duration: totalMs, fill: "forwards" });
      await Promise.all([finished(move), finished(flip)]);
      const end = points[points.length - 1];
      if (track.trail) ctx.burst(track.trail, new DOMRect(end.x - width / 2, end.y - height / 2, width, height), ctx.defaultTone, "spectacular", 900);
      // Carte fantôme (décor), ou arrivée dans la pioche / le pot : la carte s'efface à l'arrivée,
      // au lieu de rester posée, immobile, jusqu'à la fin de toute la chorégraphie.
      const endAnchor = lastPoint.at;
      const intoPile = track.mode === "move" && endAnchor.kind === "zone" && (endAnchor.zone === "deck" || endAnchor.zone === "pot");
      if (track.cards === "ghost" || intoPile) {
        const settled = getComputedStyle(nodes.root).transform;
        await finished(nodes.root.animate([
          { transform: settled, opacity: 1 },
          { transform: `${settled === "none" ? "" : settled} scale(0.6)`, opacity: 0 },
        ], { duration: 220, easing: "ease-in", fill: "forwards" }));
        ctx.layer.removeCard(spriteId);
      }
    }));
  } finally {
    if (track.mode === "move") ctx.onMoveEnd?.(track);
  }
}

/* Effets génériques appliqués à l'élément lui-même (Web Animations). */
function elementKeyframes(effect: string, intensity: number, color: string): Keyframe[] | null {
  const k = intensity;
  switch (effect) {
    case "shake": return [0, -1, 1, -1, 1, 0].map((s, i, all) => ({ transform: `translateX(${s * 5 * k}px) rotate(${s * k}deg)`, offset: i / (all.length - 1) }));
    case "pulse": return [{ transform: "scale(1)" }, { transform: `scale(${1 + 0.06 * k})` }, { transform: "scale(1)" }];
    case "glow": case "halo": case "ripple": return [{ filter: "drop-shadow(0 0 0 transparent)" }, { filter: `drop-shadow(0 0 ${8 * k}px ${color}) brightness(${1 + 0.12 * k})` }, { filter: "drop-shadow(0 0 0 transparent)" }];
    case "bounce": return [{ transform: "translateY(0)" }, { transform: `translateY(${-10 * k}px)` }, { transform: "translateY(0)" }, { transform: `translateY(${-4 * k}px)` }, { transform: "translateY(0)" }];
    case "grow": return [{ transform: "scale(1)" }, { transform: `scale(${1 + 0.15 * k})` }, { transform: "scale(1)" }];
    case "shrink": return [{ transform: "scale(1)" }, { transform: `scale(${1 - 0.15 * k})` }, { transform: "scale(1)" }];
    case "lift": return [{ transform: "translateY(0)" }, { transform: `translateY(${-14 * k}px) scale(1.05)` }, { transform: "translateY(0)" }];
    case "blink": return [1, 0.2, 1, 0.2, 1].map((opacity) => ({ opacity }));
    case "tint": return [{ filter: "none" }, { filter: `sepia(1) saturate(4) hue-rotate(${color === TONE_COLORS.cobalt ? 180 : color === TONE_COLORS.teal ? 120 : 0}deg)` }, { filter: "none" }];
    case "veil": return [{ opacity: 1, filter: "blur(0)" }, { opacity: 0.25, filter: `blur(${2 * k}px)` }, { opacity: 0.25, filter: `blur(${2 * k}px)` }, { opacity: 1, filter: "blur(0)" }];
    case "fanOpen": return [{ transform: "scaleX(1)" }, { transform: `scaleX(${1 + 0.08 * k})` }, { transform: "scaleX(1)" }];
    case "tighten": return [{ transform: "scaleX(1)" }, { transform: `scaleX(${1 - 0.1 * k})` }, { transform: "scaleX(1)" }];
    case "suck": return [{ transform: "scale(1)" }, { transform: `scale(${1 - 0.12 * k}) rotate(-4deg)` }, { transform: "scale(1)" }];
    case "eject": return [{ transform: "scale(1)" }, { transform: `scale(${1 + 0.12 * k}) translateY(${-8 * k}px)` }, { transform: "scale(1)" }];
    case "shuffle": return [0, 1, -1, 1, -1, 0].map((s, i, all) => ({ transform: `translateX(${s * 6 * k}px) rotate(${s * 6}deg)`, offset: i / (all.length - 1) }));
    case "spit": return [{ transform: "translateY(0)" }, { transform: `translateY(${-6 * k}px) scale(1.06)` }, { transform: "translateY(0)" }];
    case "flash": return [{ filter: "brightness(1)" }, { filter: `brightness(${1 + 0.6 * k})` }, { filter: "brightness(1)" }];
    case "flip": return [{ transform: "rotateY(0)" }, { transform: "rotateY(180deg)" }, { transform: "rotateY(360deg)" }];
    case "speedUp": return [{ filter: "none", transform: "rotate(0)" }, { filter: `drop-shadow(0 0 ${6 * k}px ${color})`, transform: `rotate(${12 * k}deg)` }, { filter: "none", transform: "rotate(0)" }];
    case "rewind": return [{ transform: "rotate(0)" }, { transform: `rotate(${-14 * k}deg)` }, { transform: "rotate(0)" }];
    default: return null;
  }
}

/** Calque superposé à un rect (fissure, givre, flammes, sceau, dissolution…). */
function overlayAt(ctx: ChoreoContext, rect: DOMRect, effect: string, color: string, durationMs: number, intensity: number): Animation | null {
  const host = ctx.layer.container();
  if (!host) return null;
  const node = document.createElement("div");
  node.setAttribute("data-choreo-fx", effect);
  const pad = Math.max(rect.width, rect.height) * 0.1;
  Object.assign(node.style, {
    position: "absolute", left: `${rect.left - pad}px`, top: `${rect.top - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px`,
    borderRadius: "12px", pointerEvents: "none", display: "grid", placeItems: "center", fontWeight: "900", color: "#fff",
  } satisfies Partial<CSSStyleDeclaration>);
  switch (effect) {
    case "crack":
      node.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none"><path d="M50 0 L44 28 L58 44 L40 62 L54 80 L48 100" stroke="#fff" stroke-width="${2 + intensity}" fill="none" stroke-linejoin="bevel" style="filter:drop-shadow(0 0 4px ${color})"/><path d="M58 44 L80 52 M40 62 L18 70" stroke="#fff" stroke-width="${1 + intensity / 2}" fill="none"/></svg>`;
      break;
    case "freeze":
      node.style.background = "radial-gradient(circle, rgba(185,235,255,.55), rgba(120,190,255,.15) 60%, transparent 72%)";
      node.style.boxShadow = "inset 0 0 18px rgba(220,245,255,.9)";
      node.textContent = "❄";
      node.style.fontSize = `${Math.min(rect.width, rect.height) * 0.5}px`;
      break;
    case "burn":
      node.style.background = "radial-gradient(circle at 50% 80%, rgba(255,160,40,.85), rgba(255,60,20,.4) 45%, transparent 70%)";
      node.style.mixBlendMode = "screen";
      break;
    case "dissolve":
      node.style.background = `radial-gradient(circle, ${color}, transparent 70%)`;
      node.style.filter = "blur(6px)";
      break;
    case "seal":
      node.textContent = "🔒";
      node.style.fontSize = `${Math.min(rect.width, rect.height) * 0.45}px`;
      node.style.boxShadow = `0 0 0 3px ${color}, 0 0 18px ${color}`;
      break;
    case "label":
    case "delta":
      return null;
    default:
      node.style.boxShadow = `0 0 0 3px ${color}, 0 0 ${10 * intensity}px ${color}`;
  }
  host.appendChild(node);
  const animation = node.animate(
    effect === "crack" ? [{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "scale(1)", offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
      : [{ opacity: 0, transform: "scale(.85)" }, { opacity: 1, transform: "scale(1)", offset: 0.25 }, { opacity: 1, offset: 0.75 }, { opacity: 0, transform: "scale(1.05)" }],
    { duration: durationMs, fill: "forwards" },
  );
  void finished(animation).then(() => node.remove());
  return animation;
}

/** Carte telle qu'affichée dans une main (soulevée, inclinée) : centre, taille et inclinaison à l'écran. */
function handCardBox(ctx: ChoreoContext, ui: number, index: number): { x: number; y: number; width: number; height: number; rotate: number } | null {
  const hand = ctx.registry.hand(ui);
  const face = hand?.getElement?.()?.children[index]?.firstElementChild as HTMLElement | null | undefined;
  if (face && face.offsetWidth > 0) {
    const box = face.getBoundingClientRect();
    const transform = getComputedStyle(face).transform;
    const matrix = new DOMMatrix(transform === "none" ? undefined : transform);
    return { x: box.left + box.width / 2, y: box.top + box.height / 2, width: face.offsetWidth, height: face.offsetHeight, rotate: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI };
  }
  const rect = hand?.getCardRect(index);
  return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height, rotate: 0 } : null;
}

/** Lecture de la main : une lumière la parcourt de gauche à droite ; chez le lanceur, les cartes que le conseil
 *  écarte s'éteignent une à une au passage (elles se rallument peu après la fin). */
async function playHandRead(ctx: ChoreoContext, ui: number, durationMs: number, color: string) {
  const hand = ctx.registry.hand(ui);
  const rect = hand?.getRect();
  const host = ctx.layer.container();
  if (!hand || !rect || !host) return;
  const clip = document.createElement("div");
  clip.setAttribute("data-choreo-fx", "read");
  Object.assign(clip.style, { position: "absolute", left: `${rect.left - 12}px`, top: `${rect.top - 12}px`, width: `${rect.width + 24}px`, height: `${rect.height + 24}px`, overflow: "hidden", borderRadius: "18px", pointerEvents: "none", mixBlendMode: "screen" });
  const band = document.createElement("div");
  Object.assign(band.style, { position: "absolute", top: "-20%", bottom: "-20%", left: "0", width: "38%", background: `linear-gradient(90deg, transparent, ${color}66 35%, #fff8 50%, ${color}66 65%, transparent)`, filter: "blur(6px)", transform: "skewX(-14deg)" });
  clip.appendChild(band);
  host.appendChild(clip);
  const sweepMs = durationMs * 0.85;
  // De sa largeur à gauche du cadre jusqu'au-delà du bord droit (bande = 38 % du cadre).
  const sweep = band.animate([{ transform: "translateX(-120%) skewX(-14deg)" }, { transform: "translateX(300%) skewX(-14deg)" }], { duration: sweepMs, easing: "cubic-bezier(.45,0,.35,1)", fill: "forwards" });

  // Lanceur seulement : la position de la carte conseillée ne doit pas se lire chez les autres.
  const keepIdx = ctx.cardsOf("resolved:highlight").fromIndexes[0];
  if ((ctx.viewer ?? "activator") === "activator" && keepIdx !== undefined && hand.dimCards) {
    const count = hand.cardCount?.() ?? 0;
    const end = performance.now() + durationMs + 500;
    const dimmed = new Set<number>();
    for (let index = 0; index < count; index += 1) {
      if (index === keepIdx) continue;
      setTimeout(() => {
        dimmed.add(index);
        const keep = Array.from({ length: count }, (_, k) => k).filter((k) => !dimmed.has(k));
        hand.dimCards?.(keep, Math.max(60, end - performance.now()));
      }, sweepMs * ((index + 0.5) / Math.max(1, count)));
    }
  }
  await finished(sweep);
  await finished(clip.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" }));
  clip.remove();
}

/** Carte conseillée (resolved:highlight), chez le lanceur : aura, badge « ✦ Conseil » et contour qui se vide
 *  pendant la durée du conseil. Suit la carte à chaque image ; s'efface si elle est jouée. */
async function playHandAdvice(ctx: ChoreoContext, ui: number, durationMs: number, color: string) {
  if ((ctx.viewer ?? "activator") !== "activator") return;
  const index = ctx.cardsOf("resolved:highlight").fromIndexes[0];
  const host = ctx.layer.container();
  const hand = ctx.registry.hand(ui);
  if (index === undefined || !host || !hand) return;
  const count = hand.cardCount?.();
  const first = handCardBox(ctx, ui, index);
  if (!first) return;
  ctx.burst("mystic", new DOMRect(first.x - first.width / 2, first.y - first.height / 2, first.width, first.height), ctx.defaultTone, "standard", 900);

  const node = document.createElement("div");
  node.setAttribute("data-choreo-fx", "advise");
  Object.assign(node.style, { position: "absolute", left: "0", top: "0", pointerEvents: "none", borderRadius: "9px", boxShadow: `0 0 0 2px ${color}, 0 0 22px ${color}` });
  // Contour du temps restant : rectangle arrondi autour de la carte, redimensionné à chaque image.
  node.innerHTML = `<svg style="position:absolute;left:-5px;top:-5px;overflow:visible"><rect x="1.5" y="1.5" rx="11" pathLength="100" fill="none" stroke="#fff7dc" stroke-width="3" stroke-dasharray="100" style="filter:drop-shadow(0 0 4px ${color})"/></svg>`
    + `<span style="position:absolute;left:50%;top:-14px;transform:translate(-50%,-100%);white-space:nowrap;padding:3px 9px;border-radius:999px;background:${color};color:#08120f;font:900 11px/1 var(--font-display,sans-serif);letter-spacing:.04em;box-shadow:0 3px 10px rgba(0,0,0,.45)">✦ Conseil</span>`;
  host.appendChild(node);
  const svg = node.querySelector("svg");
  const ring = node.querySelector("rect");
  const countdown = ring?.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: 100 }], { duration: durationMs, easing: "linear", fill: "forwards" });
  node.animate([{ opacity: 0, scale: "1.25" }, { opacity: 1, scale: "1" }], { duration: 320, easing: "cubic-bezier(.2,1.5,.4,1)" });
  const pulse = node.animate([{ boxShadow: `0 0 0 2px ${color}, 0 0 14px ${color}` }, { boxShadow: `0 0 0 2px ${color}, 0 0 30px ${color}` }, { boxShadow: `0 0 0 2px ${color}, 0 0 14px ${color}` }], { duration: 1200, iterations: Infinity });

  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      // Carte jouée (la main change) ou conseil écoulé : fin.
      const box = handCardBox(ctx, ui, index);
      if (!box || hand.cardCount?.() !== count || performance.now() - start >= durationMs) { resolve(); return; }
      Object.assign(node.style, { width: `${box.width}px`, height: `${box.height}px`, transform: `translate(${box.x - box.width / 2}px, ${box.y - box.height / 2}px) rotate(${box.rotate}deg)` });
      svg?.setAttribute("width", String(box.width + 10));
      svg?.setAttribute("height", String(box.height + 10));
      ring?.setAttribute("width", String(box.width + 7));
      ring?.setAttribute("height", String(box.height + 7));
      requestAnimationFrame(tick);
    };
    tick();
  });
  pulse.cancel();
  countdown?.cancel();
  await finished(node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: "forwards" }));
  node.remove();
}

/** Foudre sur une main : un éclair zigzague du haut de l'écran jusqu'au centre de la main (flash, secousse),
 *  puis des arcs électriques courent d'une carte à l'autre. */
async function playHandStrike(ctx: ChoreoContext, ui: number, durationMs: number, color: string, intensity: number) {
  const hand = ctx.registry.hand(ui);
  const rect = hand?.getRect();
  const host = ctx.layer.container();
  if (!hand || !rect || !host) return;
  const view = viewportOf(ctx);
  const tx = rect.left + rect.width / 2;
  const ty = rect.top + rect.height * 0.35;
  const sx = tx + (Math.random() - 0.5) * view.width * 0.25;
  const sy = view.top - 20;
  // Tracé en zigzag : segments de plus en plus courts vers l'impact.
  const points: string[] = [];
  const steps = 9;
  for (let k = 0; k <= steps; k += 1) {
    const t = k / steps;
    const jitter = k === 0 || k === steps ? 0 : (k % 2 ? 1 : -1) * (18 + Math.random() * 22) * (1 - t * 0.6);
    points.push(`${(sx + (tx - sx) * t + jitter).toFixed(1)},${(sy + (ty - sy) * t).toFixed(1)}`);
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("data-choreo-fx", "strike");
  Object.assign(svg.style, { position: "absolute", left: "0", top: "0", width: "100vw", height: "100vh", overflow: "visible", pointerEvents: "none" });
  svg.innerHTML = `<polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="${6 + intensity * 2}" stroke-linejoin="bevel" opacity=".55" style="filter:blur(4px)"/>`
    + `<polyline points="${points.join(" ")}" fill="none" stroke="#fff" stroke-width="${2 + intensity}" stroke-linejoin="bevel" style="filter:drop-shadow(0 0 6px ${color})"/>`;
  host.appendChild(svg);
  const flash = document.createElement("div");
  flash.setAttribute("data-choreo-fx", "strike-flash");
  Object.assign(flash.style, { position: "absolute", left: `${view.left}px`, top: `${view.top}px`, width: `${view.width}px`, height: `${view.height}px`, background: "#fff", pointerEvents: "none", mixBlendMode: "screen" });
  host.appendChild(flash);

  const boltMs = Math.min(520, durationMs * 0.45);
  const bolt = svg.animate([{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0.35, offset: 0.3 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }], { duration: boltMs, fill: "forwards" });
  const flashAnim = flash.animate([{ opacity: 0 }, { opacity: 0.18 + intensity * 0.08, offset: 0.12 }, { opacity: 0 }], { duration: boltMs * 0.9, fill: "forwards" });
  setTimeout(() => {
    ctx.impactShake(intensity * 2);
    ctx.burst("boost", new DOMRect(tx - 40, ty - 40, 80, 80), ctx.defaultTone, intensity >= 3 ? "spectacular" : "standard", 900);
  }, boltMs * 0.12);

  // Arcs électriques sur la main, après l'impact.
  const el = hand.getElement?.();
  const arcs = el && !ctx.lite
    ? el.animate([{ filter: "brightness(1)" }, { filter: `brightness(1.6) drop-shadow(0 0 10px ${color})`, offset: 0.15 }, { filter: "brightness(1.1)", offset: 0.3 }, { filter: `brightness(1.45) drop-shadow(0 0 8px ${color})`, offset: 0.45 }, { filter: "brightness(1)" }], { duration: Math.max(300, durationMs - boltMs * 0.3), delay: boltMs * 0.3 })
    : null;
  await Promise.all([finished(bolt), finished(flashAnim), arcs ? finished(arcs) : Promise.resolve()]);
  svg.remove();
  flash.remove();
}

/** Pagne : un tissu aux motifs colorés glisse sur la main de gauche à droite, la teinte un instant, puis se retire. */
async function playHandDye(ctx: ChoreoContext, ui: number, durationMs: number, color: string) {
  const hand = ctx.registry.hand(ui);
  const rect = hand?.getRect();
  const host = ctx.layer.container();
  if (!hand || !rect || !host) return;
  const clip = document.createElement("div");
  clip.setAttribute("data-choreo-fx", "dye");
  // Voile translucide : les cartes restent lisibles à travers le tissu.
  Object.assign(clip.style, { position: "absolute", left: `${rect.left - 14}px`, top: `${rect.top - 14}px`, width: `${rect.width + 28}px`, height: `${rect.height + 28}px`, overflow: "hidden", borderRadius: "20px", pointerEvents: "none" });
  const cloth = document.createElement("div");
  Object.assign(cloth.style, {
    position: "absolute", inset: "0", width: "220%",
    background: `repeating-linear-gradient(115deg, ${color} 0 14px, #f2bb45 14px 22px, #ff5b82 22px 34px, #1de4be 34px 42px, ${color} 42px 52px, #fff7dc 52px 55px)`,
    opacity: "0.38",
  });
  clip.appendChild(cloth);
  host.appendChild(clip);
  const glide = cloth.animate([{ transform: "translateX(-100%)" }, { transform: "translateX(-25%)", offset: 0.55 }, { transform: "translateX(0%)" }], { duration: durationMs, easing: "cubic-bezier(.3,0,.25,1)", fill: "forwards" });
  const fade = clip.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: durationMs, fill: "forwards" });
  const el = hand.getElement?.();
  const tint = el && !ctx.lite ? el.animate([{ filter: "none" }, { filter: `drop-shadow(0 0 10px ${color}) saturate(1.4)`, offset: 0.5 }, { filter: "none" }], { duration: durationMs }) : null;
  ctx.burst("mystic", rect, ctx.defaultTone, "standard", Math.min(1100, durationMs));
  await Promise.all([finished(glide), finished(fade), tint ? finished(tint) : Promise.resolve()]);
  clip.remove();
}

/** Zigzag d'un point à un autre (arc électrique), redessiné à chaque appel. */
function zigzag(sx: number, sy: number, tx: number, ty: number, steps: number, amplitude: number): string {
  const len = Math.hypot(tx - sx, ty - sy) || 1;
  const nx = -(ty - sy) / len, ny = (tx - sx) / len;
  return Array.from({ length: steps + 1 }, (_, k) => {
    const t = k / steps;
    const off = k === 0 || k === steps ? 0 : (Math.random() * 2 - 1) * amplitude;
    return `${(sx + (tx - sx) * t + nx * off).toFixed(1)},${(sy + (ty - sy) * t + ny * off).toFixed(1)}`;
  }).join(" ");
}

/** Coupure : un arc électrique relie l'avatar du lanceur à la main visée, crépite, puis la main grésille. */
async function playHandCut(ctx: ChoreoContext, ui: number, durationMs: number, color: string, intensity: number) {
  const hand = ctx.registry.hand(ui);
  const rect = hand?.getRect();
  const source = ctx.registry.timer(ctx.resolveRefUi("self")[0])?.getRect();
  const host = ctx.layer.container();
  if (!hand || !rect || !source || !host) return;
  const sx = source.left + source.width / 2, sy = source.top + source.height / 2;
  const tx = rect.left + rect.width / 2, ty = rect.top + rect.height / 2;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("data-choreo-fx", "cut");
  Object.assign(svg.style, { position: "absolute", left: "0", top: "0", width: "100vw", height: "100vh", overflow: "visible", pointerEvents: "none" });
  svg.innerHTML = `<polyline fill="none" stroke="${color}" stroke-width="${5 + intensity * 2}" stroke-linejoin="bevel" opacity=".55" style="filter:blur(3px)"/>`
    + `<polyline fill="none" stroke="#fff" stroke-width="${1.5 + intensity * 0.6}" stroke-linejoin="bevel" style="filter:drop-shadow(0 0 5px ${color})"/>`;
  host.appendChild(svg);
  const lines = Array.from(svg.querySelectorAll("polyline"));
  // L'arc crépite : nouveau tracé toutes les 70 ms pendant ~60 % de la durée.
  const arcMs = durationMs * 0.6;
  const steps = Math.max(8, Math.round(Math.hypot(tx - sx, ty - sy) / 34));
  const redraw = () => { const points = zigzag(sx, sy, tx, ty, steps, 10 + intensity * 4); lines.forEach((line) => line.setAttribute("points", points)); };
  redraw();
  const timer = setInterval(redraw, 70);
  const fadeIn = svg.animate([{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0.6, offset: 0.5 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: arcMs, fill: "forwards" });
  setTimeout(() => {
    ctx.impactShake(intensity);
    ctx.burst("lock", new DOMRect(tx - 40, ty - 40, 80, 80), ctx.defaultTone, intensity >= 3 ? "spectacular" : "standard", 900);
  }, arcMs * 0.25);
  // La main visée grésille (lumière qui saute), après l'impact.
  const el = hand.getElement?.();
  const flicker = el && !ctx.lite
    ? el.animate([1, 0.45, 1, 0.6, 1, 0.5, 1].map((b, i, all) => ({ filter: `brightness(${b}) ${b < 1 ? `drop-shadow(0 0 8px ${color})` : ""}`, offset: i / (all.length - 1) })), { duration: Math.max(400, durationMs * 0.7), delay: arcMs * 0.25 })
    : null;
  await Promise.all([finished(fadeIn), flicker ? finished(flicker) : Promise.resolve()]);
  clearInterval(timer);
  svg.remove();
}

/** Filet : lancé roulé depuis l'avatar du lanceur, il s'ouvre en vol, tombe sur la main visée, se resserre
 *  (la main tremble, prise), puis s'efface. */
async function playHandNet(ctx: ChoreoContext, ui: number, durationMs: number, color: string, intensity: number) {
  const hand = ctx.registry.hand(ui);
  const rect = hand?.getRect();
  const source = ctx.registry.timer(ctx.resolveRefUi("self")[0])?.getRect();
  const host = ctx.layer.container();
  if (!hand || !rect || !source || !host) return;
  const pad = Math.max(16, rect.width * 0.08);
  const w = rect.width + pad * 2, h = rect.height + pad * 2;
  const net = document.createElement("div");
  net.setAttribute("data-choreo-fx", "net");
  // Mailles en losange (deux trames de cordes), bord en corde épaisse, petits flotteurs aux coins.
  const rope = "rgba(236, 214, 170, .9)";
  Object.assign(net.style, {
    position: "absolute", left: `${rect.left - pad}px`, top: `${rect.top - pad}px`, width: `${w}px`, height: `${h}px`,
    borderRadius: "18px", pointerEvents: "none", transformOrigin: "50% 50%",
    background: `repeating-linear-gradient(45deg, transparent 0 13px, ${rope} 13px 15px), repeating-linear-gradient(-45deg, transparent 0 13px, ${rope} 13px 15px)`,
    border: `3px solid ${rope}`,
    boxShadow: `0 0 0 1px rgba(0,0,0,.35), 0 0 18px ${color}`,
    filter: "drop-shadow(0 4px 6px rgba(0,0,0,.45))",
  });
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const float = document.createElement("i");
    Object.assign(float.style, { position: "absolute", left: `calc(${x * 100}% - 7px)`, top: `calc(${y * 100}% - 7px)`, width: "14px", height: "14px", borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` });
    net.appendChild(float);
  }
  host.appendChild(net);
  // Vol : du centre de l'avatar (filet roulé, petit) jusqu'à la main (ouvert), puis il se resserre.
  const dx = source.left + source.width / 2 - (rect.left + rect.width / 2);
  const dy = source.top + source.height / 2 - (rect.top + rect.height / 2);
  const flyMs = durationMs * 0.45;
  const throwNet = net.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(.08) rotate(-40deg)`, opacity: 0.6 },
    { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 40}px) scale(.55) rotate(-12deg)`, opacity: 1, offset: 0.5 },
    { transform: "translate(0, 0) scale(1.08) rotate(0deg)", opacity: 1 },
  ], { duration: flyMs, easing: "cubic-bezier(.3,.6,.4,1)", fill: "forwards" });
  await finished(throwNet);
  ctx.impactShake(intensity);
  ctx.burst("lock", rect, ctx.defaultTone, intensity >= 3 ? "spectacular" : "standard", 900);
  const el = hand.getElement?.();
  const caught = el && !ctx.lite ? el.animate([0, -4, 4, -3, 3, 0].map((s, i, all) => ({ transform: `translateX(${s * intensity}px)`, offset: i / (all.length - 1) })), { duration: 420 }) : null;
  const tighten = net.animate([
    { transform: "scale(1.08)", opacity: 1 },
    { transform: "scale(.94)", opacity: 1, offset: 0.35 },
    { transform: "scale(.97)", opacity: 1, offset: 0.7 },
    { transform: "scale(.97)", opacity: 0 },
  ], { duration: Math.max(400, durationMs - flyMs), easing: "ease-out", fill: "forwards" });
  await Promise.all([finished(tighten), caught ? finished(caught) : Promise.resolve()]);
  net.remove();
}

/** Sceau (version C2 validée sur l'atelier) : le sceau runique part de l'avatar du lanceur en tournoyant sur un arc,
 *  se pose sur la carte désignée (resolved:highlight) avec un rebond amorti ; quatre chaînes poussent maillon par
 *  maillon vers les coins de la carte et se tendent ; le sceau se fond en cadenas qui se ferme d'un clac élastique ;
 *  la carte s'éteint. Dessiné sur un canvas qui suit la carte à chaque image. Durée de référence : 1,9 s. */
async function playHandStamp(ctx: ChoreoContext, ui: number, durationMs: number, color: string, intensity: number) {
  const index = ctx.cardsOf("resolved:highlight").fromIndexes[0];
  const hand = ctx.registry.hand(ui);
  const sourceRect = ctx.registry.timer(ctx.resolveRefUi("self")[0])?.getRect();
  const host = ctx.layer.container();
  if (index === undefined || !hand || !sourceRect || !host) return;
  if (!handCardBox(ctx, ui, index)) return;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("data-choreo-fx", "stamp");
  Object.assign(canvas.style, { position: "absolute", left: "0", top: "0", width: "100vw", height: "100vh", pointerEvents: "none" });
  host.appendChild(canvas);
  const g = canvas.getContext("2d");
  if (!g) { canvas.remove(); return; }
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  const source = { x: sourceRect.left + sourceRect.width / 2, y: sourceRect.top + sourceRect.height / 2 };
  // Repères de l'atelier (1,9 s) mis à la durée de la piste.
  const k = durationMs / 1900;
  const at = (ms: number) => ms * k;
  let landed = false, closedHit = false, dimmed = false;
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = performance.now() - start;
      const box = handCardBox(ctx, ui, index);
      if (!box || t >= durationMs) { resolve(); return; }
      const s = box.width / 58;
      const fly = sineInOut(seg(t, 0, at(520)));
      const land = spring(seg(t, at(470), at(1000)));
      const grow = [0, 1, 2, 3].map((i) => sineInOut(seg(t, at(560 + i * 45), at(1060 + i * 45))));
      const settle = spring(seg(t, at(1000), at(1500)), 6, 13);
      const morph = sineInOut(seg(t, at(1080), at(1360)));
      const close = backOut(seg(t, at(1380), at(1520)));
      const flash = easeOut(seg(t, at(1500), at(1880)));
      const fade = 1 - seg(t, durationMs - 140, durationMs);
      const shake = jolt(t, at(500), 2.4 * s) + jolt(t, at(1510), 1.8 * s);
      if (!landed && t >= at(500)) { landed = true; ctx.impactShake(intensity); }
      if (!closedHit && t >= at(1510)) {
        closedHit = true;
        ctx.burst("lock", new DOMRect(box.x - box.width / 2, box.y - box.height / 2, box.width, box.height), ctx.defaultTone, intensity >= 3 ? "spectacular" : "standard", 900);
      }
      // La carte scellée s'éteint (les autres restent jouables).
      if (!dimmed && t >= at(1420)) {
        dimmed = true;
        const count = hand.cardCount?.() ?? 0;
        hand.dimCards?.(Array.from({ length: count }, (_, i) => i).filter((i) => i !== index), Math.max(300, durationMs - t + 400));
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalAlpha = fade;
      // Vol du sceau : de l'avatar au centre de la carte, sur un arc, en tournoyant.
      if (fly < 1) {
        const x = source.x + (box.x - source.x) * fly, y = source.y + (box.y - source.y) * fly - Math.sin(Math.PI * fly) * 34 * s;
        drawRune(g, x, y, (0.5 + 1.2 * fly) * s, seg(t, 0, at(120)), (1 - fly) * -Math.PI * 3);
      }
      g.save();
      g.translate(box.x + shake, box.y);
      g.rotate((box.rotate * Math.PI) / 180);
      const link = 8.5 * s;
      sealCorners(box.width, box.height).forEach(([cx, cy], i) => {
        const stretch = grow[i] < 1 ? grow[i] : 1 + (1 - settle) * 0.06;
        drawChain(g, 0, 0, cx * stretch, cy * stretch, Math.min(1, grow[i]), link);
      });
      if (fly >= 1) drawRune(g, 0, 0, (1.7 + (1 - 1.7) * land) * (1 - morph * 0.4) * s, 1 - morph);
      if (morph > 0) drawPadlock(g, 0, 2 * s, (0.9 + 0.7 * morph) * s, close, flash > 0 ? 1 - flash : 0);
      drawRing(g, 0, 0, (10 + 30 * easeOut(seg(t, at(480), at(820)))) * s, 1 - seg(t, at(480), at(820)), color, 2.5);
      drawRing(g, 0, 0, (12 + 32 * flash) * s, 1 - flash, color);
      g.restore();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  canvas.remove();
}

/** Sablier : un sablier de verre apparaît au-dessus de l'avatar, se retourne, et son sable coule en filet dans l'anneau du
 *  minuteur, qui pâlit par à-coups ; à la fin, `label` (« −6 s ») s'envole de l'avatar. */
async function playTimerDrain(ctx: ChoreoContext, ui: number, durationMs: number, color: string, label?: string) {
  const timer = ctx.registry.timer(ui);
  const rect = timer?.getRect();
  const host = ctx.layer.container();
  if (!timer || !rect || !host) return;
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const size = Math.max(26, Math.min(44, rect.width * 0.7));
  // Le sablier se place au-dessus de l'avatar, ou en dessous s'il n'y a pas la place.
  const above = rect.top > size * 1.6;
  const gy = above ? rect.top - size * 0.95 : rect.bottom + size * 0.95;
  const glass = document.createElement("div");
  glass.setAttribute("data-choreo-fx", "drain");
  Object.assign(glass.style, { position: "absolute", left: `${cx - size / 2}px`, top: `${gy - size * 0.7}px`, width: `${size}px`, height: `${size * 1.4}px`, pointerEvents: "none" });
  // Verre, sable du haut (qui baisse) et du bas (qui monte), cadre en bois.
  glass.innerHTML = `<svg viewBox="0 0 40 56" width="100%" height="100%" style="overflow:visible;filter:drop-shadow(0 0 8px ${color})">
    <rect x="4" y="1" width="32" height="5" rx="2" fill="#8a5a2b"/><rect x="4" y="50" width="32" height="5" rx="2" fill="#8a5a2b"/>
    <path d="M9 6 C9 20 18 24 19 28 C18 32 9 36 9 50 L31 50 C31 36 22 32 21 28 C22 24 31 20 31 6 Z" fill="rgba(220,245,255,.18)" stroke="#e9f6ff" stroke-width="1.6"/>
    <clipPath id="sand-top"><path d="M10 7 C10 20 18 24 19.5 28 L20.5 28 C22 24 30 20 30 7 Z"/></clipPath>
    <clipPath id="sand-bottom"><path d="M19.5 28 C18 32 10 36 10 49 L30 49 C30 36 22 32 20.5 28 Z"/></clipPath>
    <rect class="top" clip-path="url(#sand-top)" x="8" y="10" width="24" height="18" fill="#f2c46b"/>
    <rect class="bottom" clip-path="url(#sand-bottom)" x="8" y="49" width="24" height="0" fill="#f2c46b"/>
    <rect class="stream" x="19.4" y="27" width="1.2" height="22" fill="#f2c46b" opacity="0"/>
  </svg>`;
  host.appendChild(glass);
  const top = glass.querySelector<SVGRectElement>(".top");
  const bottom = glass.querySelector<SVGRectElement>(".bottom");
  const stream = glass.querySelector<SVGRectElement>(".stream");
  // Apparition, puis le sablier se retourne (rotation 180°) avant que le sable coule.
  const flipMs = Math.min(520, durationMs * 0.28);
  await finished(glass.animate([
    { transform: "scale(.4) rotate(180deg)", opacity: 0 },
    { transform: "scale(1.1) rotate(180deg)", opacity: 1, offset: 0.35 },
    { transform: "scale(1) rotate(0deg)", opacity: 1 },
  ], { duration: flipMs, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" }));
  // Le sable coule : haut qui baisse, bas qui monte, filet de sable et grains vers l'anneau du minuteur.
  const flowMs = durationMs - flipMs - 260;
  stream?.setAttribute("opacity", "1");
  const grains = document.createElement("div");
  Object.assign(grains.style, { position: "absolute", left: "0", top: "0", width: "100vw", height: "100vh", pointerEvents: "none" });
  host.appendChild(grains);
  const dropFrom = { x: cx, y: above ? gy + size * 0.7 : gy - size * 0.7 };
  const ringEl = timer.getElement?.();
  const fade = ringEl && !ctx.lite
    ? ringEl.animate([{ filter: "none" }, { filter: `saturate(.4) brightness(.7) drop-shadow(0 0 10px ${color})`, offset: 0.6 }, { filter: "none" }], { duration: flowMs + 260 })
    : null;
  const start = performance.now();
  await new Promise<void>((resolve) => {
    let lastGrain = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / flowMs);
      top?.setAttribute("y", String(10 + 18 * p));
      top?.setAttribute("height", String(18 * (1 - p)));
      bottom?.setAttribute("y", String(49 - 18 * p));
      bottom?.setAttribute("height", String(18 * p));
      // Un grain toutes les ~45 ms, du bas du sablier jusqu'au centre de l'avatar.
      if (!ctx.lite && now - lastGrain > 45 && p < 0.95) {
        lastGrain = now;
        const grain = document.createElement("i");
        Object.assign(grain.style, { position: "absolute", left: `${dropFrom.x - 1.5 + (Math.random() - 0.5) * 4}px`, top: `${dropFrom.y}px`, width: "3px", height: "3px", borderRadius: "50%", background: "#f2c46b", boxShadow: `0 0 4px ${color}` });
        grains.appendChild(grain);
        void grain.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: `translateY(${cy - dropFrom.y}px) scale(.6)`, opacity: 0.2 }], { duration: 380, easing: "cubic-bezier(.5,0,.9,.6)" }).finished.then(() => grain.remove(), () => grain.remove());
      }
      if (p < 1) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
  stream?.setAttribute("opacity", "0");
  // Le temps perdu s'envole de l'avatar.
  const seconds = Number.parseInt(String(label ?? "").replace("−", "-"), 10);
  if (Number.isFinite(seconds)) timer.showDelta(seconds);
  ctx.burst("time", rect, ctx.defaultTone, "standard", 800);
  await Promise.all([finished(glass.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.7)" }], { duration: 260, fill: "forwards" })), fade ? finished(fade) : Promise.resolve()]);
  glass.remove();
  grains.remove();
}

/** Cri : l'avatar du lanceur enfle et trois ondes sonores (arcs épais) partent vers la table ; quand une onde atteint le
 *  minuteur d'un adversaire, celui-ci tremble, flashe et `label` (« −3 s ») s'en envole. */
async function playTimerShout(ctx: ChoreoContext, ui: number, durationMs: number, color: string, intensity: number, label?: string) {
  const source = ctx.registry.timer(ui);
  const rect = source?.getRect();
  const host = ctx.layer.container();
  if (!source || !rect || !host) return;
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  // Adversaires : tous les autres sièges qui ont un minuteur à l'écran.
  const victims = ctx.resolveRefUi("all_opponents")
    .filter((other) => other !== ui)
    .map((other) => ({ ui: other, rect: ctx.registry.timer(other)?.getRect() ?? null }))
    .filter((victim): victim is { ui: number; rect: DOMRect } => !!victim.rect);
  const reach = Math.max(120, ...victims.map((victim) => Math.hypot(victim.rect.left + victim.rect.width / 2 - cx, victim.rect.top + victim.rect.height / 2 - cy) + 30));
  const waveMs = Math.min(900, durationMs * 0.55);
  // L'avatar du lanceur enfle (il crie).
  const el = source.getElement?.();
  // Propriétés `scale` / `translate` séparées : le placement de l'avatar (souvent un `transform`) reste intact.
  if (el && !ctx.lite) void el.animate([{ scale: "1" }, { scale: "1.18", offset: 0.25 }, { scale: "1" }], { duration: 520, easing: "ease-out" });
  ctx.impactShake(intensity);
  const waves: Promise<void>[] = [];
  for (let i = 0; i < 3; i++) {
    const ring = document.createElement("div");
    ring.setAttribute("data-choreo-fx", "shout");
    Object.assign(ring.style, {
      position: "absolute", left: `${cx - reach}px`, top: `${cy - reach}px`, width: `${reach * 2}px`, height: `${reach * 2}px`,
      borderRadius: "50%", border: `${6 - i * 1.5}px solid ${color}`, boxShadow: `0 0 18px ${color}, inset 0 0 18px ${color}`, pointerEvents: "none",
    });
    host.appendChild(ring);
    waves.push(finished(ring.animate([{ transform: "scale(.06)", opacity: 0.95 }, { transform: "scale(1)", opacity: 0 }], { duration: waveMs, delay: i * 150, easing: "cubic-bezier(.2,.6,.3,1)", fill: "forwards" })).then(() => ring.remove()));
  }
  // La première onde atteint chaque adversaire selon sa distance : secousse, éclat, « −3 s ».
  const seconds = Number.parseInt(String(label ?? "").replace("−", "-"), 10);
  const hits = victims.map((victim) => {
    const distance = Math.hypot(victim.rect.left + victim.rect.width / 2 - cx, victim.rect.top + victim.rect.height / 2 - cy);
    const at = waveMs * Math.min(1, Math.sqrt(distance / reach));
    return sleep(at).then(() => {
      const timer = ctx.registry.timer(victim.ui);
      const node = timer?.getElement?.();
      if (node && !ctx.lite) void node.animate([0, -1, 1, -1, 1, 0].map((s, k, all) => ({ translate: `${s * 4}px 0`, offset: k / (all.length - 1) })), { duration: 360 });
      ctx.burst("time", victim.rect, ctx.defaultTone, "standard", 700);
      if (Number.isFinite(seconds)) timer?.showDelta(seconds);
    });
  });
  await Promise.all([...waves, ...hits, sleep(durationMs)]);
}

async function playElement(ctx: ChoreoContext, track: ChoreoTrack & { kind: "element" }, spriteEls: Map<string, HTMLElement[]>) {
  const intensity = track.intensity ?? 2;
  const tone = track.tone ?? ctx.defaultTone;
  const color = TONE_COLORS[tone];
  const target: ElementTarget = track.target;
  type Hit = { el: HTMLElement | null; rect: DOMRect | null; ui?: number };
  const hits: Hit[] = [];
  if (target.element === "card") {
    for (const el of spriteEls.get(target.trackId) ?? []) hits.push({ el: (el.firstElementChild as HTMLElement) ?? el, rect: el.getBoundingClientRect() });
  } else if (target.element === "deck") {
    const handle = ctx.registry.deck();
    hits.push({ el: handle?.getElement?.() ?? null, rect: handle?.getRect() ?? null });
  } else if (target.element === "pot") {
    const handle = ctx.registry.pot();
    hits.push({ el: handle?.getElement?.() ?? null, rect: handle?.getRect() ?? null });
  } else if ("player" in target) {
    for (const ui of ctx.resolveRefUi(target.player)) {
      const handle = target.element === "hand" ? ctx.registry.hand(ui) : target.element === "deposit" ? ctx.registry.deposit(ui) : ctx.registry.timer(ui);
      hits.push({ el: handle?.getElement?.() ?? null, rect: handle?.getRect() ?? null, ui });
    }
  }
  const effect = String(track.effect);
  const jobs: Promise<void>[] = [];
  for (const hit of hits) {
    // Lecture de la main / carte conseillée (Main du Griot) : rendus propres, voir plus bas.
    if (target.element === "hand" && hit.ui !== undefined && ["read", "advise", "strike", "dye", "cut", "net", "stamp"].includes(effect)) {
      jobs.push(effect === "read" ? playHandRead(ctx, hit.ui, track.durationMs, color)
        : effect === "advise" ? playHandAdvice(ctx, hit.ui, track.durationMs, color)
          : effect === "strike" ? playHandStrike(ctx, hit.ui, track.durationMs, color, intensity)
            : effect === "dye" ? playHandDye(ctx, hit.ui, track.durationMs, color)
              : effect === "cut" ? playHandCut(ctx, hit.ui, track.durationMs, color, intensity)
                : effect === "net" ? playHandNet(ctx, hit.ui, track.durationMs, color, intensity)
                  : playHandStamp(ctx, hit.ui, track.durationMs, color, intensity));
      continue;
    }
    // Effets « métier » délégués aux zones (rendu propre déjà existant).
    // Sablier qui se vide dans le minuteur (Sable du Temps) : rendu propre, voir playTimerDrain.
    if (target.element === "timer" && effect === "drain" && hit.ui !== undefined) {
      jobs.push(playTimerDrain(ctx, hit.ui, track.durationMs, color, track.label));
      continue;
    }
    // Cri (Cri du Chef) : ondes depuis cet avatar jusqu'au minuteur de chaque adversaire, voir playTimerShout.
    if (target.element === "timer" && effect === "shout" && hit.ui !== undefined) {
      jobs.push(playTimerShout(ctx, hit.ui, track.durationMs, color, intensity, track.label));
      continue;
    }
    if (target.element === "timer" || target.element === "avatar") {
      const timer = hit.ui !== undefined ? ctx.registry.timer(hit.ui) : null;
      if (effect === "freeze") timer?.showFreeze(track.durationMs);
      if (effect === "delta") {
        const seconds = Number.parseInt(String(track.label ?? "").replace("−", "-"), 10);
        if (Number.isFinite(seconds)) timer?.showDelta(seconds);
      }
      if (effect.startsWith("aura")) timer?.showAura(effect.slice(4).toLowerCase() as "shield" | "mask" | "totem" | "lucky");
    }
    if (target.element === "pot" && (effect === "flash" || effect === "label")) ctx.registry.pot()?.flash(track.label);
    if (target.element === "pot" && effect === "coinRain") ctx.burst("goldRain", hit.rect, "gold", INTENSITY[intensity], track.durationMs);
    if (target.element === "deck" && effect === "spit" && hit.rect) {
      // Une carte fantôme jaillit de la pioche.
      jobs.push(playCardPath(ctx, {
        id: `${track.id}_spit`, kind: "cardPath", startMs: 0, durationMs: Math.min(700, track.durationMs), cards: "ghost", mode: "display", easing: "back",
        waypoints: [{ at: { kind: "zone", zone: "deck" } }, { at: { kind: "zone", zone: "deck", dy: -8 }, scale: 1.2 }],
      }, spriteEls));
    }
    const frames = elementKeyframes(effect, intensity, color);
    if (frames && hit.el && !ctx.lite) jobs.push(finished(hit.el.animate(frames, { duration: track.durationMs, easing: "ease-in-out" })));
    if (hit.rect && ["crack", "freeze", "burn", "dissolve", "seal", "halo", "glow"].includes(effect) && !(target.element === "timer" && effect === "freeze")) {
      const overlay = overlayAt(ctx, hit.rect, effect, color, track.durationMs, intensity);
      if (overlay) jobs.push(finished(overlay));
    }
    if (effect === "dissolve" && hit.el) jobs.push(finished(hit.el.animate([{ opacity: 1, filter: "blur(0)" }, { opacity: 0, filter: "blur(6px)" }], { duration: track.durationMs, fill: "forwards" })));
    if (intensity === 3 && hit.rect && !ctx.lite) ctx.burst(effect === "freeze" ? "frost" : effect === "burn" ? "boost" : "mystic", hit.rect, tone, "standard", Math.min(1200, track.durationMs));
  }
  await Promise.all(jobs);
}

async function playScreen(ctx: ChoreoContext, track: ChoreoTrack & { kind: "screen" }) {
  const intensity = track.intensity ?? 2;
  const color = TONE_COLORS[track.tone ?? ctx.defaultTone];
  if (track.effect === "shake") { ctx.impactShake(intensity); await sleep(track.durationMs); return; }
  if (track.effect === "particles") {
    const rect = track.at ? (() => { const p = anchorPoint(ctx, track.at!); return new DOMRect(p.x - 40, p.y - 40, 80, 80); })() : viewportOf(ctx);
    ctx.burst(track.preset ?? "mystic", rect, track.tone ?? ctx.defaultTone, INTENSITY[intensity], track.durationMs);
    await sleep(track.durationMs);
    return;
  }
  const host = ctx.layer.container();
  if (!host) return;
  const node = document.createElement("div");
  node.setAttribute("data-choreo-fx", track.effect);
  const view = viewportOf(ctx);
  Object.assign(node.style, { position: "absolute", left: `${view.left}px`, top: `${view.top}px`, width: `${view.width}px`, height: `${view.height}px`, pointerEvents: "none", background: track.effect === "flash" ? color : "#000" });
  host.appendChild(node);
  const peak = track.effect === "flash" ? 0.25 + 0.15 * intensity : 0.25 + 0.12 * intensity;
  await finished(node.animate([{ opacity: 0 }, { opacity: peak, offset: track.effect === "flash" ? 0.15 : 0.3 }, { opacity: peak * (track.effect === "flash" ? 0.3 : 1), offset: 0.7 }, { opacity: 0 }], { duration: track.durationMs, fill: "forwards" }));
  node.remove();
}

async function playText(ctx: ChoreoContext, track: ChoreoTrack & { kind: "text" }, fill: (text: string) => string) {
  const host = ctx.layer.container();
  if (!host) return;
  if (!audienceSees(track.audience ?? "all", ctx.viewer ?? "activator")) return;
  const text = fill(track.text);
  if (!text) return;
  const point = anchorPoint(ctx, track.at);
  const node = document.createElement("div");
  node.setAttribute("data-choreo-fx", "text");
  node.textContent = text;
  const size = track.size === "l" ? 34 : track.size === "s" ? 15 : 22;
  const verdict = track.verdictTone ? ctx.verdict ?? null : null;
  const tone = verdict == null ? track.tone ?? ctx.defaultTone : verdict > 0 ? "teal" : verdict < 0 ? "pink" : "gold";
  Object.assign(node.style, {
    position: "absolute", left: `${point.x}px`, top: `${point.y}px`, transform: "translate(-50%, -50%)", whiteSpace: "nowrap",
    font: `900 ${size}px var(--font-display, sans-serif)`, color: "#fff", letterSpacing: "0.02em",
    textShadow: `0 0 12px ${TONE_COLORS[tone]}, 0 3px 0 rgba(0,0,0,.45)`, pointerEvents: "none",
  });
  if (verdict != null) Object.assign(node.style, { padding: "4px 12px", borderRadius: "999px", background: "rgba(10,8,6,.72)", border: `2px solid ${TONE_COLORS[tone]}` });
  host.appendChild(node);
  await finished(node.animate([
    { opacity: 0, transform: "translate(-50%, -30%) scale(.7)" },
    { opacity: 1, transform: "translate(-50%, -50%) scale(1.08)", offset: 0.18 },
    { opacity: 1, transform: "translate(-50%, -50%) scale(1)", offset: 0.75 },
    { opacity: 0, transform: "translate(-50%, -70%) scale(1)" },
  ], { duration: track.durationMs, easing: "ease-out", fill: "forwards" }));
  node.remove();
}

async function playMotifTrack(ctx: ChoreoContext, track: MotifTrack, spriteEls: Map<string, HTMLElement[]>) {
  // Un modèle inconnu (catalogue plus récent ailleurs) est ignoré, comme un effet inconnu.
  const motif = motifOfTrack(track);
  if (!motif) return;
  const cards = track.cards === "ghost" ? null : ctx.cardsOf(track.cards);
  if (cards && cards.ids.length === 0) return;
  if (track.mode === "move" && cards) ctx.onMoveStart?.(track, cards);
  try {
    await playMotif(ctx, { id: track.id, motif, cards, mode: track.mode }, spriteEls);
  } finally {
    if (track.mode === "move" && cards) ctx.onMoveEnd?.(track);
  }
}

/** Vrai déplacement par un modèle V2 : les zones donnent les poses, le modèle le mouvement.
 *  `pendingHand` : nombre de cartes de chaque main après les pistes déjà parties (l'état réel n'arrive qu'à la fin). */
async function playV2Track(ctx: ChoreoContext, track: V2Track, pendingHand: Map<number, number>) {
  const cards = ctx.cardsOf(track.cards);
  if (cards.ids.length === 0) return;
  ctx.onMoveStart?.(track, cards);
  try {
    const model = getAnimV2(track.model ?? ctx.animV2 ?? DEFAULT_V2_MODEL) ?? getAnimV2(DEFAULT_V2_MODEL) ?? DEFAULT_ANIMS_V2[0];
    const refOf = (anchor: V2ZoneAnchor): ZoneRef => ("player" in anchor ? { zone: anchor.zone, ui: ctx.resolveRefUi(anchor.player)[0] } : { zone: anchor.zone });
    const from = refOf(track.from);
    const to = refOf(track.to);
    const countOf = (ui: number) => pendingHand.get(ui) ?? ctx.registry.hand(ui)?.cardCount?.() ?? 0;
    // Échange en place : les mains gardent leur nombre de cartes.
    if (!track.inPlace) {
      if (from.zone === "hand" && from.ui != null) pendingHand.set(from.ui, countOf(from.ui) - cards.ids.length);
      if (to.zone === "hand" && to.ui != null) pendingHand.set(to.ui, countOf(to.ui) + cards.ids.length);
    }
    const finalCount = to.zone === "hand" && to.ui != null ? countOf(to.ui) : undefined;
    const moves: AnimV2Move[] = cards.ids.map((cardId, index) => ({
      card: ctx.visibleCard(cardId, index, cards),
      from: { ...from, index: from.zone === "hand" ? cards.fromIndexes[index] ?? 0 : 0 },
      to: { ...to, index: to.zone === "hand" ? cards.toIndexes[index] ?? Math.max(0, (finalCount ?? 1) - cards.ids.length + index) : 0, count: finalCount },
    }));
    const reflow = track.reflow !== false;
    const id = `v2_${track.id}_${Math.random().toString(36).slice(2, 7)}`;

    if (!track.present) {
      await playAnimV2(ctx, { id, model, moves, reflow });
      return;
    }
    // Présentation : la carte monte au-dessus de sa zone de départ ou au centre de la table (et se retourne si on a
    // le droit de la voir), attend, puis repart de ce point vers sa destination. Même modèle, vitesse de montée fixe.
    // Plusieurs cartes se rangent côte à côte.
    const view = viewportOf(ctx);
    const present = track.present;
    const center = present.at === "tableCenter" ? anchorPoint(ctx, { kind: "screen", at: "tableCenter" }) : null;
    const lifted = moves.map((move, index): ZonePose | null => {
      const base = zonePoseOf(ctx.registry, move.from, move.from.index);
      if (!base) return null;
      const dest = zonePoseOf(ctx.registry, move.to, move.to.index, move.to.count);
      const width = Math.max(base.width, dest?.width ?? 0) * (present.scale ?? 1);
      return {
        ...base,
        x: (center?.x ?? base.x) + ((present.dx ?? 0) / 100) * view.width + (index - (moves.length - 1) / 2) * width * 1.08,
        y: (center?.y ?? base.y) + ((present.dy ?? 0) / 100) * view.height,
        width,
        rotate: 0,
        face: move.card ? 0 : 180,
        z: 999,
      };
    });
    let risen: string[] = [];
    const rise = { ...model, motion: { ...model.motion, durationMs: V2_PRESENT_RISE_MS, curve: 0 } };
    await playAnimV2(ctx, {
      id: `${id}_up`, model: rise, reflow,
      moves: moves.flatMap((move, index) => (lifted[index] ? [{ ...move, to: move.from, toPose: lifted[index]! }] : [])),
      onSpawned: (ids) => { risen = ids; },
    });
    const first = lifted.find(Boolean);
    if (first) ctx.burst("mystic", new DOMRect(first.x - first.width / 2, first.y - first.width * 0.725, first.width, first.width * 1.45), ctx.defaultTone, "standard", present.holdMs);
    await sleep(present.holdMs);
    await playAnimV2(ctx, {
      id, model, reflow,
      moves: moves.flatMap((move, index) => (lifted[index] ? [{ ...move, fromPose: lifted[index]! }] : [])),
      onFirstFrame: () => risen.forEach((spriteId) => ctx.layer.removeCard(spriteId)),
    });
  } finally {
    ctx.onMoveEnd?.(track);
  }
}

/** Joue toute la chorégraphie ; se résout quand la dernière piste est finie. */
export async function playChoreography(ctx: ChoreoContext, choreo: Choreography, fill: (text: string) => string = (t) => t): Promise<void> {
  if (!ctx.motionEnabled) {
    // Animations coupées : on ne garde que les pistes qui accompagnent un vrai déplacement (pour libérer l'état).
    choreo.tracks.filter((track): track is MovingTrack => track.kind === "v2" || ((track.kind === "cardPath" || track.kind === "motif") && track.mode === "move")).forEach((track) => {
      ctx.onMoveStart?.(track, cardsOfTrack(ctx, track));
      ctx.onMoveEnd?.(track);
    });
    return;
  }
  const spriteEls = new Map<string, HTMLElement[]>();
  const pendingHand = new Map<number, number>();
  const ordered = [...choreo.tracks].sort((a, b) => a.startMs - b.startMs);
  // Les effets sur « la carte d'une trajectoire » doivent attendre que ses sprites existent.
  const pathStarted = new Map<string, Promise<void>>();
  const runs = ordered.map(async (track) => {
    await sleep(track.startMs);
    switch (track.kind) {
      case "cardPath": {
        let markStarted: () => void = () => undefined;
        pathStarted.set(track.id, new Promise((resolve) => { markStarted = resolve; }));
        const done = playCardPath(ctx, track, spriteEls);
        setTimeout(markStarted, 60);
        await done;
        return;
      }
      case "motif": {
        let markStarted: () => void = () => undefined;
        pathStarted.set(track.id, new Promise((resolve) => { markStarted = resolve; }));
        const done = playMotifTrack(ctx, track, spriteEls);
        setTimeout(markStarted, 60);
        await done;
        return;
      }
      case "v2": return playV2Track(ctx, track, pendingHand);
      case "element":
        if (track.target.element === "card") await pathStarted.get(track.target.trackId);
        return playElement(ctx, track, spriteEls);
      case "screen": return playScreen(ctx, track);
      case "text": return playText(ctx, track, fill);
      case "sound":
        ctx.playSound?.(track.sound, track.volume ?? 1);
        return;
    }
  });
  try {
    await Promise.all(runs);
  } finally {
    ctx.layer.clear();
  }
}
