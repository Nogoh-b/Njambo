"use client";

import { useEffect, useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { getPlayerLevel } from "@/lib/playerLevel";
import { listenLeaderboard } from "@/lib/playerData";
import { FCFA } from "@/data/mock";
import { AvatarIllustration } from "@/components/ui/Art";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Shell, Surface, displayFont } from "@/components/ui/Shell";
import type { OnlinePlayerProfile } from "@/types/game";

export function LeaderboardScreen() {
  const { navigateTo } = useGame();
  const { user } = useAuth();
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
    <Shell>
      <div className="nj-safe">
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
                const level = getPlayerLevel(p.stats, p.balance);
                return (
                  <div
                    key={p.uid}
                    className="leader-row"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 10px",
                      borderRadius: 17,
                      background: isYou ? `${T.gold}19` : "rgba(255,248,232,.052)",
                      border: isYou ? `1.5px solid ${T.gold}` : "1px solid rgba(255,248,232,.1)",
                      animation: `riseIn .34s ${i * 0.06}s both`,
                    }}
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
                        <Chip strong style={{ minHeight: 22, fontSize: 10 }}>Niv. {level.level}</Chip>
                        {isYou && <Chip strong style={{ minHeight: 22, fontSize: 10 }}>Toi</Chip>}
                      </div>
                    </div>
                    <div style={{ ...displayFont, color: T.gold, fontWeight: 900, fontSize: 19, whiteSpace: "nowrap" }}>
                      {FCFA(p.balance)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Surface>
        </div>
      </div>
    </Shell>
  );
}
