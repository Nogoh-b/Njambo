/* ═══════════════ Lecteur des modèles d'animation (phase G) ═══════════════
   Joue un modèle (engine/anim) sur la table réelle ou sur la table de
   démonstration. Chaque image est calculée par `sampleFlight` : le rendu est
   exactement celui de l'atelier et des tests. Les vols sont animés image par
   image (requestAnimationFrame) avec la position des zones relue en direct :
   une carte qui arrive dans une main vise sa place réelle pendant que
   l'éventail s'écarte, et l'écran peut tourner en plein vol.
   Uniquement transform / opacity / filter. */

import { MOTIF_REACTIONS, SQUASH_MS, isMultiAnchor, motifTotalMs, type AnimMotif, type MotifAnchor, type MotifPlayer } from "@/engine/anim/motif";
import { motifReactionInstances, motifSchedule, sampleFlight, type CardFrame, type MotifSlot, type Point, type ReactionInstance } from "@/engine/anim/sample";
import type { PowerFxTone } from "@/engine/power/types";
import type { Card } from "@/types/game";
import type { ChoreoCards, ChoreoContext } from "./playChoreography";

export interface MotifRun {
  /** Identifiant des sprites (cible des pistes « élément » visant la carte). */
  id: string;
  motif: AnimMotif;
  /** Cartes du moteur, ou null : cartes décoratives (`motif.count`). */
  cards: ChoreoCards | null;
  mode: "move" | "display";
  /** Quand retirer les cartes animées : à la fin du calque (chorégraphies), à l'atterrissage de chacune
   *  (moments du jeu : la vraie carte prend le relais) ou à la fin de l'animation. */
  release?: "keep" | "landing" | "end";
  /** Appelé à l'atterrissage de chaque carte (index dans `cards`). */
  onLanded?(k: number): void;
}

const TONE_COLORS: Record<PowerFxTone, string> = { gold: "#f2bb45", teal: "#1de4be", pink: "#ff5b82", cobalt: "#6fa8ff" };
/** Échelle d'une carte posée sur une zone qui n'a pas de taille de carte. */
const ZONE_SCALE: Record<MotifAnchor["zone"], number> = { hand: 1, deposit: 0.8, avatar: 0.6, timer: 0.6, deck: 0.8, pot: 0.6, center: 1, reveal: 1, offscreen: 1 };
/** Zones qui « avalent » la carte à l'arrivée (elle disparaît au lieu de rester posée). */
const SINKS: ReadonlySet<MotifAnchor["zone"]> = new Set(["deck", "pot", "avatar", "timer", "offscreen"]);
const CARD_RATIO = 1.45;
const LIFT_RATIO = 0.22;
/** Part de fin de vol pendant laquelle une carte qui se pose redescend (soulèvement → 0). */
const LIFT_SETTLE = 0.25;
const SPREAD_LEAD_MS = 340;
/** Espace central : sous la pioche et le pot (qui occupent le centre de la table). */
const CENTER_Y = 0.54;

