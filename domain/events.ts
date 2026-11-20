import type { Reward } from "./catalog";
import type { TicketTier } from "./economy";
import { normalizeEventVersion } from "./eventConfig";

export type EventDifficulty = "facile" | "normal" | "difficile" | "elite";
export type EventStageModifier = "no_powers" | "double_stake" | "turn_timer";
export type EventNotificationTrigger = "opening" | "before_end" | "at";
export type EventNotificationAudience = "all" | "active_run" | "not_joined";
/** Cycle de vie côté admin (dérivé de published/archived/dates). */
export type EventLifecycle = "draft" | "scheduled" | "live" | "ended" | "archived";

export interface EventBoss {
  name: string;
  avatarUrl?: string;
  botLevel: number;
}

export interface EventStage {
  id: string;
  order: number;
  title: string;
  difficulty: EventDifficulty;
  playerCount: number;
  stakeNkap: number;
  powersAllowed: boolean;
  crownsEnabled: boolean;
  reward: Reward[];
  rewardRepeatable: boolean;
  /** Phase 4 — règles spéciales de la table. */
  modifiers: EventStageModifier[];
  turnTimerSeconds?: number;
  boss?: EventBoss;
  /** Phase 6 — points de saison gagnés en validant la table. */
  seasonPoints: number;
}

export interface EventReviveConfig {
  enabled: boolean;
  maxPerRun: number;
  /** Prix du 1er, 2e… rachat ; le dernier prix s'applique au-delà. */
  pricesCauris: number[];
  windowMinutes: number;
}

export interface EventRankReward {
  fromRank: number;
  toRank: number;
  reward: Reward[];
}

export interface EventLeaderboardConfig {
  enabled: boolean;
  pointsPerStage: number;
  pointsPerLifeLeft: number;
  perfectBonus: number;
  minParticipants: number;
  rankRewards: EventRankReward[];
}

export interface EventNotificationConfig {
  id: string;
  trigger: EventNotificationTrigger;
  offsetMinutes?: number;
  at?: number;
  title: string;
  body: string;
  audience: EventNotificationAudience;
}

export interface EventTheme {
  /** Couleur d'accent hexadécimale (#rrggbb). */
  accent: string;
  /** Court libellé d'ambiance affiché en kicker. */
  label: string;
  /** Ton du décor (dégradé du hub) : gold, teal, events… */
  tone?: string;
}

export interface EventVersion {
  eventId: string;
  revision: number;
  published: boolean;
  archived?: boolean;
  // Général
  title: string;
  description: string;
  imageUrl?: string;
  theme: EventTheme;
  mode: "pve" | "pvp";
  startsAt: number;
  endsAt: number;
  // Entrée & vies
  ticketTier: TicketTier;
  allowedLosses: number;
  revive: EventReviveConfig;
  // Tables
  stages: EventStage[];
  // Récompenses
  finalReward: Reward[];
  perfectRun: { reward: Reward[]; badgeCosmeticId?: string };
  // Classement
  leaderboard: EventLeaderboardConfig;
  /** @deprecated remplacé par leaderboard.enabled (fiches v1). */
  rankingRewardsEnabled?: boolean;
  // Notifications
  notifications: EventNotificationConfig[];
  // Saison & défis
  seasonId?: string;
  friendChallenges: { enabled: boolean; winnerReward: Reward[] };
}

export interface EventProgressResult {
  stageIndex: number;
  losses: number;
  status: "active" | "matchmaking" | "completed" | "eliminated";
}

export function resolveEventProgress(input: {
  mode: "pve" | "pvp";
  won: boolean;
  stageIndex: number;
  stageCount: number;
  losses: number;
  allowedLosses: number;
}): EventProgressResult {
  const playable = input.mode === "pvp" ? "matchmaking" : "active";
  if (!input.won) {
    const losses = input.losses + 1;
    return {
      stageIndex: input.stageIndex,
      losses,
      status: losses >= input.allowedLosses ? "eliminated" : playable,
    };
  }
  const final = input.stageIndex >= input.stageCount - 1;
  return {
    stageIndex: final ? input.stageIndex : input.stageIndex + 1,
    losses: input.losses,
    status: final ? "completed" : playable,
  };
}

export function reservedTicketIsRefundable(ticketStatus: string, firstMatchId?: string | null) {
  return ticketStatus === "reserved" && !firstMatchId;
}

const future = Date.UTC(2030, 0, 1);

const LEGACY_DEFAULT_EVENTS: Array<Record<string, unknown>> = [
  {
    eventId: "defi_du_mboa", revision: 1, title: "Défi du Mboa",
    description: "Traverse quatre tables du quartier face aux maîtres IA.",
    mode: "pve", startsAt: 0, endsAt: future, ticketTier: "bronze", allowedLosses: 3,
    published: true, imageUrl: "/assets/njambo/events/defi-du-mboa.webp",
    theme: { accent: "#f5b314", label: "Le Quartier du Mboa", tone: "gold" },
    stages: [
      ["carrefour", "La Table du Carrefour", "facile", 150],
      ["marche", "Le Marché du Mboa", "normal", 250],
      ["foyer", "Le Foyer des Notables", "difficile", 400],
      ["tambour", "Le Cercle du Tambour", "elite", 700],
    ].map(([id, title, difficulty, nkap], index) => ({
      id: String(id), order: index + 1, title: String(title), difficulty: difficulty as EventDifficulty,
      playerCount: 4, stakeNkap: 0, powersAllowed: true,
      crownsEnabled: false,
      reward: [{ type: "nkap", amount: Number(nkap) }], rewardRepeatable: false,
    })),
    finalReward: [{ type: "cauris", amount: 15 }, { type: "booster_book", boosterId: "normal", amount: 1 }],
  },
  {
    eventId: "tournoi_du_ter", revision: 1, title: "Tournoi du Ter",
    description: "Cinq étapes classées contre les joueurs du Ter.",
    mode: "pvp", startsAt: 0, endsAt: future, ticketTier: "argent", allowedLosses: 3,
    published: true, imageUrl: "/assets/njambo/events/tournoi-du-ter.webp",
    theme: { accent: "#1aa6a0", label: "Le Cercle du Ter", tone: "teal" },
    stages: Array.from({ length: 5 }, (_, index) => ({
      id: `tour_${index + 1}`, order: index + 1, title: `Table ${index + 1}`,
      difficulty: (index < 2 ? "normal" : index < 4 ? "difficile" : "elite") as EventDifficulty,
      playerCount: 4, stakeNkap: 0, powersAllowed: true,
      crownsEnabled: true,
      reward: [{ type: "nkap", amount: 250 + index * 150 }], rewardRepeatable: false,
    })),
    finalReward: [{ type: "cauris", amount: 35 }, { type: "booster_book", boosterId: "rare", amount: 1 }],
  },
];

export const DEFAULT_EVENTS: EventVersion[] = LEGACY_DEFAULT_EVENTS.map((event) => normalizeEventVersion(event));
