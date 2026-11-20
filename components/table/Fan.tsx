"use client";

import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { GAME_CONFIG } from "@/config/gameConfig";
import { MotionCard } from "@/components/cards/MotionCard";
import type { DealOrigin } from "@/components/cards/PlayCard";
import { useRegisterZone, type HandHighlightStyle, type ZoneKey } from "@/components/table/zones/ZoneRegistry";
import type { PanInfo } from "motion/react";
import type { Card } from "@/types/game";

/* ═══════════════ FILE: components/table/Fan.tsx ═══════════════
   Éventail générique : le siège fait pivoter l'éventail entier,
   donc le même composant sert pour le bas, la gauche, le haut, la droite.
   - Distribution réelle : mesure le vecteur exact (pioche centrale → chaque
     carte) dans le repère pivoté du siège pour un vol 100% GPU sans lag.
   - Clé React stable (`card.id`) : aucun démontage/remontage de la main
     quand une carte est jouée.
   - Glisser-déposer ou glisser vers le haut fluide sur mobile & desktop. */
interface FanProps {
  cards: Card[];
  w: number;
  faceUp: boolean;
  seatIdx: number;
  seatAngle?: number;
  playerCount: number;
  dealing: boolean;
  legal: number[] | null;
  onCardClick: (cardIdx: number) => void;
  /** Vrai si les animations sont activées (drag + hover). */
  motionOn?: boolean;
  /** Rect de la zone de dépôt cible (viewport) pour le hit-test du drag. */
  getDropRect?: () => DOMRect | null;
  /** Rect de la pioche centrale (viewport) pour faire partir la donne du paquet. */
  getDeckRect?: () => DOMRect | null;
  /** Notifie la table quand le joueur glisse une carte (illumine le dépôt cible). */
  onDragActive?: (active: boolean) => void;
}

/** Le point (viewport) est-il à l'intérieur du rect, avec une marge tolérante ? */
function pointInside(point: { x: number; y: number }, r: DOMRect, pad = 92): boolean {
  return (
    point.x >= r.left - pad &&
    point.x <= r.right + pad &&
    point.y >= r.top - pad &&
    point.y <= r.bottom + pad
  );
}

const HIGHLIGHT_CLASS: Record<HandHighlightStyle, string> = {
  recommend: "nj-recommended-card",
  swapped: "nj-swapped-card",
  locked: "nj-locked-card",
  boosted: "nj-boosted-card",
};

interface HandHighlight {
  style: HandHighlightStyle;
  cardIdx?: number;
  cardIds?: string[];
}

interface HandSelection {
  filter: (card: Card, cardIdx: number) => boolean;
  onPick: (cardIdx: number) => void;
}

