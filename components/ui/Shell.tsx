"use client";

import type { CSSProperties, ReactNode } from "react";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";

export const shellBg: CSSProperties = {
  minHeight: "100svh",
};

export const displayFont: CSSProperties = {
  fontFamily: "var(--font-display), serif",
};

interface ShellProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export function Shell({ children, style, className }: ShellProps) {
  return (
    <main className={`nj-shell${className ? ` ${className}` : ""}`} style={style}>
      {children}
    </main>
  );
}

interface ScreenHeaderProps {
  title: string;
  kicker?: string;
  icon?: NjamboIconName;
  tone?: "gold" | "teal" | "pink" | "cobalt" | "light";
  badge?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}

export function ScreenHeader({
  title,
  kicker,
  icon = "cards",
  tone = "gold",
  badge,
  onBack,
  backLabel = "Salon",
}: ScreenHeaderProps) {
  const resolvedBackLabel = backLabel === "Menu" ? "Salon" : backLabel;

  return (
    <header className="nj-topbar">
      {onBack && (
        <button
          data-nj-skin="none"
          type="button"
          className="nj-sr-back"
          onClick={onBack}
          aria-label={`Retour à ${resolvedBackLabel}`}
        >
          <span aria-hidden="true">←</span>
          <span>{resolvedBackLabel}</span>
        </button>
      )}
      <div className="nj-title-row">
        <span className="nj-title-icon">
          <NjamboIcon name={icon} tone={tone} size={24} />
        </span>
        <span style={{ minWidth: 0, display: "grid", gap: 1 }}>
          {kicker && <span className="nj-kicker">{kicker}</span>}
          <span className="nj-heading" style={{ display: "block" }}>
            {title}
          </span>
        </span>
      </div>
      {badge && <div style={{ flex: "0 0 auto" }}>{badge}</div>}
    </header>
  );
}

interface SurfaceProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  /** If true, this surface can scroll internally when content overflows */
  scrollable?: boolean;
}

export function Surface({ children, style, className, scrollable }: SurfaceProps) {
  return (
    <section
      className={`nj-surface nj-panel-pad${scrollable ? " nj-surface-scroll" : ""}${className ? ` ${className}` : ""}`}
      style={style}
    >
      {children}
    </section>
  );
}
