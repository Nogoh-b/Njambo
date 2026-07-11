"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { getEntranceAnimationStyle, useMotionProfile } from "@/lib/motion";
import { acceptFriendRequest, listenFriendRequests, rejectFriendRequest } from "@/lib/socialData";
import { AvatarIllustration } from "@/components/ui/Art";
import { BottomNav } from "@/components/ui/BottomNav";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Shell, Surface } from "@/components/ui/Shell";
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
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader title="Demandes" kicker="Amitie" icon="friends" tone="pink" onBack={() => navigateTo("friends")} backLabel="Amis" />
          <Surface scrollable>
            <div className="nj-stack" style={{ gap: 10 }}>
              {loading && <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Chargement...</div>}
              {!loading && requests.length === 0 && <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Aucune demande en attente.</div>}
              {requests.map((req, i) => {
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
            </div>
          </Surface>
          <BottomNav active="friends" />
        </div>
      </div>
    </Shell>
  );
}
