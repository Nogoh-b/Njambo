"use client";

/* ═══════════════ RevealOverlay — zone de révélation de cartes ═══════════════
   Extraction de l'overlay « Œil du Sorcier » de TableScreen, généralisée :
   n'importe quel script de pouvoir peut ouvrir cette zone via le handle
   "reveal" (registre de zones). Le mode `pick` rend les cartes cliquables —
   la promesse d'open() se résout avec la carte choisie (clic générique). */

import { memo, useCallback, useRef, useState } from "react";
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

  useRegisterZone("reveal", {
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

  if (!reveal) return null;

  const visibleCards = reveal.cards.filter((c) => c.rank !== "?");
  return (
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
  );
});
