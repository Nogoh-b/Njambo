"use client";

import { memo, type CSSProperties } from "react";
import { GAME_CONFIG } from "@/config/gameConfig";
import { CEREMONIAL_STRIP, RAFFIA_WEAVE, T } from "@/config/theme";
import type { Card } from "@/types/game";

const CARD_BASE_STYLE: CSSProperties = {
  flexShrink: 0,
  position: "relative",
  overflow: "hidden",
};

const CARD_BACK_STYLE: CSSProperties = {
  border: `2px solid ${T.gold}66`,
  background: `
    linear-gradient(180deg, rgba(5,5,12,.06), rgba(5,5,12,.18)),
    url("/assets/njambo/card-back.webp") center / cover no-repeat,
    radial-gradient(circle at 50% 38%, ${T.night3}, ${T.night1} 68%)`,
  backgroundSize: "100% 100%, cover, 100% 100%",
  backgroundPosition: "center",
};

const CARD_BACK_INSET_STYLE: CSSProperties = {
  position: "absolute",
  inset: 5,
  border: "1px solid rgba(255,248,232,.18)",
};

const CEREMONIAL_STRIP_STYLE: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  top: "50%",
  height: 4,
  transform: "translateY(-50%)",
  background: CEREMONIAL_STRIP,
  opacity: 0.78,
};

const CARD_FACE_STYLE: CSSProperties = {
  background: `linear-gradient(160deg, ${T.chalk}, ${T.cream})`,
  border: "1px solid rgba(27,16,16,.22)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

const RAFFIA_WEAVE_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  opacity: 0.36,
  background: RAFFIA_WEAVE(0.22),
  backgroundSize: "28px 28px, 28px 28px",
  pointerEvents: "none",
};

const ROTATED_CORNER_STYLE: CSSProperties = { transform: "rotate(180deg)" };

const CORNER_BASE_STYLE: CSSProperties = {
  position: "relative",
  zIndex: 1,
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 1,
  fontFamily: "var(--font-display), Georgia, serif",
  fontWeight: 900,
  lineHeight: 0.85,
};

export interface PlayCardProps {
  card?: Card;
  hidden?: boolean;
  w?: number;
  rot?: number;
  lift?: number;
  dim?: boolean;
  glow?: boolean;
  onClick?: () => void;
  dealDelay?: number | null;
}

export const PlayCard = memo(function PlayCard({
  card,
  hidden,
  w = 58,
  rot = 0,
  lift = 0,
  dim,
  glow,
  onClick,
  dealDelay,
}: PlayCardProps) {
  const h = w * 1.45;
  const anim: CSSProperties =
    dealDelay != null
      ? { animation: `dealFly ${GAME_CONFIG.anim.dealFlight}ms ${dealDelay}ms cubic-bezier(.22,.85,.3,1) both` }
      : {};

  const base: CSSProperties = {
    ...CARD_BASE_STYLE,
    width: w,
    height: h,
    borderRadius: Math.max(8, w * 0.14),
    transform: `rotate(${rot}deg) translateY(${lift}px)`,
    cursor: onClick ? "pointer" : "default",
    opacity: dim ? 0.34 : 1,
    ["--card-rot" as string]: `${rot}deg`,
    ["--card-lift" as string]: `${lift}px`,
    ...anim,
  };

  const className = [
    "nj-playcard",
    glow ? "nj-playcard-glow" : "",
    !hidden && onClick ? "playcard-clickable" : "",
  ].filter(Boolean).join(" ");

  if (hidden) {
    return (
      <div
        className={className}
        style={{
          ...base,
          ...CARD_BACK_STYLE,
        }}
      >
        <div
          style={{
            ...CARD_BACK_INSET_STYLE,
            borderRadius: Math.max(6, w * 0.1),
          }}
        />
        <div style={CEREMONIAL_STRIP_STYLE} />
      </div>
    );
  }

  if (!card) return null;

  const red = card.color === "#c1292e";
  const suitColor = red ? T.pink : T.ink;

  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        ...base,
        ...CARD_FACE_STYLE,
        color: suitColor,
        padding: `${w * 0.1}px`,
      }}
    >
      <div style={RAFFIA_WEAVE_STYLE} />
      <Corner rank={card.rank} suit={card.suit} size={w} color={suitColor} />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          margin: "auto",
          width: w * 0.64,
          height: w * 0.64,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: red ? `${T.pink}18` : "rgba(27,16,16,.08)",
          border: `1.5px solid ${red ? T.pink : T.ink}33`,
          fontSize: w * 0.45,
          fontFamily: "Georgia, serif",
          lineHeight: 1,
        }}
      >
        {card.suit}
      </div>
      <div style={ROTATED_CORNER_STYLE}>
        <Corner rank={card.rank} suit={card.suit} size={w} color={suitColor} />
      </div>
    </div>
  );
});

function Corner({ rank, suit, size, color }: { rank: string; suit: string; size: number; color: string }) {
  return (
    <div
      style={{
        ...CORNER_BASE_STYLE,
        color,
      }}
    >
      <span style={{ fontSize: size * 0.28 }}>{rank}</span>
      <span style={{ fontSize: size * 0.2 }}>{suit}</span>
    </div>
  );
}
