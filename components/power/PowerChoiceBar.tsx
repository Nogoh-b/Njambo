"use client";

/* ═══════════════ PowerChoiceBar — choix de cartes d'une carte pouvoir ═══════════════
   Barre de sélection générique (toute étape `choice` d'un script) :
   - posée AU-DESSUS des cartes à choisir (jamais dessus), relue à chaque image ;
   - une case par carte possible, remplie par la carte choisie (« 7♦ ») ;
   - pastille numérotée et contour sur chaque carte choisie, dans la zone ;
   - fil du temps restant ; Valider s'allume dès que le minimum est atteint. */

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import type { ZoneRegistry } from "@/components/table/zones/ZoneRegistry";
import type { Card } from "@/types/game";
import styles from "./PowerChoiceBar.module.css";

const TONE_COLORS: Record<string, string> = { gold: "#f2bb45", teal: "#1de4be", pink: "#ff5b82", cobalt: "#6fa8ff" };
const RED_SUITS = new Set(["♥", "♦"]);

export interface PowerChoiceState {
  /** Nom de la carte pouvoir. */
  title?: string;
  tone?: string;
  /** Zone où l'on choisit. */
  zone: { kind: "hand" | "deposit"; ui: number };
  /** Index des cartes choisies (ordre du choix) et les cartes elles-mêmes. */
  selectedIdx: number[];
  selectedCards: Card[];
  min: number;
  max: number;
  /** Fin du délai de choix (Date.now()) et sa durée totale. */
  deadline: number;
  timeoutMs: number;
  onConfirm(): void;
  onCancel(): void;
}

interface Mark { x: number; y: number; width: number; height?: number; rotate: number }

/** Haut des cartes à choisir (la barre se pose au-dessus). */
function zoneTop(registry: ZoneRegistry, zone: PowerChoiceState["zone"]): number | null {
  if (zone.kind === "deposit") return registry.deposit(zone.ui)?.getRect()?.top ?? null;
  const hand = registry.hand(zone.ui);
  if (!hand) return null;
  const count = hand.cardCount?.() ?? 0;
  const tops = Array.from({ length: count }, (_, index) => hand.getCardRect(index)?.top).filter((top): top is number => top != null);
  return tops.length ? Math.min(...tops) : hand.getRect()?.top ?? null;
}

function markOf(registry: ZoneRegistry, zone: PowerChoiceState["zone"], index: number): Mark | null {
  if (zone.kind === "hand") {
    const hand = registry.hand(zone.ui);
    // Carte telle qu'affichée (soulevée et inclinée à l'intérieur de sa place) : mesurée sur l'élément visible.
    const face = hand?.getElement?.()?.children[index]?.firstElementChild as HTMLElement | null | undefined;
    if (face && face.offsetWidth > 0) {
      const box = face.getBoundingClientRect();
      const matrix = new DOMMatrix(getComputedStyle(face).transform === "none" ? undefined : getComputedStyle(face).transform);
      return { x: box.left + box.width / 2, y: box.top + box.height / 2, width: face.offsetWidth, height: face.offsetHeight, rotate: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI };
    }
    const slot = hand?.poseOf?.(index) ?? hand?.getCardSlot?.(index);
    if (slot) return { x: slot.x, y: slot.y, width: slot.width, rotate: slot.rotate };
  }
  const rect = zone.kind === "hand" ? registry.hand(zone.ui)?.getCardRect(index) : registry.deposit(zone.ui)?.getCardRect(index);
  return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, rotate: 0 } : null;
}

