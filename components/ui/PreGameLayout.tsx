"use client";

import { useId, type ReactNode } from "react";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import { Btn, type BtnMotif } from "./Btn";
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
}

interface PreGameWorkspaceProps {
  children: ReactNode;
  rail?: ReactNode;
  railLabel?: string;
  className?: string;
  primaryClassName?: string;
  railClassName?: string;
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

const MOTIF_BY_TONE: Record<PreGameTone, BtnMotif> = {
  gold: "sun-stripes",
  teal: "indigo-dots",
  pink: "royal-bands",
  cobalt: "indigo-dots",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Cadre commun des étapes qui précèdent une partie. Il ne connaît ni mise,
 * ni salle, ni matchmaking : les écrans conservent entièrement leur logique.
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
}: PreGameLayoutProps) {
  const titleId = `pre-game-${useId().replaceAll(":", "")}`;

  return (
    <GameShell
      active="play"
      className={cx(styles.scene, "nj-mboa-solar-hub", TONE_CLASS[tone], className)}
      contentClassName={styles.shellScroll}
    >
      <div className={styles.page}>
        <HubReveal className={styles.headerReveal} duration="navigation">
          <header className={styles.header}>
            <Btn
              tone={tone}
              fill="outline"
              motif={MOTIF_BY_TONE[tone]}
              motifPlacement="inset"
              className={styles.backButton}
              onClick={onBack}
              ariaLabel={backAriaLabel ?? `Retour à ${backLabel}`}
            >
              <span aria-hidden="true">←</span>
              <span className={styles.backLabel}>{backLabel}</span>
            </Btn>

            <div className={styles.identity}>
              <span className={styles.icon} aria-hidden="true">
                <NjamboIcon name={icon} tone={tone} size={31} />
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

/** Zone responsive : une colonne jusqu'au desktop, puis contenu + rail. */
export function PreGameWorkspace({
  children,
  rail,
  railLabel = "Configuration de la partie",
  className,
  primaryClassName,
  railClassName,
}: PreGameWorkspaceProps) {
  return (
    <div
      className={cx(
        styles.workspace,
        rail !== undefined && styles.hasRail,
        className,
      )}
    >
      <div className={cx(styles.primary, primaryClassName)}>{children}</div>
      {rail !== undefined && (
        <aside className={cx(styles.rail, railClassName)} aria-label={railLabel}>
          {rail}
        </aside>
      )}
    </div>
  );
}

/** Barre d'actions commune, en flux puis collante au bas de la zone de contenu. */
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
