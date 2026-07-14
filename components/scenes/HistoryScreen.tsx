"use client";

import { useEffect, useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { getEntranceAnimationStyle, useMotionProfile } from "@/lib/motion";
import { listenMatchHistory } from "@/lib/playerData";
import { NKAP } from "@/data/mock";
import { NjamboIcon, NjamboMark } from "@/components/ui/Art";
import { BottomNavScene } from "@/components/ui/BottomNavScene";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Surface, displayFont } from "@/components/ui/Shell";
import type { MatchHistoryEntry } from "@/types/game";

function modeLabel(mode: MatchHistoryEntry["mode"]): string {
  if (mode === "bot") return "IA";
  if (mode === "friends") return "Amis";
  return "Online";
}

export function HistoryScreen() {
  const { navigateTo } = useGame();
  const { user } = useAuth();
  const motion = useMotionProfile();
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setMatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = listenMatchHistory(user.uid, (nextMatches) => {
      setMatches(nextMatches);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  return (
    <BottomNavScene narrow>
        <div className="nj-phone">
          <ScreenHeader title="Historique" kicker="Dernieres parties" icon="history" tone="pink" onBack={() => navigateTo("menu")} backLabel="Retour" />
          <Surface
            scrollable={matches.length > 0}
            style={{
              minHeight: 360,
              display: matches.length === 0 ? "grid" : "block",
              placeItems: matches.length === 0 ? "center" : undefined,
              textAlign: matches.length === 0 ? "center" : "left",
            }}
          >
            {loading && <div className="nj-subtle" style={{ textAlign: "center" }}>Chargement de l&apos;historique...</div>}

            {!loading && matches.length === 0 && (
              <div>
                <div style={{ display: "grid", placeItems: "center", marginBottom: 16 }}>
                  <span style={{ position: "relative", display: "grid", placeItems: "center" }}>
                    <NjamboMark size={104} compact />
                    <span className="nj-title-icon" style={{ position: "absolute", right: -8, bottom: -8, width: 44, height: 44 }}>
                      <NjamboIcon name="empty" tone="pink" size={26} />
                    </span>
                  </span>
                </div>
                <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 6 }}>Aucune partie jouee</div>
                <p className="nj-subtle" style={{ maxWidth: 300 }}>
                  Lance une premiere manche, et tes resultats viendront se ranger ici.
                </p>
              </div>
            )}

            {!loading && matches.length > 0 && (
              <div className="nj-stack" style={{ gap: 10 }}>
                {matches.map((match, i) => (
                  <div
                    key={match.id}
                    className={`nj-list-card${match.won ? " nj-list-card--gold is-active" : ""}`}
                    style={getEntranceAnimationStyle(motion, i, { duration: 0.34, step: 0.05 })}
                  >
                    <span
                      className="nj-title-icon"
                      style={{
                        width: 42,
                        height: 42,
                        background: match.won ? T.gold : "rgba(255,248,232,.08)",
                        color: match.won ? T.ink : T.text,
                      }}
                    >
                      <NjamboIcon name={match.won ? "trophy" : "history"} tone={match.won ? "gold" : "light"} size={24} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{match.won ? "Victoire" : "Defaite"}</strong>
                        <Chip tone={match.mode === "friends" ? "pink" : match.mode === "bot" ? "teal" : "gold"}>{modeLabel(match.mode)}</Chip>
                        {match.doubles && <Chip strong>x2</Chip>}
                      </div>
                      <div className="nj-subtle">
                        Gagnant: {match.winnerName} · {new Date(match.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div
                      style={{
                        ...displayFont,
                        color: match.gain >= 0 ? T.gold : T.bad,
                        fontWeight: 900,
                        fontSize: 18,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {match.gain >= 0 ? "+" : ""}{NKAP(match.gain)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Surface>
        </div>
    </BottomNavScene>
  );
}
