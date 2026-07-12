"use client";

import { memo, useCallback, useRef, useState } from "react";
import { GAME_CONFIG } from "@/config/gameConfig";
import { MotionCard } from "@/components/cards/MotionCard";
import { useRegisterZone, type HandHighlightStyle, type ZoneKey } from "@/components/table/zones/ZoneRegistry";
import type { PanInfo } from "motion/react";
import type { Card } from "@/types/game";

/* ═══════════════ FILE: components/table/Fan.tsx ═══════════════
   Éventail générique : le siège fait pivoter l'éventail entier,
   donc le même composant sert pour le bas, la gauche, le haut, la droite.
   Les cartes jouables du joueur sont draggables (Framer Motion).

   La zone expose un HandHandle (registre de zones) : rects des cartes,
   surlignage (recommandée / échangée / verrouillée / boostée), carte cachée
   pendant un vol, et mode sélection pour le clic générique des pouvoirs.
   Ces états sont INTERNES — TableScreen ne les possède plus. */
interface FanProps {
  cards: Card[];
  w: number;
  faceUp: boolean;
  seatIdx: number;
  playerCount: number;
  dealing: boolean;
  legal: number[] | null;
  onCardClick: (cardIdx: number) => void;
  /** Vrai si les animations sont activées (drag + hover). */
  motionOn?: boolean;
  /** Rect de la zone de dépôt cible (viewport) pour le hit-test du drag. */
  getDropRect?: () => DOMRect | null;
}

/** Le point (viewport) est-il à l'intérieur du rect, avec une marge tolérante ? */
function pointInside(point: { x: number; y: number }, r: DOMRect, pad = 60): boolean {
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
  playerCount,
  dealing,
  legal,
  onCardClick,
  motionOn = true,
  getDropRect,
}: FanProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState<HandHighlight | null>(null);
  const [hiddenIndexes, setHiddenIndexes] = useState<Set<number>>(() => new Set());
  const [selection, setSelection] = useState<HandSelection | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionRef = useRef<HandSelection | null>(null);

  const cardRect = useCallback((cardIdx: number): DOMRect | null => {
    const el = rootRef.current?.children?.[cardIdx] as HTMLElement | undefined;
    return el?.getBoundingClientRect() ?? rootRef.current?.getBoundingClientRect() ?? null;
  }, []);

  useRegisterZone(`hand:${seatIdx}` as ZoneKey, {
    getRect: () => rootRef.current?.getBoundingClientRect() ?? null,
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

  const c = (cards.length - 1) / 2;
  return (
    <div ref={rootRef} style={{ display: "flex", pointerEvents: faceUp ? "auto" : "none" }}>
      {cards.map((card, ci) => {
        // Mode sélection (pouvoir en attente d'un choix de carte) : le clic
        // désigne la carte au lieu de la jouer ; les autres sont grisées.
        const selectable = selection ? selection.filter(card, ci) : false;
        const playable = selection ? selectable : faceUp && legal?.includes(ci);
        const draggable = !selection && !!playable && motionOn;
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
            key={card.id + ci}
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
            style={{
              marginLeft: ci === 0 ? 0 : -(w * 0.5),
              visibility: hiddenIndexes.has(ci) ? "hidden" : "visible",
            }}
            anim={
              draggable
                ? {
                    drag: true,
                    dragSnapToOrigin: true,
                    dragElastic: 0.55,
                    whileHover: { y: -w * 0.12 },
                    whileTap: { scale: 1.04 },
                    whileDrag: { scale: 1.14, zIndex: 200 },
                    onDragEnd: (_e: unknown, info: PanInfo) => {
                      const r = getDropRect?.();
                      if (r && pointInside(info.point, r)) onCardClick(ci);
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
