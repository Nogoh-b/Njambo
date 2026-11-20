/* ═══════════════ Saisons (phase 6) ═══════════════
   Passe de saison : des points gagnés en validant des tables d'événement
   (stage.seasonPoints, si la fiche est rattachée à la saison) débloquent des
   paliers ; chaque palier a une récompense gratuite et une premium (passe
   premium acheté en XAF). Les récompenses restent réclamables pendant
   `claimGraceDays` jours après la fin. */

import type { Reward } from "./catalog";

export interface SeasonTier {
  points: number;
  freeReward: Reward[];
  premiumReward: Reward[];
}

export interface SeasonDefinition {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  startsAt: number;
  endsAt: number;
  tiers: SeasonTier[];
  /** 0 = pas de passe premium. */
  premiumPriceXaf: number;
  claimGraceDays: number;
  published: boolean;
}

export interface SeasonProgress {
  seasonId: string;
  uid: string;
  points: number;
  claimedFree: number[];
  claimedPremium: number[];
  premium: boolean;
}

export type SeasonPhase = "upcoming" | "live" | "grace" | "closed";
export type SeasonTrack = "free" | "premium";

const DAY = 24 * 60 * 60 * 1000;
const obj = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});
const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const rewards = (value: unknown) => (Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Reward[] : []);
const ints = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is number => Number.isInteger(item)) : []);

export function normalizeSeason(raw: unknown): SeasonDefinition {
  const source = obj(raw);
  const season: SeasonDefinition = {
    id: String(source.id ?? ""),
    title: String(source.title ?? ""),
    description: String(source.description ?? ""),
    startsAt: num(source.startsAt, 0),
    endsAt: num(source.endsAt, 0),
    tiers: (Array.isArray(source.tiers) ? source.tiers : []).map((tier) => {
      const item = obj(tier);
      return { points: num(item.points, 0), freeReward: rewards(item.freeReward), premiumReward: rewards(item.premiumReward) };
    }),
    premiumPriceXaf: num(source.premiumPriceXaf, 0),
    claimGraceDays: num(source.claimGraceDays, 7),
    published: source.published === true,
  };
  if (typeof source.imageUrl === "string" && source.imageUrl) season.imageUrl = source.imageUrl;
  return season;
}

export function normalizeSeasonProgress(raw: unknown, seasonId: string, uid: string): SeasonProgress {
  const source = obj(raw);
  return {
    seasonId, uid,
    points: Math.max(0, num(source.points, 0)),
    claimedFree: ints(source.claimedFree),
    claimedPremium: ints(source.claimedPremium),
    premium: source.premium === true,
  };
}

export function seasonPhase(season: Pick<SeasonDefinition, "startsAt" | "endsAt" | "claimGraceDays">, now: number): SeasonPhase {
  if (now < season.startsAt) return "upcoming";
  if (now < season.endsAt) return "live";
  if (now < season.endsAt + season.claimGraceDays * DAY) return "grace";
  return "closed";
}

/** Nombre de paliers atteints avec ces points. */
export function reachedTiers(season: Pick<SeasonDefinition, "tiers">, points: number): number {
  return season.tiers.filter((tier) => points >= tier.points).length;
}

export type ClaimRefusal = "season_closed" | "tier_unknown" | "tier_locked" | "premium_required" | "already_claimed" | "no_reward";

export function canClaimTier(season: SeasonDefinition, progress: SeasonProgress, tierIndex: number, track: SeasonTrack, now: number): { ok: boolean; reason?: ClaimRefusal } {
  const phase = seasonPhase(season, now);
  if (phase !== "live" && phase !== "grace") return { ok: false, reason: "season_closed" };
  const tier = season.tiers[tierIndex];
  if (!tier) return { ok: false, reason: "tier_unknown" };
  if (progress.points < tier.points) return { ok: false, reason: "tier_locked" };
  if (track === "premium" && !progress.premium) return { ok: false, reason: "premium_required" };
  const claimed = track === "free" ? progress.claimedFree : progress.claimedPremium;
  if (claimed.includes(tierIndex)) return { ok: false, reason: "already_claimed" };
  if ((track === "free" ? tier.freeReward : tier.premiumReward).length === 0) return { ok: false, reason: "no_reward" };
  return { ok: true };
}

/** Points crédités pour une table validée, si la saison est en cours. */
export function seasonPointsFor(season: Pick<SeasonDefinition, "startsAt" | "endsAt" | "claimGraceDays" | "published">, stagePoints: number, now: number): number {
  if (!season.published || seasonPhase(season, now) !== "live") return 0;
  return Math.max(0, Math.floor(stagePoints));
}

export function validateSeason(season: SeasonDefinition, validateReward: (reward: unknown, path: string) => Array<{ path: string; message: string }>) {
  const issues: Array<{ path: string; message: string }> = [];
  if (!/^[a-z0-9_]{3,64}$/.test(season.id)) issues.push({ path: "id", message: "Identifiant : 3 à 64 caractères a-z, 0-9 ou _." });
  if (season.title.trim().length < 3 || season.title.length > 60) issues.push({ path: "title", message: "Titre : 3 à 60 caractères." });
  if (season.description.length > 280) issues.push({ path: "description", message: "Description : 280 caractères maximum." });
  if (!(season.endsAt > season.startsAt)) issues.push({ path: "endsAt", message: "La fin doit être après le début." });
  if (!Number.isInteger(season.premiumPriceXaf) || season.premiumPriceXaf < 0 || season.premiumPriceXaf > 1_000_000) issues.push({ path: "premiumPriceXaf", message: "Prix XAF : entier entre 0 (pas de premium) et 1 000 000." });
  if (!Number.isInteger(season.claimGraceDays) || season.claimGraceDays < 0 || season.claimGraceDays > 60) issues.push({ path: "claimGraceDays", message: "Délai de réclamation : 0 à 60 jours." });
  if (season.tiers.length === 0) issues.push({ path: "tiers", message: "Au moins un palier." });
  if (season.tiers.length > 100) issues.push({ path: "tiers", message: "100 paliers maximum." });
  season.tiers.forEach((tier, index) => {
    const base = `tiers.${index}`;
    if (!Number.isInteger(tier.points) || tier.points < 1) issues.push({ path: `${base}.points`, message: "Points requis : entier ≥ 1." });
    else if (index > 0 && tier.points <= season.tiers[index - 1].points) issues.push({ path: `${base}.points`, message: "Chaque palier doit demander plus de points que le précédent." });
    if (tier.freeReward.length === 0 && tier.premiumReward.length === 0) issues.push({ path: base, message: "Au moins une récompense (gratuite ou premium)." });
    tier.freeReward.forEach((reward, r) => issues.push(...validateReward(reward, `${base}.freeReward.${r}`)));
    tier.premiumReward.forEach((reward, r) => issues.push(...validateReward(reward, `${base}.premiumReward.${r}`)));
  });
  return issues;
}
