/* ═══════════════ Types partagés du jeu Njambo ═══════════════ */

// Import type-only (aucun cycle à l'exécution) : le modèle de script générique
// des cartes pouvoir vit dans engine/power/types.ts.
import type {
  PowerChoices,
  PowerFxPreset,
  PowerFxTone,
  PowerResolved,
  PowerScriptTag,
} from "@/engine/power/types";

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
  | "pagne_changeant"
  | "troc_cible"
  | "pacte_mains"
  | "sceau_entrave";

export type PowerCategory = "offensive" | "defense" | "score" | "tactical" | "perturbation" | "economy";
export type PowerRarity = "common" | "rare" | "epic" | "legendary";
export type PowerTargetMode = "none" | "self" | "opponent";

/**
 * Taxonomie des ÉLÉMENTS ANIMÉS qu'une carte pouvoir influence — MÉTADONNÉE
 * descriptive (boutique, filtres) uniquement. Le comportement réel (logique
 * ET animations) est désormais porté par le PowerScript de chaque carte
 * (config/powers/<id>.ts), interprété par engine/power (mutations) et
 * PowerFxOrchestrator (cues d'animation). Plus aucun code runtime ne lit ces
 * tags.
 *
 * Axes couverts (main ↔ dépôt ↔ pioche, cible précise ou non, timer, pot,
 * blocage futur, économie de fin de manche) :
 *
 *  - hand_self_mutate    : une carte de TA main est remplacée (par la pioche).
 *  - hand_self_recommend : une carte de TA main est mise en évidence (suggestion).
 *  - hand_self_boost     : ta PROCHAINE carte jouée sera transformée (valeur/couleur)
 *                          — se voit sur le DÉPÔT une fois jouée (badge « boosté »).
 *  - hand_target_reveal  : révèle la main d'un adversaire PRÉCIS (overlay).
 *  - hand_target_restrict: force un adversaire PRÉCIS à jouer une carte précise
 *                          (sa plus faible légale) à son prochain tour.
 *  - deposit_from_hand   : (RÉSERVÉ, aucune carte encore) une carte de main part
 *                          directement au dépôt sans passer par le tour normal.
 *  - hand_from_deposit   : (RÉSERVÉ, aucune carte encore) une carte du dépôt
 *                          revient dans une main — ex. futures cartes de rappel.
 *  - hand_swap_players   : (RÉSERVÉ, aucune carte encore) échange de cartes
 *                          ENTRE deux joueurs (pas via la pioche).
 *  - timer_self          : modifie TON timer.
 *  - timer_target        : modifie le timer d'un adversaire PRÉCIS.
 *  - timer_all_opponents : modifie le timer de TOUS les adversaires.
 *  - pot_bonus           : bonus/multiplicateur au pot (visible à la résolution du pli).
 *  - future_block        : intercepte la PROCHAINE activation ciblée/révélation
 *                          contre toi (bouclier, masque).
 *  - result_economy      : affecte le règlement de fin de manche (remboursement,
 *                          pénalité annulée) — visible sur l'écran de résultat.
 */
export type PowerAnimTag =
  | "hand_self_mutate"
  | "hand_self_recommend"
  | "hand_self_boost"
  | "hand_target_reveal"
  | "hand_target_restrict"
  | "deposit_from_hand"
  | "hand_from_deposit"
  | "hand_swap_players"
  | "timer_self"
  | "timer_target"
  | "timer_all_opponents"
  | "pot_bonus"
  | "future_block"
  | "result_economy";

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
  /** Éléments animés influencés — voir PowerAnimTag pour la taxonomie complète. */
  animTags: PowerAnimTag[];
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
  /** Tags de script interceptés par cet effet (moteur générique). Les champs
   *  legacy `shield`/`cancelReveal` restent renseignés pour compatibilité. */
  blocks?: PowerScriptTag[];
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
  /** Main révélée de la cible (Œil du Sorcier) — attachée LOCALEMENT à
   *  l'activateur uniquement (jamais écrite au doc partagé). */
  revealedHand?: Card[];
  /** Résultat résolu par le moteur générique (engine/power) — permet à tous
   *  les clients d'animer sans recalculer. Optionnel → rétrocompatible. */
  resolved?: PowerResolved;
  /** Choix de cartes faits par l'activateur (étapes interactives du script). */
  choices?: PowerChoices;
  /** Version du format script (absent = format legacy). */
  scriptVersion?: 1;
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
  /** Face visible pendant le vol (défaut : isYou). Permet les vols génériques
   *  des pouvoirs (pioche→main révélée, main→pioche cachée…). */
  faceUp?: boolean;
  /** Habillage mystique du vol, sans influence sur la logique de jeu. */
  fxPreset?: PowerFxPreset;
  fxTone?: PowerFxTone;
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
  /** Remboursement crédité au joueur local s'il perd avec Cauris Chanceux (F). */
  refund?: number;
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
    /** Choix de cartes de l'activateur (étapes interactives) — validés par l'hôte. */
    choices?: PowerChoices;
  } | null;
  /** Dernière activation confirmée (anti-replay) */
  lastPowerActivation?: {
    cardId: PowerCardId;
    activatedByUid: string;
    playId: string;
  } | null;
  /** Budget de secondes au démarrage du tour courant (peut être réduit par le
   *  Cri du Chef). Le timer client se cale dessus au lieu de `cfg.turnSeconds`. */
  turnStartSeconds?: number;
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
  /** Activer une carte pouvoir (cardId + cible optionnelle + choix de cartes
   *  pour les étapes interactives du script — clic générique). */
  usePowerCard: (cardId: PowerCardId, targetIdx?: number, choices?: PowerChoices) => void;
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
