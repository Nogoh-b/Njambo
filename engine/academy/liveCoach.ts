/* ═══════════════ Coach en direct : moteur pur ═══════════════
   Pendant une vraie partie, le coach dit en une phrase ce qui compte
   maintenant. Il ne voit que ce que voit le joueur : sa main, les cartes
   posées, les plis passés. Les mains adverses ne sont jamais lues, même quand
   la partie locale les connaît : il ne peut pas tricher par erreur.
   - Niveaux : « Accompagné » (guided), « Conseils » (tips), désactivé (off).
   - Contre d'autres joueurs (D10) : règles seulement, bulles courtes.
   - Carte conseillée (D11) : partie de fin d'Académie et Solo IA « Accompagné ».
   - Retrait (D12) : un conseil appliqué 3 fois de suite ne revient plus ; un
     conseil d'information se retire après 3 affichages. */

import { GAME_CONFIG } from "../../config/gameConfig";
import { botChooseCard } from "../bot";
import { legalCards, trickWinner } from "../rules";
import type { Card, GameConfig, GameState, InstantReason, Result, TrickPlay } from "../../types/game";
import type { CoachKey } from "./types";

export type CoachLevel = "guided" | "tips" | "off";
/** solo : contre l'IA ; versus : contre d'autres joueurs (en ligne, amis, événements) ; academy : partie de fin d'Académie. */
export type CoachMode = "solo" | "versus" | "academy";

/** Ce que le joueur voit de la table. */
export interface PlayerView {
  trickNo: number;
  /** Numéro du dernier pli (le Ngata). */
  lastTrick: number;
  yourTurn: boolean;
  hand: Card[];
  ledSuit: string | null;
  /** Meilleure carte de la tendance posée dans le pli en cours (valeur effective). */
  bestInTrick: number | null;
  /** Toutes les cartes posées sur la table pendant la manche. */
  seen: Card[];
  /** Plis complets de la manche, dans l'ordre de pose (vus par le joueur). */
  history: TrickPlay[][];
  /** Nombre de joueurs à table. */
  players: number;
}

export function playerView(state: GameState, cfg: GameConfig = GAME_CONFIG, history: TrickPlay[][] = []): PlayerView {
  const ledSuit = state.trickPlays[0]?.card.suit ?? null;
  const following = state.trickPlays.filter((play) => (play.card.effectiveSuit ?? play.card.suit) === ledSuit);
  return {
    trickNo: state.trickNo,
    lastTrick: cfg.cardsPerPlayer,
    yourTurn: state.phase === "turns" && state.turnIdx === 0 && state.trickPlays.length < state.players.length,
    hand: [...(state.players[0]?.hand ?? [])],
    ledSuit,
    bestInTrick: following.length ? Math.max(...following.map((play) => play.card.effectiveValue ?? play.card.value)) : null,
    seen: state.players.flatMap((player) => player.deposit),
    history,
    players: state.players.length,
  };
}

/* ═══════════════ Conseils ═══════════════ */

export type LiveTipId =
  | "start" | "threeSafe" | "beforeLast" | "lastTrick" | "cannotWin" | "canWin" | "mustFollow" | "leading"
  | "trickWon" | "power" | "lowTimer";

export interface TipSpec {
  /** Niveaux où il est dit (« guided » = Accompagné, « tips » = Conseils). */
  levels: CoachLevel[];
  /** Dit aussi contre d'autres joueurs, en version courte (règles seulement, D10). */
  versus?: boolean;
  /** Seulement dans la partie de fin d'Académie. */
  academyOnly?: boolean;
  /** Conseil d'action : retiré après 3 applications de suite (sinon : après 3 affichages). */
  checked?: boolean;
}

