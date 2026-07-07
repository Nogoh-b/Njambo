"use client";

import { useEffect, useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { listenConversations } from "@/lib/socialData";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { ScreenHeader, Shell, Surface } from "@/components/ui/Shell";
import type { ConversationEntry } from "@/types/game";

export function MessagesScreen() {
  const { navigateTo, setSocialTarget } = useGame();
  const { user } = useAuth();
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
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader title="Messages" kicker="Discussions" icon="message" tone="teal" onBack={() => navigateTo("menu")} backLabel="Retour" />
          <Surface>
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
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      width: "100%",
                      padding: "12px 10px",
                      borderRadius: 17,
                      background: unread ? `${T.teal}18` : "rgba(255,248,232,.052)",
                      border: unread ? `1.5px solid ${T.teal}` : "1px solid rgba(255,248,232,.1)",
                      color: T.text,
                      textAlign: "left",
                      cursor: "pointer",
                      animation: `riseIn .3s ${i * 0.04}s both`,
                    }}
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
      </div>
    </Shell>
  );
}
