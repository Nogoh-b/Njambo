"use client";

import { GAME_CONFIG } from "@/config/gameConfig";
import { PlayCard } from "@/components/cards/PlayCard";
import type { Card } from "@/types/game";

/* ═══════════════ FILE: components/table/Fan.jsx ═══════════════
   Éventail générique : le siège fait pivoter l'éventail entier,
   donc le même composant sert pour le bas, la gauche, le haut, la droite. */
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
}

export function Fan({
  cards,
  w,
  faceUp,
  seatIdx,
  playerCount,
  dealing,
  legal,
  onCardClick,
  hiddenIdx,
}: FanProps) {
  const c = (cards.length - 1) / 2;
  return (
    <div style={{ display: "flex", pointerEvents: faceUp ? "auto" : "none" }}>
      {cards.map((card, ci) => {
        const playable = faceUp && legal?.includes(ci);
        return (
          <div
            key={card.id + ci}
            style={{
              marginLeft: ci === 0 ? 0 : -(w * 0.5),
              visibility: hiddenIdx === ci ? "hidden" : "visible",
            }}
          >
            <PlayCard
              card={card}
              hidden={!faceUp}
              w={w}
              rot={(ci - c) * 8}
              lift={playable ? -w * 0.24 : Math.pow(Math.abs(ci - c), 1.5) * 4}
              dim={faceUp && legal != null && !playable}
              glow={playable}
              onClick={playable ? () => onCardClick(ci) : undefined}
              dealDelay={
                dealing ? (ci * playerCount + seatIdx) * GAME_CONFIG.anim.dealPerCard : null
              }
            />
          </div>
        );
      })}
    </div>
  );
}
