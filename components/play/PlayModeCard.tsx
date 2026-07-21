"use client";

import { useId } from "react";
import { GameModeCard } from "@/components/ui/GamePrimitives";
import { HubReveal } from "@/components/ui/HubReveal";
import { NjamboIcon } from "@/components/ui/Art";
import type { GameModeCatalogEntry } from "@/lib/gameModeCatalog";
import { resolveGameModeDestination } from "@/lib/gameModeCatalog";
import { useGame } from "@/contexts/GameContext";
import styles from "./PlayModeCard.module.css";

interface PlayModeCardProps {
  mode: GameModeCatalogEntry;
  guest: boolean;
  order: number;
}

export function PlayModeCard({ mode, guest, order }: PlayModeCardProps) {
  const { navigateTo } = useGame();
  const headingId = `play-mode-${useId().replaceAll(":", "")}`;
  const locked = guest && !mode.guestAllowed;
  const slotClass = mode.primary ? styles.primarySlot : styles.secondarySlot;

  return (
    <HubReveal className={`${styles.slot} ${slotClass}`} order={order}>
      <GameModeCard
        image={mode.art}
        imageClassName={styles.art}
        shadeClassName={styles.shade}
        variant={mode.primary ? "primary" : "secondary"}
        tone={mode.tone}
        locked={locked}
        priority={mode.primary}
        sizes={mode.primary
          ? "(min-width: 960px) 68vw, 100vw"
          : "(min-width: 960px) 32vw, (min-width: 600px) 50vw, 100vw"}
        className={`${styles.card} ${mode.primary ? styles.primaryCard : styles.secondaryCard} ${styles[`tone_${mode.tone}`]}${locked ? ` ${styles.locked}` : ""}`}
      >
        <div className={styles.body}>
          {locked && mode.primary && (
            <div className={styles.lockNotice} aria-hidden="true">
              <span className={styles.lockIcon}><NjamboIcon name="profile" tone="gold" size={22} /></span>
              <span>
                <strong>Compte permanent requis</strong>
                <small>Ta progression et tes gains seront sauvegardés.</small>
              </span>
            </div>
          )}

          <span className={styles.eyebrow}>{mode.eyebrow}</span>
          <div className={styles.titleRow}>
            <span className={styles.icon} aria-hidden="true">
              <NjamboIcon name={mode.icon} tone={mode.tone} size={mode.primary ? 32 : 27} />
            </span>
            <h2 id={headingId}>{mode.title}</h2>
          </div>
          <p>{mode.description}</p>
          <ul className={styles.conditions} aria-label={`Conditions pour ${mode.title}`}>
            {mode.chips.map((chip) => (
              <li key={chip.label}>
                <NjamboIcon name={chip.icon} tone={mode.tone} size={15} />
                <span>{chip.label}</span>
              </li>
            ))}
          </ul>
          <button
            data-nj-skin={mode.tone}
            className={styles.cta}
            type="button"
            onClick={() => navigateTo(resolveGameModeDestination(mode, guest))}
            aria-label={`${locked ? "Créer un compte pour jouer à" : "Jouer à"} ${mode.title}`}
          >
            <span>{locked ? "Créer un compte" : mode.primary ? "Trouver une table" : "Choisir cette table"}</span>
            <NjamboIcon name={locked ? "profile" : "play"} tone={mode.tone} size={20} />
          </button>
        </div>

      </GameModeCard>
    </HubReveal>
  );
}
