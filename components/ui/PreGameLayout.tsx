"use client";

import { useId, type ReactNode } from "react";
import Image from "next/image";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import { Btn } from "./Btn";
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
  /**
   * Illustration de fond du bandeau de titre (typiquement l'art du mode dont
   * on prépare une partie). Posée très en retrait derrière les dégradés
   * existants : elle donne son image à l'écran sans coûter un pixel de hauteur.
   */
  headerArt?: string;
  /** Classe additionnelle sur `.page` — porte les jetons de l'écran. */
  pageClassName?: string;
  /**
   * Contraint la page à la hauteur du viewport : la chaîne devient
   * rétractable et c'est à l'écran de désigner son absorbeur. Sans ce
   * drapeau, la page grandit et déborde en défilement (comportement
   * historique, conservé pour les autres écrans).
   */
  fit?: boolean;
}

interface PreGameWorkspaceProps {
  children: ReactNode;
  rail?: ReactNode;
  railLabel?: string;
  className?: string;
  primaryClassName?: string;
  railClassName?: string;
  /**
   * Place le rail avant le contenu dans le DOM. Sur mobile, la configuration
   * doit se lire avant la liste qu'elle filtre ; on déplace donc l'ordre
   * source plutôt que d'utiliser `order`, qui désynchroniserait la tabulation
   * de la lecture entre deux blocs tous deux interactifs (WCAG 2.4.3).
   */
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
  headerArt,
  pageClassName,
  fit = false,
}: PreGameLayoutProps) {
  const titleId = `pre-game-${useId().replaceAll(":", "")}`;

  return (
    /* Pas de dock : ces écrans sont des sous-menus ouverts depuis « Jouer »
       et portent déjà leur bouton de retour. Le garder ferait doublon et
       réserverait 64 px sur des mises en page déjà contraintes. */
    <GameShell
      active="play"
      dock={false}
      className={cx(styles.scene, "nj-mboa-solar-hub", TONE_CLASS[tone], className)}
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
            <Btn
              tone={tone}
              fill="outline"
              motif="indigo-dots"
              motifSides="both"
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
