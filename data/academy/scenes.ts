/* Scènes de l'Académie (docs/academie-suivi.md, A3 et A8). Sièges : 0 = toi,
   puis Mado Biyem et Ya Pauline. Chaque scène est rejouée par
   tests/academy-scenes.test.ts avec sa solution et avec une mauvaise carte. */

import type { AcademyScene, AcademySeat } from "../../engine/academy/types";

const YOU: AcademySeat = { name: "Toi", emoji: "you" };
const MADO: AcademySeat = { name: "Mado Biyem", emoji: "mado-biyem" };
const YA: AcademySeat = { name: "Ya Pauline", emoji: "ya-pauline" };
const TABLE = [YOU, MADO, YA];

/* Chapitres 1 et 2 : une seule manche, les mêmes mains. */
const BASICS_DEAL = [
  ["9♥", "5♥", "4♥", "7♦", "6♣"], // toi : aucun Pique
  ["8♠", "7♠", "10♦", "3♦", "9♣"], // Mado : aucun Cœur
  ["10♠", "5♠", "6♥", "3♥", "8♣"], // Ya
];

/** Chapitre 1 — Suis la tendance (2 plis, mode strict). */
export const CH1_FOLLOW: AcademyScene = {
  id: "ch1-follow",
  seats: TABLE,
  deal: BASICS_DEAL,
  firstLeader: 1,
  goal: "winTrick",
  actions: [
    // Pli 1 : Mado lance du Pique, tu n'en as pas.
    { seat: 1, card: "8♠" },
    { seat: 2, card: "10♠" },
    { seat: 0, card: "4♥", coach: { before: ["ch1.pli1.tendance", "ch1.pli1.defausse"], wrong: { "9♥": "ch1.pli1.wrong9", default: "ch1.pli1.wrong" } } },
    // Pli 2 : Ya a gagné, elle lance du Cœur.
    { seat: 2, card: "6♥" },
    { seat: 0, card: "9♥", coach: { before: ["ch1.pli2.suis"], wrong: { "5♥": "ch1.pli2.wrong5" } } },
    { seat: 1, card: "3♦", coach: { after: "ch1.pli2.madoDefausse" } },
  ],
  coach: { success: "ch1.success" },
};

/** Chapitre 2 — Prends la main (1 pli, défi) : suite directe du chapitre 1. */
export const CH2_LEAD: AcademyScene = {
  id: "ch2-lead",
  seats: TABLE,
  deal: BASICS_DEAL,
  firstLeader: 1,
  // Solution du chapitre 1, dans l'ordre de pose.
  history: [["8♠", "10♠", "4♥"], ["6♥", "9♥", "3♦"]],
  goal: "winTrick",
  actions: [
    { seat: 0, free: true, solution: "5♥", coach: { before: ["ch2.lance"], hint: "ch2.hint" } },
    { seat: 1, rule: "smart" },
    { seat: 2, rule: "smart" },
  ],
  coach: { success: "ch2.success", failure: "ch2.failure" },
};

/** Chapitre 3 — Le 5e tour et le 3 : nouvelle manche, déjà au pli 4. */
export const CH3_LAST_TRICK: AcademyScene = {
  id: "ch3-last-trick",
  seats: TABLE,
  deal: [
    ["10♥", "4♣", "7♠", "10♦", "3♣"],
    ["6♥", "3♠", "9♠", "8♦", "6♠"], // Mado : aucun Trèfle
    ["4♥", "5♦", "8♠", "9♦", "7♥"], // Ya : aucun Trèfle
  ],
  firstLeader: 1,
  history: [
    ["6♥", "4♥", "10♥"], // Mado lance, tu gagnes
    ["4♣", "3♠", "5♦"], // tu lances le Trèfle : elles ne suivent pas
    ["7♠", "9♠", "8♠"], // Mado gagne
  ],
  goal: "winRound",
  actions: [
    { seat: 1, card: "8♦" },
    { seat: 2, card: "9♦" },
    { seat: 0, card: "10♦", coach: { before: ["ch3.pli4.pourquoi", "ch3.pli4.gagne"] } },
    { seat: 0, card: "3♣", coach: { before: ["ch3.pli5.trois"] } },
    { seat: 1, rule: "lowest" },
    { seat: 2, rule: "lowest" },
  ],
  coach: { intro: ["ch3.recap"], success: "ch3.success" },
};

