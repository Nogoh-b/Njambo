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
}

interface ResultActionsProps {
  children: ReactNode;
  status?: ReactNode;
}

/**
 * Shell commun des fins de manche. Il porte le dialogue, les safe areas et le
 * passage une colonne -> contenu + rail, tandis que ResultScreen garde les
 * décisions de partie et les callbacks existants.
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
  },
  ref,
) {
  return (
    <div
      ref={ref}
      className={styles.root}
      data-motion-level={motionMode}
      data-reduced-motion={reducedMotion || undefined}
    >
      {decoration}
      <section
        ref={panelRef}
        className={`${styles.panel} nj-surface nj-result-panel`}
        data-has-rail={Boolean(rail)}
        data-scripted-motion={scriptedMotion || undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
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
