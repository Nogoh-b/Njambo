"use client";

import { useEffect, useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { getEntranceAnimationStyle, useMotionProfile } from "@/lib/motion";
import { rankTier } from "@/domain";
import { listenLeaderboard } from "@/lib/playerData";
import { AvatarIllustration } from "@/components/ui/Art";
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
                const tier = rankTier(crowns);
                return (
                  <div
                    key={p.uid}
                    className={`nj-list-card${isYou ? " nj-list-card--gold is-active" : ""}`}
                    style={getEntranceAnimationStyle(motion, i, { duration: 0.34, step: 0.06 })}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 14,
                        display: "grid",
                        placeItems: "center",
                        ...displayFont,
                        fontWeight: 900,
                        background: i === 0 ? T.gold : i === 1 ? "#c7d0da" : i === 2 ? T.copper : "rgba(255,248,232,.08)",
                        color: i < 3 ? T.ink : T.text,
                      }}
                    >
                      {i + 1}
                    </div>
                    <AvatarIllustration seed={p.emoji} size={48} online={p.online} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                        <Chip strong style={{ minHeight: 22, fontSize: 10 }}>{tier.label}</Chip>
                        {isYou && <Chip strong style={{ minHeight: 22, fontSize: 10 }}>Toi</Chip>}
                      </div>
                    </div>
                    <div style={{ ...displayFont, color: T.gold, fontWeight: 900, fontSize: 19, whiteSpace: "nowrap" }}>
                      {crowns.toLocaleString("fr-FR")} couronnes
                    </div>
                  </div>
                );
              })}
            </div>
          </Surface>
        </div>
    </BottomNavScene>
  );
}
