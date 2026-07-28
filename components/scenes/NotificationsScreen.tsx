"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useLobby } from "@/contexts/LobbyContext";
import { useAuth } from "@/hooks/useAuth";
import { getEntranceAnimationStyle, useMotionProfile } from "@/lib/motion";
import { listenNotifications, markNotificationRead } from "@/lib/socialData";
import { NjamboIcon } from "@/components/ui/Art";
import { PlayerCard } from "@/components/player/PlayerCard";
import { fromNotification } from "@/components/player/playerCardData";
import { BottomNavScene } from "@/components/ui/BottomNavScene";
import { ScreenHeader, Surface } from "@/components/ui/Shell";
import type { NotificationEntry } from "@/types/game";

export function NotificationsScreen() {
  const { navigateTo, setSocialTarget } = useGame();
  const { user } = useAuth();
  const motion = useMotionProfile();
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
    <BottomNavScene active="notifications" narrow>
        <div className="nj-phone">
          <ScreenHeader title="Notifications" kicker="Activite" icon="notification" tone="pink" onBack={() => navigateTo("menu")} backLabel="Retour" />
          <Surface scrollable>
            <div className="nj-stack" style={{ gap: 10 }}>
              {loading && <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Chargement...</div>}
              {!loading && notifications.length === 0 && <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Aucune notification.</div>}
              {notifications.map((item, i) => (
                <PlayerCard
                  key={item.id}
                  as="button"
                  /* L'avatar est celui de l'auteur, mais la ligne principale porte
                     le titre de la notification, pas son nom. */
                  player={{ ...fromNotification(item), name: item.title }}
                  onClick={() => { void openNotification(item); }}
                  ariaLabel={`${item.title} — ${item.body}`}
                  tone={item.read ? undefined : "pink"}
                  active={!item.read}
                  showStatus={false}
                  style={getEntranceAnimationStyle(motion, i)}
                  subtitle={item.body}
                  meta={(
                    <span className="nj-title-icon" style={{ width: 34, height: 34, borderRadius: 12 }}>
                      <NjamboIcon name={item.type === "message" ? "message" : "play"} tone="gold" size={18} />
                    </span>
                  )}
                />
              ))}
            </div>
          </Surface>
        </div>
    </BottomNavScene>
  );
}
