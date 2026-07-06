"use client";

import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { FCFA, MOCK_LEADERBOARD } from "@/data/mock";
import { AvatarIllustration } from "@/components/ui/Art";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Shell, Surface, displayFont } from "@/components/ui/Shell";

export function LeaderboardScreen() {
  const { navigateTo } = useGame();

  return (
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader title="Classement" kicker="Les forts du quartier" icon="trophy" tone="gold" onBack={() => navigateTo("menu")} backLabel="Retour" />
          <Surface>
            <div className="nj-stack" style={{ gap: 10 }}>
              {MOCK_LEADERBOARD.map((p, i) => (
                <div
                  key={p.name}
                  className="leader-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 10px",
                    borderRadius: 17,
                    background: p.you ? `${T.gold}19` : "rgba(255,248,232,.052)",
                    border: p.you ? `1.5px solid ${T.gold}` : "1px solid rgba(255,248,232,.1)",
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
                  <AvatarIllustration seed={p.emoji} size={48} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </div>
                    {p.you && <Chip strong style={{ minHeight: 22, fontSize: 10, marginTop: 4 }}>Toi</Chip>}
                  </div>
                  <div style={{ ...displayFont, color: T.gold, fontWeight: 900, fontSize: 19, whiteSpace: "nowrap" }}>
                    {FCFA(p.pts)}
                  </div>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      </div>
    </Shell>
  );
}
