"use client";

import { useEffect, useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { getPlayerLevel } from "@/lib/playerLevel";
import { listenPlayer } from "@/lib/socialData";
import { FCFA } from "@/data/mock";
import { AvatarIllustration } from "@/components/ui/Art";
import { BottomNav } from "@/components/ui/BottomNav";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Shell, Surface, displayFont } from "@/components/ui/Shell";
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
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader title="Profil joueur" kicker="Public" icon="profile" tone="gold" onBack={() => navigateTo("players")} backLabel="Joueurs" />
          <Surface style={{ textAlign: "center" }}>
            {loading && <div className="nj-subtle" style={{ padding: 20 }}>Chargement...</div>}
            {!loading && !player && <div className="nj-subtle" style={{ padding: 20 }}>Joueur introuvable.</div>}
            {player && (() => {
              const level = getPlayerLevel(player.stats, player.balance);
              return (
                <div className="nj-stack" style={{ alignItems: "center", gap: 14 }}>
                  <AvatarIllustration seed={player.emoji} size={96} online={player.online} />
                  <div>
                    <div style={{ ...displayFont, fontSize: 34, fontWeight: 900, color: T.gold }}>{player.name}</div>
                    <div className="nj-subtle">{player.online ? "En ligne" : "Hors ligne"}</div>
                  </div>
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
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, width: "100%" }}>
                    <Chip strong>{FCFA(player.balance)}</Chip>
                    <Chip>{player.stats.played} parties</Chip>
                    <Chip tone="teal">{player.stats.won} victoires</Chip>
                  </div>
                  <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
                    <SocialActions player={player} showProfile={false} />
                  </div>
                </div>
              );
            })()}
          </Surface>
          <BottomNav />
        </div>
      </div>
    </Shell>
  );
}
