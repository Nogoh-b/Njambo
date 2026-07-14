"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { getEntranceAnimationStyle, useMotionProfile } from "@/lib/motion";
import { listenConversations } from "@/lib/socialData";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { BottomNavScene } from "@/components/ui/BottomNavScene";
import { ScreenHeader, Surface } from "@/components/ui/Shell";
import type { ConversationEntry } from "@/types/game";

export function MessagesScreen() {
  const { navigateTo, setSocialTarget } = useGame();
  const { user } = useAuth();
  const motion = useMotionProfile();
  const [conversations, setConversations] = useState<ConversationEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setConversations([]);
      setLoading(false);
      return;
    }
    const unsub = listenConversations(user.uid, (items) => {
      setConversations(items);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  return (
    <BottomNavScene active="messages" narrow>
        <div className="nj-phone">
          <ScreenHeader title="Messages" kicker="Discussions" icon="message" tone="teal" onBack={() => navigateTo("menu")} backLabel="Retour" />
          <Surface scrollable>
            <div className="nj-stack" style={{ gap: 10 }}>
              {loading && <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Chargement...</div>}
              {!loading && conversations.length === 0 && <div className="nj-subtle" style={{ textAlign: "center", padding: 18 }}>Aucune conversation.</div>}
              {conversations.map((conv, i) => {
                const peerUid = conv.participants.find((uid) => uid !== user?.uid) ?? "";
                const peer = conv.participantMeta[peerUid] ?? { name: "Joueur", emoji: "😎" };
                const unread = !!(user?.uid && conv.unreadBy?.[user.uid]);
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => {
                      setSocialTarget({ conversationId: conv.id, peerUid, peerName: peer.name, peerEmoji: peer.emoji });
                      navigateTo("chat");
                    }}
                    className={`nj-list-card${unread ? " nj-list-card--teal is-active" : ""}`}
                    style={getEntranceAnimationStyle(motion, i)}
                  >
                    <AvatarIllustration seed={peer.emoji} size={50} online={unread} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>{peer.name}</div>
                      <div className="nj-subtle" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {conv.lastMessage || "Nouvelle conversation"}
                      </div>
                    </div>
                    <NjamboIcon name="message" tone={unread ? "teal" : "light"} size={22} />
                  </button>
                );
              })}
            </div>
          </Surface>
        </div>
    </BottomNavScene>
  );
}