/** Plan, A12 : qui dit quoi, à quel niveau, contre qui. */
export const LIVE_TIPS: Record<LiveTipId, TipSpec> = {
  start: { levels: ["guided"], academyOnly: true },
  threeSafe: { levels: ["guided", "tips"], checked: true },
  beforeLast: { levels: ["guided", "tips"], checked: true },
  lastTrick: { levels: ["guided"] },
  cannotWin: { levels: ["guided", "tips"], checked: true },
  canWin: { levels: ["guided"], checked: true },
  mustFollow: { levels: ["guided"], versus: true },
  leading: { levels: ["guided"], versus: true },
  trickWon: { levels: ["guided"] },
  power: { levels: ["guided", "tips"], versus: true },
  lowTimer: { levels: ["guided", "tips"], versus: true },
};

export const SUIT_NAMES: Record<string, string> = { "♥": "Cœur", "♦": "Carreau", "♣": "Trèfle", "♠": "Pique" };

/** Une situation reconnue : le conseil à dire et de quoi remplir sa phrase. */
export interface Situation {
  id: LiveTipId;
  vars: Record<string, string | number>;
  /** Ce que le joueur devrait jouer pour l'appliquer (conseils d'action). */
  applied?: (played: Card) => boolean;
  /** Clé du compteur (par carte pour les pouvoirs). */
  counter?: string;
}

/** Couleurs où chaque joueur a montré qu'il n'en avait plus (il n'a pas suivi), avec le premier pli qui l'a montré. */
export function voids(history: TrickPlay[][]): Map<number, Map<string, number>> {
  const result = new Map<number, Map<string, number>>();
  history.forEach((trick, index) => {
    const led = trick[0]?.card.suit;
    if (!led) return;
    for (const play of trick) {
      if (play.card.suit === led) continue;
      const seat = result.get(play.playerIdx) ?? new Map<string, number>();
      if (!seat.has(led)) seat.set(led, index + 1);
      result.set(play.playerIdx, seat);
    }
  });
  return result;
}

const cardName = (card: Card) => `${card.rank}${card.suit}`;

/** Situations du tour du joueur, de la plus importante à la moins importante. */
export function turnSituations(view: PlayerView, mode: CoachMode): Situation[] {
  if (!view.yourTurn || view.hand.length === 0) return [];
  const situations: Situation[] = [];
  const legal = legalCards(view.hand, view.ledSuit).map((index) => view.hand[index]);
  const lowest = [...legal].sort((a, b) => a.value - b.value)[0];
  if (mode === "academy") situations.push({ id: "start", vars: {} });

  // Dernier pli, en tête avec un 3 : les adversaires ont-ils montré qu'ils n'ont plus sa couleur ?
  const three = view.hand.find((card) => card.value === 3);
  if (view.trickNo === view.lastTrick && !view.ledSuit && three) {
    const known = voids(view.history);
    const opponents = Array.from({ length: view.players - 1 }, (_, index) => index + 1);
    const tricks = opponents.map((seat) => known.get(seat)?.get(three.suit));
    if (tricks.every((trick) => trick !== undefined)) {
      situations.push({
        id: "threeSafe",
        vars: { card: cardName(three), suitName: SUIT_NAMES[three.suit] ?? three.suit, trick: Math.max(...(tricks as number[])) },
        applied: (played) => played.id === three.id,
      });
    }
  }
  if (view.trickNo === view.lastTrick - 1) situations.push({ id: "beforeLast", vars: {} });
  if (view.trickNo === view.lastTrick) situations.push({ id: "lastTrick", vars: {} });

  if (view.ledSuit) {
    const winners = legal.filter((card) => card.suit === view.ledSuit && card.value > (view.bestInTrick ?? 0)).sort((a, b) => a.value - b.value);
    if (winners.length === 0) {
      situations.push({ id: "cannotWin", vars: {}, applied: (played) => played.value === lowest.value });
    } else {
      situations.push({ id: "canWin", vars: { card: cardName(winners[0]) }, applied: (played) => winners.some((card) => card.id === played.id) });
    }
    if (view.hand.some((card) => card.suit === view.ledSuit)) {
      situations.push({ id: "mustFollow", vars: { suit: view.ledSuit, suitName: SUIT_NAMES[view.ledSuit] ?? view.ledSuit } });
    }
  } else {
    situations.push({ id: "leading", vars: {} });
  }
  return situations;
}

