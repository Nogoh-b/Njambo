"use client";

import Image from "next/image";
import { useId } from "react";
import { NjamboIcon } from "@/components/ui/Art";
import type { GameModeCatalogEntry } from "@/lib/gameModeCatalog";
import { resolveGameModeDestination } from "@/lib/gameModeCatalog";
import { useGame } from "@/contexts/GameContext";
import styles from "./PlayModeCard.module.css";

interface PlayModeCardProps {
  mode: GameModeCatalogEntry;
  guest: boolean;
  order: number;
  offset?: number;
  selected?: boolean;
  onFocusCard?: () => void;
}

export function PlayModeCard({
  mode,
  guest,
  offset = 0,
  selected = true,
  onFocusCard,
}: PlayModeCardProps) {
  const { navigateTo } = useGame();
  const headingId = `play-mode-${useId().replaceAll(":", "")}`;
  const locked = guest && !mode.guestAllowed;

  const handleOpen = () => {
    navigateTo(resolveGameModeDestination(mode, guest));
  };

  const posClass =
    offset === 0
      ? styles.pos_center
      : offset === -1
        ? styles.pos_left
        : offset === 1
          ? styles.pos_right
          : offset < -1
            ? styles.pos_farLeft
            : styles.pos_farRight;

  return (
    <article
      className={[
        styles.card,
        styles[`tone_${mode.tone}`],
        posClass,
        mode.primary ? styles.primaryCard : "",
        selected ? styles.selectedCard : styles.sideCard,
        locked ? styles.locked : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={!selected && onFocusCard ? onFocusCard : undefined}
      aria-labelledby={headingId}
    >
      {/* Cadre doré intérieur façon carte de collection */}
      <span className={styles.goldTrim} aria-hidden="true" />

      {/* Partie haute : Illustration plein cadre + badge de mode */}
      <div className={styles.artStage}>
        <Image
          src={mode.art}
          alt=""
          fill
          priority={mode.primary}
          sizes="(min-width: 760px) 32vw, 84vw"
          className={styles.artImg}
        />
        <span className={styles.artVignette} aria-hidden="true" />

        <div className={styles.artTopRow}>
          <span className={styles.eyebrow}>{mode.eyebrow}</span>
          {mode.primary && <span className={styles.featuredBadge}>★ Populaire</span>}
        </div>

        <span className={styles.modeMedallion} aria-hidden="true">
          <NjamboIcon name={mode.icon} tone={mode.tone} size={28} />
        </span>
      </div>

      {/* Partie basse : Infos compactes + conditions + bouton 3D */}
      <div className={styles.body}>
        <div className={styles.titleBlock}>
          <h2 id={headingId}>{mode.title}</h2>
          <p>{mode.description}</p>
        </div>

        {locked && (
          <div className={styles.lockPill}>
            <NjamboIcon name="profile" tone="gold" size={14} />
            <span>Compte permanent requis</span>
          </div>
        )}

        <ul className={styles.chips} aria-label={`Conditions pour ${mode.title}`}>
          {mode.chips.map((chip) => (
            <li key={chip.label}>
              <NjamboIcon name={chip.icon} tone={mode.tone} size={13} />
              <span>{chip.label}</span>
            </li>
          ))}
        </ul>

        <button
          data-nj-skin="none"
          type="button"
          className={styles.ctaBtn}
          onClick={(event) => {
            event.stopPropagation();
            if (!selected && onFocusCard) {
              onFocusCard();
              return;
            }
            handleOpen();
          }}
          aria-label={`${locked ? "Créer un compte pour jouer à" : "Jouer à"} ${mode.title}`}
        >
          <span>{locked ? "Créer un compte" : mode.primary ? "Trouver une table" : "Choisir cette table"}</span>
          <span className={styles.ctaArrow} aria-hidden="true">→</span>
        </button>
      </div>
    </article>
  );
}
