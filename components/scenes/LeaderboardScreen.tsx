"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { listenLeaderboard } from "@/lib/playerData";
import { resolveRank } from "@/lib/playerRank";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { GameShell } from "@/components/ui/GameShell";
import type { OnlinePlayerProfile } from "@/types/game";
import styles from "./LeaderboardScreen.module.css";

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

  const topThree = players.slice(0, 3);
  /* Ordre podium visuel : #2 gauche · #1 centre surélevé · #3 droite */
  const podiumOrder = [
    topThree[1] ? { player: topThree[1], place: 2 as const } : null,
    topThree[0] ? { player: topThree[0], place: 1 as const } : null,
    topThree[2] ? { player: topThree[2], place: 3 as const } : null,
  ].filter((entry): entry is { player: OnlinePlayerProfile; place: 1 | 2 | 3 } => entry !== null);

  const rest = players.slice(3);

  return (
    <GameShell active="menu" dock={false} scroll={false} className={styles.scene} contentClassName={styles.frame}>
      {/* ═══ HUD HAUT COMPACT ═══ */}
      <header className={styles.hudBar}>
        <div className={styles.hudLeft}>
          <button
            data-nj-skin="none"
            type="button"
            className={styles.backBtn}
            onClick={() => navigateTo("menu")}
            aria-label="Retour au salon"
          >
            <span aria-hidden="true">←</span>
            <span className={styles.backLabel}>Salon</span>
          </button>
          <div className={styles.hudCopy}>
            <span className={styles.hudKicker}>Les forts du quartier</span>
            <h1>Classement</h1>
          </div>
        </div>

        <span className={styles.seasonPill}>
          <NjamboIcon name="trophy" tone="gold" size={16} />
          <span>Top {players.length || "Mboa"}</span>
        </span>
      </header>

      {/* ═══ CONTENU : PODIUM + LISTE BORNÉE ═══ */}
      {loading ? (
        <div className={styles.emptyStage}>
          <NjamboIcon name="trophy" tone="gold" size={38} />
          <strong>Chargement du podium…</strong>
          <p>Synchronisation des couronnes du Mboa.</p>
        </div>
      ) : players.length === 0 ? (
        <div className={styles.emptyStage}>
          <NjamboIcon name="trophy" tone="gold" size={42} />
          <strong>Le trône est encore libre</strong>
          <p>Joue des parties classées en ligne pour grimper sur le podium du quartier !</p>
          <button data-nj-skin="none" type="button" className={styles.playNowBtn} onClick={() => navigateTo("play")}>
            Trouver une table →
          </button>
        </div>
      ) : (
        <div className={styles.boardBody}>
          {/* PODIUM ROYAL (#2 · #1 · #3) */}
          <section className={styles.podiumStage} aria-label="Podium des trois premiers">
            {podiumOrder.map(({ player, place }) => {
              const crowns = player.crowns ?? 1_000;
              const rank = resolveRank(crowns);
              const isYou = player.uid === user?.uid;
              return (
                <article
                  key={player.uid}
                  className={`${styles.podiumCol} ${styles[`place_${place}`]}${isYou ? ` ${styles.podiumYou}` : ""}`}
                >
                  <div className={styles.podiumAvatarWrap}>
                    {place === 1 && <span className={styles.winnerCrown} aria-hidden="true">👑</span>}
                    <span className={styles.podiumRing}>
                      <AvatarIllustration seed={player.emoji} size={place === 1 ? 62 : 48} online={player.online} />
                    </span>
                    <span className={styles.podiumRankBadge}>
                      <Image src={rank.assetSrc} alt="" width={22} height={22} />
                    </span>
                  </div>

                  <strong className={styles.podiumName}>
                    {player.name}
                    {isYou ? " (Toi)" : ""}
                  </strong>

                  <span className={styles.podiumCrowns}>
                    <NjamboIcon name="crown" tone="gold" size={13} />
                    {crowns.toLocaleString("fr-FR")}
                  </span>

                  <div className={styles.pedestal}>
                    <span className={styles.pedestalNum}>#{place}</span>
                    <small>{rank.label}</small>
                  </div>
                </article>
              );
            })}
          </section>

          {/* TABLEAU #4+ (seule cette liste défile) */}
          <section className={styles.rankListCard} aria-label="Suite du classement">
            <div className={styles.rankListScroll}>
              {rest.length === 0 ? (
                <div className={styles.fewPlayersNote}>
                  Défie le quartier en ligne pour remplir le classement !
                </div>
              ) : (
                rest.map((player, idx) => {
                  const pos = idx + 4;
                  const crowns = player.crowns ?? 1_000;
                  const rank = resolveRank(crowns);
                  const isYou = player.uid === user?.uid;
                  return (
                    <div key={player.uid} className={`${styles.rankRow}${isYou ? ` ${styles.rankRowYou}` : ""}`}>
                      <span className={styles.rowPos}>{pos}</span>
                      <AvatarIllustration seed={player.emoji} size={36} online={player.online} />
                      <div className={styles.rowMeta}>
                        <strong>
                          {player.name}
                          {isYou && <span className={styles.youTag}>Toi</span>}
                        </strong>
                        <small>{rank.label}</small>
                      </div>
                      <span className={styles.rowCrowns}>
                        <NjamboIcon name="crown" tone="gold" size={14} />
                        <strong>{crowns.toLocaleString("fr-FR")}</strong>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
    </GameShell>
  );
}
