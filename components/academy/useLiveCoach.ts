"use client";

/* Coach en direct sur la table, pour toutes les parties (A12). La logique est
   dans engine/academy/liveCoachSession.ts ; ce hook lui passe les états de la
   table et applique ses réponses : bulle, compteurs, carte éclairée après 5 s
   d'hésitation. Il ne touche jamais à la synchro de la partie. */

import { useEffect, useMemo, useRef } from "react";
import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import type { ZoneRegistry } from "@/components/table/zones/ZoneRegistry";
import type { CoachLevel, CoachMode } from "@/engine/academy/liveCoach";
import { LiveCoachSession, type CoachActions, type CoachContext } from "@/engine/academy/liveCoachSession";
import { coachDirector, HINT_DELAY_MS } from "@/lib/academy/coachDirector";
import { coachPrefs } from "@/lib/academy/coachPrefs";
import type { GameConfig, GameState, PowerCardId } from "@/types/game";

export interface LiveCoachHandle {
  /** Un adversaire vient de jouer une carte Pouvoir contre le joueur. */
  onPower(cardId: PowerCardId, byName: string): void;
  /** Fin de partie : le joueur a-t-il gagné ? */
  onGameEnd(won: boolean): void;
}

interface LiveCoachOptions {
  enabled: boolean;
  mode: CoachMode;
  level: CoachLevel;
  state: GameState;
  cfg: GameConfig;
  /** C'est au joueur et la table est au repos (animations finies). */
  ready: boolean;
  registry: ZoneRegistry;
  timer: { subscribe(listener: () => void): () => void; getSnapshot(): number };
  /** Pas de chrono dans cette partie. */
  unlimited: boolean;
}

/** Applique la réponse du coach : bulle, compteurs. */
function apply(actions: CoachActions) {
  for (const record of actions.records) coachPrefs.record(record.key, record.event);
  if (actions.levelUpSaid) coachPrefs.levelUpSaid();
  if (actions.say) coachDirector.tip(actions.say.key, actions.say.vars);
}

export function useLiveCoach(options: LiveCoachOptions): LiveCoachHandle {
  const latest = useRef(options);
  latest.current = options;
  const session = useRef(new LiveCoachSession());
  const context = (): CoachContext => {
    const o = latest.current;
    const prefs = coachPrefs.getSnapshot();
    return { level: o.level, mode: o.mode, cfg: o.cfg, counters: prefs.counters, levelUpPending: prefs.levelUp === "pending", wins: prefs.wins };
  };
  const contextRef = useRef(context);
  contextRef.current = context;

  const { state, enabled, ready } = options;
  const turnKey = `${state.trickNo}:${state.trickPlays.length}`;

  // Chaque état : nouvelle donne, carte posée, pli complet (« qui gagne »).
  useEffect(() => {
    if (!latest.current.enabled) return;
    apply(session.current.observe(latest.current.state, contextRef.current()));
  }, [state]);

  // Tour du joueur : un conseil, puis la carte conseillée s'il hésite.
  useEffect(() => {
    if (!enabled || !ready) return;
    const actions = session.current.turnReady(latest.current.state, contextRef.current());
    apply(actions);
    const advise = actions.advise;
    if (!advise) return;
    const hand = () => latest.current.registry.hand(0);
    const timer = setTimeout(() => {
      hand()?.highlightCards({ cardIds: [advise], style: "recommend", durationMs: 120_000 });
      coachDirector.tip("live.advice");
    }, HINT_DELAY_MS);
    return () => {
      clearTimeout(timer);
      hand()?.highlightCards({ cardIds: [], style: "recommend", durationMs: 0 });
    };
  }, [enabled, ready, turnKey]);

  // Chrono bas : écoute directe du chrono, sans re-rendre la table chaque seconde.
  const timer = options.timer;
  useEffect(() => timer.subscribe(() => {
    const o = latest.current;
    if (!o.enabled || !o.ready) return;
    apply(session.current.timer(o.state, timer.getSnapshot(), { ...contextRef.current(), unlimited: o.unlimited }));
  }), [timer]);

  return useMemo<LiveCoachHandle>(() => ({
    onPower(cardId, byName) {
      const def = POWER_CARDS_BY_ID[cardId];
      if (!def || !latest.current.enabled) return;
      apply(session.current.power({ id: def.id, name: def.name, description: def.description }, byName, contextRef.current()));
    },
    onGameEnd(won) {
      if (won) coachPrefs.win();
    },
  }), []);
}