/** Fin d'un pli : qui gagne, avec quelle carte. */
export function trickWonSituation(trick: TrickPlay[], names: string[]): Situation | null {
  if (trick.length === 0) return null;
  const winner = trickWinner(trick, trick[0].card.suit);
  const card = trick.find((play) => play.playerIdx === winner)?.card;
  if (!card) return null;
  return { id: "trickWon", vars: { name: names[winner] ?? "", card: cardName(card), you: winner === 0 ? 1 : 0 } };
}

/* ═══════════════ Compteurs et choix ═══════════════ */

export interface TipCounter {
  /** Affichages. */
  shown: number;
  /** Applications de suite (conseils d'action). */
  streak: number;
}

export const RETIRE_AFTER = 3;

export function isRetired(spec: TipSpec, counter: TipCounter | undefined): boolean {
  if (!counter) return false;
  return spec.checked ? counter.streak >= RETIRE_AFTER : counter.shown >= RETIRE_AFTER;
}

export const counterKey = (situation: Situation) => situation.counter ?? situation.id;

/** Le conseil à dire (au plus un), ou rien : niveau, adversaires et retrait. */
export function pickTip(
  situations: Situation[],
  context: { level: CoachLevel; mode: CoachMode; counters: Record<string, TipCounter> },
): Situation | null {
  if (context.level === "off") return null;
  return situations.find((situation) => {
    const spec = LIVE_TIPS[situation.id];
    if (!spec.levels.includes(context.level)) return false;
    if (spec.academyOnly && context.mode !== "academy") return false;
    if (context.mode === "versus" && !spec.versus) return false;
    return !isRetired(spec, context.counters[counterKey(situation)]);
  }) ?? null;
}

/** Clé de texte : version courte contre d'autres joueurs, « .you » quand le joueur gagne le pli. */
export function tipTextKey(situation: Situation, mode: CoachMode): CoachKey {
  const base = `live.${situation.id}${situation.id === "trickWon" && situation.vars.you ? ".you" : ""}`;
  return mode === "versus" && LIVE_TIPS[situation.id].versus ? `${base}.short` : base;
}

/** Nouveau compteur après un affichage et/ou une application (null : situation sans test). */
export function updateCounter(counter: TipCounter | undefined, event: { shown?: boolean; applied?: boolean | null }): TipCounter {
  const next = { shown: counter?.shown ?? 0, streak: counter?.streak ?? 0 };
  if (event.shown) next.shown += 1;
  if (event.applied === true) next.streak += 1;
  if (event.applied === false) next.streak = 0;
  return next;
}

/** La carte conseillée s'éclaire-t-elle (D11) ? */
export const adviceAllowed = (level: CoachLevel, mode: CoachMode) => mode === "academy" || (mode === "solo" && level === "guided");

/** Carte conseillée (index dans la main) : l'IA « hard » du jeu, qui ne connaît que les cartes visibles. */
export function advisedCard(view: PlayerView): number | null {
  if (!view.yourTurn || view.hand.length === 0) return null;
  const index = botChooseCard(view.hand, view.ledSuit, view.trickNo >= view.lastTrick, view.bestInTrick, { difficulty: "hard", seen: view.seen });
  return legalCards(view.hand, view.ledSuit).includes(index) ? index : null;
}

/** Réplique de fin de la partie de l'Académie. */
export function finalLine(result: Pick<Result, "type" | "winnerIdx" | "doubles"> & { reason?: InstantReason }): CoachKey {
  const won = result.winnerIdx === 0;
  if (result.type === "instant") return won ? `final.instant.win.${result.reason ?? "under21"}` : "final.instant.lose";
  if (won) return result.doubles ? "final.winDouble" : "final.win";
  return "final.lose";
}
