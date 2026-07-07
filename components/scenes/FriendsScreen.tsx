"use client";

import { useEffect, useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import {
  acceptFriendRequest,
  listenDiscoverPlayers,
  listenFriendRequests,
  listenFriends,
  rejectFriendRequest,
} from "@/lib/socialData";
import { AvatarIllustration } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Shell, Surface } from "@/components/ui/Shell";
import { SocialActions } from "@/components/social/SocialActions";
import type { FriendRequest, PublicPlayerProfile, SocialFriendEntry } from "@/types/game";

type Tab = "friends" | "requests" | "players";

export function FriendsScreen() {
  const { navigateTo } = useGame();
  const { user } = useAuth();
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
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader title="Amis" kicker={`${friends.length} amis · ${incomingCount} demande${incomingCount > 1 ? "s" : ""}`} icon="friends" tone="teal" onBack={() => navigateTo("menu")} backLabel="Retour" />
          <Surface>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
              <Btn variant={tab === "friends" ? "gold" : "ghost"} onClick={() => setTab("friends")}>Amis</Btn>
              <Btn variant={tab === "requests" ? "pink" : "ghost"} onClick={() => setTab("requests")}>Demandes</Btn>
              <Btn variant={tab === "players" ? "gold" : "ghost"} onClick={() => setTab("players")}>Joueurs</Btn>
            </div>

            {tab === "players" && (
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="nj-input"
                placeholder="Rechercher un pseudo"
                style={{ width: "100%", marginBottom: 12 }}
              />
            )}

            <div className="nj-stack" style={{ gap: 10 }}>
              {tab === "friends" && friends.length === 0 && (
                <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Aucun ami pour le moment.</div>
              )}
              {tab === "friends" && friends.map((friend, i) => (
                <div
                  key={friend.uid}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 10px",
                    borderRadius: 17,
                    background: "rgba(255,248,232,.052)",
                    border: friend.online ? `1px solid ${T.teal}55` : "1px solid rgba(255,248,232,.1)",
                    animation: `riseIn .3s ${i * 0.04}s both`,
                  }}
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
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 10px",
                      borderRadius: 17,
                      background: incoming ? `${T.pink}16` : "rgba(255,248,232,.052)",
                      border: incoming ? `1.5px solid ${T.pink}` : "1px solid rgba(255,248,232,.1)",
                      animation: `riseIn .3s ${i * 0.04}s both`,
                    }}
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
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 10px",
                    borderRadius: 17,
                    background: "rgba(255,248,232,.052)",
                    border: player.online ? `1px solid ${T.teal}55` : "1px solid rgba(255,248,232,.1)",
                    animation: `riseIn .3s ${i * 0.04}s both`,
                  }}
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
          </Surface>
        </div>
      </div>
    </Shell>
  );
}
