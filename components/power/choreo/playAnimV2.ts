/* ═══════════════ Lecteur des animations V2 (étape V2-2) ═══════════════
   Joue un modèle V2 sur la table réelle ou sur la table de démonstration :
   - les poses de départ et d'arrivée viennent des ZONES (`zonePoseOf`) ;
   - le départ est figé au décollage, l'arrivée est relue à chaque image
     (une carte jouable se soulève, l'éventail s'écarte : la carte vise
     toujours la place que la main affichera) ;
   - la main de départ se resserre et celle d'arrivée s'écarte pendant le vol
     (`reflowZone`), au moment fixé par le modèle ;
   - effets de sortie et d'entrée sur les zones.
   Chaque image est calculée par `sampleAnimV2` (pur, testé).
   Uniquement transform / opacity / filter. */

import { animV2Timeline, ANIM_V2_EFFECTS, type AnimV2, type AnimV2Effect } from "@/engine/anim/v2/model";
import { CARD_RATIO, type ZonePose } from "@/engine/anim/v2/pose";
import { sampleAnimV2, type AnimV2Frame } from "@/engine/anim/v2/sample";
import type { PowerFxTone } from "@/engine/power/types";
import type { Card } from "@/types/game";
import { reflowZone, zonePoseOf, type ZoneRef } from "@/components/table/zones/zonePose";
import type { ChoreoContext } from "./playChoreography";

/** Une carte qui bouge : d'une place d'une zone à une place d'une autre. */
export interface AnimV2Move {
  /** Carte montrée face visible (null = de dos, carte décorative). */
  card: Card | null;
  from: ZoneRef & { index: number };
  /** `count` : nombre de cartes de la zone d'arrivée APRÈS le mouvement (main : sa nouvelle disposition).
   *  `cardId` : carte posée sur un dépôt, pour viser sa place exacte (son jeté). */
  to: ZoneRef & { index: number; count?: number; cardId?: string };
  /** Point libre (au-dessus d'une zone, par exemple) à la place de la pose de la zone de départ / d'arrivée :
   *  la zone n'est alors ni masquée, ni réorganisée, ni animée de ce côté-là. */
  fromPose?: ZonePose;
  toPose?: ZonePose;
  /** Décalage optionnel au décollage (ms) : permet de regrouper une distribution dans une seule boucle RAF. */
  delayMs?: number;
}

export interface AnimV2Run {
  /** Identifiant des sprites. */
  id: string;
  model: AnimV2;
  /** Cartes qui bougent ensemble (même décollage). */
  moves: AnimV2Move[];
  /** Retrait des sprites : à la fin du calque (défaut), à l'atterrissage (la vraie carte prend le relais) ou à la fin de l'animation. */
  release?: "keep" | "landing" | "end";
  /** Réorganiser les mains (défaut : oui). Non pour la distribution : les vraies cartes sont déjà à leur place, cachées. */
  reflow?: boolean;
  /** Appelé à l'atterrissage de chaque carte (index dans `moves`). */
  onLanded?(k: number): void;
  /** Appelé une fois, quand les cartes volantes sont dessinées pour la première fois (relais sans à-coup). */
  onFirstFrame?(): void;
  /** Identifiants des cartes volantes, dès leur création (pour les retirer plus tard avec `layer.removeCard`). */
  onSpawned?(spriteIds: string[]): void;
  /** Origine des temps des `delayMs` (`performance.now()`) partagée avec la pioche ; défaut : première image. */
  epoch?: number;
}

interface Flight {
  k: number;
  move: AnimV2Move;
  delayMs: number;
  spriteId: string;
  root: HTMLElement;
  flipper: HTMLElement;
  from: ZonePose;
  to: ZonePose;
  landed: boolean;
  released: boolean;
}

const TONE_COLORS: Record<PowerFxTone, string> = { gold: "#f2bb45", teal: "#1de4be", pink: "#ff5b82", cobalt: "#6fa8ff" };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const zoneKey = (ref: ZoneRef) => `${ref.zone}:${ref.ui ?? ""}`;
/** La carte disparaît en arrivant : zone qui avale (avatar, pot) ou pioche (le paquet ne grandit pas). */
const swallows = (move: AnimV2Move, pose: ZonePose) => !!pose.sink || move.to.zone === "deck";

