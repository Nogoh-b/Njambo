"use client";

/* Coach en direct sur la table : un conseil aux moments clés, et la carte
   conseillée qui s'éclaire si le joueur hésite (comme Main du Griot). Ne parle
   que quand c'est au joueur et que la table est prête (animations finies). */

import { useEffect, useRef } from "react";
import type { ZoneRegistry } from "@/components/table/zones/ZoneRegistry";
import { advisedCard, liveTip, playerView } from "@/engine/academy/liveCoach";
import type { CoachKey } from "@/engine/academy/types";
import { coachDirector, HINT_DELAY_MS } from "@/lib/academy/coachDirector";
import type { GameConfig, GameState } from "@/types/game";

export function useLiveCoach(options: { enabled: boolean; state: GameState; cfg: GameConfig; ready: boolean; registry: ZoneRegistry }) {
  const { enabled, state, cfg, ready, registry } = options;
  const said = useRef(new Set<CoachKey>());
  const latest = useRef({ state, cfg });
  latest.current = { state, cfg };

  // Nouvelle donne : chaque conseil peut revenir une fois.
  useEffect(() => {
    if (state.phase === "dealing") said.current.clear();
  }, [state.phase]);

  useEffect(() => {
    if (!enabled || !ready) return;
    const view = playerView(latest.current.state, latest.current.cfg);
    const tip = liveTip(view, said.current);
    if (tip) {
      said.current.add(tip);
      coachDirector.tip(tip);
    }
    const advised = advisedCard(view);
    if (advised === null) return;
    const cardId = view.hand[advised].id;
    const hand = () => registry.hand(0);
    const timer = setTimeout(() => {
      hand()?.highlightCards({ cardIds: [cardId], style: "recommend", durationMs: 120_000 });
      coachDirector.tip("live.advice");
    }, HINT_DELAY_MS);
    return () => {
      clearTimeout(timer);
      hand()?.highlightCards({ cardIds: [], style: "recommend", durationMs: 0 });
    };
  }, [enabled, ready, registry, state.trickNo, state.trickPlays.length]);
}
