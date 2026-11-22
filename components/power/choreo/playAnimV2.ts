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
}

interface Flight {
  k: number;
  move: AnimV2Move;
  spriteId: string;
  root: HTMLElement;
  flipper: HTMLElement;
  faces: HTMLElement[];
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

function zoneElement(ctx: ChoreoContext, ref: ZoneRef): HTMLElement | null {
  const { registry } = ctx, ui = ref.ui;
  switch (ref.zone) {
    case "hand": return ui == null ? null : registry.hand(ui)?.getElement?.() ?? null;
    case "deposit": return ui == null ? null : registry.deposit(ui)?.getElement?.() ?? null;
    case "avatar": case "timer": return ui == null ? null : registry.timer(ui)?.getElement?.() ?? null;
    case "deck": return registry.deck()?.getElement?.() ?? null;
    case "pot": return registry.pot()?.getElement?.() ?? null;
    case "reveal": return registry.reveal()?.getElement?.() ?? null;
  }
}

/** Effet sur une zone. Jamais de transformation de la zone elle-même : ses poses sont relues pendant le vol
 *  (une main agrandie de 7 % décalerait la place visée). La pulsation est une onde dessinée par-dessus. */
function zoneEffect(ctx: ChoreoContext, ref: ZoneRef, effect: AnimV2Effect, at: ZonePose | null) {
  if (effect === "none") return;
  const color = TONE_COLORS[ctx.defaultTone];
  const duration = ANIM_V2_EFFECTS[effect].durationMs;
  const el = zoneElement(ctx, ref);
  if (effect === "glow") {
    void el?.animate([{ filter: "drop-shadow(0 0 0 transparent)" }, { filter: `drop-shadow(0 0 16px ${color}) brightness(1.15)`, offset: 0.35 }, { filter: "drop-shadow(0 0 0 transparent)" }], { duration, easing: "ease-out" });
    return;
  }
  void el?.animate([{ filter: "brightness(1)" }, { filter: "brightness(1.5)", offset: 0.5 }, { filter: "brightness(1)" }], { duration, easing: "ease-out" });
  const host = ctx.layer.container();
  if (!host || !at) return;
  const width = at.width * 1.25, height = width * CARD_RATIO;
  const ring = document.createElement("div");
  ring.setAttribute("data-choreo-fx", "v2-pulse");
  Object.assign(ring.style, {
    position: "absolute", left: `${at.x - width / 2}px`, top: `${at.y - height / 2}px`, width: `${width}px`, height: `${height}px`,
    borderRadius: `${Math.max(8, width * 0.14)}px`, border: `2px solid ${color}`, boxShadow: `0 0 18px ${color}`, pointerEvents: "none",
    transform: `rotate(${at.rotate}deg)`,
  });
  host.appendChild(ring);
  void ring.animate([{ opacity: 0.9, scale: "0.85" }, { opacity: 0, scale: "1.25" }], { duration, easing: "ease-out" }).finished.then(() => ring.remove(), () => ring.remove());
}

function applyFrame(flight: Flight, frame: AnimV2Frame, width: number, hidden: boolean) {
  const height = width * CARD_RATIO;
  const scale = (frame.width / width) * frame.pop;
  flight.root.style.transform = `translate3d(${(frame.x - width / 2).toFixed(2)}px, ${(frame.y - height / 2).toFixed(2)}px, 0) rotate(${frame.rotate.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
  flight.root.style.opacity = hidden ? "0" : "1";
  flight.flipper.style.transform = `rotateY(${frame.flip.toFixed(1)}deg)`;
  // Ombre portée : la carte « monte » à mi-vol.
  const lift = frame.pop - 1;
  const shadow = `drop-shadow(0 ${(3 + lift * 120).toFixed(1)}px ${(5 + lift * 140).toFixed(1)}px rgba(0,0,0,${(0.32 + lift * 2).toFixed(2)}))`;
  for (const face of flight.faces) face.style.filter = shadow;
}

/** Joue un modèle V2 ; se résout à la fin du vol, de la réorganisation et des effets. */
export async function playAnimV2(ctx: ChoreoContext, run: AnimV2Run): Promise<void> {
  const { model } = run;
  const timeline = animV2Timeline(model);
  const { registry } = ctx;

  // Poses au décollage (avant toute réorganisation) ; un mouvement sans zone est ignoré.
  const planned = run.moves
    .map((move, k) => ({ move, k, from: zonePoseOf(registry, move.from, move.from.index), to: zonePoseOf(registry, move.to, move.to.index, move.to.count, move.to.cardId) }))
    .filter((item): item is { move: AnimV2Move; k: number; from: ZonePose; to: ZonePose } => !!item.from && !!item.to);
  if (planned.length === 0) return;

  // Taille du sprite : la plus grande des deux cartes (on réduit, on n'agrandit jamais une petite carte).
  const width = clamp(Math.max(...planned.flatMap((item) => [item.from.width, item.to.width])) || 62, 40, 96);

  const flights: Flight[] = [];
  await Promise.all(planned.map(({ move, k, from, to }) => {
    const spriteId = `${run.id}_${k}_${Math.random().toString(36).slice(2, 7)}`;
    return ctx.layer.spawnCard({ id: spriteId, card: move.card, width }).then((nodes) => {
      if (!nodes) return;
      nodes.root.style.opacity = "0";
      flights.push({ k, move, spriteId, root: nodes.root, flipper: nodes.flipper, faces: Array.from(nodes.flipper.children) as HTMLElement[], from, to, landed: false, released: false });
    });
  }));
  if (flights.length === 0) return;
  flights.sort((a, b) => a.k - b.k);

  // Zones touchées : la carte de départ s'efface (son sprite la remplace), les mains se réorganisent.
  const leaving = new Map<string, { ref: ZoneRef; indexes: number[]; flight: Flight }>();
  const entering = new Map<string, { ref: ZoneRef; count: number; flight: Flight }>();
  for (const flight of flights) {
    const { move } = flight;
    const from = leaving.get(zoneKey(move.from)) ?? { ref: move.from, indexes: [], flight };
    from.indexes.push(move.from.index);
    leaving.set(zoneKey(move.from), from);
    const to = entering.get(zoneKey(move.to)) ?? { ref: move.to, count: 0, flight };
    to.count += 1;
    entering.set(zoneKey(move.to), to);
  }
  const hideFor = timeline.totalMs + 2500;
  for (const { ref, indexes, flight } of leaving.values()) {
    if (ref.zone === "hand" && ref.ui != null) registry.hand(ref.ui)?.hideCardsFor?.(indexes, hideFor);
    if (ref.zone === "deposit" && ref.ui != null) registry.deposit(ref.ui)?.hideCardsFor?.(indexes, hideFor);
    if (!ctx.lite) zoneEffect(ctx, ref, model.effects.onLeave, flight.from);
  }

  let reflowed = false, entered = false;
  const start = await nextFrame();
  for (let now = start; ; now = await nextFrame()) {
    const elapsed = now - start;
    // 1. Lectures (poses des zones), 2. écritures : une seule mise en page par image.
    const frames = flights.map((flight) => {
      if (elapsed < model.motion.durationMs) flight.to = zonePoseOf(registry, flight.move.to, flight.move.to.index, flight.move.to.count, flight.move.to.cardId) ?? flight.to;
      return { flight, frame: sampleAnimV2(model, flight.from, flight.to, elapsed) };
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

    for (const { flight, frame } of frames) {
      if (flight.released) continue;
      // Release à l'atterrissage : la pose finale est dessinée une image, puis la carte volante est retirée
      // (sinon la dernière image visible reste juste avant l'arrivée).
      if (flight.landed && run.release === "landing") {
        flight.released = true;
        ctx.layer.removeCard(flight.spriteId);
        continue;
      }
      if (frame.phase === "landed" && !flight.landed) {
        flight.landed = true;
        run.onLanded?.(flight.k);
      }
      applyFrame(flight, frame, width, frame.phase === "landed" && swallows(flight.move, flight.to));
    }
    if (elapsed >= timeline.totalMs) break;
  }
  if (run.release === "end" || run.release === "landing") flights.forEach((flight) => ctx.layer.removeCard(flight.spriteId));
}
