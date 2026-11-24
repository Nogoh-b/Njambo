"use client";

import { useId, type ReactNode } from "react";
import Image from "@/components/ui/GameImage";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import { GameShell } from "@/components/ui/GameShell";
import type { GameTone } from "@/components/ui/GamePrimitives";
import { HubReveal } from "@/components/ui/HubReveal";
import styles from "./PreGameLayout.module.css";

export type PreGameTone = GameTone;

interface PreGameLayoutProps {
  title: ReactNode;
  kicker?: ReactNode;
  subtitle?: ReactNode;
  icon: NjamboIconName;
  tone?: PreGameTone;
  onBack: () => void;
  backLabel?: string;
  backAriaLabel?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  headerArt?: string;
  pageClassName?: string;
  /** Par défaut true : verrouille l'écran dans 100dvh sans scroll global. */
  fit?: boolean;
}

interface PreGameWorkspaceProps {
  children: ReactNode;
  rail?: ReactNode;
  railLabel?: string;
  className?: string;
  primaryClassName?: string;
  railClassName?: string;
  railFirst?: boolean;
}

interface PreGameFooterProps {
  children: ReactNode;
  status?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

const TONE_CLASS: Record<PreGameTone, string> = {
  gold: styles.toneGold,
  teal: styles.toneTeal,
  pink: styles.tonePink,
  cobalt: styles.toneCobalt,
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Cadre Salon Royal Vibrant des écrans de pré-partie (IA, En ligne, Amis, Lobby).
 * Zéro dock bas, zéro scroll global : en-tête HUD compact, workspace borné
 * (où seules les listes défilent) et barre CTA 3D fixée en bas.
 */
export function PreGameLayout({
  title,
  kicker,
  subtitle,
  icon,
  tone = "gold",
  onBack,
  backLabel = "Menu",
  backAriaLabel,
  children,
  className,
  contentClassName,
  headerArt,
  pageClassName,
  fit = true,
}: PreGameLayoutProps) {
  const titleId = `pre-game-${useId().replaceAll(":", "")}`;
  const displayBackLabel = backLabel === "Menu" ? "Salon" : backLabel;

  return (
    <GameShell
      active="play"
      dock={false}
      scroll={!fit}
      className={cx(styles.scene, TONE_CLASS[tone], className)}
      contentClassName={styles.shellScroll}
    >
      <div className={cx(styles.page, fit && styles.fitPage, pageClassName)}>
        <HubReveal className={styles.headerReveal} duration="navigation">
          <header className={styles.header}>
            {headerArt !== undefined && (
              <Image
                className={styles.headerArt}
                src={headerArt}
                alt=""
                fill
                sizes="100vw"
                priority
              />
            )}
            <button
              data-nj-skin="none"
              type="button"
              className={styles.backButton}
              onClick={onBack}
              aria-label={backAriaLabel ?? `Retour à ${backLabel}`}
            >
              <span aria-hidden="true">←</span>
              <span className={styles.backLabel}>{displayBackLabel}</span>
            </button>

            <div className={styles.identity}>
              <span className={styles.icon} aria-hidden="true">
                <NjamboIcon name={icon} tone={tone} size={23} />
              </span>
              <div className={styles.heading}>
                {kicker !== undefined && <div className={styles.kicker}>{kicker}</div>}
                <h1 id={titleId}>{title}</h1>
                {subtitle !== undefined && <p>{subtitle}</p>}
              </div>
            </div>
          </header>
        </HubReveal>

        <HubReveal className={styles.contentReveal} order={1} duration="panel">
          <div
            className={cx(styles.content, contentClassName)}
            role="region"
            aria-labelledby={titleId}
          >
            {children}
          </div>
        </HubReveal>
      </div>
    </GameShell>
  );
}

/** Zone responsive bornée : contenu + rail sans scroll global. */
export function PreGameWorkspace({
  children,
  rail,
  railLabel = "Configuration de la partie",
  className,
  primaryClassName,
  railClassName,
  railFirst = false,
}: PreGameWorkspaceProps) {
  const primaryNode = <div className={cx(styles.primary, primaryClassName)}>{children}</div>;
  const railNode = rail !== undefined ? (
    <aside className={cx(styles.rail, railClassName)} aria-label={railLabel}>
      {rail}
    </aside>
  ) : null;

  return (
    <div
      className={cx(
        styles.workspace,
        rail !== undefined && styles.hasRail,
        className,
      )}
    >
      {railFirst
        ? <>{railNode}{primaryNode}</>
        : <>{primaryNode}{railNode}</>}
    </div>
  );
}

/** Barre d'actions 3D fixée en bas de l'écran de pré-partie. */
export function PreGameFooter({
  children,
  status,
  ariaLabel = "Actions de préparation",
  className,
}: PreGameFooterProps) {
  return (
    <footer className={cx(styles.footer, className)} aria-label={ariaLabel}>
      {status !== undefined && <div className={styles.footerStatus}>{status}</div>}
      <div className={styles.footerActions}>{children}</div>
    </footer>
  );
}
