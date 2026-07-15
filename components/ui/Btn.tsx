"use client";

import type { CSSProperties, ReactNode } from "react";

export type BtnVariant = "gold" | "teal" | "pink" | "ghost" | "dark";

interface BtnProps {
  children?: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  style?: CSSProperties;
  className?: string;
  icon?: ReactNode;
  ariaLabel?: string;
  ariaPressed?: boolean;
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
  ariaPressed,
}: BtnProps) {
  const iconOnly = !!icon && !children;

  return (
    <button
      type="button"
      data-nj-skin={iconOnly ? "icon" : variant}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={`btn btn-${variant}${iconOnly ? " btn-icon-only" : ""}${className ? ` ${className}` : ""}`}
      style={style}
    >
      {icon}
      {children}
    </button>
  );
}
