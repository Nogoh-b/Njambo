"use client";

import { memo } from "react";
import { GAME_CONFIG } from "@/config/gameConfig";
import { MotionCard } from "@/components/cards/MotionCard";
import type { PanInfo } from "motion/react";
import type { Card } from "@/types/game";

/* ═══════════════ FILE: components/table/Fan.tsx ═══════════════
   Éventail générique : le siège fait pivoter l'éventail entier,
   donc le même composant sert pour le bas, la gauche, le haut, la droite.
   Les cartes jouables du joueur sont désormais draggables (Framer Motion) :
   on peut les glisser vers le dépôt central pour les jouer, en plus du tap. */
interface FanProps {
  cards: Card[];
  w: number;
  faceUp: boolean;
  seatIdx: number;
  playerCount: number;
  dealing: boolean;
  legal: number[] | null;
  onCardClick: (cardIdx: number) => void;
  hiddenIdx?: number | null;
  recommendedIdx?: number | null;
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

export const Fan = memo(function Fan({
  cards,
  w,
  faceUp,
  seatIdx,
  playerCount,
  dealing,
  legal,
  onCardClick,
  hiddenIdx,
  recommendedIdx,
  motionOn = true,
  getDropRect,
}: FanProps) {
  const c = (cards.length - 1) / 2;
  return (
    <div style={{ display: "flex", pointerEvents: faceUp ? "auto" : "none" }}>
      {cards.map((card, ci) => {
        const playable = faceUp && legal?.includes(ci);
        const draggable = !!playable && motionOn;
        return (
          <MotionCard
            key={card.id + ci}
            className={recommendedIdx === ci ? "nj-recommended-card" : undefined}
            card={card}
            hidden={!faceUp}
            w={w}
            rot={(ci - c) * 8}
            lift={playable ? -w * 0.24 : Math.pow(Math.abs(ci - c), 1.5) * 4}
            dim={faceUp && legal != null && !playable}
            glow={playable}
            onClick={playable ? () => onCardClick(ci) : undefined}
            dealDelay={dealing ? (ci * playerCount + seatIdx) * GAME_CONFIG.anim.dealPerCard : null}
            style={{
              marginLeft: ci === 0 ? 0 : -(w * 0.5),
              visibility: hiddenIdx === ci ? "hidden" : "visible",
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