export const Fan = memo(function Fan({
  cards,
  w,
  faceUp,
  seatIdx,
  seatAngle = 0,
  playerCount,
  dealing,
  legal,
  onCardClick,
  motionOn = true,
  getDropRect,
  getDeckRect,
  onDragActive,
}: FanProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState<HandHighlight | null>(null);
  const [hiddenIndexes, setHiddenIndexes] = useState<Set<number>>(() => new Set());
  const [selection, setSelection] = useState<HandSelection | null>(null);
  const [dealOrigins, setDealOrigins] = useState<DealOrigin[] | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionRef = useRef<HandSelection | null>(null);

  const cardRect = useCallback((cardIdx: number): DOMRect | null => {
    const children = rootRef.current?.children;
    if (!children || children.length === 0) return rootRef.current?.getBoundingClientRect() ?? null;
    const clamped = Math.max(0, Math.min(children.length - 1, cardIdx));
    const el = children[clamped] as HTMLElement | undefined;
    return el?.getBoundingClientRect() ?? rootRef.current?.getBoundingClientRect() ?? null;
  }, []);

  useRegisterZone(`hand:${seatIdx}` as ZoneKey, {
    getRect: () => rootRef.current?.getBoundingClientRect() ?? null,
    getElement: () => rootRef.current,
    getCardRect: cardRect,
    highlightCards: ({ cardIdx, cardIds, style, durationMs }) => {
      setHighlight({ style, cardIdx, cardIds });
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        setHighlight(null);
        highlightTimerRef.current = null;
      }, durationMs);
    },
    setHiddenCard: (cardIdx: number | null) =>
      setHiddenIndexes(cardIdx == null ? new Set() : new Set([cardIdx])),
    setHiddenCards: (cardIdxs: number[]) => setHiddenIndexes(new Set(cardIdxs)),
    beginSelection: (filter: HandSelection["filter"], onPick: HandSelection["onPick"]) => {
      const sel: HandSelection = { filter, onPick };
      selectionRef.current = sel;
      setSelection(sel);
      return () => {
        if (selectionRef.current === sel) {
          selectionRef.current = null;
          setSelection(null);
        }
      };
    },
  });

  /* Mesure exacte (avant le 1er paint de la donne) du vecteur pioche → chaque
     carte, converti dans le repère local du siège pivoté par `seatAngle`. */
  useLayoutEffect(() => {
    if (!dealing || cards.length === 0) {
      setDealOrigins(null);
      return;
    }
    const root = rootRef.current;
    const deckRect = getDeckRect?.() ?? null;
    if (!root || !deckRect) {
      setDealOrigins(null);
      return;
    }
    const deckCx = deckRect.left + deckRect.width / 2;
    const deckCy = deckRect.top + deckRect.height / 2;
    const rad = (seatAngle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const scale = Math.max(0.45, Math.min(1.05, deckRect.width / Math.max(24, w)));
    const rootRect = root.getBoundingClientRect();

    const origins: DealOrigin[] = cards.map((_, ci) => {
      const child = root.children[ci] as HTMLElement | undefined;
      const box = child?.getBoundingClientRect() ?? rootRect;
      const wx = deckCx - (box.left + box.width / 2);
      const wy = deckCy - (box.top + box.height / 2);
      return {
        dx: wx * cos + wy * sin,
        dy: -wx * sin + wy * cos,
        scale,
      };
    });
    setDealOrigins(origins);
  }, [dealing, cards.length, getDeckRect, seatAngle, w]);

  const c = (cards.length - 1) / 2;
  return (
    <div
      ref={rootRef}
      role={faceUp ? "group" : undefined}
      aria-label={faceUp ? `Votre main, ${cards.length} cartes` : undefined}
      aria-hidden={faceUp ? undefined : true}
      style={{ display: "flex", pointerEvents: faceUp ? "auto" : "none" }}
    >
      {cards.map((card, ci) => {
        const selectable = selection ? selection.filter(card, ci) : false;
        const playable = selection ? selectable : faceUp && legal?.includes(ci);
        const draggable = !selection && !!playable && motionOn && !dealing;
        const highlighted =
          highlight != null &&
          (highlight.cardIdx === ci || (highlight.cardIds?.includes(card.id) ?? false));
        const handleTap = selection
          ? selectable
            ? () => selection.onPick(ci)
            : undefined
          : playable
            ? () => onCardClick(ci)
            : undefined;
        return (
          <MotionCard
            key={card.id}
            className={highlighted ? HIGHLIGHT_CLASS[highlight.style] : undefined}
            card={card}
            hidden={!faceUp}
            w={w}
            rot={(ci - c) * 8}
            lift={playable ? -w * 0.24 : Math.pow(Math.abs(ci - c), 1.5) * 4}
            dim={faceUp && ((selection != null && !selectable) || (selection == null && legal != null && !playable))}
            glow={!!playable}
            onClick={handleTap}
            dealDelay={dealing ? (ci * playerCount + seatIdx) * GAME_CONFIG.anim.dealPerCard : null}
            dealOrigin={dealing ? (dealOrigins?.[ci] ?? null) : null}
            style={{
              marginLeft: ci === 0 ? 0 : -(w * 0.5),
              visibility: hiddenIndexes.has(ci) ? "hidden" : "visible",
              transition: dealing ? undefined : "margin-left 180ms cubic-bezier(.22,1,.36,1)",
            }}
            anim={
              draggable
                ? {
                    drag: true,
                    dragSnapToOrigin: true,
                    dragElastic: 0.45,
                    whileHover: { y: -w * 0.16, scale: 1.05 },
                    whileTap: { scale: 1.04 },
                    whileDrag: { scale: 1.14, zIndex: 200 },
                    onDragStart: () => onDragActive?.(true),
                    onDragEnd: (_e: unknown, info: PanInfo) => {
                      onDragActive?.(false);
                      const r = getDropRect?.();
                      const swipedUp = info.offset.y < -62;
                      if (swipedUp || (r && pointInside(info.point, r))) {
                        onCardClick(ci);
                      }
                    },
                  }
                : playable
                  ? { whileTap: { scale: 1.04 } }
                  : undefined
            }
          />
        );
      })}
    </div>
  );
});
