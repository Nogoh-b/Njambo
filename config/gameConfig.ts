import type { GameConfig, Suit } from "@/types/game";

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
    // vitesses d'animation (ms) — réglables. Cadence « posée » : chaque action
    // respire (vol → pose → settle → annonce → pause → coup suivant).
    dealPerCard: 175, // décalage entre chaque carte distribuée
    dealFlight: 720, // durée du vol d'une carte à la donne
    dropFlight: 680, // durée du vol main → dépôt (plus ample, plus de poids)
    trickPause: 2200, // pause après résolution d'un tour (contient pose+settle+moment)
    landSettle: 260, // beat de pose avant l'annonce du gagnant
    powerBeat: 900, // lecture du FX carte pouvoir avant le coup du bot
  },
  economy: {
    dailyBonus: 500, // jetons offerts par réclamation
    bonusCooldownH: 24, // 1 réclamation / 24 h
    brokeFloor: 200, // plancher anti-faillite (2× mise mini)
  },
};