/** Effet sur une zone — 100 % GPU (transform/opacity sur anneau superposé, jamais de filter sur un conteneur). */
function zoneEffect(ctx: ChoreoContext, _ref: ZoneRef, effect: AnimV2Effect, at: ZonePose | null) {
  if (effect === "none" || !at) return;
  const host = ctx.layer.container();
  if (!host) return;
  const color = TONE_COLORS[ctx.defaultTone];
  const duration = ANIM_V2_EFFECTS[effect].durationMs;
  const width = at.width * (effect === "glow" ? 1.15 : 1.25);
  const height = width * CARD_RATIO;
  const ring = document.createElement("div");
  ring.setAttribute("data-choreo-fx", effect === "glow" ? "v2-glow" : "v2-pulse");
  Object.assign(ring.style, {
    position: "absolute",
    left: `${at.x - width / 2}px`,
    top: `${at.y - height / 2}px`,
    width: `${width}px`,
    height: `${height}px`,
    borderRadius: `${Math.max(8, width * 0.14)}px`,
    border: effect === "glow" ? `1.5px solid ${color}` : `2px solid ${color}`,
    boxShadow: `0 0 ${effect === "glow" ? 14 : 18}px ${color}`,
    pointerEvents: "none",
    willChange: "transform, opacity",
  });
  host.appendChild(ring);
  const rot = `rotate(${at.rotate}deg)`;
  const keyframes = effect === "glow"
    ? [{ opacity: 0, transform: `${rot} scale(0.92)` }, { opacity: 0.78, transform: `${rot} scale(1.04)`, offset: 0.35 }, { opacity: 0, transform: `${rot} scale(1.1)` }]
    : [{ opacity: 0.9, transform: `${rot} scale(0.85)` }, { opacity: 0, transform: `${rot} scale(1.25)` }];
  void ring.animate(keyframes, { duration, easing: "ease-out" }).finished.then(() => ring.remove(), () => ring.remove());
}

