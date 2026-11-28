"use client";

import { CATEGORY_MOTIF_PALETTE } from "@/components/power/PowerCardMotif";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import type { PowerCardTextLayout } from "@/domain/powerBorders";
import type { PowerCardDef, PowerRarity } from "@/types/game";
import styles from "./PowerCardTextOverlay.module.css";

const RARITY_LABELS: Record<PowerRarity, string> = {
  common: "Commune",
  rare: "Rare",
  epic: "Épique",
  legendary: "Légendaire",
};

export interface PowerCardTextOverlayProps {
  layout: Exclude<PowerCardTextLayout, "classique">;
  card: Pick<PowerCardDef, "name" | "category" | "rarity" | "icon" | "tone">;
  size?: "compact" | "default" | "hero";
  showMeta?: boolean;
  /** Garde le tiroir ouvert sur le style `survol` (ex. carte sélectionnée). */
  revealed?: boolean;
  /** Décale la barrette `haut` pour ne pas recouvrir un bouton/verrou en haut à droite. */
  reserveTopRight?: boolean;
  /** En mode `externe` + `compact`, affiche une mini-plaque interne si aucune légende externe n'est montée. */
  fallbackInlineWhenCompact?: boolean;
}

export function PowerCardTextOverlay({
  layout,
  card,
  size = "default",
  showMeta = false,
  revealed = false,
  reserveTopRight = false,
  fallbackInlineWhenCompact = false,
}: PowerCardTextOverlayProps) {
  const pal = CATEGORY_MOTIF_PALETTE[card.category];
  const sizeClass = size === "hero" ? styles.hero : size === "compact" ? styles.compact : "";
  const iconPx = size === "compact" ? 9 : size === "hero" ? 13 : 11;
  const sealIconPx = size === "compact" ? 10 : size === "hero" ? 15 : 13;

  if (layout === "plaque" || (layout === "externe" && size === "compact" && fallbackInlineWhenCompact)) {
    return (
      <div className={sizeClass || undefined}>
        <div className={styles.plaqueBar}>
          <span className={styles.plaqueIcon} aria-hidden="true">
            <NjamboIcon name={card.icon as NjamboIconName} tone={card.tone} size={iconPx} />
          </span>
          <strong className={styles.plaqueTitle}>{card.name}</strong>
          <span className={styles.plaqueDot} aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (layout === "externe") {
    return (
      <div className={sizeClass || undefined}>
        <span className={styles.cornerSeal} title={`${pal.label} · ${RARITY_LABELS[card.rarity]}`} aria-hidden="true">
          <NjamboIcon name={card.icon as NjamboIconName} tone={card.tone} size={sealIconPx} />
        </span>
      </div>
    );
  }

  if (layout === "ruban") {
    return (
      <div className={sizeClass || undefined}>
        <span className={styles.rubanSeal} aria-hidden="true">
          <span className={styles.rubanSealInner}>
            <NjamboIcon name={card.icon as NjamboIconName} tone={card.tone} size={size === "compact" ? 9 : 12} />
          </span>
        </span>
        <div className={styles.rubanBar}>
          <strong className={styles.rubanTitle}>{card.name}</strong>
        </div>
      </div>
    );
  }

  if (layout === "comic") {
    return (
      <div className={sizeClass || undefined}>
        <span className={styles.comicPill} aria-hidden="true">
          <NjamboIcon name={card.icon as NjamboIconName} tone={card.tone} size={size === "compact" ? 9 : 11} />
          <span className={styles.comicPillText}>{pal.label}</span>
        </span>
        <div className={styles.comicTitleWrap}>
          <strong className={styles.comicTitle}>{card.name}</strong>
        </div>
      </div>
    );
  }

  if (layout === "haut") {
    return (
      <div className={sizeClass || undefined}>
        <div className={`${styles.hautBar}${reserveTopRight ? ` ${styles.hautReserveRight}` : ""}`}>
          <span className={styles.hautIcon} aria-hidden="true">
            <NjamboIcon name={card.icon as NjamboIconName} tone={card.tone} size={iconPx} />
          </span>
          <strong className={styles.hautTitle}>{card.name}</strong>
          {!reserveTopRight && <span className={styles.hautCat}>{pal.label}</span>}
        </div>
      </div>
    );
  }

  /* survol */
  return (
    <div className={`${sizeClass}${revealed ? ` ${styles.survolOpen}` : ""}`.trim() || undefined}>
      <span className={styles.cornerSeal} aria-hidden="true">
        <NjamboIcon name={card.icon as NjamboIconName} tone={card.tone} size={sealIconPx} />
      </span>
      <div className={styles.survolDrawer}>
        <span className={styles.survolCat}>
          {pal.label}{showMeta ? ` · ${RARITY_LABELS[card.rarity]}` : ""}
        </span>
        <strong className={styles.survolTitle}>{card.name}</strong>
      </div>
    </div>
  );
}

export interface PowerCardExternalCaptionProps {
  card: Pick<PowerCardDef, "name" | "category" | "rarity">;
  hero?: boolean;
  showMeta?: boolean;
}

export function PowerCardExternalCaption({ card, hero = false, showMeta = true }: PowerCardExternalCaptionProps) {
  const pal = CATEGORY_MOTIF_PALETTE[card.category];
  return (
    <div
      className={`${styles.externalCaption}${hero ? ` ${styles.externalHero}` : ""}`}
      style={
        {
          "--c-primary": pal.primary,
          "--c-secondary": pal.secondary,
          "--c-glow": pal.glow,
        } as React.CSSProperties
      }
    >
      <strong className={styles.externalTitle}>{card.name}</strong>
      <span className={styles.externalMeta}>
        <span className={styles.externalSwatch} aria-hidden="true" />
        <span>
          {pal.label}{showMeta ? ` · ${RARITY_LABELS[card.rarity]}` : ""}
        </span>
      </span>
    </div>
  );
}