export const PowerChoiceBar = memo(function PowerChoiceBar({ state, registry }: { state: PowerChoiceState; registry: ZoneRegistry | null }) {
  const [bottom, setBottom] = useState<number | null>(null);
  const [marks, setMarks] = useState<(Mark | null)[]>([]);
  const color = TONE_COLORS[state.tone ?? "cobalt"] ?? TONE_COLORS.cobalt;
  const ready = state.selectedIdx.length >= state.min;
  const zoneKey = `${state.zone.kind}:${state.zone.ui}`;
  const selectedKey = state.selectedIdx.join(",");
  const confirmRef = useRef(state.onConfirm);
  const cancelRef = useRef(state.onCancel);
  useEffect(() => { confirmRef.current = state.onConfirm; cancelRef.current = state.onCancel; }, [state.onConfirm, state.onCancel]);

  // Position de la barre et des pastilles relue à chaque image (les cartes se soulèvent, l'éventail s'écarte).
  useEffect(() => {
    if (!registry) return;
    const [kind, ui] = zoneKey.split(":");
    const zone = { kind: kind as "hand" | "deposit", ui: Number(ui) };
    const indexes = selectedKey ? selectedKey.split(",").map(Number) : [];
    let raf = 0;
    let last = "";
    const tick = () => {
      const top = zoneTop(registry, zone);
      // Au-dessus des cartes ET de la rangée avatar / « Mon deck » qui les borde (main : 64 px de marge).
      const gap = zone.kind === "hand" ? 64 : 12;
      const nextBottom = top == null ? null : Math.round(Math.min(window.innerHeight * 0.7, window.innerHeight - top + gap));
      const nextMarks = indexes.map((index) => markOf(registry, zone, index));
      const key = `${nextBottom}|${nextMarks.map((mark) => (mark ? `${Math.round(mark.x)},${Math.round(mark.y)},${Math.round(mark.rotate)}` : "-")).join(";")}`;
      if (key !== last) { last = key; setBottom(nextBottom); setMarks(nextMarks); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [registry, zoneKey, selectedKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelRef.current();
      if (event.key === "Enter") confirmRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const instruction = state.max > 1
    ? state.min === state.max ? `Choisis ${state.max} cartes` : `Choisis ${state.min === 1 ? "1" : state.min} à ${state.max} cartes`
    : state.zone.kind === "deposit" ? "Choisis une carte du dépôt" : "Choisis une carte de ta main";

  return (
    <>
    {/* Pastilles sur les cartes choisies, dans l'ordre du choix (calque à part, au-dessus de la main). */}
    <div className={styles.marks} style={{ "--choice-color": color } as CSSProperties} aria-hidden="true">
      {marks.map((mark, order) => mark && (
        <div key={state.selectedIdx[order]} className={styles.mark}
          style={{ left: mark.x, top: mark.y, width: mark.width, height: mark.height ?? mark.width * 1.45, transform: `translate(-50%, -50%) rotate(${mark.rotate}deg)` }}>
          <span className={styles.badge}>{order + 1}</span>
        </div>
      ))}
    </div>
    <div className={styles.root} style={{ "--choice-color": color } as CSSProperties} data-power-choice>

      <div className={styles.bar} style={{ bottom: bottom ?? undefined }} role="group" aria-label={`${state.title ?? "Carte pouvoir"} : ${instruction}`}>
        <button type="button" className={styles.close} onClick={() => cancelRef.current()} aria-label="Annuler">✕</button>
        <div className={styles.copy}>
          {state.title && <span className={styles.title}>{state.title}</span>}
          <strong className={styles.instruction}>{instruction}</strong>
        </div>
        <div className={styles.slots} aria-label={`${state.selectedIdx.length} sur ${state.max}`}>
          {Array.from({ length: state.max }, (_, index) => {
            const card = state.selectedCards[index];
            const optional = index >= state.min;
            return (
              <span key={index} className={`${styles.slot} ${card ? styles.filled : ""} ${optional && !card ? styles.optional : ""}`}>
                {card && (
                  <span key={card.id} className={styles.slotCard} style={{ color: RED_SUITS.has(card.suit) ? "#c1292e" : "#1c1712" }}>
                    {card.rank}<small>{card.suit}</small>
                  </span>
                )}
              </span>
            );
          })}
        </div>
        {state.max > 1 && (
          <button type="button" className={`${styles.confirm} ${ready ? styles.ready : ""}`} disabled={!ready} onClick={() => confirmRef.current()}>
            Valider
          </button>
        )}
        <ChoiceTimer deadline={state.deadline} timeoutMs={state.timeoutMs} />
      </div>
    </div>
    </>
  );
});

/** Fil du temps restant : se vide jusqu'à la fin du délai. */
function ChoiceTimer({ deadline, timeoutMs }: { deadline: number; timeoutMs: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const remaining = Math.max(0, deadline - Date.now());
    const animation = ref.current?.animate(
      [{ transform: `scaleX(${remaining / Math.max(1, timeoutMs)})` }, { transform: "scaleX(0)" }],
      { duration: remaining, easing: "linear", fill: "forwards" },
    );
    return () => animation?.cancel();
  }, [deadline, timeoutMs]);
  return <span ref={ref} className={styles.timer} aria-hidden="true" />;
}
