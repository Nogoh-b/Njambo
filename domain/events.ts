import type { Reward } from "./catalog";
import type { TicketTier } from "./economy";

export interface EventStage {
  id: string;
  order: number;
  title: string;
  difficulty: "facile" | "normal" | "difficile" | "elite";
  playerCount: number;
  stakeNkap: number;
  powersAllowed: boolean;
  crownsEnabled: boolean;
  reward: Reward[];
  rewardRepeatable: boolean;
}

export interface EventVersion {
  eventId: string;
  revision: number;
  title: string;
  description: string;
  mode: "pve" | "pvp";
  startsAt: number;
  endsAt: number;
  ticketTier: TicketTier;
  allowedLosses: number;
  stages: EventStage[];
  finalReward: Reward[];
  rankingRewardsEnabled: boolean;
  published: boolean;
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

export const DEFAULT_EVENTS: EventVersion[] = [
  {
    eventId: "defi_du_mboa", revision: 1, title: "Défi du Mboa",
    description: "Traverse quatre tables du quartier face aux maîtres IA.",
    mode: "pve", startsAt: 0, endsAt: future, ticketTier: "bronze", allowedLosses: 3,
    rankingRewardsEnabled: false, published: true,
    stages: [
      ["carrefour", "La Table du Carrefour", "facile", 150],
      ["marche", "Le Marché du Mboa", "normal", 250],
      ["foyer", "Le Foyer des Notables", "difficile", 400],
      ["tambour", "Le Cercle du Tambour", "elite", 700],
    ].map(([id, title, difficulty, nkap], index) => ({
      id: String(id), order: index + 1, title: String(title), difficulty: difficulty as EventStage["difficulty"],
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
    rankingRewardsEnabled: false, published: true,
    stages: Array.from({ length: 5 }, (_, index) => ({
      id: `tour_${index + 1}`, order: index + 1, title: `Table ${index + 1}`,
      difficulty: (index < 2 ? "normal" : index < 4 ? "difficile" : "elite") as EventStage["difficulty"],
      playerCount: 4, stakeNkap: 0, powersAllowed: true,
      crownsEnabled: true,
      reward: [{ type: "nkap", amount: 250 + index * 150 }], rewardRepeatable: false,
    })),
    finalReward: [{ type: "cauris", amount: 35 }, { type: "booster_book", boosterId: "rare", amount: 1 }],
  },
];
