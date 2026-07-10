/* ═══════════════ Types partagés du jeu Njambo ═══════════════ */

export interface Card {
  rank: string;
  value: number;
  suit: string;
  color: string;
  id: string;
  effectiveValue?: number;
  effectiveSuit?: string;
  powerTag?: PowerCardId;
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
  /** Cartes pouvoir équipées pour cette partie */
  equippedPowers?: PowerCardId[];
  /** État d'activation des cartes pouvoir en jeu */
  powerActivations?: PowerCardActivation[];
}

export interface TrickPlay {
  playerIdx: number;
  card: Card;
}

export type Screen = "menu" | "setup" | "table";
export type SceneName =
  | "splashscreen" | "menu" | "setup" | "table" | "result"
  | "bot_setup" | "online_setup" | "friends_invite" | "lobby"
  | "profile" | "leaderboard" | "friends" | "options" | "history"
  | "players" | "friend_requests" | "notifications" | "messages" | "chat" | "public_profile"
  | "power_shop" | "power_collection"
  | "rules";
export type Phase = "idle" | "dealing" | "turns" | "trickEnd" | "result";
export type BotDifficulty = "easy" | "normal" | "hard";
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
  /** Monnaie premium (cauris) pour acheter des cartes pouvoir */
  cauris?: number;
  /** Inventaire des cartes pouvoir (cardId → quantité) */
  powerInventory?: PowerCardInventory;
  /** Cartes pouvoir équipées pour la prochaine partie (max 3) */
  equippedPowers?: PowerCardId[];
}

/* ───── Cartes Pouvoir ───── */

export type PowerCardId =
  | "oeil_sorcier"
  | "pluie_etoiles"
  | "vent_nord"
  | "benediction_chef"
  | "coupe_circuit"
  | "sable_temps"
  | "bouclier_village"
  | "tambour_appel"
  | "cauris_chanceux"
  | "main_griot"
  | "eclair_mfoundi"
  | "totem_ancetres"
  | "masque_bluffeur"
  | "filet_pecheur"
  | "marche_nuit"
  | "cri_chef"
  | "feu_camp"
  | "pagne_changeant";

export type PowerCategory = "offensive" | "defense" | "score" | "tactical" | "perturbation" | "economy";
export type PowerRarity = "common" | "rare" | "epic" | "legendary";
export type PowerTargetMode = "none" | "self" | "opponent";

export interface PowerCardDef {
  id: PowerCardId;
  name: string;
  category: PowerCategory;
  /** Nom de l'icône dans NjamboIcon */
  icon: string;
  tone: "gold" | "teal" | "pink" | "cobalt";
  rarity: PowerRarity;
  targetMode: PowerTargetMode;
  art: string;
  activationTitle: string;
  activationText: string;
  description: string;
  /** Coût d'achat en cauris */
  costCauris: number;
  /** Coût d'achat alternatif en FCFA */
  costFcfa: number;
}

/** Carte pouvoir possédée par un joueur (cardId → quantité) */
export interface PowerCardInventory {
  [cardId: string]: number;
}

/** Cartes pouvoir équipées pour une partie (max 3) */
export type EquippedPowers = PowerCardId[];

/** Effet de pouvoir actif pendant une partie */
export interface ActivePowerEffect {
  cardId: PowerCardId;
  /** playerIdx (UI) de l'activateur */
  activatedBy: number;
  /** Pli concerné par l'effet */
  scopeTrickNo: number;
  targetIdx?: number;
  scoreMultiplier?: number;
  potBonus?: number;
  conditionalPotBonus?: boolean;
  refundOnLoss?: number;
  shield?: boolean;
  preventDoublePenalty?: boolean;
  cancelReveal?: boolean;
  valueBonus?: number;
  suitOverride?: boolean;
}

