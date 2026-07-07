"use client";

import { useEffect, useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useLobby } from "@/contexts/LobbyContext";
import { useAuth } from "@/hooks/useAuth";
import { listenNotifications, markNotificationRead } from "@/lib/socialData";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { ScreenHeader, Shell, Surface } from "@/components/ui/Shell";
import type { NotificationEntry } from "@/types/game";

export function NotificationsScreen() {
  const { navigateTo, setSocialTarget } = useGame();
  const { user } = useAuth();
  const { joinRoomById } = useLobby();
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    const unsub = listenNotifications(user.uid, (items) => {
      setNotifications(items);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  const openNotification = async (item: NotificationEntry) => {
    if (user?.uid) await markNotificationRead(user.uid, item.id);
    if (item.type === "room_invite" && item.roomId) {
      const joined = await joinRoomById(item.roomId);
      if (joined) navigateTo("lobby");
      return;
    }
    if (item.type === "message" && item.conversationId) {
      setSocialTarget({
        conversationId: item.conversationId,
        peerUid: item.actorUid,
        peerName: item.actorName,
        peerEmoji: item.actorEmoji,
      });
      navigateTo("chat");
      return;
    }
    if (item.actorUid) {
      setSocialTarget({ playerUid: item.actorUid, peerUid: item.actorUid, peerName: item.actorName, peerEmoji: item.actorEmoji });
      navigateTo("public_profile");
    }
  };

  return (
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader title="Notifications" kicker="Activite" icon="notification" tone="pink" onBack={() => navigateTo("menu")} backLabel="Retour" />
          <Surface>
            <div className="nj-stack" style={{ gap: 10 }}>
              {loading && <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Chargement...</div>}
              {!loading && notifications.length === 0 && <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Aucune notification.</div>}
              {notifications.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { void openNotification(item); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "12px 10px",
                    borderRadius: 17,
                    background: item.read ? "rgba(255,248,232,.052)" : `${T.pink}18`,
                    border: item.read ? "1px solid rgba(255,248,232,.1)" : `1.5px solid ${T.pink}`,
                    color: T.text,
                    textAlign: "left",
                    cursor: "pointer",
                    animation: `riseIn .3s ${i * 0.04}s both`,
                  }}
                >
                  <AvatarIllustration seed={item.actorEmoji} size={48} online />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900 }}>{item.title}</div>
                    <div className="nj-subtle" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.body}</div>
                  </div>
                  <span className="nj-title-icon" style={{ width: 34, height: 34, borderRadius: 12 }}>
                    <NjamboIcon name={item.type === "message" ? "message" : "play"} tone="gold" size={18} />
                  </span>
                </button>
              ))}
            </div>
          </Surface>
        </div>
      </div>
    </Shell>
  );
}
