"use client";

import { memo, type CSSProperties } from "react";
import { GAME_CONFIG } from "@/config/gameConfig";
import { RAFFIA_WEAVE, T } from "@/config/theme";
import { DEFAULT_CARD_BACK_ASSET } from "@/lib/assets/manifests";
import type { Card } from "@/types/game";

const CARD_BASE_STYLE: CSSProperties = {
  flexShrink: 0,
  position: "relative",
  overflow: "hidden",
};

const CARD_BACK_STYLE: CSSProperties = {
  border: `1.5px solid ${T.gold}88`,
  background: `
    var(--nj-card-back, url("${DEFAULT_CARD_BACK_ASSET}")) center / cover no-repeat,
    radial-gradient(circle at 50% 44%, #3c1e0c, #110805 72%)`,
  backgroundSize: "cover, 100% 100%",
  backgroundPosition: "center",
};

const CARD_BACK_SHEEN_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(145deg, rgba(255,248,220,.14) 0%, transparent 42%, rgba(0,0,0,.12) 100%)",
  pointerEvents: "none",
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

const SUIT_LABELS: Record<string, string> = {
  "♠": "pique",
  "♥": "cœur",
  "♦": "carreau",
  "♣": "trèfle",
};

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

export interface DealOrigin {
  dx: number;
  dy: number;
  scale: number;
}

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
  /** Durée du vol de la donne (ms) ; défaut : celle du jeu. */
  dealDuration?: number;
  /** Vecteur local (pioche → emplacement carte) mesuré pour la donne. */
  dealOrigin?: DealOrigin | null;
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
  dealDuration = GAME_CONFIG.anim.dealFlight,
  dealOrigin,
}: PlayCardProps) {
  const h = w * 1.45;
  const anim: CSSProperties =
    dealDelay != null
      ? {
          animation: `dealFly ${dealDuration}ms ${dealDelay}ms cubic-bezier(.2,.86,.26,1) both`,
          willChange: "transform, opacity",
          ...(dealOrigin
            ? {
                ["--deal-dx" as string]: `${Math.round(dealOrigin.dx)}px`,
                ["--deal-dy" as string]: `${Math.round(dealOrigin.dy)}px`,
                ["--deal-scale" as string]: dealOrigin.scale.toFixed(3),
              }
            : {}),
        }
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
        <div style={CARD_BACK_SHEEN_STYLE} />
      </div>
    );
  }

  if (!card) return null;

  const red = card.color === "#c1292e";
  const suitColor = red ? T.pink : T.ink;
  const face = (
    <>
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
    </>
  );

  const faceStyle: CSSProperties = {
    ...base,
    ...CARD_FACE_STYLE,
    color: suitColor,
    padding: `${w * 0.1}px`,
  };

  if (onClick) {
    return (
      <button
        data-nj-skin="none"
        type="button"
        onClick={onClick}
        className={className}
        style={faceStyle}
        aria-label={`Jouer ${card.rank} de ${SUIT_LABELS[card.suit] ?? card.suit}`}
      >
        {face}
      </button>
    );
  }

  return (
    <div
      className={className}
      style={faceStyle}
    >
      {face}
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
