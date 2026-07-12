/**
 * ═══════════════ Modèle déclaratif des cartes pouvoir ═══════════════
 *
 * Une carte pouvoir = un module `config/powers/<id>.ts` exportant un
 * `PowerModule` : sa définition boutique (`PowerCardDef`) + son `PowerScript`.
 * Le script est de la DONNÉE pure, interprétée par deux runtimes communs :
 *
 *  - engine/power/interpret.ts + apply.ts : mutations d'état (côté syncs,
 *    local et host Firestore) ;
 *  - components/power/PowerFxOrchestrator : séquence d'animation (chaque client).
 *
 * Ajouter une carte demain = créer son module + 1 littéral `PowerCardId`
 * + 1 ligne dans `config/powers/index.ts`. Zéro modification du moteur,
 * des syncs ou de TableScreen.
 *
 * Le schéma d'une activation suit toujours les 5 étapes :
 *  1. ciblage (`TargetSpec`) — 1 joueur, plusieurs, tous, au hasard, ou aucun ;
 *  2. mouvement de cartes (`moveCards` = vrai déplacement / `revealHand`,
 *     `highlightCard` = affichage seul) ;
 *  3. blocage de cartes d'un joueur (`restrictNextPlay`) ;
 *  4. timer gelé / temps ajouté ou retiré (`timerFreeze`, `timerDelta`) ;
 *  5. boost virtuel d'une carte (`boostNextCard`).
 */

import type { ComponentType } from "react";
import type { Card, GameState, PowerCardDef, PowerCardId } from "@/types/game";

/**
 * Référence de joueur ABSTRAITE — résolue en « seat » (index dans l'ordre du
 * jeu) au moment de l'activation. Les syncs convertissent seat↔idx (local)
 * et seat↔uid (Firestore) ; le script n'en sait rien.
 */
export type PlayerRef = "self" | "target" | "each_target" | "all_opponents" | "all";

/** Étape 1 du schéma : le ciblage (qui choisit, combien). */
export interface TargetSpec {
  count: "none" | "one" | "many" | "all_opponents" | "random_opponent";
  /** "activator" → modale de choix ; "engine" → résolu par le moteur (ex. random). */
  chooser?: "activator" | "engine";
  /** Pour count: "many" — nombre maximum de cibles. */
  max?: number;
  /** Autorise à se cibler soi-même (défaut false). */
  allowSelf?: boolean;
}

/** Sélecteur de cartes dans une collection (main, dépôt, pioche, révélation). */
export type CardSelector =
  | { kind: "weakest" }
  | { kind: "strongest" }
  | { kind: "all" }
  | { kind: "bySuit"; suit: "led" | string }
  | { kind: "byValue"; min?: number; max?: number }
  | { kind: "topOfDeck" }
  | { kind: "random" }
  | { kind: "byId"; cardId: string }
  /** Marché de Nuit : 1re carte de la pioche STRICTEMENT meilleure que la plus faible. */
  | { kind: "firstBetterThanWeakest" }
  /** Main du Griot : meilleure carte légale (gagnante si possible, sinon plus basse légale). */
  | { kind: "bestLegal" }
  /** Carte désignée par clic — voir ChoiceRequest, résolue via PowerChoices. */
  | { kind: "chosen"; choiceId: string };

/** Une zone physique de la table, du point de vue d'un script. */
export type ZoneRef =
  | { zone: "hand"; player: PlayerRef }
  | { zone: "deposit"; player: PlayerRef }
  | { zone: "deck" }
  | { zone: "reveal" };

/** Conditions d'activation déclaratives (remplacent les branches en dur de canActivatePowerCard). */
export type PowerCondition =
  | { kind: "deckNotEmpty" }
  | { kind: "isTrickLeader"; beforeAnyPlay: true }
  | { kind: "ledSuitKnown" }
  | { kind: "activatorLacksLedSuit" };

/**
 * Tags DÉRIVÉS automatiquement d'un script (jamais écrits à la main) :
 *  - "targeted"     ⇐ target.count ≠ "none"
 *  - "reveal"       ⇐ contient un op revealHand
 *  - "restrict"     ⇐ contient un op restrictNextPlay
 *  - "timer_attack" ⇐ timerFreeze/timerDelta négatif sur un autre joueur
 * Un `grantShield` déclare quels tags il intercepte via `blocks`.
 */
export type PowerScriptTag = "targeted" | "reveal" | "restrict" | "timer_attack";

