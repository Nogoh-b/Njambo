"use client";

/* Onglet « Classement » du détail d'un événement : podium, top 50, ma ligne
   épinglée, barème et récompenses par rang. Données : commande serveur
   getEventLeaderboard (le rang hors top 50 est calculé côté serveur). */

import Image from "@/components/ui/GameImage";
import { useState } from "react";
import type { EventRankReward, EventVersion } from "@/domain";
import type { EventLeaderboardData, RankedEntry } from "@/hooks/useEventLeaderboard";
import { rewardVisual } from "@/lib/eventRewards";
import styles from "./EventLeaderboardPanel.module.css";

export const rankLabel = (rank: number) => (rank === 1 ? "1er" : `${rank}e`);
const tierLabel = (tier: EventRankReward) => (tier.fromRank === tier.toRank ? rankLabel(tier.fromRank) : `${rankLabel(tier.fromRank)} – ${rankLabel(tier.toRank)}`);

function RewardChips({ rewards }: { rewards: EventRankReward["reward"] }) {
  return (
    <span className={styles.chips}>
      {rewards.map((reward, index) => {
        const visual = rewardVisual(reward);
        return <span key={index} className={styles.chip}><Image src={visual.src} unoptimized={visual.src.startsWith("http")} alt="" width={16} height={16} />{visual.label}</span>;
      })}
    </span>
  );
}

function Row({ entry, mine }: { entry: RankedEntry; mine: boolean }) {
  return (
    <li className={`${styles.row}${mine ? ` ${styles.rowMine}` : ""}`}>
      <span className={styles.rank}>{entry.rank}</span>
      <span className={styles.avatar} aria-hidden="true">
        {entry.emoji}
        {/* eslint-disable-next-line @next/next/no-img-element -- cosmétiques uploadés (URL du VPS) */}
        {entry.cosmetics?.avatarFrame?.imageUrl && <img className={styles.frame} src={entry.cosmetics.avatarFrame.imageUrl} alt="" />}
      </span>
      <span className={styles.name}>
        <span className={styles.nameLine}>
          {mine ? "Toi" : entry.name}
          {entry.perfect && <span className={styles.perfect} title="Parcours parfait">★</span>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {entry.cosmetics?.badge?.imageUrl && <img className={styles.badge} src={entry.cosmetics.badge.imageUrl} alt={entry.cosmetics.badge.name} title={entry.cosmetics.badge.name} />}
        </span>
        {entry.cosmetics?.title && <small className={styles.title}>{entry.cosmetics.title.name}</small>}
      </span>
      <span className={styles.progress}>{entry.completed ? "Grand prix" : `${entry.stagesWon} table${entry.stagesWon > 1 ? "s" : ""}`}</span>
      <strong className={styles.score}>{entry.score.toLocaleString("fr-FR")}</strong>
    </li>
  );
}

export function EventLeaderboardPanel({ event, uid, data, error, reload, preview = false }: {
  event: EventVersion;
  uid: string | null;
  data: EventLeaderboardData | null;
  error: string | null;
  reload: () => void;
  preview?: boolean;
}) {
  const [showRewards, setShowRewards] = useState(false);

  const board = event.leaderboard;
  const top = data?.top ?? [];
  const podium = top.slice(0, 3);
  const rest = top.slice(3);
  const me = data?.me ?? null;
  const meVisible = Boolean(me && top.some((entry) => entry.uid === me.uid));
  const myReward = me ? board.rankRewards.find((tier) => me.rank >= tier.fromRank && me.rank <= tier.toRank) : undefined;

  return (
    <div className={styles.panel}>
      <div className={styles.summary}>
        <span>{data?.settledAt ? "Classement final" : "Classement en direct"}{data ? ` · ${data.participants} joueur${data.participants > 1 ? "s" : ""}` : ""}</span>
        <button type="button" data-nj-skin="none" className={styles.linkBtn} onClick={() => setShowRewards((open) => !open)}>
          {showRewards ? "Voir le classement" : "Récompenses"}
        </button>
      </div>

      {showRewards || preview || !uid ? (
        <div className={styles.scroll}>
          <p className={styles.scoring}>
            +{board.pointsPerStage} pts par table gagnée · à l’arrivée +{board.pointsPerLifeLeft} pts par vie restante
            {board.perfectBonus > 0 ? ` · +${board.perfectBonus} parcours parfait` : ""} · égalité : le plus rapide passe devant.
          </p>
          {board.rankRewards.length === 0 ? <p className={styles.empty}>Pas de récompense de classement pour cet événement.</p> : (
            <ul className={styles.tiers}>
              {board.rankRewards.map((tier, index) => (
                <li key={index}><strong>{tierLabel(tier)}</strong><RewardChips rewards={tier.reward} /></li>
              ))}
            </ul>
          )}
          {board.minParticipants > 1 && <p className={styles.scoring}>Distribuées à la fin si au moins {board.minParticipants} joueurs participent.</p>}
          {!uid && !preview && <p className={styles.empty}>Connecte-toi pour voir le classement.</p>}
        </div>
      ) : error ? (
        <div className={styles.scroll}><p className={styles.empty}>{error} <button type="button" data-nj-skin="none" className={styles.linkBtn} onClick={reload}>Réessayer</button></p></div>
      ) : !data ? (
        <div className={styles.scroll}><p className={styles.empty}>Chargement du classement…</p></div>
      ) : top.length === 0 ? (
        <div className={styles.scroll}><p className={styles.empty}>Personne n’a encore gagné de table. Sois le premier au sommet !</p></div>
      ) : (
        <>
          <div className={styles.scroll}>
            <ol className={styles.podium} aria-label="Podium">
              {[podium[1], podium[0], podium[2]].map((entry, slot) => entry ? (
                <li key={entry.uid} className={`${styles.step} ${styles[`step${[2, 1, 3][slot]}`]}${entry.uid === uid ? ` ${styles.rowMine}` : ""}`}>
                  <span className={styles.podiumAvatar} aria-hidden="true">
                    {entry.emoji}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {entry.cosmetics?.avatarFrame?.imageUrl && <img className={styles.frame} src={entry.cosmetics.avatarFrame.imageUrl} alt="" />}
                  </span>
                  <span className={styles.podiumName}>{entry.uid === uid ? "Toi" : entry.name}</span>
                  {entry.cosmetics?.title && <small className={styles.title}>{entry.cosmetics.title.name}</small>}
                  <strong>{entry.score.toLocaleString("fr-FR")}</strong>
                  <span className={styles.block}>{entry.rank}</span>
                </li>
              ) : <li key={`empty-${slot}`} className={styles.stepEmpty} aria-hidden="true" />)}
            </ol>
            {rest.length > 0 && <ol className={styles.list}>{rest.map((entry) => <Row key={entry.uid} entry={entry} mine={entry.uid === uid} />)}</ol>}
          </div>
          {me && !meVisible && <ol className={`${styles.list} ${styles.pinned}`}><Row entry={me} mine /></ol>}
        </>
      )}

      {me && !showRewards && (
        <p className={styles.myLine}>
          Tu es <strong>{rankLabel(me.rank)}</strong> avec {me.score.toLocaleString("fr-FR")} pts
          {myReward ? <> · à la clé : <RewardChips rewards={myReward.reward} /></> : board.rankRewards.length ? " · grimpe pour décrocher une récompense" : ""}
        </p>
      )}
    </div>
  );
}
