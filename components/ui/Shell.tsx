"use client";

import type { CSSProperties, ReactNode } from "react";
import { T } from "@/config/theme";
import { Btn } from "@/components/ui/Btn";
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
  backLabel = "Menu",
}: ScreenHeaderProps) {
  return (
    <div className="nj-topbar">
      <div className="nj-title-row">
        <span className="nj-title-icon">
          <NjamboIcon name={icon} tone={tone} size={30} />
        </span>
        <span style={{ minWidth: 0 }}>
          {kicker && <span className="nj-kicker">{kicker}</span>}
          <span className="nj-heading" style={{ display: "block", color: tone === "gold" ? T.text : undefined }}>
            {title}
          </span>
        </span>
        {badge}
      </div>
      {onBack && (
        <Btn variant="ghost" onClick={onBack} style={{ flex: "0 0 auto" }}>
          ← {backLabel}
        </Btn>
      )}
    </div>
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
