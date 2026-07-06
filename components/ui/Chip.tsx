"use client";

import type { CSSProperties, ReactNode } from "react";

interface ChipProps {
  children: ReactNode;
  strong?: boolean;
  tone?: "gold" | "teal" | "pink" | "muted";
  style?: CSSProperties;
}

export function Chip({ children, strong, tone = "muted", style }: ChipProps) {
  const toneClass = strong ? "chip-strong" : tone === "teal" ? "chip-teal" : tone === "pink" ? "chip-pink" : "";

  return (
    <span className={`chip ${toneClass}`} style={style}>
      {children}
    </span>
  );
}
