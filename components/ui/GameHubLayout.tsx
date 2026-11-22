"use client";

import { useId, type ReactNode } from "react";
import type { BottomNavKey } from "@/components/ui/BottomNav";
import { NjamboIcon, type NjamboIconName, type NjamboIconTone } from "@/components/ui/Art";
import { GameShell } from "@/components/ui/GameShell";
import type { GameTone } from "@/components/ui/GamePrimitives";
import { useGame } from "@/contexts/GameContext";
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
  /** Retour personnalisé (par défaut : retour au Salon d'accueil). */
  onBack?: () => void;
  backLabel?: string;
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

const TONE_ICON: Record<GameHubTone, { icon: NjamboIconName; tone: NjamboIconTone }> = {
  gold: { icon: "coin", tone: "gold" },
  teal: { icon: "play", tone: "teal" },
  pink: { icon: "trophy", tone: "pink" },
  cobalt: { icon: "sparkle", tone: "cobalt" },
  home: { icon: "home", tone: "gold" },
  play: { icon: "cards", tone: "teal" },
  events: { icon: "trophy", tone: "pink" },
  shop: { icon: "coin", tone: "gold" },
  wallet: { icon: "coin", tone: "gold" },
  social: { icon: "users", tone: "palm" },
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Cadre commun Salon Royal Vibrant des hubs (Boutique, Événements, Social, Portefeuille).
 * Verrouillé à 100dvh, sans barre de navigation basse : un bouton 3D « ← Salon »
 * ancre le retour dans le HUD compact, et seules les listes internes défilent.
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
  onBack,
  backLabel = "Salon",
}: GameHubLayoutProps) {
  const titleId = `game-hub-${useId().replaceAll(":", "")}`;
  const { goBack, backLabelFor } = useGame();
  const emblem = TONE_ICON[tone];
  const resolvedBackLabel = onBack ? backLabel : backLabelFor("menu");

  return (
    <GameShell
      active={active}
      dock={false}
      scroll={false}
      className={cx(styles.scene, TONE_CLASS[tone], className)}
      contentClassName={cx(styles.frame, contentClassName)}
    >
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            data-nj-skin="none"
            type="button"
            className={styles.backBtn}
            onClick={onBack ?? (() => goBack("menu"))}
            aria-label={`Retour à ${resolvedBackLabel}`}
          >
            <span aria-hidden="true">←</span>
            <span className={styles.backLabel}>{resolvedBackLabel}</span>
          </button>

          <span className={styles.headerMedallion} aria-hidden="true">
            <NjamboIcon name={emblem.icon} tone={emblem.tone} size={23} />
          </span>

          <div className={styles.heading}>
            {kicker !== undefined && <span className={styles.kicker}>{kicker}</span>}
            <h1 id={titleId}>{title}</h1>
            {subtitle !== undefined && <p className={styles.subtitle}>{subtitle}</p>}
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
