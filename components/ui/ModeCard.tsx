"use client";

import { T } from "@/config/theme";
import { displayFont } from "@/components/ui/Shell";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import type { CSSProperties, ReactNode } from "react";

interface ModeCardProps {
  icon: NjamboIconName;
  title: string;
  subtitle: string;
  tone: "gold" | "teal" | "pink" | "cobalt";
  badge?: ReactNode;
  onClick?: () => void;
  muted?: boolean;
  delay?: number;
}

export function ModeCard({ icon, title, subtitle, tone, badge, onClick, muted, delay = 0 }: ModeCardProps) {
  const toneColor = { gold: T.gold, teal: T.teal, pink: T.pink, cobalt: T.cobalt }[tone];
  const cardStyle = {
    "--mode-tone": toneColor,
    "--mode-delay": `${delay}s`,
  } as CSSProperties;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`mode-card mode-card-${tone}${muted ? " mode-card-muted" : ""}`}
      style={{
        ...cardStyle,
        position: "relative",
        minWidth: 0,
        minHeight: 158,
        borderRadius: 20,
        border: `1px solid ${toneColor}55`,
        cursor: "pointer",
        color: T.text,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        padding: 16,
        opacity: muted ? 0.74 : 1,
        overflow: "hidden",
        animation: `modeCardEnter .55s ${delay}s both`,
        background: `
          radial-gradient(circle at 18% 16%, ${toneColor}38, transparent 34%),
          linear-gradient(145deg, rgba(255,248,232,.09), rgba(255,248,232,.025)),
          rgba(5,5,12,.28)`,
      }}
    >
      <span
        className="mode-card-weave"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "repeating-linear-gradient(45deg, transparent 0 14px, rgba(255,255,255,.055) 14px 16px, transparent 16px 30px)",
          opacity: 0.7,
        }}
      />
      <span className="mode-card-shine" aria-hidden="true" />
      <span className="mode-card-rhythm" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="mode-card-top">
        <span
          className="mode-card-icon"
          style={{
            width: 54,
            height: 54,
            borderRadius: 18,
            display: "grid",
            placeItems: "center",
            color: toneColor,
            background: "rgba(5,5,12,.35)",
            border: "1px solid rgba(255,248,232,.12)",
          }}
        >
          <NjamboIcon name={icon} tone={tone} size={34} />
        </span>
        {badge}
      </span>
      <span className="mode-card-copy">
        <span
          className="mode-card-title"
          style={{
            ...displayFont,
            display: "block",
            fontWeight: 900,
            fontSize: "clamp(19px, 4vw, 24px)",
            lineHeight: 1,
          }}
        >
          {title}
        </span>
        <span className="mode-card-subtitle" style={{ display: "block", marginTop: 6, color: "rgba(255,244,223,.68)", fontSize: 12, lineHeight: 1.35 }}>
          {subtitle}
        </span>
      </span>
    </button>
  );
}

export function SoonBadge() {
  return (
    <span className="chip chip-strong badge-soon" style={{ minHeight: 24, fontSize: 10, letterSpacing: ".08em" }}>
      BIENTÔT
    </span>
  );
}