/** Volet MOTEUR d'une étape — mutations appliquées atomiquement (host/local). */
export type PowerOp =
  /** Étape 2 : VRAI déplacement de cartes (mutation d'état).
   *  `swap` décrit l'échange bidirectionnel (ex. Vent du Nord : la plus
   *  faible part à la pioche, une carte de pioche arrive en main). */
  | {
      op: "moveCards";
      from: ZoneRef;
      select: CardSelector;
      to: ZoneRef;
      swap?: { incoming: CardSelector };
    }
  /** Étape 2 bis : AFFICHAGE seul, aucune mutation. */
  | { op: "revealHand"; player: PlayerRef; durationMs: number }
  | { op: "highlightCard"; player: PlayerRef; select: CardSelector; durationMs: number }
  /** Échange le même nombre de cartes entre deux mains. */
  | {
      op: "exchangeCards";
      left: PlayerRef;
      leftSelect: CardSelector;
      right: PlayerRef;
      rightSelect: CardSelector;
    }
  /** Bloque une carte légale au prochain tour seulement si assez d'alternatives existent. */
  | {
      op: "blockNextLegalCard";
      player: PlayerRef;
      select: CardSelector;
      minLegalChoices?: number;
    }
  /** Étape 3 : blocage — force ("forceSelector") ou verrouille ("lockSelector")
   *  les cartes matchées par `select` au prochain tour du joueur. */
  | {
      op: "restrictNextPlay";
      player: PlayerRef;
      mode: "forceSelector" | "lockSelector";
      select: CardSelector;
    }
  /** Étape 4 : timers. */
  | { op: "timerFreeze"; player: PlayerRef; durationMs: number }
  | { op: "timerDelta"; player: PlayerRef; seconds: number }
  /** Étape 5 : boost virtuel de la PROCHAINE carte jouée. */
  | { op: "boostNextCard"; player: PlayerRef; valueBonus?: number; suitOverride?: "led" }
  /** Effets persistants / économie. */
  | { op: "potBonus"; amount: number; when: "now" | "winTrick" }
  | { op: "potMultiplier"; factor: number; when: "winTrick" }
  | { op: "grantShield"; player: PlayerRef; blocks: PowerScriptTag[] }
  | { op: "refundOnLoss"; player: PlayerRef; ratio: number }
  | { op: "preventDoublePenalty"; player: PlayerRef };

/**
 * Étape interactive : la table passe en « mode sélection » et attend un clic
 * sur une carte de la surface indiquée. Le choix voyage dans PowerChoices
 * (validé par le host contre `filter` — anti-triche).
 */
export interface ChoiceRequest {
  /** Clé du choix dans PowerChoices. */
  id: string;
  surface: "hand-self" | "reveal" | "deposit";
  /** Pour deposit/reveal : à qui appartient la collection. */
  player?: PlayerRef;
  /** Cartes cliquables (les autres sont grisées). Absent = toutes. */
  filter?: CardSelector;
  /** Défaut : 2 × TABLE_READABILITY_MS. */
  timeoutMs?: number;
  /** "cancel" = activation annulée ; "auto" = le moteur choisit via filter. */
  onTimeout: "cancel" | "auto";
  /** Nombre de cartes sélectionnables. Absent = exactement une. */
  count?: { min: number; max: number };
}

/** Choix de cartes faits par l'activateur (choiceId → carte désignée). */
export interface PowerCardChoice {
  cardId: string;
  cardIdx: number;
}
export type PowerChoices = Record<string, PowerCardChoice | PowerCardChoice[]>;

/**
 * Pointeur vers les cartes CALCULÉES par le moteur dans PowerResolved
 * ("resolved:outgoing", "resolved:incoming", "resolved:highlight"…) —
 * sinon un CardSelector réévalué à l'affichage.
 */
export type ResolvedCardsRef = `resolved:${string}` | CardSelector;

/** Volet ANIMATION d'une étape — rejoué par l'orchestrateur sur chaque client. */
export type PowerFxTone = "gold" | "pink" | "teal" | "cobalt";
export type PowerFxIntensity = "subtle" | "standard" | "spectacular";
export type PowerFxPreset =
  | "mystic"
  | "wind"
  | "frost"
  | "time"
  | "goldRain"
  | "shield"
  | "revealMist"
  | "lock"
  | "boost";

export interface AnimFxSpec {
  /** Surcharge facultative ; absent = preset dérivé automatiquement du cue. */
  preset?: PowerFxPreset;
  tone?: PowerFxTone;
  intensity?: PowerFxIntensity;
}

