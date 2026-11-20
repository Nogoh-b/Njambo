"use client";

/* Défis entre amis (phase 7) : défier un ami sur l'événement, répondre aux
   invitations, suivre les duels (scores en direct) et leurs résultats. */

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import type { ChallengeSideScore, EventVersion, Reward } from "@/domain";
import { callBackend } from "@/lib/backend";
import { listenFriends } from "@/lib/socialData";
import { rewardVisual } from "@/lib/eventRewards";
import type { SocialFriendEntry } from "@/types/game";
import styles from "./EventChallenges.module.css";

export interface ChallengeItem {
  id: string;
  eventId: string;
  fromUid: string;
  toUid: string;
  fromName: string;
  toName: string;
  fromEmoji: string;
  toEmoji: string;
  status: "pending" | "accepted" | "declined" | "finished" | "expired";
  fromRunId?: string;
  toRunId?: string;
  winnerUid?: string | null;
  winnerReward: Reward[];
  scores?: { from: ChallengeSideScore | null; to: ChallengeSideScore | null };
  live?: { from: ChallengeSideScore | null; to: ChallengeSideScore | null };
  expiresAt: number;
}

export function useEventChallenges(eventId: string, active: boolean) {
  const [challenges, setChallenges] = useState<ChallengeItem[] | null>(null);
  const reload = useCallback(async () => {
    if (!active) return;
    try { setChallenges((await callBackend<{ challenges: ChallengeItem[] }>("listMyChallenges", { eventId })).data.challenges); } catch { setChallenges([]); }
  }, [eventId, active]);
  useEffect(() => { void reload(); }, [reload]);
  return { challenges, reload };
}

function Rewards({ rewards }: { rewards: Reward[] }) {
  return (
    <span className={styles.rewards}>
      {rewards.map((reward, index) => {
        const visual = rewardVisual(reward);
        return <span key={index}><Image src={visual.src} unoptimized={visual.src.startsWith("http")} alt="" width={16} height={16} />{visual.label}</span>;
      })}
    </span>
  );
}

/** Contenu de la fenêtre « Défis » (présentation pure + actions). */
export function ChallengesView({ event, uid, challenges, friends, busy, onChallenge, onRespond }: {
  event: Pick<EventVersion, "title" | "friendChallenges">;
  uid: string;
  challenges: ChallengeItem[] | null;
  friends: SocialFriendEntry[];
  busy: string | null;
  onChallenge: (friendUid: string) => void;
  onRespond: (challengeId: string, accept: boolean) => void;
}) {
  const open = (challenges ?? []).filter((item) => item.status === "pending" || item.status === "accepted");
  const engaged = new Set(open.flatMap((item) => [item.fromUid, item.toUid]));
  const side = (item: ChallengeItem) => {
    const mine = item.fromUid === uid;
    return {
      mine, otherName: mine ? item.toName : item.fromName, otherEmoji: mine ? item.toEmoji : item.fromEmoji,
      myScore: (item.scores ?? item.live)?.[mine ? "from" : "to"] ?? null,
      theirScore: (item.scores ?? item.live)?.[mine ? "to" : "from"] ?? null,
      myRunBound: Boolean(mine ? item.fromRunId : item.toRunId),
    };
  };
  const scoreText = (score: ChallengeSideScore | null) => (score ? `${score.score} pts${score.finished ? "" : " · en cours"}` : "pas encore joué");

  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        Duel sur « {event.title} » : vos <strong>prochains parcours</strong> sont comparés (tables, vies, parcours parfait ; égalité → le plus rapide). Le gagnant reçoit <Rewards rewards={event.friendChallenges.winnerReward} />.
      </p>

      {(challenges ?? []).length > 0 && (
        <section>
          <h3 className={styles.h3}>Mes duels</h3>
          <ul className={styles.list}>
            {(challenges ?? []).map((item) => {
              const s = side(item);
              const won = item.status === "finished" && item.winnerUid === uid;
              const lost = item.status === "finished" && item.winnerUid && item.winnerUid !== uid;
              return (
                <li key={item.id} className={`${styles.duel} ${won ? styles.won : lost ? styles.lost : ""}`}>
                  <div className={styles.versus}>
                    <span className={styles.me}>Toi<small>{scoreText(s.myScore)}</small></span>
                    <span className={styles.vs}>⚔️</span>
                    <span className={styles.them}>{s.otherEmoji} {s.otherName}<small>{scoreText(s.theirScore)}</small></span>
                  </div>
                  {item.status === "pending" && !s.mine && (
                    <div className={styles.actions}>
                      <button data-nj-skin="none" type="button" className={styles.accept} disabled={busy !== null} onClick={() => onRespond(item.id, true)}>Relever le défi</button>
                      <button data-nj-skin="none" type="button" className={styles.decline} disabled={busy !== null} onClick={() => onRespond(item.id, false)}>Refuser</button>
                    </div>
                  )}
                  <span className={styles.status}>
                    {item.status === "pending" && (s.mine ? "En attente de sa réponse" : "Te défie !")}
                    {item.status === "accepted" && (s.myRunBound ? "Duel en cours" : "Lance ton prochain parcours : il compte pour le duel")}
                    {item.status === "finished" && (won ? <>🏆 Victoire · <Rewards rewards={item.winnerReward} /></> : lost ? "Défaite — prends ta revanche !" : "Égalité parfaite")}
                    {item.status === "declined" && "Défi refusé"}
                    {item.status === "expired" && "Défi expiré"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h3 className={styles.h3}>Défier un ami</h3>
        {friends.length === 0 ? <p className={styles.hint}>Ajoute des amis depuis l’onglet Social pour les défier.</p> : (
          <ul className={styles.friends}>
            {friends.map((friend) => (
              <li key={friend.uid}>
                <span>{friend.emoji} {friend.name}</span>
                <button data-nj-skin="none" type="button" className={styles.challenge} disabled={busy !== null || engaged.has(friend.uid)} onClick={() => onChallenge(friend.uid)}>
                  {engaged.has(friend.uid) ? "Duel ouvert" : busy === friend.uid ? "…" : "Défier"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Version connectée (données + commandes). */
export function EventChallenges({ event, uid, onChanged }: { event: EventVersion; uid: string; onChanged?: () => void }) {
  const { challenges, reload } = useEventChallenges(event.eventId, true);
  const [friends, setFriends] = useState<SocialFriendEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => listenFriends(uid, setFriends), [uid]);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try { await action(); await reload(); onChanged?.(); } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      setError(/ALREADY_OPEN/.test(reason) ? "Un duel est déjà ouvert avec cet ami." : /NOT_FRIENDS/.test(reason) ? "Vous n’êtes pas (encore) amis." : /EXPIRED/.test(reason) ? "Ce défi a expiré." : "L’action a échoué, réessaie.");
    } finally { setBusy(null); }
  };

  return (
    <>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <ChallengesView
        event={event} uid={uid} challenges={challenges} friends={friends} busy={busy}
        onChallenge={(friendUid) => void run(friendUid, () => callBackend("createEventChallenge", { eventId: event.eventId, toUid: friendUid }))}
        onRespond={(challengeId, accept) => void run(challengeId, () => callBackend("respondEventChallenge", { challengeId, accept }))}
      />
    </>
  );
}
