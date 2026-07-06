"use client";

import type { CSSProperties, ReactNode } from "react";

export type BtnVariant = "gold" | "pink" | "ghost" | "dark";

interface BtnProps {
  children?: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  style?: CSSProperties;
  className?: string;
  icon?: ReactNode;
  ariaLabel?: string;
}

export function Btn({
  children,
  onClick,
  variant = "gold",
  disabled,
  style,
  className,
  icon,
  ariaLabel,
}: BtnProps) {
  const iconOnly = !!icon && !children;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`btn btn-${variant}${iconOnly ? " btn-icon-only" : ""}${className ? ` ${className}` : ""}`}
      style={style}
    >
      {icon}
      {children}
    </button>
  );
}
