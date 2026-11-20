/* ═══════════════ Configuration des événements (fiche v2) ═══════════════
   Règles PURES partagées par l'éditeur admin (erreurs en direct), le serveur
   (refus de publier une fiche invalide) et le client (lecture tolérante des
   anciennes fiches). Aucun import runtime depuis ./events (cycle). */

import type { Reward } from "./catalog";
import type { TicketTier } from "./economy";
import type {
  EventDifficulty,
  EventLeaderboardConfig,
  EventLifecycle,
  EventNotificationConfig,
  EventReviveConfig,
  EventStage,
  EventStageModifier,
  EventVersion,
} from "./events";

export const EVENT_DIFFICULTIES: EventDifficulty[] = ["facile", "normal", "difficile", "elite"];
export const EVENT_MODIFIERS: EventStageModifier[] = ["no_powers", "double_stake", "turn_timer"];
export const TICKET_TIERS: TicketTier[] = ["bronze", "argent", "or"];
const REWARD_TYPES = ["nkap", "cauris", "ticket", "energy_pass", "booster_book", "card"] as const;
const CARD_RARITIES = ["village", "notable", "chef", "ancetre"] as const;

export const DEFAULT_EVENT_REVIVE: EventReviveConfig = {
  enabled: false, maxPerRun: 2, pricesCauris: [20, 40], windowMinutes: 10,
};

export const DEFAULT_EVENT_LEADERBOARD: EventLeaderboardConfig = {
  enabled: false, pointsPerStage: 100, pointsPerLifeLeft: 30, perfectBonus: 50,
  minParticipants: 1, rankRewards: [],
};

export const DEFAULT_EVENT_THEME = { accent: "#e5407a", label: "Le Ter", tone: "events" };

/* ─────────────── Normalisation ─────────────── */

type Loose = Record<string, unknown>;
const obj = (value: unknown): Loose => (value && typeof value === "object" && !Array.isArray(value) ? value as Loose : {});
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
const optStr = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : undefined);

function rewards(value: unknown): Reward[] {
  return arr(value).filter((item) => item && typeof item === "object") as Reward[];
}

export function normalizeEventStage(raw: unknown, index: number): EventStage {
  const source = obj(raw);
  const boss = obj(source.boss);
  const modifiers = arr(source.modifiers).filter((m): m is EventStageModifier => EVENT_MODIFIERS.includes(m as EventStageModifier));
  const stage: EventStage = {
    id: str(source.id, `table_${index + 1}`),
    order: num(source.order, index + 1),
    title: str(source.title, `Table ${index + 1}`),
    difficulty: EVENT_DIFFICULTIES.includes(source.difficulty as EventDifficulty) ? source.difficulty as EventDifficulty : "normal",
    playerCount: num(source.playerCount, 4),
    stakeNkap: num(source.stakeNkap, 0),
    powersAllowed: bool(source.powersAllowed, true),
    crownsEnabled: bool(source.crownsEnabled, false),
    reward: rewards(source.reward),
    rewardRepeatable: bool(source.rewardRepeatable, false),
    modifiers,
    seasonPoints: num(source.seasonPoints, 0),
  };
  if (typeof source.turnTimerSeconds === "number") stage.turnTimerSeconds = source.turnTimerSeconds;
  if (typeof boss.name === "string" && boss.name.length > 0) {
    stage.boss = { name: boss.name, botLevel: num(boss.botLevel, 3), ...(optStr(boss.avatarUrl) ? { avatarUrl: optStr(boss.avatarUrl) } : {}) };
  }
  return stage;
}

