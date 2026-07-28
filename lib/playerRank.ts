import { RANK_TIERS, rankTier } from "@/domain";

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

/** `chef_table` → `chef-table` : les fichiers utilisent des tirets. */
export function rankAssetId(tier: RankTier): string {
  return tier.id.replaceAll("_", "-");
}

export function rankAssetSrc(tier: RankTier, size: 64 | 128 | 256 = 64): string {
  return `/assets/njambo/ranks/rank-${rankAssetId(tier)}-${size}.webp`;
}

/** Palier + visuel pour un total de couronnes. Sans couronnes, on retombe sur « Joueur du Mboa ». */
export function resolveRank(crowns: number | undefined | null): ResolvedRank {
  const tier = rankTier(crowns ?? 1_000);
  return { tier, label: tier.label, assetSrc: rankAssetSrc(tier) };
}
