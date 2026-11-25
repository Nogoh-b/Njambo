"use client";

/* ═══════════════ RevealOverlay — zone de révélation de cartes ═══════════════
   Extraction de l'overlay « Œil du Sorcier » de TableScreen, généralisée :
   n'importe quel script de pouvoir peut ouvrir cette zone via le handle
   "reveal" (registre de zones). Le mode `pick` rend les cartes cliquables —
   la promesse d'open() se résout avec la carte choisie (clic générique). */

import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { PlayCard } from "@/components/cards/PlayCard";
import { displayFont } from "@/components/ui/Shell";
import { T } from "@/config/theme";
import type { Card } from "@/types/game";
import { useRegisterZone } from "./ZoneRegistry";

interface RevealRequest {
  title: string;
  playerName: string;
  cards: Card[];
  durationMs?: number;
  pick?: { filter?: (card: Card) => boolean };
}

interface RevealState extends RevealRequest {
  key: string;
}

export const RevealOverlay = memo(function RevealOverlay() {
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const resolveRef = useRef<((card: Card | null) => void) | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settle = useCallback((card: Card | null) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    resolveRef.current?.(card);
    resolveRef.current = null;
    setReveal(null);
    cardRefs.current = {};
  }, []);

  // Révélation sur la table (Œil du Sorcier) : séparée de l'overlay plein écran, elle ne bloque pas le jeu.
  const [onTable, setOnTable] = useState<TableReveal | null>(null);
  const tableDoneRef = useRef<(() => void) | null>(null);

  useRegisterZone("reveal", {
    showOnTable: (req) => new Promise<void>((resolve) => {
      tableDoneRef.current?.();
      tableDoneRef.current = resolve;
      setOnTable({ ...req, key: `table-${Date.now()}` });
    }),
    getElement: () => rootRef.current,
    open: (req: RevealRequest) => {
      // Une révélation remplace la précédente (sa promesse se résout null).
      resolveRef.current?.(null);
      return new Promise<Card | null>((resolve) => {
        resolveRef.current = resolve;
        setReveal({ ...req, key: `reveal-${Date.now()}` });
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        if (req.durationMs) {
          closeTimerRef.current = setTimeout(() => settle(null), req.durationMs);
        }
      });
    },
    getCardRect: (cardId: string) =>
      cardRefs.current[cardId]?.getBoundingClientRect() ?? null,
    getRect: () => rootRef.current?.getBoundingClientRect() ?? null,
    close: () => settle(null),
  });

  const table = onTable ? (
    <TableRevealView
      key={onTable.key}
      reveal={onTable}
      onDone={() => {
        tableDoneRef.current?.();
        tableDoneRef.current = null;
        setOnTable(null);
      }}
    />
  ) : null;
  if (!reveal) return table;

  const visibleCards = reveal.cards.filter((c) => c.rank !== "?");
  return (
    <>
    {table}
    <div
      ref={rootRef}
      key={reveal.key}
      onClick={() => settle(null)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 72,
        background: "rgba(5,5,12,.8)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div style={{ textAlign: "center" }} onClick={(e) => reveal.pick && e.stopPropagation()}>
        <div style={{ ...displayFont, fontWeight: 900, fontSize: 20, color: T.pink, marginBottom: 2 }}>
          {reveal.title}
        </div>
        <div className="nj-subtle" style={{ fontSize: 13, marginBottom: 16 }}>
          {reveal.pick ? `Choisis une carte — ${reveal.playerName}` : `Main de ${reveal.playerName}`}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", maxWidth: 340 }}>
          {visibleCards.length === 0 ? (
            <span className="nj-subtle">Main non visible dans cette partie.</span>
          ) : (
            visibleCards.map((c) => {
              const pickable = !!reveal.pick && (reveal.pick.filter?.(c) ?? true);
              return (
                <div
                  key={c.id}
                  ref={(el) => {
                    cardRefs.current[c.id] = el;
                  }}
                  onClick={pickable ? () => settle(c) : undefined}
                  style={{
                    cursor: pickable ? "pointer" : "default",
                    opacity: reveal.pick && !pickable ? 0.35 : 1,
                    transition: "transform .15s",
                  }}
                  className={pickable ? "nj-reveal-pickable" : undefined}
                >
                  <PlayCard card={c} w={46} />
                </div>
              );
            })
          )}
        </div>
        {reveal.pick && (
          <button data-nj-skin="dark"
            type="button"
            onClick={() => settle(null)}
            style={{
              marginTop: 14,
              padding: "8px 16px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,.2)",
              background: "transparent",
              color: T.muted,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Annuler
          </button>
        )}
      </div>
    </div>
    </>
  );
});

interface TableReveal {
  key: string;
  playerName: string;
  cards: Card[];
  faceUp: boolean;
  from: DOMRect | null;
  durationMs: number;
}

const TABLE_CARD_W = 56;
const FLY_MS = 420;
const STAGGER_MS = 130;
const FLIP_MS = 320;

/** Révélation sur la table : cartes une par une de la main de la cible vers le centre (face visible pour le lanceur, de
 *  dos pour les autres), tenue `durationMs`, puis retour une par une. Aucun fond, aucun clic capté : on joue en regardant. */
function TableRevealView({ reveal, onDone }: { reveal: TableReveal; onDone(): void }) {
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const doneRef = useRef(onDone);
  useLayoutEffect(() => { doneRef.current = onDone; });

  useLayoutEffect(() => {
    const slots = slotRefs.current.filter((slot): slot is HTMLDivElement => !!slot);
    const offsetOf = (slot: HTMLDivElement) => {
      if (!reveal.from) return { x: 0, y: 40 };
      const box = slot.getBoundingClientRect();
      return { x: reveal.from.left + reveal.from.width / 2 - (box.left + box.width / 2), y: reveal.from.top + reveal.from.height / 2 - (box.top + box.height / 2) };
    };
    let cancelled = false;
    const run = async () => {
      if (titleRef.current) void titleRef.current.animate([{ opacity: 0, translate: "0 6px" }, { opacity: 1, translate: "0 0" }], { duration: 300, fill: "forwards" });
      // Aller : chaque carte quitte la main de la cible (petite, de dos) et rejoint sa place au centre ; chez le lanceur,
      // elle se retourne à l'arrivée.
      await Promise.all(slots.map((slot, index) => {
        const { x, y } = offsetOf(slot);
        const delay = index * STAGGER_MS;
        const flight = slot.animate([
          { transform: `translate(${x}px, ${y}px) scale(.45) rotate(${index % 2 ? 8 : -8}deg)`, opacity: 0 },
          { transform: `translate(${x * 0.3}px, ${y * 0.3 - 24}px) scale(.9)`, opacity: 1, offset: 0.6 },
          { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
        ], { duration: FLY_MS, delay, easing: "cubic-bezier(.3,.8,.4,1)", fill: "both" });
        if (!reveal.faceUp) return flight.finished.catch(() => undefined);
        const back = slot.querySelector<HTMLElement>("[data-side=back]");
        const face = slot.querySelector<HTMLElement>("[data-side=face]");
        back?.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(90deg)" }], { duration: FLIP_MS / 2, delay: delay + FLY_MS, fill: "both" });
        return face?.animate([{ transform: "rotateY(-90deg)" }, { transform: "rotateY(0deg)" }], { duration: FLIP_MS / 2, delay: delay + FLY_MS + FLIP_MS / 2, fill: "both" }).finished.catch(() => undefined);
      }));
      if (cancelled) return;
      await new Promise((resolve) => setTimeout(resolve, reveal.durationMs));
      if (cancelled) return;
      // Retour : les cartes repartent une par une vers la main de la cible.
      if (titleRef.current) void titleRef.current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" });
      await Promise.all(slots.map((slot, index) => {
        const { x, y } = offsetOf(slot);
        return slot.animate([
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          { transform: `translate(${x}px, ${y}px) scale(.45)`, opacity: 0 },
        ], { duration: 360, delay: index * 90, easing: "cubic-bezier(.5,0,.8,.5)", fill: "both" }).finished.catch(() => undefined);
      }));
      if (!cancelled) doneRef.current();
    };
    void run();
    return () => { cancelled = true; };
  }, [reveal]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 72, display: "grid", placeItems: "center", pointerEvents: "none" }} data-reveal-table>
      <div style={{ textAlign: "center", transform: "translateY(-6%)" }}>
        <div ref={titleRef} style={{
          ...displayFont, display: "inline-block", fontWeight: 900, fontSize: 14, color: "#ffd6e4", marginBottom: 10, opacity: 0,
          padding: "4px 12px", borderRadius: 999, background: "rgba(24,8,18,.88)", border: `1px solid ${T.pink}`, boxShadow: `0 0 12px ${T.pink}55`,
        }}>
          {reveal.faceUp ? `Main de ${reveal.playerName}` : `L'œil lit la main de ${reveal.playerName}`}
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", maxWidth: 360, padding: "0 12px" }}>
          {reveal.cards.map((card, index) => (
            <div key={`${card.id}-${index}`} ref={(el) => { slotRefs.current[index] = el; }}
              style={{ position: "relative", width: TABLE_CARD_W, height: TABLE_CARD_W * 1.45, opacity: 0, perspective: 400, filter: `drop-shadow(0 6px 10px rgba(0,0,0,.55)) drop-shadow(0 0 6px ${T.pink}66)` }}>
              <div data-side="back" style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden" }}><PlayCard hidden w={TABLE_CARD_W} /></div>
              {reveal.faceUp && (
                <div data-side="face" style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(-90deg)" }}><PlayCard card={card} w={TABLE_CARD_W} /></div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
