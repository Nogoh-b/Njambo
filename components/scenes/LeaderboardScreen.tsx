"use client";

import { useEffect, useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { getEntranceAnimationStyle, useMotionProfile } from "@/lib/motion";
import { listenLeaderboard } from "@/lib/playerData";
import { resolveRank } from "@/lib/playerRank";
import { PlayerCard } from "@/components/player/PlayerCard";
import { fromPublicProfile } from "@/components/player/playerCardData";
import { BottomNavScene } from "@/components/ui/BottomNavScene";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Surface, displayFont } from "@/components/ui/Shell";
import type { OnlinePlayerProfile } from "@/types/game";

export function LeaderboardScreen() {
  const { navigateTo } = useGame();
  const { user } = useAuth();
  const motion = useMotionProfile();
  const [players, setPlayers] = useState<OnlinePlayerProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = listenLeaderboard((nextPlayers) => {
      setPlayers(nextPlayers);
      setLoading(false);
    });
    return unsub;
  }, []);

  return (
    <BottomNavScene narrow>
        <div className="nj-phone">
          <ScreenHeader title="Classement" kicker="Les forts du quartier" icon="trophy" tone="gold" onBack={() => navigateTo("menu")} backLabel="Retour" />
          <Surface scrollable>
            <div className="nj-stack" style={{ gap: 10 }}>
              {loading && <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Chargement du classement...</div>}
              {!loading && players.length === 0 && (
                <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>
                  Aucun joueur classe pour le moment.
                </div>
              )}
              {players.map((p, i) => {
                const isYou = p.uid === user?.uid;
                const crowns = p.crowns ?? 1_000;
                const rank = resolveRank(crowns);
                return (
                  <PlayerCard
                    key={p.uid}
                    player={fromPublicProfile(p)}
                    tone={isYou ? "gold" : undefined}
                    active={isYou}
                    style={getEntranceAnimationStyle(motion, i, { duration: 0.34, step: 0.06 })}
                    subtitle={null}
                    lead={(
                      <span
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 14,
                          display: "grid",
                          placeItems: "center",
                          ...displayFont,
                          fontWeight: 900,
                          background: i === 0 ? T.gold : i === 1 ? "#c7d0da" : i === 2 ? T.copper : "var(--nj-solar-sand)",
                          color: i < 3 ? T.ink : "var(--nj-solar-ink)",
                        }}
                      >
                        {i + 1}
                      </span>
                    )}
                    badges={(
                      <>
                        <Chip strong style={{ minHeight: 22, fontSize: 10 }}>{rank.label}</Chip>
                        {isYou && <Chip strong style={{ minHeight: 22, fontSize: 10 }}>Toi</Chip>}
                      </>
                    )}
                    meta={(
                      <span style={{ ...displayFont, color: "var(--nj-solar-yellow-deep)", fontWeight: 900, fontSize: 19, whiteSpace: "nowrap" }}>
                        {crowns.toLocaleString("fr-FR")} couronnes
                      </span>
                    )}
                  />
                );
              })}
            </div>
          </Surface>
        </div>
    </BottomNavScene>
  );
}