/** Complète une fiche (v1 ou partielle) avec les valeurs par défaut v2. */
export function normalizeEventVersion(raw: unknown): EventVersion {
  const source = obj(raw);
  const revive = obj(source.revive);
  const leaderboard = obj(source.leaderboard);
  const perfect = obj(source.perfectRun);
  const challenges = obj(source.friendChallenges);
  const theme = obj(source.theme);
  const event: EventVersion = {
    eventId: str(source.eventId),
    revision: num(source.revision, 1),
    published: bool(source.published, false),
    title: str(source.title),
    description: str(source.description),
    theme: {
      accent: str(theme.accent, DEFAULT_EVENT_THEME.accent),
      label: str(theme.label, DEFAULT_EVENT_THEME.label),
      tone: str(theme.tone, DEFAULT_EVENT_THEME.tone),
    },
    mode: source.mode === "pvp" ? "pvp" : "pve",
    startsAt: num(source.startsAt, 0),
    endsAt: num(source.endsAt, 0),
    ticketTier: TICKET_TIERS.includes(source.ticketTier as TicketTier) ? source.ticketTier as TicketTier : "bronze",
    allowedLosses: num(source.allowedLosses, 3),
    revive: {
      enabled: bool(revive.enabled, DEFAULT_EVENT_REVIVE.enabled),
      maxPerRun: num(revive.maxPerRun, DEFAULT_EVENT_REVIVE.maxPerRun),
      pricesCauris: Array.isArray(revive.pricesCauris) ? revive.pricesCauris.filter((p): p is number => typeof p === "number") : [...DEFAULT_EVENT_REVIVE.pricesCauris],
      windowMinutes: num(revive.windowMinutes, DEFAULT_EVENT_REVIVE.windowMinutes),
    },
    stages: arr(source.stages).map(normalizeEventStage).sort((a, b) => a.order - b.order),
    finalReward: rewards(source.finalReward),
    perfectRun: { reward: rewards(perfect.reward), ...(optStr(perfect.badgeCosmeticId) ? { badgeCosmeticId: optStr(perfect.badgeCosmeticId) } : {}) },
    leaderboard: {
      enabled: bool(leaderboard.enabled, bool(source.rankingRewardsEnabled, DEFAULT_EVENT_LEADERBOARD.enabled)),
      pointsPerStage: num(leaderboard.pointsPerStage, DEFAULT_EVENT_LEADERBOARD.pointsPerStage),
      pointsPerLifeLeft: num(leaderboard.pointsPerLifeLeft, DEFAULT_EVENT_LEADERBOARD.pointsPerLifeLeft),
      perfectBonus: num(leaderboard.perfectBonus, DEFAULT_EVENT_LEADERBOARD.perfectBonus),
      minParticipants: num(leaderboard.minParticipants, DEFAULT_EVENT_LEADERBOARD.minParticipants),
      rankRewards: arr(leaderboard.rankRewards).map((entry) => {
        const item = obj(entry);
        return { fromRank: num(item.fromRank, 1), toRank: num(item.toRank, 1), reward: rewards(item.reward) };
      }),
    },
    notifications: arr(source.notifications).map((entry, index) => {
      const item = obj(entry);
      const trigger = item.trigger === "before_end" || item.trigger === "at" ? item.trigger : "opening";
      const audience = item.audience === "active_run" || item.audience === "not_joined" ? item.audience : "all";
      const notification: EventNotificationConfig = { id: str(item.id, `notif_${index + 1}`), trigger, title: str(item.title), body: str(item.body), audience };
      if (typeof item.offsetMinutes === "number") notification.offsetMinutes = item.offsetMinutes;
      if (typeof item.at === "number") notification.at = item.at;
      return notification;
    }),
    friendChallenges: { enabled: bool(challenges.enabled, false), winnerReward: rewards(challenges.winnerReward) },
  };
  if (source.archived === true) event.archived = true;
  if (optStr(source.imageUrl)) event.imageUrl = optStr(source.imageUrl);
  if (optStr(source.seasonId)) event.seasonId = optStr(source.seasonId);
  return event;
}

/* ─────────────── Validation ─────────────── */

export interface EventValidationIssue {
  /** Chemin du champ fautif, ex. "stages.2.reward.0.amount". */
  path: string;
  message: string;
}

const ID_PATTERN = /^[a-z0-9_]{3,64}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const IMAGE_URL = /^(\/[\w\-./]+|https:\/\/[\w\-.]+(:\d+)?\/[\w\-./%]*)$/;
const isInt = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

export function validateReward(reward: unknown, path: string): EventValidationIssue[] {
  const item = obj(reward);
  const type = item.type as string;
  if (!REWARD_TYPES.includes(type as typeof REWARD_TYPES[number])) return [{ path: `${path}.type`, message: "Type de récompense inconnu." }];
  const issues: EventValidationIssue[] = [];
  const needAmount = (max: number) => { if (!isInt(item.amount, 1, max)) issues.push({ path: `${path}.amount`, message: `Quantité entière entre 1 et ${max}.` }); };
  if (type === "nkap") needAmount(10_000_000);
  if (type === "cauris") needAmount(100_000);
  if (type === "ticket") {
    needAmount(100);
    if (!TICKET_TIERS.includes(item.tier as TicketTier)) issues.push({ path: `${path}.tier`, message: "Palier de ticket invalide." });
  }
  if (type === "energy_pass" && !isInt(item.durationMinutes, 1, 60 * 24 * 30)) issues.push({ path: `${path}.durationMinutes`, message: "Durée en minutes (1 à 43 200)." });
  if (type === "booster_book") {
    needAmount(100);
    if (!str(item.boosterId)) issues.push({ path: `${path}.boosterId`, message: "Booster requis." });
  }
  if (type === "card") {
    if (!str(item.cardId)) issues.push({ path: `${path}.cardId`, message: "Carte requise." });
    if (!CARD_RARITIES.includes(item.rarity as typeof CARD_RARITIES[number])) issues.push({ path: `${path}.rarity`, message: "Rareté invalide." });
  }
  return issues;
}

