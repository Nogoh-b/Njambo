"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { getPlayerLevel } from "@/lib/playerLevel";
import { resolveRank } from "@/lib/playerRank";
import { listenPlayer } from "@/lib/socialData";
import { NKAP } from "@/data/mock";
import { PlayerCard } from "@/components/player/PlayerCard";
import { fromPublicProfile } from "@/components/player/playerCardData";
import { BottomNavScene } from "@/components/ui/BottomNavScene";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Surface } from "@/components/ui/Shell";
import { SocialActions } from "@/components/social/SocialActions";
import type { PublicPlayerProfile } from "@/types/game";

export function PublicProfileScreen() {
  const { navigateTo, socialTarget } = useGame();
  const [player, setPlayer] = useState<PublicPlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!socialTarget.playerUid && !socialTarget.peerUid) {
      setPlayer(null);
      setLoading(false);
      return;
    }
    const uid = socialTarget.playerUid ?? socialTarget.peerUid!;
    const unsub = listenPlayer(uid, (nextPlayer) => {
      setPlayer(nextPlayer);
      setLoading(false);
    });
    return unsub;
  }, [socialTarget.peerUid, socialTarget.playerUid]);

  return (
    <BottomNavScene narrow>
        <div className="nj-phone">
          <ScreenHeader title="Profil joueur" kicker="Public" icon="profile" tone="gold" onBack={() => navigateTo("players")} backLabel="Joueurs" />
          <Surface style={{ textAlign: "center" }}>
            {loading && <div className="nj-subtle" style={{ padding: 20 }}>Chargement...</div>}
            {!loading && !player && <div className="nj-subtle" style={{ padding: 20 }}>Joueur introuvable.</div>}
            {player && (() => {
              const level = getPlayerLevel(player.stats, player.balance);
              return (
                <div className="nj-stack" style={{ alignItems: "center", gap: 14 }}>
                  <PlayerCard
                    variant="hero"
                    player={fromPublicProfile(player)}
                    rank={resolveRank(player.crowns)}
                    style={{ width: "100%" }}
                    badges={(
                      <>
                        <Chip strong>{NKAP(player.balance)}</Chip>
                        <Chip>{player.stats.played} parties</Chip>
                        <Chip tone="teal">{player.stats.won} victoires</Chip>
                      </>
                    )}
                    actions={<SocialActions player={player} showProfile={false} />}
                  >
                    <div className="nj-profile-level-card" style={{ width: "100%" }}>
                      <div className="nj-profile-level-top">
                        <span className="nj-profile-level-pill">Niveau {level.level}</span>
                        <span>{level.title}</span>
                      </div>
                      <div className="nj-level-track nj-profile-level-track" aria-hidden="true">
                        <span className="nj-level-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
                      </div>
                      <div className="nj-profile-level-meta">
                        <span>{level.xp} XP</span>
                        <span>{level.xpToNext} XP avant niveau {level.level + 1}</span>
                      </div>
                    </div>
                  </PlayerCard>
                </div>
              );
            })()}
          </Surface>
        </div>
    </BottomNavScene>
  );
}
