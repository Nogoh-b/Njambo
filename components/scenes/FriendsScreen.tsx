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
import { AvatarIllustration } from "@/components/ui/Art";
import { GameHubLayout } from "@/components/ui/GameHubLayout";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
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
            <div className={styles.tabs} role="tablist" aria-label="Sections sociales">
              <button data-nj-skin="none" type="button" role="tab" aria-selected={tab === "friends"} onClick={() => setTab("friends")}>Amis</button>
              <button data-nj-skin="none" type="button" role="tab" aria-selected={tab === "requests"} onClick={() => setTab("requests")}>
                Demandes{incomingCount > 0 && <span>{incomingCount}</span>}
              </button>
              <button data-nj-skin="none" type="button" role="tab" aria-selected={tab === "players"} onClick={() => setTab("players")}>Joueurs</button>
            </div>

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
                <div
                  key={friend.uid}
                  className={`nj-list-card${friend.online ? " nj-list-card--teal is-active" : ""}`}
                  style={getEntranceAnimationStyle(motion, i)}
                >
                  <AvatarIllustration seed={friend.emoji} size={50} online={friend.online} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{friend.name}</div>
                    <div className="nj-subtle">{friend.online ? "En ligne" : "Hors ligne"}</div>
                  </div>
                  <SocialActions player={friend} compact showProfile={false} />
                </div>
              ))}

              {tab === "requests" && requests.length === 0 && (
                <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Aucune demande en attente.</div>
              )}
              {tab === "requests" && requests.map((req, i) => {
                const incoming = req.toUid === user?.uid;
                return (
                  <div
                    key={req.id}
                    className={`nj-list-card${incoming ? " nj-list-card--pink is-active" : ""}`}
                    style={getEntranceAnimationStyle(motion, i)}
                  >
                    <AvatarIllustration seed={incoming ? req.fromEmoji : req.toEmoji} size={50} online />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>{incoming ? req.fromName : req.toName}</div>
                      <Chip tone={incoming ? "pink" : "muted"}>{incoming ? "Reçue" : "Envoyee"}</Chip>
                    </div>
                    {incoming ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn variant="gold" onClick={() => { void acceptFriendRequest(req); }} style={{ paddingInline: 10 }}>OK</Btn>
                        <Btn variant="dark" onClick={() => { void rejectFriendRequest(req.id); }} style={{ paddingInline: 10 }}>Non</Btn>
                      </div>
                    ) : (
                      <Btn variant="dark" onClick={() => { void rejectFriendRequest(req.id, true); }} style={{ paddingInline: 10 }}>Annuler</Btn>
                    )}
                  </div>
                );
              })}

              {tab === "players" && players.length === 0 && (
                <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Aucun joueur trouve.</div>
              )}
              {tab === "players" && players.map((player, i) => (
                <div
                  key={player.uid}
                  className={`nj-list-card${player.online ? " nj-list-card--teal is-active" : ""}`}
                  style={getEntranceAnimationStyle(motion, i)}
                >
                  <AvatarIllustration seed={player.emoji} size={50} online={player.online} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name}</div>
                    <div className="nj-subtle">{player.online ? "En ligne" : "Hors ligne"}</div>
                  </div>
                  <SocialActions player={player} compact />
                </div>
              ))}
            </div>
      </section>
    </GameHubLayout>
  );
}
