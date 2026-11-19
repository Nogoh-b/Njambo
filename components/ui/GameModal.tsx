"use client";

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMotionProfile } from "@/lib/motion";
import styles from "./GameModal.module.css";

export type GameModalTone = "gold" | "teal" | "pink" | "palm";

interface GameModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  kicker?: ReactNode;
  tone?: GameModalTone;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function GameModal({
  open,
  onClose,
  title,
  kicker,
  tone = "gold",
  children,
  footer,
  className,
}: GameModalProps) {
  const titleId = `game-modal-${useId().replaceAll(":", "")}`;
  const motion = useMotionProfile();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`${styles.backdrop}${motion.enabled ? ` ${styles.animated}` : ""}`}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${styles.dialog} ${styles[`tone_${tone}`]}${className ? ` ${className}` : ""}`}
      >
        <div className={styles.innerFrame} aria-hidden="true" />
        <header className={styles.header}>
          <div className={styles.heading}>
            {kicker !== undefined && <span className={styles.kicker}>{kicker}</span>}
            <h2 id={titleId} className={styles.title}>{title}</h2>
          </div>
          <button
            data-nj-skin="none"
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Fermer"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <div className={styles.body}>{children}</div>

        {footer !== undefined && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
