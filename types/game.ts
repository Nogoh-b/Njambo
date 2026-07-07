/* ═══════════════ Types partagés du jeu Njambo ═══════════════ */

export interface Card {
  rank: string;
  value: number;
  suit: string;
  color: string;
  id: string;
}

/** Carte déposée sur le tapis : carte + métadonnées de positionnement aléatoire. */
export interface DepositedCard extends Card {
  dropRot?: number;
  dx?: number;
  dy?: number;
}

export interface Player {
  name: string;
  emoji: string;
  isYou: boolean;
  balance: number;
  hand: Card[];
  deposit: DepositedCard[];
}

export interface TrickPlay {
  playerIdx: number;
  card: Card;
}

export type Screen = "menu" | "setup" | "table";
export type SceneName =
  | "splashscreen" | "menu" | "setup" | "table" | "result"
  | "bot_setup" | "online_setup" | "friends_invite" | "lobby"
  | "profile" | "leaderboard" | "friends" | "options" | "history";
export type Phase = "idle" | "dealing" | "turns" | "trickEnd" | "result";
export type Panel = "leaderboard" | "friends" | "options" | "rules" | null;
export type GameMode = "online" | "friends" | "bot";

export type InstantReason = "flush" | "under21" | "exact21";
export type ResultType = "instant" | "lastTrick";

export interface Suit {
  s: string;
  color: string;
}

export interface Profile {
  name: string;
  emoji: string;
  balance: number;
}

export interface LeaderEntry {
  name: string;
  pts: number;
  emoji: string;
  you?: boolean;
}

export interface FriendEntry {
  name: string;
  emoji: string;
  online: boolean;
}

/** Carte en vol (main → dépôt). */
export interface Flight {
  key: string;
  card: Card;
  from: DOMRect;
  to: DOMRect;
  w: number;
  angle: number;
  dropRot: number;
  isYou: boolean;
}

/* ───── Résultat de partie (union discriminée par `type`) ───── */

export interface InstantWinCore {
  type: "instant";
  winnerIdx: number;
  reason: InstantReason;
  total: number;
  doubles: boolean;
}

export interface LastTrickWinCore {
  type: "lastTrick";
  winnerIdx: number;
  doubles: boolean;
  lastCard: Card;
}

/** Infos brutes produites par le moteur / resolveWin. */
export type WinInfo = InstantWinCore | LastTrickWinCore;

/** Résultat complet exposé à l'UI (gagnant + gain + infos de la victoire). */
export type Result = (InstantWinCore | LastTrickWinCore) & {
  winner: Player;
  gain: number;
  playersCount: number;
};

/* ───── Config du jeu (règles, vitesses d'animation) ───── */

/* ───── En ligne (Firebase — architecture préparatoire) ───── */

export interface AuthUser {
  uid: string;
  name: string;
  emoji: string;
  email?: string;
}

/** Joueur dans une salle (Firestore rooms/{roomId}) */
export interface RoomPlayer {
  uid: string;
  name: string;
  emoji: string;
  ready: boolean;
  balance: number;
  joinedAt: number;
}

/** Document salle Firestore rooms/{roomId} */
export interface RoomDoc {
  id: string;
  code: string;
  hostId: string;
  stake: number;
  status: "waiting" | "playing";
  maxPlayers: number;
  players: RoomPlayer[];
  playerUids?: string[];
  createdAt: number;
}

/** Document de tour Firestore rooms/{roomId}/game/{roundId} */
export interface GameDoc {
  roomId: string;
  roundId: string;
  phase: Phase;
  leaderIdx: number;
  turnIdx: number;
  trickNo: number;
  pot: number;
  balances?: Record<string, number>;
  playerMeta?: Record<string, { name: string; emoji: string }>;
  trickPlays: TrickPlay[];
  players: string[]; // uids dans l'ordre du jeu
  hands: Record<string, Card[]>; // uid → main
  deposits: Record<string, DepositedCard[]>;
  result: Result | null;
  dominantIdx?: number | null;
  pendingPlay?: {
    playerIdx: number;
    cardIdx: number;
    uid: string;
    playId: string;
    createdAt: number;
  } | null;
  lastPlay?: {
    playerIdx: number;
    cardIdx: number;
    card: Card;
    playId: string;
  } | null;
  rematch?: {
    readyUids: string[];
    deadlineAt: number;
    requestedAt: number;
  } | null;
  instantWinChecked: boolean;
  updatedAt: number;
  startedAt: number;
}

/** État synchronisé du jeu (consommé par TableScreen) */
export interface GameState {
  phase: Phase;
  trickNo: number;
  trickPlays: TrickPlay[];
  leaderIdx: number;
  turnIdx: number;
  pot: number;
  dominantIdx: number | null;
  banner: string;
  players: Player[];
}

/** Interface du sync adapter (bot ou en ligne) */
export interface GameSyncActions {
  /** Démarrer la partie */
  start: () => void;
  /** Lancer la manche suivante */
  nextRound: () => void;
  /** Envoyer une action (le TableScreen appelle ça) */
  playCard: (cardIdx: number) => void;
  /** Nettoyer les ressources */
  destroy: () => void;

  /** Événements entrants — retourne une fonction de désabonnement */
  onStateUpdate: (cb: (state: GameState) => void) => () => void;
  onPlayCard: (cb: (play: { playerIdx: number; cardIdx: number; card: Card; playId?: string }) => void) => () => void;
  onTrickEnd: (cb: (winnerIdx: number) => void) => () => void;
  onRoundEnd: (cb: (result: Result) => void) => () => void;
  onTimerTick: (cb: (seconds: number) => void) => () => void;
}

export interface GameConfig {
  ranks: { min: number; max: number };
  suits: Suit[];
  cardsPerPlayer: number;
  turnSeconds: number;
  startingBalance: number;
  stakes: number[];
  instantWin: {
    enabled: boolean;
    sumBelow: number;
    sumExactDoubles: number;
    flushWins: boolean;
    flushDoubles: boolean;
  };
  lastCardThreeDoubles: boolean;
  winnerPlaysLastNextRound: boolean;
  firstLeaderIndex: number;
  anim: {
    dealPerCard: number;
    dealFlight: number;
    dropFlight: number;
    trickPause: number;
  };
}
