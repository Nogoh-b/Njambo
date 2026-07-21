"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import type { MotionProfileMode } from "@/lib/motion";
import styles from "./TableLayout.module.css";

type TableScreenEffect = "win" | "lose" | null;

interface TableLayoutProps {
  children: ReactNode;
  activeFx?: boolean;
  paused?: boolean;
  motionMode: MotionProfileMode;
  screenEffect?: TableScreenEffect;
  className?: string;
}

interface TableSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  inset: string;
  ceremony?: boolean;
}

interface TableStatusBarProps {
  children: ReactNode;
  ariaLabel?: string;
}

interface TableStatusMessageProps {
  children: ReactNode;
  urgent?: boolean;
}

interface TableLiveRegionProps {
  message: string;
}

interface TableMenuButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  label: string;
}

interface TableTurnStatusProps {
  children: ReactNode;
  bottomOffset: number;
  motionEnabled: boolean;
}

interface TablePowerTrayProps {
  children: ReactNode;
  ariaLabel?: string;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Cadre purement visuel de la table. Les règles, le tour courant et les
 * contrats de synchronisation restent entièrement dans TableScreen.
 */
export const TableLayout = forwardRef<HTMLDivElement, TableLayoutProps>(function TableLayout(
  {
    children,
    activeFx = false,
    paused = false,
    motionMode,
    screenEffect = null,
    className,
  },
  ref,
) {
  return (
    <main
      ref={ref}
      className={cx(
        styles.root,
        activeFx && "nj-table-active-fx",
        paused && "nj-table-paused",
        className,
      )}
      aria-label="Table de jeu"
      aria-hidden={paused || undefined}
      inert={paused || undefined}
      data-motion-level={motionMode}
      data-screen-effect={screenEffect ?? undefined}
    >
      {children}
    </main>
  );
});

export function TableSurface({ inset, ceremony = false, className, style, children, ...props }: TableSurfaceProps) {
  return (
    <div
      {...props}
      className={cx(styles.surface, "nj-table-image", ceremony && "nj-table-image-ceremony", className)}
      style={{ ...style, inset }}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

export function TableStatusBar({ children, ariaLabel = "État de la manche" }: TableStatusBarProps) {
  return (
    <header className={styles.statusBar} aria-label={ariaLabel}>
      {children}
    </header>
  );
}

export function TableStatusMessage({ children, urgent = false }: TableStatusMessageProps) {
  return (
    <div
      className={styles.statusMessage}
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      aria-atomic="true"
    >
      {children}
    </div>
  );
}

/** Une seule sortie vocale pour les moments transitoires, même si les effets sont coupés. */
export function TableLiveRegion({ message }: TableLiveRegionProps) {
  return (
    <p className={styles.liveRegion} role="status" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );
}

export function TableMenuButton({ label, className, children, ...props }: TableMenuButtonProps) {
  return (
    <button
      {...props}
      data-nj-skin="icon"
      type="button"
      className={cx(styles.menuButton, className)}
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function TableTurnStatus({ children, bottomOffset, motionEnabled }: TableTurnStatusProps) {
  return (
    <div
      className={cx(styles.turnStatus, "nj-turn-prompt", motionEnabled && styles.turnStatusMotion)}
      style={{ "--nj-table-turn-offset": `${bottomOffset}px` } as CSSProperties}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {children}
    </div>
  );
}

export function TablePowerTray({ children, ariaLabel = "Cartes pouvoir" }: TablePowerTrayProps) {
  return (
    <div className={styles.powerTray} role="group" aria-label={ariaLabel}>
      {children}
    </div>
  );
}
