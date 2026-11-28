"use client";

import Image from "@/components/ui/GameImage";
import type { CSSProperties } from "react";
import { T } from "@/config/theme";
import { CATEGORY_MOTIF_PALETTE, PowerCardMotif, RARITY_METAL_PALETTE } from "@/components/power/PowerCardMotif";
import { PowerCardBorder } from "@/components/power/PowerCardBorder";
import { PowerCardParticles } from "@/components/power/PowerCardParticles";
import { PowerCardExternalCaption, PowerCardTextOverlay } from "@/components/power/PowerCardTextOverlay";
import { NjamboIcon, type NjamboIconName } from "@/components/ui/Art";
import type { PowerCardDef, PowerRarity } from "@/types/game";
import styles from "./PowerCardView.module.css";
import { sysAsset, useAssetPacks } from "@/lib/assetPack";
import { isPackedPowerArt, isPortraitPowerPack } from "@/domain/assetPacks";
import {
  powerBorderDefinition,
  type PowerBorderId,
  type PowerBorderParticlesMode,
  type PowerCardTextLayout,
} from "@/domain/powerBorders";
import { usePlayerCardParticlesEnabled, usePowerBorderConfig } from "@/lib/powerBorderStore";

const RARITY_INFO: Record<PowerRarity, { label: string; className: string }> = {
  common: { label: "Commune", className: "rCommon" },
  rare: { label: "Rare", className: "rRare" },
  epic: { label: "Épique", className: "rEpic" },
  legendary: { label: "Légendaire", className: "rLegendary" },
};

const BORDER_CLASS: Record<Exclude<PowerBorderId, "classique">, string> = {
  orfevre: "bOrfevre",
  braise: "bBraise",
  prisme: "bPrisme",
  ndop_energy: "bNdopEnergy",
  relique: "bRelique",
  foudre: "bFoudre",
  monolithe: "bMonolithe",
  solaire: "bSolaire",
  kente: "bKente",
  eclipse: "bEclipse",
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
  /** Surcharge ponctuelle de bordure (ex. aperçu dans l'admin). */
  borderOverride?: PowerBorderId;
  /** Surcharge ponctuelle du mode de particules (ex. aperçu dans l'admin). */
  particlesOverride?: PowerBorderParticlesMode;
  /** Force l'affichage sur pack portrait dans les aperçus admin. */
  onPortraitOverride?: boolean;
  /** Surcharge ponctuelle de la mise en page du texte (ex. galerie admin). */
  textLayoutOverride?: PowerCardTextLayout;
  /** Affiche aussi l'ombrage classique sur pack Portrait (pour comparer avant/après en admin). */
  showClassicOnPortrait?: boolean;
  /** Force l'ouverture du tiroir sur le mode `survol` (ex. aperçu admin). */
  revealHoverDrawer?: boolean;
}