/** Chapitre 3 — « Et si ? » : rejeu automatique où Mado a gardé un Trèfle. */
export const CH3_WHAT_IF: AcademyScene = {
  id: "ch3-what-if",
  seats: TABLE,
  deal: [
    ["10♥", "7♠", "4♦", "10♦", "3♣"],
    ["6♥", "9♠", "3♠", "8♦", "5♣"],
    ["4♥", "8♠", "6♦", "9♦", "7♥"],
  ],
  firstLeader: 1,
  history: [
    ["6♥", "4♥", "10♥"],
    ["7♠", "9♠", "8♠"],
    ["3♠", "6♦", "4♦"],
    ["8♦", "9♦", "10♦"],
  ],
  goal: "watch",
  actions: [
    { seat: 0, card: "3♣" },
    { seat: 1, card: "5♣", coach: { after: "ch3.etSi.mado" } },
    { seat: 2, card: "7♥" },
  ],
  coach: { done: "ch3.etSi.lecon" },
};

/* Défi du chapitre 3 : plis 3 à 5 joués librement avec 10♦ 6♥ 3♣, bots « smart ».
   Une des deux situations est tirée au sort ; chacune a une suite gagnante et des pièges
   (vérifié en jouant les 6 ordres possibles). */

/** Le 3 passe : au 2e pli, Mado et Ya n'ont pas suivi le Trèfle. 6♥, puis 10♦ pour reprendre la main, puis 3♣ (×2). */
export const CH3_CHALLENGE_SAFE_THREE: AcademyScene = {
  id: "ch3-challenge-safe-three",
  seats: TABLE,
  deal: [
    ["10♦", "6♥", "3♣", "10♥", "6♣"],
    ["8♦", "9♥", "3♥", "7♦", "4♦"],
    ["3♠", "9♠", "5♦", "6♦", "3♦"],
  ],
  firstLeader: 1,
  history: [
    ["3♥", "3♠", "10♥"], // Ya n'a pas de Cœur
    ["6♣", "4♦", "3♦"], // tu lances le Trèfle : ni Mado ni Ya ne suivent
  ],
  actions: [],
  open: { bots: "smart", solution: ["6♥", "10♦", "3♣"], coach: { hint: "ch3.defi.hintSafe" } },
  goal: "winRound",
  coach: { intro: ["ch3.defi.intro"], success: "ch3.defi.success", failure: "ch3.defi.failure" },
};

/** Le 3 ne passe pas : Mado a suivi le Trèfle au 1er pli et en a encore. Garder le 10♦ pour le dernier pli. */
export const CH3_CHALLENGE_UNSAFE_THREE: AcademyScene = {
  id: "ch3-challenge-unsafe-three",
  seats: TABLE,
  deal: [
    ["10♦", "6♥", "3♣", "10♣", "10♥"],
    ["5♥", "9♦", "4♣", "7♣", "5♣"],
    ["4♦", "6♣", "6♦", "7♠", "7♦"],
  ],
  firstLeader: 1,
  history: [
    ["4♣", "6♣", "10♣"], // Mado et Ya suivent le Trèfle
    ["10♥", "5♥", "4♦"], // Ya n'a pas de Cœur
  ],
  actions: [],
  open: { bots: "smart", solution: ["6♥", "3♣", "10♦"], coach: { hint: "ch3.defi.hintUnsafe" } },
  goal: "winRound",
  coach: { intro: ["ch3.defi.intro"], success: "ch3.defi.success", failure: "ch3.defi.failure" },
};

export const CH3_CHALLENGES: AcademyScene[] = [CH3_CHALLENGE_SAFE_THREE, CH3_CHALLENGE_UNSAFE_THREE];

/** Chapitre 4, geste 1 — effet direct : l'Éclair fait compter ton 8♥ pour 10. */
export const CH4_DIRECT: AcademyScene = {
  id: "ch4-direct",
  seats: TABLE,
  deal: [
    ["8♥", "4♠", "5♣", "6♦", "7♠"],
    ["9♥", "10♣", "3♦", "6♠", "5♦"],
    ["4♥", "7♣", "8♦", "3♣", "10♠"],
  ],
  firstLeader: 1,
  equipped: { 0: ["eclair_mfoundi"] },
  goal: "winTrick",
  actions: [
    { seat: 1, card: "9♥" },
    { seat: 2, rule: "smart" },
    { seat: 0, power: "eclair_mfoundi", coach: { before: ["ch4.direct.intro"], wrong: { default: "ch4.direct.wrong" } } },
    { seat: 0, card: "8♥", coach: { before: ["ch4.direct.joue"] } },
  ],
  coach: { success: "ch4.direct.success" },
};

