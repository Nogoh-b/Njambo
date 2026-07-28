"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { getEntranceAnimationStyle, useMotionProfile } from "@/lib/motion";
import { listenConversations } from "@/lib/socialData";
import { NjamboIcon } from "@/components/ui/Art";
import { PlayerCard } from "@/components/player/PlayerCard";
import { fromConversation } from "@/components/player/playerCardData";
import { BottomNavScene } from "@/components/ui/BottomNavScene";
import { Chip } from "@/components/ui/Chip";
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
                  <PlayerCard
                    key={conv.id}
                    as="button"
                    player={fromConversation(conv, peerUid)}
                    onClick={() => {
                      setSocialTarget({ conversationId: conv.id, peerUid, peerName: peer.name, peerEmoji: peer.emoji });
                      navigateTo("chat");
                    }}
                    ariaLabel={`Conversation avec ${peer.name}${unread ? " — non lue" : ""}`}
                    tone={unread ? "teal" : undefined}
                    active={unread}
                    style={getEntranceAnimationStyle(motion, i)}
                    subtitle={conv.lastMessage || "Nouvelle conversation"}
                    meta={(
                      <>
                        {unread && <Chip tone="teal">Nouveau</Chip>}
                        <NjamboIcon name="message" tone="teal" size={22} />
                      </>
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
