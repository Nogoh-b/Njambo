"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { getEntranceAnimationStyle, useMotionProfile } from "@/lib/motion";
import { acceptFriendRequest, listenFriendRequests, rejectFriendRequest } from "@/lib/socialData";
import { PlayerCard } from "@/components/player/PlayerCard";
import { fromFriendRequest } from "@/components/player/playerCardData";
import { BottomNavScene } from "@/components/ui/BottomNavScene";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Surface } from "@/components/ui/Shell";
import type { FriendRequest } from "@/types/game";

export function FriendRequestsScreen() {
  const { navigateTo } = useGame();
  const { user } = useAuth();
  const motion = useMotionProfile();
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setRequests([]);
      setLoading(false);
      return;
    }

    const unsub = listenFriendRequests(user.uid, (items) => {
      setRequests(items);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  return (
    <BottomNavScene active="friends" narrow>
        <div className="nj-phone">
          <ScreenHeader title="Demandes" kicker="Amitie" icon="friends" tone="pink" onBack={() => navigateTo("friends")} backLabel="Amis" />
          <Surface scrollable>
            <div className="nj-stack" style={{ gap: 10 }}>
              {loading && <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Chargement...</div>}
              {!loading && requests.length === 0 && <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Aucune demande en attente.</div>}
              {requests.map((req, i) => {
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
            </div>
          </Surface>
        </div>
    </BottomNavScene>
  );
}
