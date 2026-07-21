"use client";

import { useId, type ReactNode } from "react";
import type { BottomNavKey } from "@/components/ui/BottomNav";
import { NjamboFriendlyIcon, type NjamboFriendlyIconName } from "@/components/ui/Art";
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
  shop: styles.toneGold,
  wallet: styles.toneGold,
  social: styles.tonePalm,
};

const TONE_ICON: Record<GameHubTone, NjamboFriendlyIconName> = {
  gold: "home",
  teal: "play",
  pink: "events",
  cobalt: "shop",
  home: "home",
  play: "play",
  events: "events",
  shop: "shop",
  wallet: "shop",
  social: "social",
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
      className={cx(styles.scene, "nj-mboa-solar-hub", TONE_CLASS[tone], className)}
      contentClassName={cx(styles.scroll, contentClassName)}
    >
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <span className={styles.headerMedallion} aria-hidden="true">
            <NjamboFriendlyIcon name={TONE_ICON[tone]} size={36} />
          </span>
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