interface ResolvedSlot extends MotifSlot { cardWidth: number | null }
interface Flight {
  k: number;
  cardId: string;
  card: Card | null;
  fromUi: number | null;
  toUi: number | null;
  fromIdx: number | undefined;
  toIdx: number | undefined;
  startMs: number;
  endMs: number;
  root: HTMLElement;
  flipper: HTMLElement;
  faces: HTMLElement[];
  frozenFrom: ResolvedSlot | null;
  lastTo: ResolvedSlot | null;
  history: Point[];
  emittedSparks: number;
  departed: boolean;
  landed: boolean;
  released: boolean;
  /** Pose finale dessinée (le sprite sera retiré à l'image suivante). */
  finalShown: boolean;
  glowActive: boolean;
  spriteId: string;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const cardWidthOf = (rect: DOMRect) => Math.min(rect.width, rect.height / CARD_RATIO);
const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

function viewportOf(ctx: ChoreoContext): DOMRect {
  return ctx.viewport?.() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

/** Joueurs (index UI) désignés par un rôle de modèle. */
export function motifPlayersUi(ctx: ChoreoContext, player: MotifPlayer): number[] {
  if (player === "winner") {
    const winner = ctx.winnerUi?.();
    return winner != null ? [winner] : ctx.resolveRefUi("self");
  }
  return ctx.resolveRefUi(player);
}

function uiFor(ctx: ChoreoContext, anchor: MotifAnchor, k: number): number | null {
  if (!("player" in anchor)) return null;
  const list = motifPlayersUi(ctx, anchor.player);
  if (list.length === 0) return null;
  return isMultiAnchor(anchor) ? list[k % list.length] : list[0];
}

/** Emplacement d'une carte sur un repère (centre, taille, rotation, face).
 *  `cardId` : sur un dépôt, la place exacte de cette carte (son jeté), posée ou à venir. */
function slotOf(ctx: ChoreoContext, anchor: MotifAnchor, ui: number | null, cardIdx: number | undefined, cardId?: string): ResolvedSlot {
  const view = viewportOf(ctx);
  const point = (x: number, y: number, face: 0 | 180 | null = 0): ResolvedSlot => ({ x, y, rotate: 0, scale: ZONE_SCALE[anchor.zone], face: face ?? 0, cardWidth: null });
  const fromRect = (rect: DOMRect | null | undefined, cardSized: boolean, face: 0 | 180): ResolvedSlot => rect
    ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, rotate: 0, scale: ZONE_SCALE[anchor.zone], face, cardWidth: cardSized ? cardWidthOf(rect) : null }
    : point(view.left + view.width / 2, view.top + view.height * CENTER_Y, face);
  switch (anchor.zone) {
    case "hand": {
      const hand = ui == null ? null : ctx.registry.hand(ui);
      const face = ui === 0 ? 0 : 180;
      if (hand && cardIdx !== undefined) {
        const slot = hand.getCardSlot?.(cardIdx);
        if (slot) return { x: slot.x, y: slot.y, rotate: slot.rotate, scale: 1, face, cardWidth: slot.width };
        return fromRect(hand.getCardRect(cardIdx), true, face);
      }
      return fromRect(hand?.getRect(), false, face);
    }
    case "deposit": {
      const deposit = ui == null ? null : ctx.registry.deposit(ui);
      const exact = cardId ? deposit?.poseOf?.(cardIdx ?? 0, undefined, cardId) : null;
      if (exact) return { x: exact.x, y: exact.y, rotate: exact.rotate, scale: ZONE_SCALE.deposit, face: 0, cardWidth: exact.width };
      return fromRect(deposit?.getTopCardRect() ?? deposit?.getRect(), true, 0);
    }
    case "avatar":
    case "timer":
      return fromRect(ui == null ? null : ctx.registry.timer(ui)?.getRect(), false, 0);
    case "deck":
      return fromRect(ctx.registry.deck()?.getRect(), true, 180);
    case "pot":
      return fromRect(ctx.registry.pot()?.getRect(), false, 0);
    case "reveal":
      return fromRect(ctx.registry.reveal()?.getRect(), false, 0);
    case "center":
      return point(view.left + view.width / 2, view.top + view.height * CENTER_Y);
    case "offscreen": {
      const { side } = anchor;
      const x = side === "left" ? view.left - view.width * 0.25 : side === "right" ? view.right + view.width * 0.25 : view.left + view.width / 2;
      const y = side === "top" ? view.top - view.height * 0.25 : side === "bottom" ? view.bottom + view.height * 0.25 : view.top + view.height / 2;
      return point(x, y);
    }
  }
}

/* ─────────────── Réactions de la table ─────────────── */

/** Calque d'effet posé sur la table ; `keep` le laisse affiché jusqu'au `layer.clear()` (ou la fin d'un modèle qui libère ses cartes). */
function overlay(ctx: ChoreoContext, kind: string, style: Partial<CSSStyleDeclaration>, frames: Keyframe[], durationMs: number, { keep = false, text }: { keep?: boolean; text?: string } = {}): HTMLElement | null {
  const host = ctx.layer.container();
  if (!host) return null;
  const node = document.createElement("div");
  node.setAttribute("data-choreo-fx", kind);
  Object.assign(node.style, { position: "absolute", pointerEvents: "none", ...style });
  if (text) node.textContent = text;
  host.appendChild(node);
  const animation = node.animate(frames, { duration: durationMs, fill: "forwards", easing: "ease-out" });
  if (!keep) void animation.finished.then(() => node.remove(), () => node.remove());
  return node;
}

function zoneElement(ctx: ChoreoContext, zone: MotifAnchor["zone"], ui: number | null): HTMLElement | null {
  switch (zone) {
    case "hand": return ui == null ? null : ctx.registry.hand(ui)?.getElement?.() ?? null;
    case "deposit": return ui == null ? null : ctx.registry.deposit(ui)?.getElement?.() ?? null;
    case "avatar": case "timer": return ui == null ? null : ctx.registry.timer(ui)?.getElement?.() ?? null;
    case "deck": return ctx.registry.deck()?.getElement?.() ?? null;
    case "pot": return ctx.registry.pot()?.getElement?.() ?? null;
    case "reveal": return ctx.registry.reveal()?.getElement?.() ?? null;
    default: return null;
  }
}

/** Déclenche une réaction ; renvoie l'effet qui reste affiché (couronne), s'il y en a un. */
function fireReaction(ctx: ChoreoContext, run: MotifRun, instance: ReactionInstance, flight: Flight): HTMLElement | null {
  const { reaction, durationMs } = instance;
  const color = TONE_COLORS[reaction.tone ?? ctx.defaultTone];
  const motif = run.motif;
  // Lieu : départ, arrivée (par défaut) ou zone précise.
  const where = reaction.at ?? "to";
  const anchor: MotifAnchor = where === "from" ? motif.from : where === "to" ? motif.to : where;
  const ui = where === "from" ? flight.fromUi : where === "to" ? flight.toUi : uiFor(ctx, where, flight.k);
  const slot = where === "from" ? flight.frozenFrom : where === "to" ? flight.lastTo : null;
  const at = slot ?? slotOf(ctx, anchor, ui, undefined);
  const lite = ctx.lite;
  switch (reaction.type) {
    case "flash": {
      const size = 150;
      overlay(ctx, "flash", { left: `${at.x - size / 2}px`, top: `${at.y - size / 2}px`, width: `${size}px`, height: `${size}px`, borderRadius: "50%", background: `radial-gradient(circle, rgba(255,250,232,.95), ${color}99 35%, transparent 70%)`, mixBlendMode: "screen" },
        [{ opacity: 0.95, transform: "scale(.45)" }, { opacity: 0, transform: "scale(1.15)" }], durationMs);
      break;
    }
    case "ring": {
      const size = 60;
      overlay(ctx, "ring", { left: `${at.x - size / 2}px`, top: `${at.y - size * 0.35}px`, width: `${size}px`, height: `${size * 0.7}px`, borderRadius: "50%", border: `4px solid ${color}` },
        [{ opacity: 1, transform: "scale(.4)" }, { opacity: 0, transform: "scale(2.6)" }], durationMs);
      break;
    }
    case "burst": {
      const count = lite ? 8 : 18;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + hash(i) * 0.4, distance = 26 + hash(i + 9) * 50;
        overlay(ctx, "burst", { left: `${at.x - 3}px`, top: `${at.y - 3}px`, width: "6px", height: "6px", borderRadius: "50%", background: i % 3 === 0 ? TONE_COLORS.teal : color, boxShadow: `0 0 6px ${color}` },
          [{ opacity: 1, transform: "translate(0,0) scale(1)" }, { opacity: 0, transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(.3)` }], durationMs);
      }
      break;
    }
    case "glow": {
      const el = zoneElement(ctx, anchor.zone, ui);
      const glow = TONE_COLORS[reaction.tone ?? "teal"];
      if (el) void el.animate([{ filter: "drop-shadow(0 0 0 transparent)" }, { filter: `drop-shadow(0 0 14px ${glow}) brightness(1.15)`, offset: 0.25 }, { filter: `drop-shadow(0 0 6px ${glow})`, offset: 0.5 }, { filter: `drop-shadow(0 0 14px ${glow}) brightness(1.15)`, offset: 0.75 }, { filter: "drop-shadow(0 0 0 transparent)" }], { duration: durationMs });
      else overlay(ctx, "glow", { left: `${at.x - 80}px`, top: `${at.y - 40}px`, width: "160px", height: "80px", borderRadius: "50%", background: `radial-gradient(ellipse, ${glow}88, transparent 70%)` },
        [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], durationMs);
      break;
    }
    case "crown": {
      const lift = (flight.lastTo?.cardWidth ?? 46) * 0.9;
      return overlay(ctx, "crown", { left: `${at.x - 14}px`, top: `${at.y - lift - 18}px`, fontSize: "28px", lineHeight: "1", color, textShadow: `0 0 12px ${color}, 0 2px 0 #7a3b22` },
        [{ opacity: 0, transform: "scale(.2)" }, { opacity: 1, transform: "scale(1.25)", offset: 0.6 }, { opacity: 1, transform: "scale(1)" }], durationMs, { keep: true, text: "♛" });
    }
    case "avatarPulse": {
      const avatarUi = anchor.zone === "avatar" || anchor.zone === "timer" ? ui : motifPlayersUi(ctx, "self")[0] ?? null;
      const timer = avatarUi == null ? null : ctx.registry.timer(avatarUi);
      const rect = timer?.getRect();
      void timer?.getElement?.()?.animate([{ transform: "scale(1)" }, { transform: "scale(1.16)", filter: `drop-shadow(0 0 12px ${color})` }, { transform: "scale(1)" }], { duration: durationMs, easing: "ease-in-out" });
      if (rect) {
        const size = Math.max(rect.width, rect.height);
        overlay(ctx, "avatarPulse", { left: `${rect.left + rect.width / 2 - size / 2}px`, top: `${rect.top + rect.height / 2 - size / 2}px`, width: `${size}px`, height: `${size}px`, borderRadius: "50%", border: `3px solid ${color}` },
          [{ opacity: 0.9, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.9)" }], durationMs);
      }
      break;
    }
    case "nkap": {
      const nkapUi = flight.toUi ?? motifPlayersUi(ctx, "self")[0] ?? null;
      if (nkapUi != null) ctx.registry.timer(nkapUi)?.pulseBalance?.(durationMs);
      break;
    }
    case "deckShake":
      void ctx.registry.deck()?.getElement?.()?.animate([0, -1, 1, -1, 1, 0].map((s, i, all) => ({ transform: `translateX(${s * 5}px) rotate(${s * 3}deg)`, offset: i / (all.length - 1) })), { duration: durationMs });
      break;
    case "dim": {
      const handUi = motif.from.zone === "hand" ? flight.fromUi : null;
      if (handUi != null) {
        const keep = run.cards?.fromIndexes.length ? run.cards.fromIndexes : flight.fromIdx !== undefined ? [flight.fromIdx] : [];
        ctx.registry.hand(handUi)?.dimCards?.(keep, durationMs);
      }
      break;
    }
    case "shake":
      ctx.impactShake(2);
      break;
  }
  return null;
}

/* ─────────────── Traînées ─────────────── */

function emitSpark(ctx: ChoreoContext, at: Point, seed: number, color: string) {
  const angle = hash(seed) * Math.PI * 2, distance = 10 + hash(seed + 7.3) * 30, size = 2 + hash(seed + 3.1) * 3;
  overlay(ctx, "spark", { left: `${at.x - size / 2}px`, top: `${at.y - size / 2}px`, width: `${size}px`, height: `${size}px`, borderRadius: "50%", background: hash(seed + 1.7) < 0.75 ? color : TONE_COLORS.teal, boxShadow: `0 0 5px ${color}` },
    [{ opacity: 1, transform: "translate(0,0)" }, { opacity: 0, transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance + 12}px)` }], 520);
}

/* ─────────────── Lecture ─────────────── */

function applyFrame(flight: Flight, frame: CardFrame, width: number, sink: boolean, color: string) {
  const height = width * CARD_RATIO;
  const lift = frame.lift * width * LIFT_RATIO;
  const scale = frame.scale;
  flight.root.style.transform = `translate3d(${(frame.x - width / 2).toFixed(2)}px, ${(frame.y - height / 2 - lift).toFixed(2)}px, 0) rotate(${frame.rotate.toFixed(2)}deg) scale(${(scale * frame.scaleX).toFixed(4)}, ${(scale * frame.scaleY).toFixed(4)})`;
  const hidden = frame.phase === "waiting" || (frame.phase === "landed" && sink);
  flight.root.style.opacity = hidden ? "0" : Math.max(0, Math.min(1, frame.opacity)).toFixed(3);
  flight.flipper.style.transform = `rotateY(${frame.flip.toFixed(1)}deg)`;
  const glowActive = frame.glow > 0.15;
  if (glowActive !== flight.glowActive) {
    flight.glowActive = glowActive;
    flight.flipper.style.boxShadow = glowActive
      ? `0 10px 22px rgba(0, 0, 0, 0.44), 0 0 18px ${color}`
      : "0 10px 22px rgba(0, 0, 0, 0.44)";
  }
}

/** Joue un modèle ; se résout à la fin du dernier vol et de la dernière réaction. Les cartes (et la couronne) restent
 *  posées jusqu'au `layer.clear()`, sauf avec `release` : rien ne reste à la fin. */
export async function playMotif(ctx: ChoreoContext, run: MotifRun, spriteEls?: Map<string, HTMLElement[]>): Promise<void> {
  const { motif } = run;
  const ids = run.cards?.ids.length ? run.cards.ids : run.cards ? [] : Array.from({ length: motif.count }, (_, k) => `ghost_${k}`);
  if (ids.length === 0) return;
  const cards: ChoreoCards = run.cards ?? { ids, snapshots: [], fromIndexes: [], toIndexes: [] };
  const color = TONE_COLORS[ctx.defaultTone];
  const sink = SINKS.has(motif.to.zone);
  const inPlace = JSON.stringify(motif.from) === JSON.stringify(motif.to);
  const schedule = motifSchedule(motif, ids.length);

  // Index des cartes dans leurs mains (sinon : les dernières au départ, à la suite à l'arrivée).
  const fromUis = ids.map((_, k) => uiFor(ctx, motif.from, k));
  const toUis = ids.map((_, k) => uiFor(ctx, motif.to, k));
  const handCount = (ui: number | null) => (ui == null ? 0 : ctx.registry.hand(ui)?.cardCount?.() ?? 0);
  const arrivalsPerUi = new Map<number, number>();
  const fromIdx = ids.map((_, k) => cards.fromIndexes[k] ?? (motif.from.zone === "hand" ? Math.max(0, handCount(fromUis[k]) - ids.length + k) : undefined));
  const toIdx = ids.map((_, k) => {
    if (inPlace) return fromIdx[k];
    if (cards.toIndexes[k] !== undefined) return cards.toIndexes[k];
    if (motif.to.zone !== "hand" || toUis[k] == null) return undefined;
    const ui = toUis[k]!;
    const order = arrivalsPerUi.get(ui) ?? 0;
    arrivalsPerUi.set(ui, order + 1);
    return handCount(ui) + order;
  });

  // Taille du sprite : la plus grande des deux cartes (on réduit, on n'agrandit jamais une petite carte).
  const first = slotOf(ctx, motif.from, fromUis[0], fromIdx[0]);
  const firstTo = slotOf(ctx, motif.to, toUis[0], toIdx[0]);
  const width = clamp(Math.max(first.cardWidth ?? 0, firstTo.cardWidth ?? 0) || 62, 40, 96);

  const flights: Flight[] = [];
  const spriteSpecs = ids.map((cardId, k) => {
    const card = cardId.startsWith("ghost_") && !run.cards ? null : ctx.visibleCard(cardId, k, cards);
    const spriteId = `${run.id}_${k}_${Math.random().toString(36).slice(2, 7)}`;
    return { id: spriteId, card, width, cardId, k };
  });
  const spawned = ctx.layer.spawnCards
    ? await ctx.layer.spawnCards(spriteSpecs.map(({ id, card, width: w }) => ({ id, card, width: w })))
    : await Promise.all(spriteSpecs.map(({ id, card, width: w }) => ctx.layer.spawnCard({ id, card, width: w })));
  spawned.forEach((nodes, idx) => {
    if (!nodes) return;
    const spec = spriteSpecs[idx]!;
    nodes.root.style.opacity = "0";
    flights.push({
      k: spec.k, cardId: spec.cardId, card: spec.card, fromUi: fromUis[spec.k], toUi: toUis[spec.k], fromIdx: fromIdx[spec.k], toIdx: toIdx[spec.k],
      startMs: schedule[spec.k].startMs, endMs: schedule[spec.k].endMs,
      root: nodes.root, flipper: nodes.flipper, faces: Array.from(nodes.flipper.children) as HTMLElement[],
      frozenFrom: null, lastTo: null, history: [], emittedSparks: 0, departed: false, landed: false, released: false, finalShown: false, glowActive: false, spriteId: spec.id,
    });
  });
  flights.sort((a, b) => a.k - b.k);
  if (spriteEls) spriteEls.set(run.id, flights.map((flight) => flight.root));

  // Écartement des mains d'arrivée : juste avant la première arrivée de chacune.
  const spreads: Array<{ ui: number; atMs: number; count: number; durationMs: number; done: boolean }> = [];
  if (run.mode === "move" && motif.to.zone === "hand" && !inPlace) {
    for (const ui of new Set(toUis.filter((value): value is number => value != null))) {
      const mine = flights.filter((flight) => flight.toUi === ui);
      if (mine.length === 0) continue;
      const firstEnd = Math.min(...mine.map((flight) => flight.endMs)), lastEnd = Math.max(...mine.map((flight) => flight.endMs));
      spreads.push({ ui, atMs: Math.max(0, firstEnd - SPREAD_LEAD_MS), count: mine.length, durationMs: SPREAD_LEAD_MS + lastEnd - firstEnd, done: false });
    }
  }
  const reactions = motifReactionInstances(motif, flights.length).map((instance) => ({ instance, fired: false }));
  const total = motifTotalMs(motif, flights.length);
  const trailEvery = motif.trail === "sparks" ? (ctx.lite ? 90 : 26) / (motif.trailIntensity ?? 2) * 2 : 0;
  const afterimages = motif.trail === "light" && !ctx.lite ? 2 + (motif.trailIntensity ?? 2) : 0;
  const ghostNodes = new Map<number, HTMLElement[]>();
  const kept: HTMLElement[] = [];

  const start = await nextFrame();
  for (let now = start; ; now = await nextFrame()) {
    const elapsed = now - start;
    // 1. Lectures (positions des zones), 2. écritures : une seule mise en page par image.
    const frames = flights.map((flight) => {
      const local = elapsed - flight.startMs;
      // Vraies cartes : sur un dépôt, elles partent de / visent leur place exacte (jeté compris).
      const realId = run.cards ? flight.cardId : undefined;
      if (local >= 0 && !flight.frozenFrom) flight.frozenFrom = slotOf(ctx, motif.from, flight.fromUi, flight.fromIdx, realId);
      const from = flight.frozenFrom ?? slotOf(ctx, motif.from, flight.fromUi, flight.fromIdx, realId);
      const needsLiveTo = !inPlace && (!flight.lastTo || (motif.to.zone === "hand" && spreads.length > 0 && local >= 0 && local <= motif.durationMs));
      const to = inPlace ? from : needsLiveTo ? slotOf(ctx, motif.to, flight.toUi, flight.toIdx, realId) : flight.lastTo!;
      flight.lastTo = to;
      const fromSlot = { ...from, scale: from.cardWidth ? from.cardWidth / width : from.scale };
      const toSlot = { ...to, scale: to.cardWidth ? to.cardWidth / width : to.scale, face: motif.to.zone === "offscreen" ? from.face : to.face };
      return { flight, local, frame: sampleFlight(motif, { from: fromSlot, to: toSlot }, local) };
    });

    const toRemove: string[] = [];
    for (const { flight, local, frame } of frames) {
      if (local >= 0 && !flight.departed) {
        flight.departed = true;
        const hand = motif.from.zone === "hand" && flight.fromUi != null && flight.fromIdx !== undefined ? ctx.registry.hand(flight.fromUi) : null;
        // Départ réel : l'éventail se resserre. Sur place : la vraie carte s'efface le temps que le sprite la remplace.
        if (hand && run.mode === "move" && !inPlace) hand.collapseCards?.([flight.fromIdx!], 360);
        if (hand && inPlace) hand.hideCardsFor?.([flight.fromIdx!], Math.max(0, total - flight.startMs));
        // Une carte qui part d'un dépôt (ou s'y anime sur place) y est remplacée par son sprite.
        if (motif.from.zone === "deposit" && flight.fromUi != null && flight.fromIdx !== undefined) {
          ctx.registry.deposit(flight.fromUi)?.hideCardsFor?.([flight.fromIdx], Math.max(0, total - flight.startMs) + (inPlace ? 0 : 2500));
        }
      }
      if (frame.phase === "landed" && !flight.landed) {
        flight.landed = true;
        run.onLanded?.(flight.k);
      }
      const settledAt = motif.durationMs + (motif.squash && !inPlace ? SQUASH_MS : 0);
      if (run.release === "landing" && !flight.released && local >= settledAt) {
        if (flight.finalShown) {
          flight.released = true;
          toRemove.push(flight.spriteId);
          continue;
        }
        flight.finalShown = true;
      }
      if (flight.released) continue;
      if (frame.phase === "flying" && afterimages > 0) {
        flight.history.push({ x: frame.x, y: frame.y });
        if (flight.history.length > 12) flight.history.shift();
      }
      const settles = run.mode === "move" && !inPlace && (motif.to.zone === "hand" || motif.to.zone === "deposit");
      const landed = settles ? { ...frame, lift: frame.lift * clamp((motif.durationMs - local) / (motif.durationMs * LIFT_SETTLE), 0, 1) } : frame;
      applyFrame(flight, landed, width, sink, color);

      // Traînée lumineuse : reflets qui suivent la carte avec un léger retard.
      if (afterimages) {
        let nodes = ghostNodes.get(flight.k);
        const host = ctx.layer.container();
        if (!nodes && host) {
          nodes = Array.from({ length: afterimages }, (_, i) => {
            const node = document.createElement("div");
            node.setAttribute("data-choreo-fx", "trail");
            const size = width * (0.9 - i * 0.12);
            Object.assign(node.style, { position: "absolute", left: "0", top: "0", width: `${size}px`, height: `${size}px`, borderRadius: "50%", pointerEvents: "none", background: `radial-gradient(circle, ${color}cc, ${color}00 70%)`, mixBlendMode: "screen", opacity: "0" });
            host.appendChild(node);
            return node;
          });
          ghostNodes.set(flight.k, nodes);
        }
        nodes?.forEach((node, i) => {
          const past = flight.history[flight.history.length - 1 - (i + 1) * 2];
          const visible = frame.phase === "flying" && past;
          const size = parseFloat(node.style.width);
          node.style.opacity = visible ? (0.55 - i * 0.1).toFixed(2) : "0";
          if (past) node.style.transform = `translate3d(${past.x - size / 2}px, ${past.y - size / 2}px, 0)`;
        });
      }
      // Étincelles : émises le long du trajet.
      if (trailEvery && frame.phase === "flying") {
        const due = Math.floor(local / trailEvery);
        while (flight.emittedSparks < due) emitSpark(ctx, frame, flight.k * 977 + flight.emittedSparks++, color);
      }
    }
    if (toRemove.length > 0) {
      if (ctx.layer.removeCards) ctx.layer.removeCards(toRemove);
      else toRemove.forEach((id) => ctx.layer.removeCard(id));
    }

    for (const spread of spreads) {
      if (!spread.done && elapsed >= spread.atMs) {
        spread.done = true;
        ctx.registry.hand(spread.ui)?.makeRoom?.(spread.count, spread.durationMs);
      }
    }
    for (const entry of reactions) {
      if (entry.fired || elapsed < entry.instance.atMs) continue;
      entry.fired = true;
      if (!MOTIF_REACTIONS[entry.instance.reaction.type]) continue;
      const flight = flights.find((item) => item.k === entry.instance.flight) ?? flights[0];
      const node = flight ? fireReaction(ctx, run, entry.instance, flight) : null;
      if (node) kept.push(node);
    }
    if (elapsed >= total) break;
  }
  ghostNodes.forEach((nodes) => nodes.forEach((node) => node.remove()));
  // Sur place : la vraie carte réapparaît, le sprite n'a plus lieu d'être.
  if (run.release === "end" || run.release === "landing" || (inPlace && (motif.from.zone === "hand" || motif.from.zone === "deposit"))) {
    const remaining = flights.filter((f) => !f.released).map((f) => f.spriteId);
    if (remaining.length > 0) {
      if (ctx.layer.removeCards) ctx.layer.removeCards(remaining);
      else remaining.forEach((id) => ctx.layer.removeCard(id));
    }
  }
  // Moments du jeu : leur calque n'est vidé qu'en fin de manche, rien ne doit rester (couronne posée sur un dépôt déjà ramassé).
  if (run.release === "end" || run.release === "landing") {
    for (const node of kept) void node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: "forwards" }).finished.then(() => node.remove(), () => node.remove());
  }
}
