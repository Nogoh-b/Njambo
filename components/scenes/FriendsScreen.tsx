"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getEntranceAnimationStyle, useMotionProfile } from "@/lib/motion";
import {
  acceptFriendRequest,
  listenDiscoverPlayers,
  listenFriendRequests,
  listenFriends,
  rejectFriendRequest,
} from "@/lib/socialData";
import { PlayerCard } from "@/components/player/PlayerCard";
import { fromFriendEntry, fromFriendRequest, fromPublicProfile } from "@/components/player/playerCardData";
import { GameHubLayout } from "@/components/ui/GameHubLayout";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { TabBar } from "@/components/ui/TabBar";
import { SocialActions } from "@/components/social/SocialActions";
import type { FriendRequest, PublicPlayerProfile, SocialFriendEntry } from "@/types/game";
import styles from "./FriendsScreen.module.css";

type Tab = "friends" | "requests" | "players";

export function FriendsScreen() {
  const { user } = useAuth();
  const motion = useMotionProfile();
  const [tab, setTab] = useState<Tab>("friends");
  const [search, setSearch] = useState("");
  const [friends, setFriends] = useState<SocialFriendEntry[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [players, setPlayers] = useState<PublicPlayerProfile[]>([]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = listenFriends(user.uid, setFriends);
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = listenFriendRequests(user.uid, setRequests);
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    const unsub = listenDiscoverPlayers(user?.uid, search, setPlayers);
    return unsub;
  }, [search, user?.uid]);

  const incomingCount = requests.filter((req) => req.toUid === user?.uid).length;

  return (
    <GameHubLayout
      tone="social"
      kicker={`${friends.length} amis · ${incomingCount} demande${incomingCount > 1 ? "s" : ""}`}
      title="Le village social"
      subtitle="Retrouve tes proches, réponds aux invitations et rencontre de nouveaux joueurs."
      active="friends"
      className={styles.socialHub}
    >
      <section className={styles.panel} aria-label="Réseau social Njambo">
            <TabBar
              tabs={[
                { id: "friends", label: "Amis", tone: "palm" },
                { id: "requests", label: "Demandes", tone: "pink", badge: incomingCount > 0 ? incomingCount : undefined },
                { id: "players", label: "Joueurs", tone: "teal" },
              ]}
              activeId={tab}
              onChange={(next) => setTab(next as Tab)}
              ariaLabel="Sections sociales"
              tone="palm"
              className={styles.tabs}
            />

            {tab === "players" && (
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`nj-input ${styles.search}`}
                placeholder="Rechercher un pseudo"
                aria-label="Rechercher un joueur par pseudo"
              />
            )}

            <div className={`nj-stack ${styles.list}`}>
              {tab === "friends" && friends.length === 0 && (
                <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Aucun ami pour le moment.</div>
              )}
              {tab === "friends" && friends.map((friend, i) => (
                <PlayerCard
                  key={friend.uid}
                  player={fromFriendEntry(friend)}
                  tone={friend.online ? "teal" : undefined}
                  active={friend.online}
                  style={getEntranceAnimationStyle(motion, i)}
                  actions={<SocialActions player={friend} compact showProfile={false} />}
                />
              ))}

              {tab === "requests" && requests.length === 0 && (
                <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Aucune demande en attente.</div>
              )}
              {tab === "requests" && requests.map((req, i) => {
                const incoming = req.toUid === user?.uid;
                return (
                  <PlayerCard
                    key={req.id}
                    player={fromFriendRequest(req, incoming ? "from" : "to")}
                    tone={incoming ? "pink" : undefined}
                    active={incoming}
                    style={getEntranceAnimationStyle(motion, i)}
                    subtitle={null}
                    badges={<Chip tone={incoming ? "pink" : "muted"}>{incoming ? "Reçue" : "Envoyee"}</Chip>}
                    actions={incoming ? (
                      <>
                        <Btn tone="teal" fill="solid" size="sm" onClick={() => { void acceptFriendRequest(req); }} style={{ paddingInline: 10 }}>OK</Btn>
                        <Btn tone="red" fill="solid" size="sm" onClick={() => { void rejectFriendRequest(req.id); }} style={{ paddingInline: 10 }}>Non</Btn>
                      </>
                    ) : (
                      <Btn tone="red" fill="outline" size="sm" onClick={() => { void rejectFriendRequest(req.id, true); }} style={{ paddingInline: 10 }}>Annuler</Btn>
                    )}
                  />
                );
              })}

              {tab === "players" && players.length === 0 && (
                <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Aucun joueur trouve.</div>
              )}
              {tab === "players" && players.map((player, i) => (
                <PlayerCard
                  key={player.uid}
                  player={fromPublicProfile(player)}
                  tone={player.online ? "teal" : undefined}
                  active={player.online}
                  style={getEntranceAnimationStyle(motion, i)}
                  actions={<SocialActions player={player} compact />}
                />
              ))}
            </div>
      </section>
    </GameHubLayout>
  );
}