/** Chapitre 4, geste 2 — pouvoir ciblé : Coupe-Circuit force Ya à jouer son 4♠. */
export const CH4_TARGETED: AcademyScene = {
  id: "ch4-targeted",
  seats: TABLE,
  deal: [
    ["9♠", "3♥", "5♦", "6♣", "7♥"],
    ["8♠", "4♦", "9♣", "3♣", "10♥"],
    ["10♠", "4♠", "6♥", "7♦", "5♣"],
  ],
  firstLeader: 0,
  equipped: { 0: ["coupe_circuit"] },
  goal: "winTrick",
  actions: [
    { seat: 0, power: "coupe_circuit", target: 2, coach: { before: ["ch4.cible.intro"], wrong: { target: "ch4.cible.wrongTarget", default: "ch4.cible.wrong" } } },
    { seat: 0, card: "9♠", coach: { before: ["ch4.cible.joue"] } },
    { seat: 1, rule: "smart" },
    // Ya jouerait son 10♠ : la restriction impose sa plus faible carte.
    { seat: 2, rule: "smart", coach: { after: "ch4.cible.yaForcee" } },
  ],
  coach: { success: "ch4.cible.success" },
};

/** Chapitre 4, geste 3 — choix de cartes : Troc Ciblé change ton 4♦ contre le 10♥ de la pioche. */
export const CH4_CHOICE: AcademyScene = {
  id: "ch4-choice",
  seats: TABLE,
  deal: [
    ["4♦", "3♠", "5♣", "6♠", "7♣"],
    ["9♥", "8♣", "3♦", "10♠", "6♦"],
    ["5♥", "7♦", "8♠", "9♣", "4♣"],
  ],
  firstLeader: 1,
  deckTop: ["10♥"],
  equipped: { 0: ["troc_cible"] },
  goal: "winTrick",
  actions: [
    { seat: 1, card: "9♥" },
    { seat: 2, rule: "smart" },
    { seat: 0, power: "troc_cible", choose: { give: ["4♦"] }, coach: { before: ["ch4.choix.intro"], wrong: { choice: "ch4.choix.wrongChoice", default: "ch4.choix.wrong" } } },
    { seat: 0, card: "10♥", coach: { before: ["ch4.choix.joue"] } },
  ],
  coach: { success: "ch4.choix.success" },
};

/** Chapitre 4, geste 4 — défense : le Bouclier arrête le Coupe-Circuit de Mado au pli suivant. */
export const CH4_DEFENSE: AcademyScene = {
  id: "ch4-defense",
  seats: TABLE,
  deal: [
    ["9♠", "4♠", "5♦", "3♥", "6♣"],
    ["10♦", "8♠", "7♥", "3♣", "4♦"],
    ["7♠", "6♦", "9♣", "10♣", "5♥"],
  ],
  firstLeader: 0,
  equipped: { 0: ["bouclier_village"], 1: ["coupe_circuit"] },
  goal: "winTrick",
  actions: [
    // Pli 1 : un pouvoir ne s'active qu'à son tour, tu te protèges avant l'attaque.
    { seat: 0, power: "bouclier_village", coach: { before: ["ch4.defense.intro"], wrong: { default: "ch4.defense.wrong" } } },
    { seat: 0, card: "5♦", coach: { before: ["ch4.defense.lance"] } },
    { seat: 1, rule: "smart" },
    { seat: 2, rule: "smart" },
    // Pli 2 : Mado a gagné, elle attaque avant de lancer.
    { seat: 1, power: "coupe_circuit", target: 0, coach: { after: "ch4.defense.bloque" } },
    { seat: 1, card: "8♠" },
    { seat: 2, rule: "smart" },
    { seat: 0, card: "9♠", coach: { before: ["ch4.defense.joue"] } },
  ],
  coach: { success: "ch4.defense.success" },
};

export const ACADEMY_SCENES: AcademyScene[] = [
  CH1_FOLLOW, CH2_LEAD, CH3_LAST_TRICK, CH3_WHAT_IF, ...CH3_CHALLENGES,
  CH4_DIRECT, CH4_TARGETED, CH4_CHOICE, CH4_DEFENSE,
];
