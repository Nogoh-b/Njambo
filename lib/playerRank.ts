import { RANK_TIERS, rankTier } from "@/domain";
import { sysAsset } from "@/lib/assetPack";

/**
 * Source unique pour le palier de rang et son visuel.
 *
 * Avant ce module, deux sources coexistaient : MenuScreen lisait
 * `useEconomy().rank.badge` et fabriquait le chemin de l'asset à la main,
 * tandis que LeaderboardScreen rappelait `rankTier()` de son côté. Le calcul
 * du palier et le nom de fichier vivent désormais ici.
 *
 * `useEconomy()` reste la source des COURONNES (autorité serveur) ; ce module
 * est la source du PALIER et de l'ASSET dérivés de ces couronnes.
 */

export type RankTier = (typeof RANK_TIERS)[number];

export interface ResolvedRank {
  tier: RankTier;
  label: string;
  assetSrc: string;
}

export interface RankProgress extends ResolvedRank {
  crowns: number;
  nextTier: RankTier | null;
  /** Progression normalisée (0–100) à l'intérieur du palier courant. */
  progressPct: number;
  /** Nombre de couronnes manquantes avant le palier supérieur (null au sommet). */
  crownsToNext: number | null;
}

/** `chef_table` → `chef-table` : les fichiers utilisent des tirets. */
export function rankAssetId(tier: RankTier): string {
  return tier.id.replaceAll("_", "-");
}

export function rankAssetSrc(tier: RankTier, size: 64 | 128 | 256 = 64): string {
  return sysAsset(`/assets/njambo/ranks/rank-${rankAssetId(tier)}-${size}.webp`);
}

/** Palier + visuel pour un total de couronnes. Sans couronnes, on retombe sur « Joueur du Mboa ». */
export function resolveRank(crowns: number | undefined | null): ResolvedRank {
  const tier = rankTier(crowns ?? 1_000);
  return { tier, label: tier.label, assetSrc: rankAssetSrc(tier) };
}

/** Progression détaillée d'un joueur au sein de son palier de rang (pour la jauge radiale). */
export function resolveRankProgress(crowns: number | undefined | null): RankProgress {
  const safeCrowns = Math.max(0, Math.round(crowns ?? 1_000));
  const tier = rankTier(safeCrowns);
  const index = RANK_TIERS.findIndex((candidate) => candidate.id === tier.id);
  const nextTier = index >= 0 && index < RANK_TIERS.length - 1 ? RANK_TIERS[index + 1] : null;

  let progressPct = 100;
  let crownsToNext: number | null = null;

  if (nextTier) {
    const floor = Number.isFinite(tier.min) ? tier.min : Math.max(0, nextTier.min - 200);
    const span = Math.max(1, nextTier.min - floor);
    progressPct = Math.max(4, Math.min(99, Math.round(((safeCrowns - floor) / span) * 100)));
    crownsToNext = Math.max(1, nextTier.min - safeCrowns);
  }

  return {
    tier,
    label: tier.label,
    assetSrc: rankAssetSrc(tier),
    crowns: safeCrowns,
    nextTier,
    progressPct,
    crownsToNext,
  };
}
