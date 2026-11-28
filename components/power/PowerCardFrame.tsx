"use client";

/* ═══════════════ Calque universel de bordure & particules (PowerCardFrame) ═══════════════
   Remplace les appels directs à `<PowerCardMotif>` dans toutes les pages du jeu
   (Ma collection, Boutique, Hub Jouer, Profil, Avatar adversaire) :
   - En mode `classique`, rend exactement le `<PowerCardMotif>` historique.
   - Sur les 8 autres itérations, rend l'armature SVG, le faisceau orbital éventuel
     et les particules `<canvas>` en direct, tout en respectant la surcharge par carte
     (`cardBorder`) et le réglage global (`usePowerBorderConfig`). */

import { memo, type CSSProperties } from "react";
import { isPackedPowerArt, isPortraitPowerPack } from "@/domain/assetPacks";
import { powerBorderDefinition, type PowerBorderId, type PowerBorderParticlesMode } from "@/domain/powerBorders";
import { sysAsset, useAssetPacks } from "@/lib/assetPack";
import { usePowerBorderConfig, usePlayerCardParticlesEnabled } from "@/lib/powerBorderStore";
import type { PowerCategory, PowerRarity } from "@/types/game";
import { CATEGORY_MOTIF_PALETTE, PowerCardMotif, RARITY_METAL_PALETTE } from "./PowerCardMotif";
import { PowerCardBorder } from "./PowerCardBorder";
import { PowerCardParticles } from "./PowerCardParticles";
import styles from "./PowerCardFrame.module.css";

const BORDER_STYLE_CLASS: Record<Exclude<PowerBorderId, "classique">, string> = {
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

interface PowerCardFrameProps {
  category: PowerCategory;
  rarity: PowerRarity;
  /** URL de l'illustration pour détecter les packs Portrait si fournie. */
  art?: string;
  /** Surcharge de bordure définie sur la fiche de la carte (`def.border`). */
  cardBorder?: PowerBorderId;
  /** Surcharge de particules définie sur la fiche de la carte (`def.borderParticles`). */
  cardParticles?: PowerBorderParticlesMode;
  /** Surcharge ponctuelle (ex. aperçu admin). */
  borderOverride?: PowerBorderId;
  /** Surcharge ponctuelle d'intensité des particules. */
  particlesOverride?: PowerBorderParticlesMode;
  /** Classe appliquée au `<PowerCardMotif>` en mode classique. */
  className?: string;
  compact?: boolean;
  /** Désactive les particules (ex. carte fantôme pendant drag ou micro-vignette 15 px). */
  disableParticles?: boolean;
}

export const PowerCardFrame = memo(function PowerCardFrame({
  category,
  rarity,
  art,
  cardBorder,
  cardParticles,
  borderOverride,
  particlesOverride,
  className,
  compact = false,
  disableParticles = false,
}: PowerCardFrameProps) {
  const packs = useAssetPacks();
  const config = usePowerBorderConfig();
  const playerParticlesOn = usePlayerCardParticlesEnabled();
  const pal = CATEGORY_MOTIF_PALETTE[category];
  const rar = RARITY_METAL_PALETTE[rarity];

  const packedArtwork = Boolean(art) && packs.powers !== "classique" && isPackedPowerArt(sysAsset(art!));
  const portraitArtwork = packedArtwork && isPortraitPowerPack(packs.powers);

  const activeBorder: PowerBorderId = borderOverride ?? cardBorder ?? config.border;
  const resolvedParticles: PowerBorderParticlesMode = particlesOverride ?? cardParticles ?? config.particles;
  const activeParticles: PowerBorderParticlesMode =
    particlesOverride !== undefined ? particlesOverride : playerParticlesOn ? resolvedParticles : "off";

  if (activeBorder === "classique") {
    if (portraitArtwork) return null;
    return <PowerCardMotif category={category} rarity={rarity} className={className} />;
  }

  if (portraitArtwork && !config.onPortrait && borderOverride === undefined) {
    return null;
  }

  const def = powerBorderDefinition(activeBorder);
  const showParticles = !disableParticles && def.hasParticles && activeParticles !== "off";

  return (
    <div
      className={`${styles.overlay} ${styles[BORDER_STYLE_CLASS[activeBorder]]}${compact ? ` ${styles.compact}` : ""}`}
      data-power-border={activeBorder}
      aria-hidden="true"
      style={
        {
          "--c-primary": pal.primary,
          "--c-secondary": pal.secondary,
          "--c-glow": pal.glow,
          "--r-metal": rar.metal,
          "--r-bright": rar.metalBright,
          "--r-glow": rar.glow,
        } as CSSProperties
      }
    >
      <PowerCardBorder
        border={activeBorder}
        category={category}
        rarity={rarity}
        compact={compact}
        portrait={portraitArtwork}
        className={styles.svg}
      />
      {def.hasOrbitBeam && <span className={styles.orbitBeam} />}
      {showParticles && (
        <PowerCardParticles
          border={activeBorder}
          category={category}
          rarity={rarity}
          mode={activeParticles}
          compact={compact}
          contained
          className={styles.particlesContained}
        />
      )}
    </div>
  );
});
