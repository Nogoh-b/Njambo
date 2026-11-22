"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useMotionProfile } from "@/lib/motion";
import { registerModalBackHandler } from "@/lib/navigation";
import styles from "./GameModal.module.css";

export type GameModalTone = "gold" | "teal" | "pink" | "palm";
export type GameModalSize = "sm" | "md" | "lg";

const openModalStack: string[] = [];
const stackListeners = new Set<() => void>();

function emitStack() {
  stackListeners.forEach((listener) => listener());
}

function subscribeStack(listener: () => void) {
  stackListeners.add(listener);
  return () => {
    stackListeners.delete(listener);
  };
}

function pushModal(id: string) {
  if (!openModalStack.includes(id)) {
    openModalStack.push(id);
    emitStack();
  }
}

function popModal(id: string) {
  const idx = openModalStack.indexOf(id);
  if (idx !== -1) {
    openModalStack.splice(idx, 1);
    emitStack();
  }
}

interface GameModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  kicker?: ReactNode;
  tone?: GameModalTone;
  size?: GameModalSize;
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
  size = "sm",
  children,
  footer,
  className,
}: GameModalProps) {
  const titleId = `game-modal-${useId().replaceAll(":", "")}`;
  const motionProfile = useMotionProfile();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    pushModal(titleId);
    const unregisterBack = registerModalBackHandler(titleId, () => onCloseRef.current());
    return () => {
      unregisterBack();
      popModal(titleId);
    };
  }, [open, titleId]);

  const stackIndex = useSyncExternalStore(
    subscribeStack,
    () => openModalStack.indexOf(titleId),
    () => -1,
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openModalStack.length > 0 && openModalStack[openModalStack.length - 1] !== titleId) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, titleId]);

  if (typeof document === "undefined") return null;

  const animateOn = motionProfile.enabled;
  const zIndex = 300 + Math.max(0, stackIndex) * 12;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key={titleId}
          className={styles.backdrop}
          style={{ zIndex }}
          role="presentation"
          initial={animateOn ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={animateOn ? { opacity: 0 } : undefined}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`${styles.dialog} ${styles[`tone_${tone}`]} ${styles[`size_${size}`]}${className ? ` ${className}` : ""}`}
            initial={animateOn ? { opacity: 0, y: 22, scale: 0.91 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={animateOn ? { opacity: 0, y: 12, scale: 0.95 } : undefined}
            transition={
              animateOn
                ? { type: "spring", stiffness: 360, damping: 27, mass: 0.85 }
                : { duration: 0 }
            }
          >
            <div className={styles.innerFrame} aria-hidden="true" />
            {animateOn && <span className={styles.openSheen} aria-hidden="true" />}
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
