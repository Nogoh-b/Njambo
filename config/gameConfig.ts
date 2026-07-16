import type { GameConfig, Suit } from "../types/game";

/* ═══════════════ FILE: config/gameConfig.js ═══════════════
   TOUTES les règles se changent ICI. */
export const GAME_CONFIG: GameConfig = {
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
    navigation: 160,
    roundIntro: 1200,
    dealPerCard: 80,
    dealFlight: 420,
    dropFlight: 380,
    trickPause: 950,
    moment: 1100,
    powerMax: 1600,
    landSettle: 140,
    powerBeat: 500,
    // Cadence du REPLAY serveur (AuthoritativeGameSync) : "réflexion" simulée
    // avant chaque coup adverse d'un batch. Plus court que le bot local
    // (le coup est déjà décidé). La deadline serveur inclut séparément tout
    // le budget du replay avant les 15 secondes réellement jouables.
    replayBotThinkMin: 700,
    replayBotThinkMax: 1400,
  },
  economy: {
    dailyBonus: 500, // jetons offerts par réclamation
    bonusCooldownH: 24, // 1 réclamation / 24 h
    brokeFloor: 200, // plancher anti-faillite (2× mise mini)
  },
};
