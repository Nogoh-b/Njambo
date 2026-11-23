"use client";

/* Accès commun aux mini-jeux : état du jour (parties gratuites / restantes),
   capacité à payer, et appels serveur. Le serveur reste seul juge : ces
   valeurs ne servent qu'à l'affichage. */

import { useCallback, useMemo } from "react";
import { useEconomy } from "@/contexts/EconomyContext";
import { useAuth } from "@/hooks/useAuth";
import {
  MINI_GAMES_BY_ID,
  doualaDayKey,
  freePlaysLeft,
  playsLeft,
  type HiLoGuess,
  type InstantScript,
  type MiniGameCost,
  type MiniGameId,
  type MiniGameSession,
  type Reward,
} from "@/domain";

export interface InstantResult {
  reward: Reward;
  script: InstantScript;
  free: boolean;
}

export function costLabel(cost: MiniGameCost): string {
  if (cost.type === "nkap") return `${cost.amount} Nkap`;
  if (cost.type === "cauris") return `${cost.amount} cauris`;
  if (cost.type === "ticket") return `${cost.amount} ticket Bronze`;
  return "Gratuit";
}

export function costIcon(cost: MiniGameCost): string | null {
  if (cost.type === "nkap") return "/assets/njambo/economy/nkap-stack-64.webp";
  if (cost.type === "cauris") return "/assets/njambo/economy/cauris-pouch-64.webp";
  if (cost.type === "ticket") return "/assets/njambo/tickets/ticket-bronze-64.webp";
  return null;
}

/** Messages lisibles pour les refus du serveur. */
export function miniGameError(cause: unknown): string {
  const reason = cause instanceof Error ? cause.message : String(cause ?? "");
  if (/INSUFFICIENT_TICKETS/.test(reason)) return "Il te faut un ticket Bronze pour gratter.";
  if (/INSUFFICIENT_CAURIS/.test(reason)) return "Pas assez de cauris pour cette partie.";
  if (/INSUFFICIENT_NKAP/.test(reason)) return "Pas assez de Nkap pour cette partie.";
  if (/MINIGAME_DAILY_LIMIT/.test(reason)) return "Tu as joué toutes tes parties du jour. Reviens demain !";
  if (/SPENDING_BLOCKED/.test(reason)) return "Les dépenses sont bloquées sur ton compte.";
  if (/SESSION_IN_PROGRESS/.test(reason)) return "Termine d’abord ta partie de Plus haut ou plus bas.";
  return "La partie n’a pas pu démarrer. Réessaie dans un instant.";
}

export function useMiniGames() {
  const { user } = useAuth();
  const { economy, inventory, command } = useEconomy();
  const guest = !user || user.isAnonymous === true;
  const day = doualaDayKey();

  const status = useCallback((id: MiniGameId) => {
    const game = MINI_GAMES_BY_ID[id];
    const free = freePlaysLeft(economy?.minigames, id, day);
    const left = playsLeft(economy?.minigames, id, day);
    const cost = game.cost;
    const affordable = free > 0 || (
      cost.type === "nkap" ? (economy?.nkap ?? 0) >= cost.amount
        : cost.type === "cauris" ? (economy?.cauris ?? 0) >= cost.amount
        : cost.type === "ticket" ? Number(inventory.tickets?.[cost.tier] ?? 0) >= cost.amount
        : false
    );
    return { game, free, left, affordable: affordable && left > 0 && !economy?.spendingBlocked };
  }, [day, economy, inventory.tickets]);

  const api = useMemo(() => ({
    play: (gameId: MiniGameId, choice?: number) =>
      command<InstantResult>("playMiniGame", { gameId, ...(choice !== undefined ? { choice } : {}) }),
    startHiLo: () => command<{ session: MiniGameSession; resumed: boolean }>("startHiLo"),
    guessHiLo: (sessionId: string, guess: HiLoGuess) =>
      command<{ next: number; won: boolean; wins: number; multiplier: number; finished: boolean; reward: Reward | null }>("guessHiLo", { sessionId, guess }),
    cashOutHiLo: (sessionId: string) => command<{ reward: Reward; wins: number }>("cashOutHiLo", { sessionId }),
    startSkill: (gameId: MiniGameId) => command<{ session: MiniGameSession }>("startSkillGame", { gameId }),
    finishSkill: (sessionId: string, score: number, timeLeftMs = 0) =>
      command<{ reward: Reward }>("finishSkillGame", { sessionId, score, timeLeftMs }),
  }), [command]);

  return { guest, economy, inventory, status, api, session: economy?.minigameSession ?? null };
}

/** Contrat commun des composants de jeu. */
export interface MiniGameProps {
  mg: ReturnType<typeof useMiniGames>;
  /** Lot gagné : affiche la fenêtre de gain. */
  onReward: (reward: Reward) => void;
  /** Message d'erreur lisible (refus serveur…). */
  onError: (message: string) => void;
  /** Invité : ouvrir la connexion. */
  onAuth: () => void;
  /** Ouvre « Lots & chances ». */
  onOdds: () => void;
}