/** Activation d'une carte pouvoir en cours de partie */
export interface PowerCardActivation {
  cardId: PowerCardId;
  /** UID du joueur qui active */
  activatedByUid: string;
  /** UID du joueur ciblé (ex: Œil du Sorcier) */
  targetUid?: string;
  /** Pli au moment de l'activation */
  trickNo: number;
  /** La carte a-t-elle été consommée ? */
  used: boolean;
  /** Identifiant anti-replay (crypto UUID) */
  playId: string;
  blockedByCardId?: PowerCardId;
  consumedCardIds?: PowerCardId[];
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

export interface PlayerStats {
  played: number;
  won: number;
  bestWin: number;
}

export interface OnlinePlayerProfile {
  uid: string;
  name: string;
  emoji: string;
  balance: number;
  online: boolean;
  lastSeen: number;
  stats: PlayerStats;
  /** Timestamp (ms) de la dernière réclamation du bonus quotidien */
  lastBonusAt?: number;
}

export type PublicPlayerProfile = OnlinePlayerProfile;

export interface SocialUserLite {
  uid: string;
  name: string;
  emoji: string;
}

export interface SocialTarget {
  playerUid?: string;
  conversationId?: string;
  peerUid?: string;
  peerName?: string;
  peerEmoji?: string;
}

export interface SocialFriendEntry extends SocialUserLite {
  online: boolean;
  lastSeen: number;
  createdAt: number;
}

export interface FriendRequest {
  id: string;
  fromUid: string;
  fromName: string;
  fromEmoji: string;
  toUid: string;
  toName: string;
  toEmoji: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  createdAt: number;
  updatedAt: number;
}

export interface NotificationEntry {
  id: string;
  type: "friend_request" | "friend_accept" | "room_invite" | "message";
  actorUid: string;
  actorName: string;
  actorEmoji: string;
  title: string;
  body: string;
  read: boolean;
  roomId?: string;
  conversationId?: string;
  createdAt: number;
}

export interface ConversationEntry {
  id: string;
  participants: string[];
  participantMeta: Record<string, { name: string; emoji: string }>;
  lastMessage: string;
  lastMessageAt: number;
  unreadBy?: Record<string, boolean>;
}

export interface ChatMessage {
  id: string;
  fromUid: string;
  text: string;
  createdAt: number;
}

export interface MatchHistoryEntry {
  id: string;
  mode: GameMode;
  stake: number;
  gain: number;
  won: boolean;
  winnerName: string;
  playersCount: number;
  resultType: ResultType;
  doubles: boolean;
  roomId?: string;
  createdAt: number;
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
  roomType?: "online" | "friends";
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
  hands: Record<string, Card[]>; // uid → main (deprecated: use hands_private subcollection)
  deck?: Card[];
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
  updatedAt: unknown; // number or serverTimestamp()
  startedAt: unknown; // number or serverTimestamp()
  /** UID du joueur actuellement autorisé à agir comme hôte (rotation) */
  currentGameHost?: string;
  /** Cartes pouvoir équipées par joueur (uid → max 3 cartes) */
  equippedPowers?: Record<string, PowerCardId[]>;
  /** Activations de pouvoir en cours de partie */
  powerActivations?: PowerCardActivation[];
  /** Activation de pouvoir en attente de validation par l'hôte */
  pendingPowerActivation?: {
    cardId: PowerCardId;
    activatedByUid: string;
    targetUid?: string;
    equippedPowersSnapshot?: PowerCardId[];
    trickNo: number;
    playId: string;
    createdAt: number;
  } | null;
  /** Dernière activation confirmée (anti-replay) */
  lastPowerActivation?: {
    cardId: PowerCardId;
    activatedByUid: string;
    playId: string;
  } | null;
}

/** Document de mise à jour de solde (settlement via balance_updates subcollection) */
export interface BalanceUpdateDoc {
  uid: string;
  oldBalance: number;
  newBalance: number;
  gain: number;
  roomId: string;
  roundId: string;
  createdAt: number;
}

/** Document de demande de prise de contrôle d'hôte */
export interface TakeoverRequestDoc {
  uid: string;
  roomId: string;
  timestamp: number;
  agreedBy: string[]; // uids des joueurs qui ont accepté
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
  /** Effets de pouvoir actifs sur le pli courant */
  activePowerEffects?: ActivePowerEffect[];
  /** Révélation temporaire de main (Œil du Sorcier) : playerIdx → Cartes révélées */
  revealedHands?: Record<number, Card[]>;
}

/** Interface du sync adapter (bot ou en ligne) */
export interface GameSyncActions {
  /** Démarrer la partie */
  start: () => void;
  /** Lancer la manche suivante */
  nextRound: () => void;
  /** Envoyer une action (le TableScreen appelle ça) */
  playCard: (cardIdx: number) => void;
  /** Activer une carte pouvoir (cardId + cible optionnelle) */
  usePowerCard: (cardId: PowerCardId, targetIdx?: number) => void;
  /** Nettoyer les ressources */
  destroy: () => void;

  /** Événements entrants — retourne une fonction de désabonnement */
  onStateUpdate: (cb: (state: GameState) => void) => () => void;
  onPlayCard: (cb: (play: { playerIdx: number; cardIdx: number; card: Card; playId?: string }) => void) => () => void;
  onTrickEnd: (cb: (winnerIdx: number) => void) => () => void;
  onRoundEnd: (cb: (result: Result) => void) => () => void;
  onTimerTick: (cb: (seconds: number) => void) => () => void;
  /** Événement : une carte pouvoir a été activée */
  onPowerActivated: (cb: (activation: PowerCardActivation) => void) => () => void;
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
    /** Beat de « pose » après l'atterrissage d'une carte, avant l'annonce (ms) */
    landSettle: number;
    /** Temps de lecture du FX d'une carte pouvoir avant que le bot ne joue (ms) */
    powerBeat: number;
  };
  economy: {
    /** Montant du bonus quotidien (F) */
    dailyBonus: number;
    /** Délai avant nouvelle réclamation (heures) */
    bonusCooldownH: number;
    /** Plancher anti-faillite : solde minimal garanti pour rejouer */
    brokeFloor: number;
  };
}