function applyFrame(flight: Flight, frame: AnimV2Frame, width: number, hidden: boolean) {
  const height = width * CARD_RATIO;
  const scale = (frame.width / width) * frame.pop;
  flight.root.style.transform = `translate3d(${(frame.x - width / 2).toFixed(2)}px, ${(frame.y - height / 2).toFixed(2)}px, 0) rotate(${frame.rotate.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
  flight.root.style.opacity = hidden ? "0" : "1";
  flight.flipper.style.transform = `rotateY(${frame.flip.toFixed(1)}deg)`;
}

/** Joue un modèle V2 ; se résout à la fin du vol, de la réorganisation et des effets. */
export async function playAnimV2(ctx: ChoreoContext, run: AnimV2Run): Promise<void> {
  const { model } = run;
  const timeline = animV2Timeline(model);
  const { registry } = ctx;

  // Poses au décollage (avant toute réorganisation) ; un mouvement sans zone est ignoré.
  const planned = run.moves
    .map((move, k) => ({
      move,
      k,
      delayMs: Math.max(0, move.delayMs ?? 0),
      from: move.fromPose ?? zonePoseOf(registry, move.from, move.from.index),
      to: move.toPose ?? zonePoseOf(registry, move.to, move.to.index, move.to.count, move.to.cardId),
    }))
    .filter((item): item is { move: AnimV2Move; k: number; delayMs: number; from: ZonePose; to: ZonePose } => !!item.from && !!item.to);
  if (planned.length === 0) return;

  // Taille du sprite : la plus grande des deux cartes (on réduit, on n'agrandit jamais une petite carte).
  const width = clamp(Math.max(...planned.flatMap((item) => [item.from.width, item.to.width])) || 62, 40, 96);

  const spriteSpecs = planned.map(({ move, k }) => ({
    id: `${run.id}_${k}_${Math.random().toString(36).slice(2, 7)}`,
    card: move.card,
    width,
  }));
  const spawned = ctx.layer.spawnCards
    ? await ctx.layer.spawnCards(spriteSpecs)
    : await Promise.all(spriteSpecs.map((spec) => ctx.layer.spawnCard(spec)));

  const flights: Flight[] = [];
  spawned.forEach((nodes, idx) => {
    if (!nodes) return;
    const item = planned[idx]!;
    nodes.root.style.opacity = "0";
    flights.push({
      k: item.k,
      move: item.move,
      delayMs: item.delayMs,
      spriteId: spriteSpecs[idx]!.id,
      root: nodes.root,
      flipper: nodes.flipper,
      from: item.from,
      to: item.to,
      landed: false,
      released: false,
    });
  });
  if (flights.length === 0) return;
  flights.sort((a, b) => a.k - b.k);
  run.onSpawned?.(flights.map((flight) => flight.spriteId));

  // Zones touchées : la carte de départ s'efface (son sprite la remplace), les mains se réorganisent.
  const leaving = new Map<string, { ref: ZoneRef; indexes: number[]; flight: Flight }>();
  const entering = new Map<string, { ref: ZoneRef; count: number; flight: Flight }>();
  let maxDelayMs = 0;
  for (const flight of flights) {
    if (flight.delayMs > maxDelayMs) maxDelayMs = flight.delayMs;
    const { move } = flight;
    if (!move.fromPose) {
      const from = leaving.get(zoneKey(move.from)) ?? { ref: move.from, indexes: [], flight };
      from.indexes.push(move.from.index);
      leaving.set(zoneKey(move.from), from);
    }
    if (!move.toPose) {
      const to = entering.get(zoneKey(move.to)) ?? { ref: move.to, count: 0, flight };
      to.count += 1;
      entering.set(zoneKey(move.to), to);
    }
  }
  const totalRunMs = maxDelayMs + timeline.totalMs;
  const hideFor = totalRunMs + 2500;
  for (const { ref, indexes, flight } of leaving.values()) {
    if (ref.zone === "hand" && ref.ui != null) registry.hand(ref.ui)?.hideCardsFor?.(indexes, hideFor);
    if (ref.zone === "deposit" && ref.ui != null) registry.deposit(ref.ui)?.hideCardsFor?.(indexes, hideFor);
    if (!ctx.lite) zoneEffect(ctx, ref, model.effects.onLeave, flight.from);
  }

  let reflowed = false, entered = false;
  const needsLiveReflowRead = run.reflow !== false;
  const reflowWindowEnd = timeline.reflowAt + model.handReflowMs + 80;
  // Horloge partagée : le temps passé à créer les sprites ne décale pas les départs.
  const start = await nextFrame();
  const origin = run.epoch ?? start;
  for (let now = start; ; now = await nextFrame()) {
    const elapsed = now - origin;
    // 1. Lectures groupées uniquement si une main se réorganise réellement pendant le vol.
    const frames = flights.map((flight) => {
      const local = elapsed - flight.delayMs;
      if (local < 0) return { flight, local, frame: null };
      if (
        needsLiveReflowRead
        && !flight.move.toPose
        && flight.move.to.zone === "hand"
        && local >= timeline.reflowAt
        && local <= Math.min(model.motion.durationMs, reflowWindowEnd)
      ) {
        flight.to = zonePoseOf(registry, flight.move.to, flight.move.to.index, flight.move.to.count, flight.move.to.cardId) ?? flight.to;
      }
      return { flight, local, frame: sampleAnimV2(model, flight.from, flight.to, local) };
    });

    if (!reflowed && elapsed >= timeline.reflowAt) {
      reflowed = true;
      if (run.reflow !== false) {
        for (const { ref, indexes } of leaving.values()) reflowZone(registry, ref, { leave: indexes }, model.handReflowMs);
        for (const { ref, count } of entering.values()) reflowZone(registry, ref, { enter: count }, model.handReflowMs);
      }
    }
    if (!entered && elapsed >= timeline.enterFxAt) {
      entered = true;
      for (const { ref, flight } of entering.values()) zoneEffect(ctx, ref, model.effects.onEnter, flight.to);
    }

    const toRemove: string[] = [];
    for (const { flight, frame } of frames) {
      if (flight.released || !frame) continue;
      // Release à l'atterrissage : la pose finale est dessinée une image, puis la carte volante est retirée.
      if (flight.landed && run.release === "landing") {
        flight.released = true;
        toRemove.push(flight.spriteId);
        continue;
      }
      if (frame.phase === "landed" && !flight.landed) {
        flight.landed = true;
        run.onLanded?.(flight.k);
      }
      applyFrame(flight, frame, width, frame.phase === "landed" && !flight.move.toPose && swallows(flight.move, flight.to));
    }
    if (toRemove.length > 0) {
      if (ctx.layer.removeCards) ctx.layer.removeCards(toRemove);
      else toRemove.forEach((id) => ctx.layer.removeCard(id));
    }
    if (now === start) run.onFirstFrame?.();
    if (elapsed >= totalRunMs) break;
  }
  if (run.release === "end" || run.release === "landing") {
    const remaining = flights.filter((f) => !f.released).map((f) => f.spriteId);
    if (remaining.length > 0) {
      if (ctx.layer.removeCards) ctx.layer.removeCards(remaining);
      else remaining.forEach((id) => ctx.layer.removeCard(id));
    }
  }
}
