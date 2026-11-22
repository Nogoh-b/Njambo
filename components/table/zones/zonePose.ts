/* ═══════════════ Animation V2 — poses lues sur les zones (étape V2-1) ═══════════════
   Pont entre le registre des zones et les poses pures (engine/anim/v2/pose) :
   - `zonePoseOf` demande la pose à la zone (`poseOf`), ou la déduit de son
     rectangle si la zone ne sait pas la donner : jamais d'erreur ;
   - `reflowZone` fait se réorganiser la zone quand une carte part ou arrive
     (main : l'éventail se resserre ou s'écarte ; les autres zones : rien). */

import { rectPose, scaleFromBox, type ZonePose } from "@/engine/anim/v2/pose";
import type { ZoneRegistry } from "./ZoneRegistry";

export type PoseZone = "hand" | "deposit" | "deck" | "avatar" | "timer" | "pot" | "reveal";

/** Zone visée : son type, et le siège (index UI) pour les zones d'un joueur. */
export interface ZoneRef { zone: PoseZone; ui?: number }

/** Échelle à l'écran d'un élément tourné de `angle` (échelles des ancêtres comprises). */
export function elementScale(el: HTMLElement, angle = 0): number {
  return scaleFromBox(el.getBoundingClientRect().width, el.offsetWidth, el.offsetHeight, angle);
}

/** Centre à l'écran d'un élément (inchangé par sa rotation). */
export function elementCenter(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Pose de la carte `index` dans une zone, quand elle en compte `count` (par défaut : maintenant).
 *  `cardId` : carte qui arrive sur un dépôt, pour viser sa place exacte (son jeté). */
export function zonePoseOf(registry: ZoneRegistry, ref: ZoneRef, index: number, count?: number, cardId?: string): ZonePose | null {
  const ui = ref.ui;
  switch (ref.zone) {
    case "hand": {
      const hand = ui == null ? null : registry.hand(ui);
      if (!hand) return null;
      const pose = hand.poseOf?.(index, count);
      if (pose) return pose;
      const rect = hand.getCardRect(index) ?? hand.getRect();
      return rect ? rectPose(rect, { face: ui === 0 ? 0 : 180, index }) : null;
    }
    case "deposit": {
      const deposit = ui == null ? null : registry.deposit(ui);
      if (!deposit) return null;
      const pose = deposit.poseOf?.(index, count, cardId);
      if (pose) return pose;
      const rect = deposit.getTopCardRect() ?? deposit.getRect();
      return rect ? rectPose(rect, { index }) : null;
    }
    case "deck": {
      const deck = registry.deck();
      if (!deck) return null;
      const pose = deck.poseOf?.(index, count);
      if (pose) return pose;
      const rect = deck.getRect();
      return rect ? rectPose(rect, { face: 180, index }) : null;
    }
    case "avatar":
    case "timer": {
      const rect = ui == null ? null : registry.timer(ui)?.getRect();
      return rect ? rectPose(rect, { sink: true, index }) : null;
    }
    case "pot": {
      const rect = registry.pot()?.getRect();
      return rect ? rectPose(rect, { sink: true, index }) : null;
    }
    case "reveal": {
      const rect = registry.reveal()?.getRect();
      return rect ? rectPose(rect, { index }) : null;
    }
  }
}

/** Réorganisation d'une zone : `leave` = cartes qui partent (index actuels), `enter` = cartes qui arrivent. */
export interface ZoneChange { leave?: number[]; enter?: number }

export function reflowZone(registry: ZoneRegistry, ref: ZoneRef, change: ZoneChange, durationMs: number): void {
  if (ref.zone !== "hand" || ref.ui == null) return;
  const hand = registry.hand(ref.ui);
  if (!hand) return;
  if (change.leave?.length) hand.collapseCards?.(change.leave, durationMs);
  if (change.enter) hand.makeRoom?.(change.enter, durationMs);
}
