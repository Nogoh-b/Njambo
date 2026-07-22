"use client";

import { NjamboIcon } from "./Art";
import styles from "./NkapAmount.module.css";

interface NkapAmountProps {
  value: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const ICON_SIZE = { sm: 14, md: 17, lg: 22 } as const;

/** Montant Nkap visuel : le médaillon monnaie remplace le suffixe répété. */
export function NkapAmount({ value, size = "md", className }: NkapAmountProps) {
  const formatted = Math.round(value).toLocaleString("fr-FR");

  return (
    <span
      className={`${styles.amount} ${styles[size]}${className ? ` ${className}` : ""}`}
      aria-label={`${formatted} Nkap`}
    >
      <NjamboIcon name="coin" tone="gold" size={ICON_SIZE[size]} />
      <span className={styles.value} aria-hidden="true">{formatted}</span>
    </span>
  );
}
