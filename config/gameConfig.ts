import type { GameConfig, Suit } from "../types/game";
import { DEFAULT_GAMEPLAY_CONFIG } from "../domain/gameplayConfig";

/* ═══════════════ FILE: config/gameConfig.js ═══════════════
   TOUTES les règles se changent ICI. */
export const GAME_CONFIG: GameConfig = {
  ...DEFAULT_GAMEPLAY_CONFIG,
  ranks: { min: 3, max: 10 }, // 3..10 → 32 cartes (pas d'As)
  suits: [
    { s: "♠", color: "#1e1e1e" },
    { s: "♥", color: "#c1292e" },
    { s: "♦", color: "#c1292e" },
    { s: "♣", color: "#1e1e1e" },
  ] as Suit[],
  cardsPerPlayer: 5,
  turnSeconds: 15,
  startingBalance: 5000,
  stakes: [100, 250, 500],
  instantWin: {
    enabled: true,
    sumBelow: 21, // somme de la donne < 21 → victoire immédiate
    sumExactDoubles: 21, // somme = 21 → victoire doublée
    flushWins: true, // 5 cartes même couleur → victoire immédiate
    flushDoubles: false,
  },
  lastCardThreeDoubles: true, // dominer le dernier tour avec un 3 → doublé
  winnerPlaysLastNextRound: true,
  firstLeaderIndex: 0,
  anim: {
    navigation: 220,
    roundIntro: 750,
    // Rythme de la donne par défaut ; réglable dans l'admin (Règles des parties), copié dans les règles de chaque partie.
    dealPerCard: DEFAULT_GAMEPLAY_CONFIG.dealPerCardMs,
    dealFlight: DEFAULT_GAMEPLAY_CONFIG.dealFlightMs,
    dropFlight: 340,
    trickPause: 780,
    moment: 950,
    // Annonce d'une carte pouvoir (carte au centre + titre/texte) avant sa mise en scène.
    powerMax: 2200,
    landSettle: 80,
    // Animations coupées : courte pause après un pouvoir. Sinon, la pause suit la durée
    // réelle de l'animation (engine/power/animBudget.ts).
    powerBeat: 420,
    // Cadence de l'IA (table locale ET replay serveur) : un temps de
    // « réflexion » avant chaque carte adverse, puis une pause après son
    // atterrissage, pour qu'on voie la partie se dérouler.
    // COUPLÉ au budget de deadline serveur (functions/src/matchCommands.ts).
    replayBotThinkMin: 800,
    replayBotThinkMax: 1300,
    botAfterPlay: 450,
  },
  economy: {
    dailyBonus: 500, // jetons offerts par réclamation
    bonusCooldownH: 24, // 1 réclamation / 24 h
    brokeFloor: 200, // plancher anti-faillite (2× mise mini)
  },
};