function validateRewardList(list: Reward[], path: string, required: boolean): EventValidationIssue[] {
  if (required && list.length === 0) return [{ path, message: "Au moins une récompense." }];
  return list.flatMap((reward, index) => validateReward(reward, `${path}.${index}`));
}

/** Toutes les erreurs bloquantes d'une fiche normalisée (liste vide = publiable). */
export function validateEventVersion(event: EventVersion): EventValidationIssue[] {
  const issues: EventValidationIssue[] = [];
  const push = (path: string, message: string) => issues.push({ path, message });

  if (!ID_PATTERN.test(event.eventId)) push("eventId", "Identifiant : 3 à 64 caractères a-z, 0-9 ou _.");
  if (!isInt(event.revision, 1, 1_000_000)) push("revision", "Révision invalide.");
  if (event.title.trim().length < 3 || event.title.length > 60) push("title", "Titre : 3 à 60 caractères.");
  if (event.description.length > 280) push("description", "Description : 280 caractères maximum.");
  if (event.imageUrl && !IMAGE_URL.test(event.imageUrl)) push("imageUrl", "Image : chemin /… ou URL https.");
  if (!HEX_COLOR.test(event.theme.accent)) push("theme.accent", "Couleur au format #rrggbb.");
  if (event.theme.label.length > 40) push("theme.label", "Libellé d'ambiance : 40 caractères maximum.");
  if (!Number.isFinite(event.startsAt) || event.startsAt < 0) push("startsAt", "Date de début invalide.");
  if (!Number.isFinite(event.endsAt) || event.endsAt <= event.startsAt) push("endsAt", "La fin doit être après le début.");
  if (!isInt(event.allowedLosses, 1, 10)) push("allowedLosses", "Vies : entre 1 et 10.");

  if (event.revive.enabled) {
    if (!isInt(event.revive.maxPerRun, 1, 10)) push("revive.maxPerRun", "Rachats : entre 1 et 10.");
    if (event.revive.pricesCauris.length === 0) push("revive.pricesCauris", "Au moins un prix.");
    event.revive.pricesCauris.forEach((price, index) => { if (!isInt(price, 1, 10_000)) push(`revive.pricesCauris.${index}`, "Prix entier en cauris (1 à 10 000)."); });
    if (!isInt(event.revive.windowMinutes, 1, 1_440)) push("revive.windowMinutes", "Délai : 1 à 1 440 minutes.");
  }

  if (event.stages.length === 0) push("stages", "Au moins une table.");
  if (event.stages.length > 20) push("stages", "20 tables maximum.");
  const stageIds = new Set<string>();
  event.stages.forEach((stage, index) => {
    const base = `stages.${index}`;
    if (!ID_PATTERN.test(stage.id)) push(`${base}.id`, "Identifiant de table invalide.");
    if (stageIds.has(stage.id)) push(`${base}.id`, "Identifiant de table en double.");
    stageIds.add(stage.id);
    if (stage.title.trim().length < 2 || stage.title.length > 48) push(`${base}.title`, "Nom de table : 2 à 48 caractères.");
    if (!isInt(stage.playerCount, 2, 4)) push(`${base}.playerCount`, "Joueurs : 2 à 4.");
    if (!isInt(stage.stakeNkap, 0, 1_000_000)) push(`${base}.stakeNkap`, "Mise en Nkap invalide.");
    if (!isInt(stage.seasonPoints, 0, 10_000)) push(`${base}.seasonPoints`, "Points de saison invalides.");
    if (stage.modifiers.includes("turn_timer") && !isInt(stage.turnTimerSeconds, 5, 120)) push(`${base}.turnTimerSeconds`, "Minuteur : 5 à 120 secondes.");
    if (stage.boss) {
      if (stage.boss.name.trim().length < 2 || stage.boss.name.length > 32) push(`${base}.boss.name`, "Nom du boss : 2 à 32 caractères.");
      if (!isInt(stage.boss.botLevel, 1, 5)) push(`${base}.boss.botLevel`, "Niveau du boss : 1 à 5.");
      if (stage.boss.avatarUrl && !IMAGE_URL.test(stage.boss.avatarUrl)) push(`${base}.boss.avatarUrl`, "Avatar : chemin /… ou URL https.");
    }
    issues.push(...validateRewardList(stage.reward, `${base}.reward`, false));
  });

  issues.push(...validateRewardList(event.finalReward, "finalReward", false));
  issues.push(...validateRewardList(event.perfectRun.reward, "perfectRun.reward", false));

  const board = event.leaderboard;
  if (board.enabled) {
    if (!isInt(board.pointsPerStage, 0, 100_000)) push("leaderboard.pointsPerStage", "Points par table invalides.");
    if (!isInt(board.pointsPerLifeLeft, 0, 100_000)) push("leaderboard.pointsPerLifeLeft", "Points par vie invalides.");
    if (!isInt(board.perfectBonus, 0, 100_000)) push("leaderboard.perfectBonus", "Bonus parfait invalide.");
    if (!isInt(board.minParticipants, 1, 100_000)) push("leaderboard.minParticipants", "Participants minimum : au moins 1.");
    const sorted = board.rankRewards.map((entry, index) => ({ ...entry, index })).sort((a, b) => a.fromRank - b.fromRank);
    sorted.forEach((entry, position) => {
      const base = `leaderboard.rankRewards.${entry.index}`;
      if (!isInt(entry.fromRank, 1, 1_000_000) || !isInt(entry.toRank, entry.fromRank, 1_000_000)) push(base, "Tranche de rangs invalide (du rang ≤ au rang).");
      const previous = sorted[position - 1];
      if (previous && entry.fromRank <= previous.toRank) push(base, "Tranches de rangs qui se chevauchent.");
      issues.push(...validateRewardList(entry.reward, `${base}.reward`, true));
    });
  }

  const notificationIds = new Set<string>();
  event.notifications.forEach((notification, index) => {
    const base = `notifications.${index}`;
    if (notificationIds.has(notification.id)) push(`${base}.id`, "Identifiant de notification en double.");
    notificationIds.add(notification.id);
    if (notification.title.trim().length < 2 || notification.title.length > 60) push(`${base}.title`, "Titre : 2 à 60 caractères.");
    if (notification.body.trim().length < 2 || notification.body.length > 160) push(`${base}.body`, "Message : 2 à 160 caractères.");
    if (notification.trigger === "before_end" && !isInt(notification.offsetMinutes, 1, 60 * 24 * 7)) push(`${base}.offsetMinutes`, "Minutes avant la fin : 1 à 10 080.");
    if (notification.trigger === "at") {
      if (!Number.isFinite(notification.at)) push(`${base}.at`, "Date d'envoi requise.");
      else if ((notification.at as number) < event.startsAt || (notification.at as number) > event.endsAt) push(`${base}.at`, "L'envoi doit tomber pendant l'événement.");
    }
  });

  if (event.friendChallenges.enabled) issues.push(...validateRewardList(event.friendChallenges.winnerReward, "friendChallenges.winnerReward", true));
  return issues;
}

/* ─────────────── Cycle de vie ─────────────── */

export function eventLifecycle(event: Pick<EventVersion, "published" | "archived" | "startsAt" | "endsAt">, now = Date.now()): EventLifecycle {
  if (event.archived) return "archived";
  if (!event.published) return "draft";
  if (event.startsAt > now) return "scheduled";
  if (event.endsAt <= now) return "ended";
  return "live";
}

/** Fiche vierge prête à éditer dans l'admin. */
export function blankEventVersion(eventId: string, now = Date.now()): EventVersion {
  const day = 24 * 60 * 60 * 1000;
  return normalizeEventVersion({
    eventId, revision: 1, published: false, title: "Nouvel événement", description: "",
    startsAt: now + day, endsAt: now + 8 * day,
    stages: [{ id: "table_1", order: 1, title: "Première table", difficulty: "facile", reward: [{ type: "nkap", amount: 150 }] }],
    finalReward: [{ type: "cauris", amount: 10 }],
  });
}
