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
    navigation: 220,
    roundIntro: 750,
    dealPerCard: 65,
    dealFlight: 380,
    dropFlight: 340,
    trickPause: 780,
    moment: 950,
    powerMax: 1500,
    landSettle: 80,
    powerBeat: 420,
    // Cadence du REPLAY serveur (AuthoritativeGameSync) : réactive et naturelle
    // tout en laissant chaque vol de carte clairement lisible.
    replayBotThinkMin: 420,
    replayBotThinkMax: 780,
  },
  economy: {
    dailyBonus: 500, // jetons offerts par réclamation
    bonusCooldownH: 24, // 1 réclamation / 24 h
    brokeFloor: 200, // plancher anti-faillite (2× mise mini)
  },
};