export function PowerCardView({
  card,
  qty,
  selected = false,
  disabled = false,
  compact = false,
  showMeta = true,
  className,
  borderOverride,
  particlesOverride,
  onPortraitOverride,
  textLayoutOverride,
  showClassicOnPortrait = false,
  revealHoverDrawer = false,
}: PowerCardViewProps) {
  const pal = CATEGORY_MOTIF_PALETTE[card.category];
  const rar = RARITY_METAL_PALETTE[card.rarity];
  const rarity = RARITY_INFO[card.rarity];
  const packs = useAssetPacks();
  const borderConfig = usePowerBorderConfig();
  const playerParticlesOn = usePlayerCardParticlesEnabled();
  const packedArtwork = packs.powers !== "classique" && isPackedPowerArt(sysAsset(card.art));
  const portraitArtwork = packedArtwork && isPortraitPowerPack(packs.powers);

  const activeBorder: PowerBorderId = borderOverride ?? card.border ?? borderConfig.border;
  const resolvedParticles: PowerBorderParticlesMode = particlesOverride ?? card.borderParticles ?? borderConfig.particles;
  const activeParticles: PowerBorderParticlesMode =
    particlesOverride !== undefined ? particlesOverride : playerParticlesOn ? resolvedParticles : "off";
  const activeTextLayout: PowerCardTextLayout = textLayoutOverride ?? borderConfig.textLayout;
  const allowOnPortrait = onPortraitOverride ?? borderConfig.onPortrait;
  const isCustomBorder = activeBorder !== "classique";
  const showCustomFrame = isCustomBorder && (!portraitArtwork || allowOnPortrait);
  const showParticles = showCustomFrame && !disabled && activeParticles !== "off";
  const showOrbitBeam = showCustomFrame && powerBorderDefinition(activeBorder).hasOrbitBeam;
  const useCustomTextLayout = activeTextLayout !== "classique";
  const showExternalCaption = activeTextLayout === "externe" && !compact;
  const forceClassicMask = activeTextLayout === "classique" && showClassicOnPortrait;

  const cardNode = (
    <div
      className={[
        styles.card,
        "nj-card-hover-host",
        styles[rarity.className],
        packedArtwork && !useCustomTextLayout && !forceClassicMask ? styles.packedArt : "",
        portraitArtwork && !useCustomTextLayout && !forceClassicMask ? styles.portraitArt : "",
        useCustomTextLayout ? styles.fullBleedArt : "",
        compact ? styles.compact : "",
        selected ? styles.selected : "",
        disabled ? styles.disabled : "",
        showCustomFrame ? styles.customBorder : "",
        showCustomFrame ? styles[BORDER_CLASS[activeBorder]] : "",
        !showExternalCaption ? (className ?? "") : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-power-border={activeBorder}
      data-power-text-layout={activeTextLayout}
      style={
        {
          "--c-primary": pal.primary,
          "--c-secondary": pal.secondary,
          "--c-glow": pal.glow,
          "--c-top": pal.clothTop,
          "--c-bot": pal.clothBot,
          "--r-metal": rar.metal,
          "--r-bright": rar.metalBright,
          "--r-glow": rar.glow,
        } as CSSProperties
      }
    >
      <div className={styles.clip}>
        {/* Artwork plein cadre (6 nouvelles itérations) ou fondu classique */}
        <div className={styles.artMask} aria-hidden="true">
          <Image
            src={card.art}
            powerArtSize={compact ? "small" : undefined}
            alt=""
            fill
            sizes={compact ? "80px" : "190px"}
            className={styles.artImg}
          />
        </div>

        {/* Motif classique Ndop OU bordure personnalisée */}
        {!isCustomBorder && !portraitArtwork && (
          <PowerCardMotif category={card.category} rarity={card.rarity} className={styles.motifSvg} />
        )}
        {showCustomFrame && (
          <PowerCardBorder
            border={activeBorder}
            category={card.category}
            rarity={card.rarity}
            compact={compact}
            portrait={portraitArtwork}
            className={styles.borderSvg}
          />
        )}
        {!compact && <span className={styles.sheen} aria-hidden="true" />}

        {/* Haut de carte épuré : badge quantité à droite */}
        <div className={styles.topRow}>
          {qty !== undefined && qty > 0 && <span className={styles.qtyBadge}>×{qty}</span>}
        </div>

        {/* Texte : rendu classique OU l'une des 6 itérations sans gros ombrage */}
        {useCustomTextLayout ? (
          <PowerCardTextOverlay
            layout={activeTextLayout}
            card={card}
            size={compact ? "compact" : "default"}
            showMeta={showMeta}
            revealed={selected || revealHoverDrawer}
            reserveTopRight={qty !== undefined && qty > 0}
            fallbackInlineWhenCompact
          />
        ) : (
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
        )}
      </div>

      {/* Faisceau lumineux orbital sur le pourtour (Prisme, Foudre, Solaire, Éclipse) */}
      {showOrbitBeam && <span className={styles.orbitBeam} aria-hidden="true" />}

      {/* Particules vivantes sur et autour de la bordure */}
      {showParticles && (
        <PowerCardParticles
          border={activeBorder}
          category={card.category}
          rarity={card.rarity}
          mode={activeParticles}
          compact={compact}
          className={styles.particlesCanvas}
        />
      )}
    </div>
  );

  if (showExternalCaption) {
    return (
      <div className={[styles.externeWrap, className ?? ""].filter(Boolean).join(" ")}>
        {cardNode}
        <PowerCardExternalCaption card={card} showMeta={showMeta} />
      </div>
    );
  }

  return cardNode;
}
