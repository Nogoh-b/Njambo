/* Libellés français et modèles par défaut de l'éditeur de cartes pouvoir. */

import type { AnimCue, CardSelector, PowerOp, ZoneRef } from "@/engine/power/types";
import type { PowerCardDef } from "@/types/game";

export const CATEGORY_LABELS: Record<PowerCardDef["category"], string> = {
  offensive: "Offensive", defense: "Défense", score: "Score", tactical: "Tactique", perturbation: "Perturbation", economy: "Économie",
};
export const RARITY_LABELS: Record<PowerCardDef["rarity"], string> = { common: "Commune", rare: "Rare", epic: "Épique", legendary: "Légendaire" };
export const TONE_LABELS: Record<PowerCardDef["tone"], string> = { gold: "Or", teal: "Émeraude", pink: "Rose", cobalt: "Cobalt" };
export const TARGET_MODE_LABELS: Record<PowerCardDef["targetMode"], string> = { none: "Aucune cible", self: "Soi-même", opponent: "Un adversaire" };
export const BOOSTER_TIER_LABELS = { village: "Village", notable: "Notable", chef: "Chef", ancetre: "Ancêtre" } as const;

export const TARGET_COUNT_LABELS = {
  none: "Aucune cible",
  one: "Un joueur",
  many: "Plusieurs joueurs",
  all_opponents: "Tous les adversaires",
  random_opponent: "Un adversaire au hasard",
} as const;

export const PLAYER_LABELS = {
  self: "Le lanceur",
  target: "La cible",
  each_target: "Chaque cible",
  all_opponents: "Tous les adversaires",
  all: "Tous les joueurs",
} as const;

export const CONDITION_LABELS = {
  deckNotEmpty: "La pioche n'est pas vide",
  isTrickLeader: "Le lanceur ouvre le pli (avant toute carte)",
  ledSuitKnown: "La couleur du pli est connue",
  activatorLacksLedSuit: "Le lanceur n'a pas la couleur demandée",
  notLastTrick: "Avant le dernier pli (issue encore inconnue)",
} as const;

export const SELECTOR_LABELS: Record<CardSelector["kind"], string> = {
  weakest: "La plus faible",
  strongest: "La plus forte",
  all: "Toutes",
  bySuit: "D'une couleur",
  byValue: "Par valeur",
  topOfDeck: "Le haut de la pioche",
  random: "Au hasard",
  byId: "Une carte précise",
  firstBetterThanWeakest: "1re meilleure que la plus faible",
  bestLegal: "La meilleure jouable",
  chosen: "Choisie par clic",
};

export const ZONE_LABELS = { hand: "Main", deposit: "Dépôt", deck: "Pioche", reveal: "Révélation" } as const;

export const SHIELD_LABELS = { targeted: "Ciblage", reveal: "Révélation", restrict: "Restriction", timer_attack: "Attaque du minuteur" } as const;

export const FX_PRESET_LABELS = {
  mystic: "Mystique", wind: "Vent", frost: "Givre", time: "Temps", goldRain: "Pluie d'or",
  shield: "Bouclier", revealMist: "Brume de révélation", lock: "Verrou", boost: "Élan",
} as const;

export const OP_LABELS: Record<PowerOp["op"], { label: string; family: string; help: string }> = {
  moveCards: { label: "Déplacer des cartes", family: "Cartes", help: "Prendre, donner, défausser ou piocher (vrai déplacement)." },
  exchangeCards: { label: "Échanger des cartes", family: "Cartes", help: "Le même nombre de cartes change de main entre deux joueurs." },
  highlightCard: { label: "Mettre une carte en valeur", family: "Cartes", help: "Affichage seulement (conseil, repérage)." },
  revealHand: { label: "Révéler une main", family: "Information", help: "Montre la main d'un joueur pendant un temps." },
  blockNextLegalCard: { label: "Bloquer une carte jouable", family: "Restrictions", help: "Bloque une carte au prochain tour s'il reste assez d'alternatives." },
  restrictNextPlay: { label: "Forcer / verrouiller le prochain coup", family: "Restrictions", help: "Impose ou interdit des cartes au prochain tour du joueur." },
  timerFreeze: { label: "Geler le minuteur", family: "Temps", help: "Le temps du joueur s'arrête." },
  timerDelta: { label: "Ajouter / retirer du temps", family: "Temps", help: "+ ou − secondes sur le minuteur du joueur." },
  boostNextCard: { label: "Renforcer la prochaine carte", family: "Valeur", help: "Bonus de valeur et/ou couleur imposée sur la prochaine carte jouée." },
  potBonus: { label: "Bonus de pot", family: "Pot", help: "Ajoute des Nkap au pot." },
  potMultiplier: { label: "Multiplier le pot", family: "Pot", help: "Multiplie le pot si la manche (ou le pli) est gagnée." },
  refundOnLoss: { label: "Remboursement en cas de défaite", family: "Pot", help: "Rend une part de la mise si la manche est perdue." },
  preventDoublePenalty: { label: "Annuler la double pénalité", family: "Pot", help: "Protège contre la pénalité de doublé." },
  grantShield: { label: "Bouclier", family: "Défense", help: "Bloque les attaques choisies jusqu'à la fin de la manche." },
};

