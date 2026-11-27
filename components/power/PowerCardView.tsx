"use client";

import Image from "@/components/ui/GameImage";
import type { CSSProperties } from "react";
import { T } from "@/config/theme";
import { CATEGORY_MOTIF_PALETTE, PowerCardMotif } from "@/components/power/PowerCardMotif";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import type { PowerCardDef, PowerRarity } from "@/types/game";
import styles from "./PowerCardView.module.css";
import { sysAsset, useAssetPacks } from "@/lib/assetPack";
import { isPackedPowerArt, isPortraitPowerPack } from "@/domain/assetPacks";

const RARITY_INFO: Record<PowerRarity, { label: string; className: string }> = {
  common: { label: "Commune", className: "rCommon" },
  rare: { label: "Rare", className: "rRare" },
  epic: { label: "Épique", className: "rEpic" },
  legendary: { label: "Légendaire", className: "rLegendary" },
};

export function cardToneColor(tone: string): string {
  return tone === "gold" ? T.gold : tone === "teal" ? T.teal : tone === "pink" ? T.pink : T.cobalt;
}

interface PowerCardViewProps {
  card: PowerCardDef;
  qty?: number;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  showMeta?: boolean;
  className?: string;
  surface?: "default" | "solar";
}

export function PowerCardView({
  card,
  qty,
  selected = false,
  disabled = false,
  compact = false,
  showMeta = true,
  className,
}: PowerCardViewProps) {
  const pal = CATEGORY_MOTIF_PALETTE[card.category];
  const rarity = RARITY_INFO[card.rarity];
  const packs = useAssetPacks();
  const packedArtwork = packs.powers !== "classique" && isPackedPowerArt(sysAsset(card.art));
  const portraitArtwork = packedArtwork && isPortraitPowerPack(packs.powers);

  return (
    <div
      className={[
        styles.card,
        styles[rarity.className],
        packedArtwork ? styles.packedArt : "",
        portraitArtwork ? styles.portraitArt : "",
        compact ? styles.compact : "",
        selected ? styles.selected : "",
        disabled ? styles.disabled : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--c-primary": pal.primary,
          "--c-secondary": pal.secondary,
          "--c-glow": pal.glow,
          "--c-top": pal.clothTop,
          "--c-bot": pal.clothBot,
        } as CSSProperties
      }
    >
      {/* Artwork fondu organiquement dans la carte */}
      <div className={styles.artMask} aria-hidden="true">
        <Image
          src={card.art}
          alt=""
          fill
          sizes={compact ? "80px" : "190px"}
          className={styles.artImg}
        />
      </div>

      {/* Grand motif Ndop coloré selon le type + grand blason & architecture selon la rareté */}
      {!portraitArtwork && <PowerCardMotif category={card.category} rarity={card.rarity} className={styles.motifSvg} />}
      {!compact && <span className={styles.sheen} aria-hidden="true" />}

      {/* Haut de carte épuré : laisse le grand blason central libre */}
      <div className={styles.topRow}>
        {qty !== undefined && qty > 0 && <span className={styles.qtyBadge}>×{qty}</span>}
      </div>

      {/* Bas de carte flottant sur le motif */}
      <div className={styles.bottomInfo}>
        <span className={styles.iconHalo} aria-hidden="true">
          <NjamboIcon name={card.icon as NjamboIconName} tone={card.tone} size={compact ? 11 : 16} />
        </span>
        {!compact && (
          <span className={styles.typeLabel}>
            {pal.label}{showMeta ? ` · ${rarity.label}` : ""}
          </span>
        )}
        <strong className={styles.title}>{card.name}</strong>
      </div>
    </div>
  );
}
