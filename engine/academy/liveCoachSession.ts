/* ═══════════════ Coach en direct : une partie ═══════════════
   Suit une partie état après état et dit quoi faire : quel conseil afficher,
   quels compteurs mettre à jour, quelle carte éclairer. PUR (ni React ni DOM) :
   components/academy/useLiveCoach.ts applique ses réponses à l'écran. */

import { GAME_CONFIG } from "../../config/gameConfig";
import type { Card, GameConfig, GameState, TrickPlay } from "../../types/game";
import {
  adviceAllowed,
  advisedCard,
  counterKey,
  pickTip,
  playerView,
  tipTextKey,
  trickWonSituation,
  turnSituations,
  type CoachLevel,
  type CoachMode,
  type Situation,
  type TipCounter,
} from "./liveCoach";
import type { CoachKey } from "./types";

/** Seuil du chrono bas (mêmes 5 s que l'alerte de l'avatar). */
export const LOW_TIMER_SECONDS = 5;

export interface CoachContext {
  level: CoachLevel;
  mode: CoachMode;
  cfg?: GameConfig;
  counters: Record<string, TipCounter>;
  /** Proposition de passer en « Conseils » à dire au prochain tour. */
  levelUpPending?: boolean;
  wins?: number;
}

export interface CoachRecord {
  key: string;
  event: { shown?: boolean; applied?: boolean | null };
}

/** Ce que l'écran doit faire. */
export interface CoachActions {
  say?: { key: CoachKey; vars: Record<string, string | number> };
  records: CoachRecord[];
  /** Carte à éclairer si le joueur hésite (D11). */
  advise?: string;
  levelUpSaid?: boolean;
}

const none = (): CoachActions => ({ records: [] });

export class LiveCoachSession {
  private history: TrickPlay[][] = [];
  private recorded = new Set<number>();
  /** Conseils d'action du tour : jugés sur la carte jouée. */
  private checks: { situations: Situation[]; hand: string[] } | null = null;
  private beforeLastPending = false;
  private lowTimerTurn: string | null = null;

  /** Dit le premier conseil permis (niveau, adversaires, retrait) et compte l'affichage. */
  private say(situations: Situation[], context: CoachContext, actions: CoachActions): CoachActions {
    if (context.level === "off" && context.mode !== "academy") return actions;
    const chosen = pickTip(situations, context);
    if (!chosen) return actions;
    actions.say = { key: tipTextKey(chosen, context.mode), vars: chosen.vars };
    actions.records.push({ key: counterKey(chosen), event: { shown: true } });
    return actions;
  }

  /** Chaque nouvel état de la table : nouvelle donne, carte posée par le joueur, pli complet. */
  observe(state: GameState, context: CoachContext): CoachActions {
    const actions = none();
    if (state.phase === "dealing") {
      this.history = [];
      this.recorded.clear();
      this.checks = null;
      this.beforeLastPending = false;
      return actions;
    }
    // Le joueur a posé sa carte : ses conseils d'action sont-ils appliqués ?
    const pending = this.checks;
    if (pending) {
      const hand = (state.players[0]?.hand ?? []).map((card) => card.id);
      const playedId = pending.hand.find((id) => !hand.includes(id));
      const played = playedId ? (state.players[0]?.deposit.find((card) => card.id === playedId) as Card | undefined) : undefined;
      if (played) {
        this.checks = null;
        for (const situation of pending.situations) {
          if (situation.applied) actions.records.push({ key: counterKey(situation), event: { applied: situation.applied(played) } });
        }
      }
    }
    // Pli complet : qui gagne ; l'avant-dernier pli gagné valide son conseil.
    const complete = state.players.length > 0 && state.trickPlays.length === state.players.length;
    if (!complete || this.recorded.has(state.trickNo)) return actions;
    this.recorded.add(state.trickNo);
    const trick = state.trickPlays.map((play) => ({ ...play }));
    this.history = [...this.history, trick];
    const won = trickWonSituation(trick, state.players.map((player) => player.name));
    const cfg = context.cfg ?? GAME_CONFIG;
    if (this.beforeLastPending && state.trickNo === cfg.cardsPerPlayer - 1) {
      actions.records.push({ key: "beforeLast", event: { applied: won?.vars.you === 1 } });
      this.beforeLastPending = false;
    }
    return won ? this.say([won], context, actions) : actions;
  }

  /** C'est au joueur et la table est au repos : un conseil, et la carte à éclairer s'il hésite. */
  turnReady(state: GameState, context: CoachContext): CoachActions {
    const actions = none();
    const view = playerView(state, context.cfg ?? GAME_CONFIG, this.history);
    if (!view.yourTurn) return actions;
    const situations = turnSituations(view, context.mode);
    this.checks = { situations: situations.filter((situation) => situation.applied), hand: view.hand.map((card) => card.id) };
    if (situations.some((situation) => situation.id === "beforeLast")) this.beforeLastPending = true;

    if (context.levelUpPending && context.level !== "off") {
      actions.say = { key: "live.levelUp", vars: { wins: context.wins ?? 0 } };
      actions.levelUpSaid = true;
    } else {
      this.say(situations, context, actions);
    }
    if (adviceAllowed(context.level, context.mode)) {
      const advised = advisedCard(view);
      if (advised !== null) actions.advise = view.hand[advised].id;
    }
    return actions;
  }

  /** Chrono du joueur : une alerte par tour quand il reste 5 s ou moins. */
  timer(state: GameState, seconds: number, context: CoachContext & { unlimited: boolean }): CoachActions {
    const actions = none();
    const key = `${state.trickNo}:${state.trickPlays.length}`;
    const yourTurn = state.phase === "turns" && state.turnIdx === 0;
    if (!yourTurn || context.unlimited || seconds > LOW_TIMER_SECONDS || seconds <= 0 || this.lowTimerTurn === key) return actions;
    this.lowTimerTurn = key;
    return this.say([{ id: "lowTimer", vars: { seconds } }], context, actions);
  }

  /** Un adversaire vient de jouer une carte Pouvoir contre le joueur. */
  power(card: { id: string; name: string; description?: string }, byName: string, context: CoachContext): CoachActions {
    const effect = card.description ? card.description.charAt(0).toLowerCase() + card.description.slice(1) : "";
    return this.say([{ id: "power", vars: { power: card.name, name: byName, effect }, counter: `power:${card.id}` }], context, none());
  }
}
