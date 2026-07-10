import type { Card, GameState, PowerCardId } from "@/types/game";

/* ═══════════════ Cartes Pouvoir — Logique des effets ═══════════════
   Fonctions pures qui calculent les mutations produites par chaque
   carte pouvoir. Ces fonctions ne modifient pas l'état directement —
   elles retournent une description des changements à appliquer.
   Utilisées par LocalGameSync (bots) et FirestoreGameSync (online). */

/** Contexte d'activation d'une carte pouvoir. */
export interface PowerActivationContext {
  /** État courant du jeu (non muté). */
  state: GameState;
  /** playerIdx (UI) du joueur qui active la carte. */
  activatedBy: number;
  /** playerIdx (UI) du joueur ciblé, si applicable. */
  target?: number;
  /** Pioche disponible (cartes non distribuées), pour Vent du Nord. */
  deck?: Card[];
  /** Plafond de valeur pour une carte (typiquement 10). */
  maxValue?: number;
}

/** Durée de l'effet de révélation (ms). */
export const REVEAL_DURATION_MS = 5000;
/** Durée du gel du timer (ms). */
export const FREEZE_DURATION_MS = 10000;
/** Bonus de pot pour Pluie d'Étoiles. */
export const STAR_RAIN_BONUS = 200;

/** Résultat d'application d'une carte pouvoir : mutations à appliquer. */
export interface PowerEffectResult {
  /** Mains mutées (playerIdx → nouvelle main). */
  handsMutated?: Record<number, Card[]>;
  /** Révéler la main d'un joueur (Œil du Sorcier). */
  revealHand?: { playerIdx: number; durationMs: number };
  /** Forcer un joueur à jouer sa carte la plus faible au prochain pli. */
  forceLowestCard?: { playerIdx: number };
  /** Multiplicateur de score sur le pli en cours (Bénédiction du Chef). */
  trickScoreMultiplier?: number;
  /** Bonus de pot (Pluie d'Étoiles). */
  potBonus?: number;
  /** Geler le timer d'un joueur (Sable du Temps). */
  timerFreeze?: { playerIdx: number; durationMs: number };
  /** Nouvelle pioche après échange (Vent du Nord). */
  newDeck?: Card[];
}

/**
 * Applique une carte pouvoir et retourne les mutations à effectuer.
 * Fonction pure : ne modifie pas le contexte passé en paramètre.
 */
export function applyPowerCard(
  cardId: PowerCardId,
  ctx: PowerActivationContext,
): PowerEffectResult {
  const { state, activatedBy, target, deck } = ctx;
  const players = state.players;

  switch (cardId) {
    /* ── Œil du Sorcier : révéler la main adverse ── */
    case "oeil_sorcier": {
      if (target === undefined) return {};
      const targetPlayer = players[target];
      if (!targetPlayer) return {};
      return {
        revealHand: { playerIdx: target, durationMs: REVEAL_DURATION_MS },
      };
    }

    /* ── Coupe-Circuit : forcer la carte la plus faible ── */
    case "coupe_circuit": {
      if (target === undefined) return {};
      const targetPlayer = players[target];
      if (!targetPlayer) return {};
      return {
        forceLowestCard: { playerIdx: target },
      };
    }

    /* ── Bénédiction du Chef : doubler le score du pli ── */
    case "benediction_chef": {
      return {
        trickScoreMultiplier: 2,
      };
    }

    /* ── Pluie d'Étoiles : bonus de pot ── */
    case "pluie_etoiles": {
      return {
        potBonus: STAR_RAIN_BONUS,
      };
    }

    /* ── Vent du Nord : échanger une carte ── */
    case "vent_nord": {
      const me = players[activatedBy];
      if (!me || me.hand.length === 0) return {};
      if (!deck || deck.length === 0) return {};

      // Échange la carte la plus faible de la main contre une carte aléatoire de la pioche.
      const handCopy = [...me.hand];
      const weakestIdx = handCopy.reduce(
        (minIdx, c, i) => (c.value < handCopy[minIdx].value ? i : minIdx),
        0,
      );
      const oldCard = handCopy[weakestIdx];
      const [newCard, ...restDeck] = deck;
      handCopy[weakestIdx] = newCard;
      // L'ancienne carte retourne dans la pioche.
      const newDeck = [...restDeck, oldCard];

      return {
        handsMutated: { [activatedBy]: handCopy },
        newDeck,
      };
    }

    /* ── Sable du Temps : geler le timer adverse ── */
    case "sable_temps": {
      if (target === undefined) return {};
      const targetPlayer = players[target];
      if (!targetPlayer) return {};
      return {
        timerFreeze: { playerIdx: target, durationMs: FREEZE_DURATION_MS },
      };
    }

    default:
      return {};
  }
}

/**
 * Indique si une carte pouvoir nécessite une cible.
 */
export function requiresTarget(cardId: PowerCardId): boolean {
  return (
    cardId === "oeil_sorcier" ||
    cardId === "coupe_circuit" ||
    cardId === "sable_temps"
  );
}

/**
 * Vérifie si une carte peut être activée dans le contexte courant.
 * Retourne une raison si non, null si oui.
 */
export function canActivatePowerCard(
  cardId: PowerCardId,
  ctx: PowerActivationContext,
): string | null {
  const { state, activatedBy, target, deck } = ctx;

  if (state.phase !== "turns") {
    return "Ce n'est pas le moment de jouer une carte pouvoir.";
  }

  const me = state.players[activatedBy];
  if (!me) return "Joueur introuvable.";

  // Vérifier que la carte n'a pas déjà été utilisée.
  const activations = me.powerActivations ?? [];
  const alreadyUsed = activations.some((a) => a.cardId === cardId && a.used);
  if (alreadyUsed) return "Carte déjà utilisée.";

  // Cartes avec cible obligatoire.
  if (requiresTarget(cardId)) {
    if (target === undefined) return "Cette carte nécessite une cible.";
    if (target === activatedBy) return "Tu ne peux pas te cibler toi-même.";
    if (!state.players[target]) return "Cible invalide.";
  }

  // Vent du Nord : besoin d'une pioche non vide.
  if (cardId === "vent_nord" && (!deck || deck.length === 0)) {
    return "Pioche vide — impossible d'échanger.";
  }

  return null;
}
