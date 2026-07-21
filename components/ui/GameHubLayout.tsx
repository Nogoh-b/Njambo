"use client";

import { useId, type ReactNode } from "react";
import type { BottomNavKey } from "@/components/ui/BottomNav";
import { GameShell } from "@/components/ui/GameShell";
import type { GameTone } from "@/components/ui/GamePrimitives";
import styles from "./GameHubLayout.module.css";

export type GameHubTone = GameTone | "home" | "play" | "events" | "shop" | "wallet" | "social";

export interface GameHubLayoutProps {
  tone?: GameHubTone;
  kicker?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  active?: BottomNavKey;
  headerAction?: ReactNode;
  secondaryRail?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

const TONE_CLASS: Record<GameHubTone, string> = {
  gold: styles.toneGold,
  teal: styles.toneTeal,
  pink: styles.tonePink,
  cobalt: styles.toneCobalt,
  home: styles.toneGold,
  play: styles.toneTeal,
  events: styles.tonePink,
  shop: styles.toneCobalt,
  wallet: styles.toneGold,
  social: styles.tonePink,
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Cadre commun des hubs de premier niveau. La navigation principale tient lieu
 * de retour : aucun bouton Accueil redondant n'est rendu dans l'en-tête.
 */
export function GameHubLayout({
  tone = "gold",
  kicker,
  title,
  subtitle,
  active,
  headerAction,
  secondaryRail,
  children,
  className,
  contentClassName,
}: GameHubLayoutProps) {
  const titleId = `game-hub-${useId().replaceAll(":", "")}`;

  return (
    <GameShell
      active={active}
      className={cx(styles.scene, TONE_CLASS[tone], className)}
      contentClassName={cx(styles.scroll, contentClassName)}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          {kicker !== undefined && (
            <div className={styles.kicker}>
              <span aria-hidden="true" />
              <span>{kicker}</span>
            </div>
          )}
          <h1 id={titleId}>{title}</h1>
          {subtitle !== undefined && <p>{subtitle}</p>}
        </div>
        {headerAction !== undefined && <div className={styles.headerAction}>{headerAction}</div>}
      </header>
      <div className={cx(styles.body, secondaryRail !== undefined && styles.hasSecondary)}>
        <div className={styles.content} role="region" aria-labelledby={titleId}>
          {children}
        </div>
        {secondaryRail !== undefined && <aside className={styles.secondaryRail}>{secondaryRail}</aside>}
      </div>
    </GameShell>
  );
}
