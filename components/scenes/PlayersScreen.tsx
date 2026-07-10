"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { listenDiscoverPlayers } from "@/lib/socialData";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { BottomNav } from "@/components/ui/BottomNav";
import { ScreenHeader, Shell, Surface } from "@/components/ui/Shell";
import { SocialActions } from "@/components/social/SocialActions";
import type { PublicPlayerProfile } from "@/types/game";

export function PlayersScreen() {
  const { navigateTo } = useGame();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [players, setPlayers] = useState<PublicPlayerProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = listenDiscoverPlayers(user?.uid, search, (items) => {
      setPlayers(items);
      setLoading(false);
    });
    return unsub;
  }, [search, user?.uid]);

  return (
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader title="Joueurs" kicker="Decouverte" icon="search" tone="teal" onBack={() => navigateTo("menu")} backLabel="Retour" />
          <Surface scrollable>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <span className="nj-title-icon" style={{ width: 42, height: 42, borderRadius: 14 }}>
                <NjamboIcon name="search" tone="teal" size={22} />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un pseudo"
                className="nj-input"
                style={{ flex: 1 }}
              />
            </div>
            <div className="nj-stack" style={{ gap: 10 }}>
              {loading && <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Chargement...</div>}
              {!loading && players.length === 0 && (
                <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Aucun joueur trouve.</div>
              )}
              {players.map((player, i) => (
                <div
                  key={player.uid}
                  className={`nj-list-card${player.online ? " nj-list-card--teal is-active" : ""}`}
                  style={{ animation: `riseIn .3s ${i * 0.04}s both` }}
                >
                  <AvatarIllustration seed={player.emoji} size={50} online={player.online} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name}</div>
                    <div className="nj-subtle">{player.online ? "En ligne" : "Hors ligne"} · {player.stats.played} parties</div>
                  </div>
                  <SocialActions player={player} compact />
                </div>
              ))}
            </div>
          </Surface>
          <BottomNav active="players" />
        </div>
      </div>
    </Shell>
  );
}
