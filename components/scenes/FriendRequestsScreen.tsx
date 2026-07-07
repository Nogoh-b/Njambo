"use client";

import { useEffect, useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { acceptFriendRequest, listenFriendRequests, rejectFriendRequest } from "@/lib/socialData";
import { AvatarIllustration } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { ScreenHeader, Shell, Surface } from "@/components/ui/Shell";
import type { FriendRequest } from "@/types/game";

export function FriendRequestsScreen() {
  const { navigateTo } = useGame();
  const { user } = useAuth();
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
            </div>
          </Surface>
        </div>
      </div>
    </Shell>
  );
}
