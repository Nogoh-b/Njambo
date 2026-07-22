"use client";

import type { CSSProperties, FocusEventHandler, PointerEventHandler, ReactNode } from "react";

/** Ancienne API (skins raster 9-slice). Conservée pour rétro-compatibilité. */
export type BtnVariant = "gold" | "teal" | "pink" | "ghost" | "dark";

/** Nouveau système partagé, piloté par props. */
export type BtnTone = "gold" | "teal" | "pink" | "cobalt" | "blue" | "orange";
export type BtnFill = "solid" | "soft" | "outline" | "pattern";
export type BtnSize = "sm" | "md" | "lg";
export type BtnMotif = "indigo-dots" | "sun-stripes" | "royal-bands";
export type BtnMotifSides = "left" | "right" | "both";

interface BtnProps {
  children?: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  /** Ancienne API skin raster (gold/teal/pink/ghost/dark). Ignorée si `tone`/`fill`/`size` sont fournis. */
  variant?: BtnVariant;
  /** Nouveau système : couleur partagée. */
  tone?: BtnTone;
  /** Nouveau système : style de remplissage. */
  fill?: BtnFill;
  /** Nouveau système : taille. */
  size?: BtnSize;
  /** Motif textile inspiré des références africaines du projet. */
  motif?: BtnMotif;
  /** Côté portant le motif. Sans `motif`, le bouton reste uni. */
  motifSides?: BtnMotifSides;
  disabled?: boolean;
  style?: CSSProperties;
  className?: string;
  icon?: ReactNode;
  ariaLabel?: string;
  ariaPressed?: boolean;
  ariaBusy?: boolean;
  onPointerEnter?: PointerEventHandler<HTMLButtonElement>;
  onFocus?: FocusEventHandler<HTMLButtonElement>;
}

export function Btn({
  children,
  onClick,
  type = "button",
  variant = "gold",
  tone,
  fill,
  size,
  motif,
  motifSides = "both",
  disabled,
  style,
  className,
  icon,
  ariaLabel,
  ariaPressed,
  ariaBusy,
  onPointerEnter,
  onFocus,
}: BtnProps) {
  const iconOnly = !!icon && !children;

  // Dès qu'une prop du nouveau système est fournie, on bascule sur la famille .njb
  // (un seul composant, le style change entièrement via les paramètres).
  const useShared = tone !== undefined || fill !== undefined || size !== undefined || motif !== undefined;

  if (useShared) {
    const resolvedTone: BtnTone = tone ?? "gold";
    const resolvedFill: BtnFill = fill ?? "solid";
    const resolvedSize: BtnSize = size ?? "md";
    const classes = [
      "njb",
      `njb--${resolvedTone}`,
      `njb--${resolvedFill}`,
      `njb--${resolvedSize}`,
      motif ? `njb--motif-${motif}` : "",
      motif ? `njb--motif-${motifSides}` : "",
      iconOnly ? "njb--icon" : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        type={type}
        data-nj-skin="none"
        onClick={onClick}
        onPointerEnter={onPointerEnter}
        onFocus={onFocus}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-pressed={ariaPressed}
        aria-busy={ariaBusy}
        className={classes}
        style={style}
      >
        {motif && <span className="njb__motif" aria-hidden="true" />}
        <span className="njb__content">
          {icon}
          {children}
        </span>
      </button>
    );
  }

  return (
    <button
      type={type}
      data-nj-skin={iconOnly ? "icon" : variant}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onFocus={onFocus}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      aria-busy={ariaBusy}
      className={`btn btn-${variant}${iconOnly ? " btn-icon-only" : ""}${className ? ` ${className}` : ""}`}
      style={style}
    >
      {icon}
      {children}
    </button>
  );
}
