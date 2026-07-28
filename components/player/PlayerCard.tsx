"use client";

import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { AvatarIllustration } from "@/components/ui/Art";
import type { PlayerLevelProgress } from "@/lib/playerLevel";
import type { ResolvedRank } from "@/lib/playerRank";
import type { PlayerCardData } from "./playerCardData";
import styles from "./PlayerCard.module.css";

export type PlayerCardVariant = "row" | "hero" | "hud";
export type PlayerCardTone = "gold" | "teal" | "pink" | "cobalt";
export type PlayerCardDensity = "cozy" | "compact";

export interface PlayerCardProps {
  player: PlayerCardData;
  /** Géométrie, pas domaine : `row` pour les listes, `hero` pour les profils, `hud` pour l'accueil. */
  variant?: PlayerCardVariant;
  tone?: PlayerCardTone;
  active?: boolean;
  density?: PlayerCardDensity;

  as?: "div" | "button";
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  ariaPressed?: boolean;

  /** Remplace le libellé de présence par défaut. */
  subtitle?: ReactNode;
  /** Force l'affichage de la pastille de présence (par défaut : selon `player.online`). */
  showStatus?: boolean;
  /** Avant l'avatar : numéro de classement, coche de sélection… */
  lead?: ReactNode;
  /** Sous le nom : <Chip>, « HÔTE », « Toi »… */
  badges?: ReactNode;
  /** À droite, contenu court : couronnes, icône, pastille « prêt ». */
  meta?: ReactNode;
  /** À droite, actions : <SocialActions>, Accepter/Refuser… */
  actions?: ReactNode;
  /** Contenu libre sous l'identité (barre XP, édition du pseudo…). */
  children?: ReactNode;

  /**
   * Décorations calculées en amont. Elles sont PASSÉES et non dérivées ici :
   * sinon le composant devrait consommer useEconomy, soit un abonnement par
   * ligne de liste.
   */
  level?: PlayerLevelProgress | null;
  rank?: ResolvedRank | null;

  className?: string;
  style?: CSSProperties;
}

const VARIANT_CLASS: Record<PlayerCardVariant, string> = {
  row: styles.row,
  hero: styles.hero,
  hud: styles.hud,
};

export function PlayerCard({
  player,
  variant = "row",
  tone,
  active = false,
  density = "cozy",
  as = "div",
  onClick,
  disabled,
  ariaLabel,
  ariaPressed,
  subtitle,
  showStatus,
  lead,
  badges,
  meta,
  actions,
  children,
  level,
  rank,
  className,
  style,
}: PlayerCardProps) {
  const withStatus = showStatus ?? player.online !== undefined;
  const hasTrailing = !!meta || !!actions;

  const classes = [
    "nj-list-card",
    tone ? `nj-list-card--${tone}` : "",
    active ? "is-active" : "",
    styles.card,
    VARIANT_CLASS[variant],
    density === "compact" ? styles.compact : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      {lead && <span className={styles.lead}>{lead}</span>}

      <span className={styles.avatar}>
        <AvatarIllustration
          seed={player.emoji}
          fluid
          active={variant === "hero"}
          online={withStatus ? !!player.online : undefined}
        />
        {level && variant === "hud" && <span className={styles.levelMedal}>{level.level}</span>}
        {rank && variant === "hud" && (
          <span className={styles.rankMark}>
            <Image src={rank.assetSrc} alt="" width={27} height={27} />
          </span>
        )}
      </span>

      <span className={styles.identity}>
        <span className={styles.name} title={variant === "hero" ? undefined : player.name}>
          {player.name}
        </span>
        {subtitle !== undefined
          ? subtitle && <span className={styles.subtitle}>{subtitle}</span>
          : withStatus && (
              <span className={styles.subtitle}>{player.online ? "En ligne" : "Hors ligne"}</span>
            )}
        {rank && variant !== "hud" && <span className={styles.rankLine}>{rank.label}</span>}
        {badges && <span className={styles.badges}>{badges}</span>}
        {children}
      </span>

      {hasTrailing && (
        <span className={styles.trailing}>
          {meta && <span className={styles.meta}>{meta}</span>}
          {actions && <span className={styles.actions}>{actions}</span>}
        </span>
      )}
    </>
  );

  if (as === "button") {
    return (
      <button
        type="button"
        data-nj-playercard=""
        data-nj-skin="none"
        className={classes}
        style={style}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-pressed={ariaPressed}
      >
        {body}
      </button>
    );
  }

  return (
    <div data-nj-playercard="" className={classes} style={style}>
      {body}
    </div>
  );
}
