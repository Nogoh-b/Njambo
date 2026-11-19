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
export type TableSeatEdge = "bottom" | "top" | "left" | "right";

interface TableLayoutProps {
  children: ReactNode;
  activeFx?: boolean;
  paused?: boolean;
  motionMode: MotionProfileMode;
  screenEffect?: TableScreenEffect;
  turnEdge?: TableSeatEdge | null;
  finalTrick?: boolean;
  className?: string;
}

interface TableSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  inset: string;
  ceremony?: boolean;
  finalTrick?: boolean;
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
  bottomOffset?: number;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Cadre visuel « Salon Royal Épuré » de la table de jeu.
 * Toute la logique, les règles et la synchronisation restent dans TableScreen.
 */
export const TableLayout = forwardRef<HTMLDivElement, TableLayoutProps>(function TableLayout(
  {
    children,
    activeFx = false,
    paused = false,
    motionMode,
    screenEffect = null,
    turnEdge = null,
    finalTrick = false,
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
        finalTrick && styles.finalTrickScene,
        className,
      )}
      aria-label="Table de jeu"
      aria-hidden={paused || undefined}
      inert={paused || undefined}
      data-motion-level={motionMode}
      data-screen-effect={screenEffect ?? undefined}
      data-turn-edge={turnEdge ?? undefined}
    >
      {/* Filigrane discret des 4 enseignes dans les angles de la salle */}
      <div className={styles.roomWatermarks} aria-hidden="true">
        <span className={styles.wmTL}>♠</span>
        <span className={styles.wmTR}>♥</span>
        <span className={styles.wmBL}>♦</span>
        <span className={styles.wmBR}>♣</span>
      </div>

      {/* Projecteur de tour doré qui bascule vers le joueur actif */}
      <div
        className={cx(
          styles.turnSpotlight,
          turnEdge && styles[`spot_${turnEdge}`],
        )}
        aria-hidden="true"
      />

      {children}
    </main>
  );
});

export function TableSurface({
  inset,
  ceremony = false,
  finalTrick = false,
  className,
  style,
  children,
  ...props
}: TableSurfaceProps) {
  return (
    <div
      {...props}
      className={cx(
        styles.surface,
        ceremony && "nj-table-image-ceremony",
        finalTrick && styles.surfaceFinal,
        className,
      )}
      style={{ ...style, inset }}
      aria-hidden="true"
    >
      {/* Filet laiton + 4 rivets sur le rebord en acajou */}
      <span className={styles.railBevel} />
      <span className={cx(styles.rivet, styles.rivetTL)} />
      <span className={cx(styles.rivet, styles.rivetTR)} />
      <span className={cx(styles.rivet, styles.rivetBL)} />
      <span className={cx(styles.rivet, styles.rivetBR)} />

      {/* Feutre émeraude profond + couture or + reflet doux */}
      <div className={styles.feltBed}>
        <span className={styles.feltStitch} />
        <span className={styles.feltSheen} />
        {children}
      </div>
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
      data-nj-skin="none"
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

export function TablePowerTray({
  children,
  ariaLabel = "Cartes pouvoir",
  bottomOffset,
}: TablePowerTrayProps) {
  return (
    <div
      className={styles.powerTray}
      role="group"
      aria-label={ariaLabel}
      style={
        bottomOffset !== undefined
          ? ({ "--nj-power-tray-bottom": `${bottomOffset}px` } as CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  );
}
