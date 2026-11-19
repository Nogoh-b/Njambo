"use client";

import {
  forwardRef,
  type ReactNode,
  type Ref,
} from "react";
import type { MotionProfileMode } from "@/lib/motion";
import styles from "./ResultLayout.module.css";

interface ResultLayoutProps {
  titleId: string;
  descriptionId?: string;
  motionMode: MotionProfileMode;
  reducedMotion?: boolean;
  scriptedMotion?: boolean;
  decoration?: ReactNode;
  main: ReactNode;
  rail?: ReactNode;
  panelRef?: Ref<HTMLElement>;
  /** Pilote l'ambiance (halo, teintes) : dorée en victoire, émeraude nocturne en défaite. */
  outcome?: "win" | "loss";
}

interface ResultActionsProps {
  children: ReactNode;
  status?: ReactNode;
}

/**
 * Shell Salon Royal commun à toutes les fins de manche (Solo IA, En ligne,
 * Entre amis, Événements). Strictement verrouillé sur 100dvh sans défilement
 * externe, avec cadre acajou-émeraude et laiton gravé.
 */
export const ResultLayout = forwardRef<HTMLDivElement, ResultLayoutProps>(function ResultLayout(
  {
    titleId,
    descriptionId,
    motionMode,
    reducedMotion = false,
    scriptedMotion = false,
    decoration,
    main,
    rail,
    panelRef,
    outcome,
  },
  ref,
) {
  return (
    <div
      ref={ref}
      className={styles.root}
      data-motion-level={motionMode}
      data-reduced-motion={reducedMotion || undefined}
      data-outcome={outcome}
    >
      {decoration}
      <section
        ref={panelRef}
        className={`${styles.panel} nj-result-panel`}
        data-has-rail={Boolean(rail)}
        data-scripted-motion={scriptedMotion || undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        {/* Rivets laiton discrets aux quatre coins (signature Salon Royal) */}
        <span className={`${styles.rivet} ${styles.rivetTl}`} aria-hidden="true" />
        <span className={`${styles.rivet} ${styles.rivetTr}`} aria-hidden="true" />
        <span className={`${styles.rivet} ${styles.rivetBl}`} aria-hidden="true" />
        <span className={`${styles.rivet} ${styles.rivetBr}`} aria-hidden="true" />

        <div className={styles.workspace}>
          <div className={styles.main}>{main}</div>
          {rail && (
            <aside className={styles.rail} aria-label="Joueurs rencontrés">
              {rail}
            </aside>
          )}
        </div>
      </section>
    </div>
  );
});

export function ResultActions({ children, status }: ResultActionsProps) {
  return (
    <footer className={styles.actions} aria-label="Actions de fin de manche">
      <div className={styles.actionButtons}>{children}</div>
      {status && (
        <p className={styles.actionStatus} role="status" aria-live="polite" aria-atomic="true">
          {status}
        </p>
      )}
    </footer>
  );
}