export const CUE_LABELS: Record<AnimCue["cue"], string> = {
  flyCards: "Vol de cartes",
  revealOverlay: "Fenêtre de révélation",
  highlightHandCard: "Surbrillance dans la main",
  timerFx: "Effet sur le minuteur",
  deckPulse: "Pulsation de la pioche",
  potFlash: "Éclat du pot",
  avatarAura: "Aura sur l'avatar",
  toast: "Message flottant",
};

const handOf = (player: "self" | "target"): ZoneRef => ({ zone: "hand", player });

/** Modèle de départ d'une brique (valide tel quel). */
export function defaultOp(kind: PowerOp["op"]): PowerOp {
  switch (kind) {
    case "moveCards": return { op: "moveCards", from: handOf("target"), select: { kind: "random" }, to: handOf("self") };
    case "exchangeCards": return { op: "exchangeCards", left: "self", leftSelect: { kind: "weakest" }, right: "target", rightSelect: { kind: "strongest" } };
    case "highlightCard": return { op: "highlightCard", player: "self", select: { kind: "bestLegal" }, durationMs: 3000 };
    case "revealHand": return { op: "revealHand", player: "target", durationMs: 5000 };
    case "blockNextLegalCard": return { op: "blockNextLegalCard", player: "target", select: { kind: "strongest" }, minLegalChoices: 2 };
    case "restrictNextPlay": return { op: "restrictNextPlay", player: "target", mode: "lockSelector", select: { kind: "strongest" } };
    case "timerFreeze": return { op: "timerFreeze", player: "self", durationMs: 5000 };
    case "timerDelta": return { op: "timerDelta", player: "target", seconds: -3 };
    case "boostNextCard": return { op: "boostNextCard", player: "self", valueBonus: 2 };
    case "potBonus": return { op: "potBonus", amount: 200, when: "winRound" };
    case "potMultiplier": return { op: "potMultiplier", factor: 2, when: "winRound" };
    case "refundOnLoss": return { op: "refundOnLoss", player: "self", ratio: 0.5 };
    case "preventDoublePenalty": return { op: "preventDoublePenalty", player: "self" };
    case "grantShield": return { op: "grantShield", player: "self", blocks: ["targeted"] };
  }
}

/** Modèle de départ d'une animation. */
export function defaultCue(kind: AnimCue["cue"]): AnimCue {
  switch (kind) {
    case "flyCards": return { cue: "flyCards", from: handOf("target"), to: handOf("self"), cards: "resolved:outgoing", mode: "move" };
    case "revealOverlay": return { cue: "revealOverlay", player: "target", durationMs: 5000 };
    case "highlightHandCard": return { cue: "highlightHandCard", player: "self", cards: "resolved:highlight", style: "recommend", durationMs: 3000 };
    case "timerFx": return { cue: "timerFx", player: "target", kind: "loss", seconds: 3 };
    case "deckPulse": return { cue: "deckPulse" };
    case "potFlash": return { cue: "potFlash", amountLabel: "+200" };
    case "avatarAura": return { cue: "avatarAura", player: "self", style: "shield" };
    case "toast": return { cue: "toast", text: "{activator} frappe {target} !", tone: "gold" };
  }
}

/** Nouvelle carte vierge (valide une fois l'identifiant choisi). */
export function blankPowerCard(id: string) {
  return {
    def: {
      id, name: "Nouveau pouvoir", category: "tactical" as const, icon: "sparkle", tone: "gold" as const, rarity: "rare" as const,
      targetMode: "opponent" as const, art: "/assets/power-cards/v2/oeil_sorcier.webp", activationTitle: "POUVOIR",
      activationText: "Effet déclenché", description: "Décris ici ce que fait la carte.", costCauris: 30, costNkap: 500,
      animTags: [] as PowerCardDef["animTags"], boosterTier: "notable" as const,
    },
    script: {
      id, target: { count: "one" as const, chooser: "activator" as const },
      steps: [{ ops: [defaultOp("revealHand")], anim: [defaultCue("revealOverlay")] }],
    },
  };
}
