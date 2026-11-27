/* ═══════════════ Académie : modèle d'une scène ═══════════════
   Une scène = une situation de jeu figée, rejouable à l'identique : donne
   complète, plis déjà joués, puis les coups de la scène dans l'ordre de la
   table. Le siège 0 est toujours le joueur. PUR : aucun DOM ni réseau. */

import type { PowerCardId } from "../../types/game";

/** Carte notée comme son identifiant dans le jeu : « 9♥ », « 10♠ ». */
export type CardCode = string;

/** Clé d'une réplique du coach (textes dans data/academy/fr.ts). */
export type CoachKey = string;

/** Choix d'un bot quand la scène ne lui impose pas de carte précise. */
export type BotRule =
  /** Plus petite carte légale. */
  | "lowest"
  /** Plus forte carte légale. */
  | "highest"
  /** Gagne le pli au plus juste s'il le peut, sinon plus petite carte légale. */
  | "smart";

export interface AcademySeat {
  name: string;
  /** Graine de l'avatar (comme les bots du jeu). */
  emoji: string;
}

export interface SceneCoach {
  /** Répliques dites avant que le coup soit attendu (dans l'ordre). */
  before?: CoachKey[];
  /** Réplique dite une fois le coup joué. */
  after?: CoachKey;
  /** Indice si le joueur hésite (A2 : au bout de 5 s). */
  hint?: CoachKey;
  /** Mode strict : réplique quand le joueur se trompe. Clés : une carte (« 9♥ »),
   *  `power` (mauvais pouvoir), `target` (mauvaise cible), `choice` (mauvaises
   *  cartes choisies), sinon `default`. */
  wrong?: Partial<Record<CardCode | "default" | "power" | "target" | "choice", CoachKey>>;
}

/** Coup d'un siège pendant la scène. */
export type SceneAction =
  /** Carte imposée : le bot la joue, le joueur doit la jouer (mode strict). */
  | { seat: number; card: CardCode; coach?: SceneCoach }
  /** Bot seulement : carte choisie par une règle (s'adapte au coup du joueur). */
  | { seat: number; rule: BotRule; coach?: SceneCoach }
  /** Joueur seulement, mode libre (défi) : toute carte légale ; `solution` gagne. */
  | { seat: 0; free: true; solution: CardCode; coach?: SceneCoach }
  /** Activation d'une carte Pouvoir, avant la carte du même siège. Pour le joueur,
   *  c'est un geste attendu (mode strict) : bonne carte, bonne cible, bons choix. */
  | {
      seat: number;
      power: PowerCardId;
      /** Siège visé (pouvoirs ciblés). */
      target?: number;
      /** Cartes choisies pour les étapes interactives (choiceId → cartes). */
      choose?: Record<string, CardCode[]>;
      coach?: SceneCoach;
    };

export type SceneGoal =
  /** Le joueur doit gagner le dernier pli de la scène. */
  | "winTrick"
  /** Le dernier pli de la scène est le 5e : le joueur doit gagner la manche. */
  | "winRound"
  /** Rejeu à regarder : aucun coup du joueur n'est attendu. */
  | "watch";

export interface AcademyScene {
  id: string;
  /** Sièges dans l'ordre de la table ; le siège 0 est le joueur. */
  seats: AcademySeat[];
  /** Main complète de chaque siège au début de la manche (avant le 1er pli). */
  deal: CardCode[][];
  /** Siège qui lance le 1er pli de la manche. */
  firstLeader: number;
  /** Plis déjà joués avant la scène, chacun dans l'ordre de pose (le meneur
   *  d'abord) ; le vainqueur d'un pli lance le suivant. */
  history?: CardCode[][];
  /** Dessus de la pioche, première carte en tête ; le reste du paquet suit. */
  deckTop?: CardCode[];
  /** Cartes Pouvoir équipées, par siège. */
  equipped?: Partial<Record<number, PowerCardId[]>>;
  /** Coups de la scène, dans l'ordre de la table. */
  actions: SceneAction[];
  goal: SceneGoal;
  /** Répliques d'ouverture, puis de fin (`done` : fin d'un rejeu à regarder). */
  coach?: { intro?: CoachKey[]; success?: CoachKey; failure?: CoachKey; done?: CoachKey };
}

/** Coup attendu du joueur, tel que le calque du coach (A2) l'affiche. */
export type YourExpectation =
  | { kind: "card"; card: CardCode; coach?: SceneCoach }
  | { kind: "free"; solution: CardCode; coach?: SceneCoach }
  | { kind: "power"; power: PowerCardId; target?: number; choose?: Record<string, CardCode[]>; coach?: SceneCoach };

export type SceneOutcome = "success" | "failure" | "done";
