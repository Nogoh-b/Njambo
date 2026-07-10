"use client";

import { useEffect, useMemo, useState } from "react";
import { T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { listenMessages, markConversationRead, sendMessage } from "@/lib/socialData";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import { ScreenHeader, Shell, Surface } from "@/components/ui/Shell";
import type { ChatMessage } from "@/types/game";

export function ChatScreen() {
  const { navigateTo, socialTarget, setSocialTarget } = useGame();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const peer = useMemo(() => ({
    uid: socialTarget.peerUid ?? "",
    name: socialTarget.peerName ?? "Joueur",
    emoji: socialTarget.peerEmoji ?? "😎",
  }), [socialTarget.peerEmoji, socialTarget.peerName, socialTarget.peerUid]);

  useEffect(() => {
    if (!socialTarget.conversationId) {
      setMessages([]);
      return;
    }

    const convId = socialTarget.conversationId;
    const unsub = listenMessages(convId, setMessages);
    if (user?.uid) void markConversationRead(user.uid, convId);
    return unsub;
  }, [socialTarget.conversationId, user?.uid]);

  const submit = async () => {
    if (!user || !peer.uid || !text.trim()) return;
    setBusy(true);
    try {
      const convId = await sendMessage(
        { uid: user.uid, name: user.name, emoji: user.emoji },
        peer,
        text,
      );
      setText("");
      setSocialTarget((prev) => ({ ...prev, conversationId: convId }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="nj-safe">
        <div className="nj-phone">
          <ScreenHeader title={peer.name} kicker="Message prive" icon="message" tone="teal" onBack={() => navigateTo("messages")} backLabel="Messages" />
          <Surface style={{ minHeight: "60svh", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <AvatarIllustration seed={peer.emoji} size={46} online />
              <div>
                <div style={{ fontWeight: 900 }}>{peer.name}</div>
                <div className="nj-subtle">Conversation 1-to-1</div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>
              {messages.length === 0 && <div className="nj-subtle" style={{ textAlign: "center", padding: 20 }}>Aucun message.</div>}
              {messages.map((msg) => {
                const mine = msg.fromUid === user?.uid;
                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: mine ? "flex-end" : "flex-start",
                      maxWidth: "78%",
                      padding: "9px 12px",
                      borderRadius: 14,
                      background: mine
                        ? `${T.teal}26`
                        : "linear-gradient(160deg, rgba(60,37,20,.55), rgba(10,8,6,.82))",
                      border: mine ? `1px solid ${T.teal}66` : "1px solid var(--wood-edge)",
                    }}
                  >
                    {msg.text}
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                placeholder="Ecris un message"
                className="nj-input"
                style={{ flex: 1 }}
              />
              <Btn variant="pink" onClick={() => { void submit(); }} disabled={busy || !text.trim()} icon={<NjamboIcon name="message" tone="light" size={18} />}>
                Envoyer
              </Btn>
            </div>
          </Surface>
        </div>
      </div>
    </Shell>
  );
}