type AnimCueCore =
  /** Vol de carte(s) origine→destination. mode "move" = accompagne une vraie
   *  mutation (l'état est retardé le temps du vol) ; "display" = purement visuel. */
  | {
      cue: "flyCards";
      from: ZoneRef;
      to: ZoneRef;
      cards: ResolvedCardsRef;
      mode: "move" | "display";
      hidden?: boolean;
    }
  /** Overlay de révélation (type Œil du Sorcier). `pick` le rend cliquable. */
  | { cue: "revealOverlay"; player: PlayerRef; durationMs?: number; pick?: ChoiceRequest }
  | {
      cue: "highlightHandCard";
      player: PlayerRef;
      cards: ResolvedCardsRef;
      style: "recommend" | "swapped" | "locked" | "boosted";
      durationMs?: number;
    }
  | {
      cue: "timerFx";
      player: PlayerRef;
      kind: "freeze" | "gain" | "loss";
      seconds?: number;
      durationMs?: number;
    }
  | { cue: "deckPulse" }
  | { cue: "potFlash"; amountLabel?: string }
  /** Aura persistante sur l'avatar (bouclier, masque, totem, chance…). */
  | { cue: "avatarAura"; player: PlayerRef; style: "shield" | "mask" | "totem" | "lucky" }
  /** Réaction de table. Placeholders : "{activator}" et "{target}" → noms des joueurs. */
  | { cue: "toast"; text: string; tone?: "gold" | "teal" | "pink" };

export type AnimCue = AnimCueCore & {
  fx?: AnimFxSpec;
  /** Pause de lisibilité après ce cue, sans bloquer les particules décoratives. */
  afterMs?: number;
};

export interface PowerStep {
  /** Étape interactive — bloque jusqu'au clic ou au timeout. */
  choice?: ChoiceRequest;
  /** Mutations moteur de l'étape. */
  ops?: PowerOp[];
  /** Cues d'animation de l'étape. */
  anim?: AnimCue[];
}

export interface PowerScript {
  id: PowerCardId;
  /** Étape 1 : ciblage (attente du choix du joueur si chooser: "activator"). */
  target: TargetSpec;
  conditions?: PowerCondition[];
  steps: PowerStep[];
  /** Timings surchargés par carte ; défauts dérivés de TABLE_READABILITY_MS. */
  beats?: { introMs?: number; stepGapMs?: number };
}

/** Props d'un overlay custom par carte (rare — la plupart utilisent les visuels génériques). */
export interface PowerOverlayProps {
  def: PowerCardDef;
  targetSeats: number[];
  onDone: () => void;
}

/** Un module de carte pouvoir : définition boutique + script + rendu custom optionnel. */
export interface PowerModule {
  def: PowerCardDef;
  script: PowerScript;
  /** Composant lazy pour un rendu d'activation vraiment exotique (optionnel). */
  renderOverlay?: ComponentType<PowerOverlayProps>;
  /** Carte de DEV : jamais en boutique, équipable seulement via NEXT_PUBLIC_DEV_*. */
  dev?: boolean;
}

/**
 * Payload RÉSOLU par le moteur, transporté dans PowerCardActivation : tous
 * les clients animent depuis cette source de vérité sans recalculer (il
 * remplace la détection par diff type swapDetectRef).
 * NB : `moves` ne doit exposer que des cardIds déjà visibles du client
 * destinataire — pour une main adverse, vol `hidden` sans identités.
 */
export interface PowerResolved {
  /** Cibles résolues (y compris tirage random côté moteur). */
  targetSeats: number[];
  moves?: {
    key: string;
    from: ZoneRef;
    to: ZoneRef;
    cardIds: string[];
    /** Instantanés pris AVANT la mutation. Ils permettent à l'animation de
     *  rendre la vraie carte même lorsqu'elle n'existe pas encore (ou plus)
     *  dans l'état React affiché. */
    cardSnapshots?: Card[];
    /** Indices physiques dans les collections avant/après mutation. */
    fromCardIndexes?: number[];
    toCardIndexes?: number[];
    hiddenFor?: "others";
  }[];
  highlight?: { seat: number; cardIdx: number; cardId: string };
  /** false → aucun effet concret : la carte n'est PAS consommée. */
  impact: boolean;
}

/** Cartes du payload résolu, indexées par clé "outgoing"/"incoming"/… */
export type ResolvedCards = Record<string, Card[]>;

/**
 * Contexte d'exécution d'un script — tout est exprimé en SEATS (index dans
 * l'ordre du jeu). Les syncs convertissent seat↔idx (local) et seat↔uid
 * (Firestore) avant d'appeler le moteur.
 */
export interface PowerRunContext {
  state: GameState;
  /** Seat de l'activateur. */
  activatedBy: number;
  /** Cibles résolues (seats) — vide si le script ne cible personne. */
  targets: number[];
  deck: Card[];
  maxValue: number;
  choices?: PowerChoices;
}
