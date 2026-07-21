"use client";

import { useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useLobby } from "@/contexts/LobbyContext";
import { useAuth } from "@/hooks/useAuth";
import { sendFriendRequest, sendRoomInvite } from "@/lib/socialData";
import { Btn } from "@/components/ui/Btn";
import { NjamboIcon } from "@/components/ui/Art";
import type { PublicPlayerProfile, SocialUserLite } from "@/types/game";

interface SocialActionsProps {
  player: PublicPlayerProfile | SocialUserLite;
  compact?: boolean;
  showProfile?: boolean;
  showInvite?: boolean;
}

function toLite(player: PublicPlayerProfile | SocialUserLite): SocialUserLite {
  return { uid: player.uid, name: player.name, emoji: player.emoji };
}

export function SocialActions({ player, compact = false, showProfile = true, showInvite = true }: SocialActionsProps) {
  const { user } = useAuth();
  const { navigateTo, setSocialTarget, cfg } = useGame();
  const { currentRoom, createRoom } = useLobby();
  const [busy, setBusy] = useState<string | null>(null);
  const isSelf = !user || user.uid === player.uid;
  const me = user ? { uid: user.uid, name: user.name, emoji: user.emoji } : null;
  const target = toLite(player);

  const openProfile = () => {
    setSocialTarget({ playerUid: player.uid, peerUid: player.uid, peerName: player.name, peerEmoji: player.emoji });
    navigateTo("public_profile");
  };

  const openChat = () => {
    setSocialTarget({ peerUid: player.uid, peerName: player.name, peerEmoji: player.emoji });
    navigateTo("chat");
  };

  const addFriend = async () => {
    if (!me || isSelf) return;
    setBusy("friend");
    try {
      await sendFriendRequest(me, target);
    } finally {
      setBusy(null);
    }
  };

  const invite = async () => {
    if (!me || isSelf) return;
    setBusy("invite");
    try {
      const roomId = currentRoom?.id ?? await createRoom(cfg.stakes[1], 2, "friends");
      await sendRoomInvite(me, target, roomId);
      if (!currentRoom?.id) navigateTo("lobby");
    } finally {
      setBusy(null);
    }
  };

  const pad = compact ? { paddingInline: 9, fontSize: 11 } : undefined;

  return (
    <div
      role="group"
      aria-label={`Actions pour ${player.name}`}
      style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}
    >
      {showProfile && (
        <Btn ariaLabel={`Voir le profil de ${player.name}`} variant="ghost" onClick={openProfile} style={pad} icon={<NjamboIcon name="profile" tone="gold" size={compact ? 16 : 18} />}>
          {compact ? "" : "Profil"}
        </Btn>
      )}
      <Btn ariaLabel={`Ajouter ${player.name} aux amis`} variant="gold" onClick={addFriend} disabled={isSelf || busy === "friend"} style={pad} icon={<NjamboIcon name="plus" tone="gold" size={compact ? 16 : 18} />}>
        {compact ? "" : busy === "friend" ? "..." : "Ajouter"}
      </Btn>
      <Btn ariaLabel={`Écrire à ${player.name}`} variant="dark" onClick={openChat} disabled={isSelf} style={pad} icon={<NjamboIcon name="message" tone="light" size={compact ? 16 : 18} />}>
        {compact ? "" : "Message"}
      </Btn>
      {showInvite && (
        <Btn ariaLabel={`Inviter ${player.name} à une table`} variant="pink" onClick={invite} disabled={isSelf || busy === "invite"} style={pad} icon={<NjamboIcon name="online" tone="pink" size={compact ? 16 : 18} />}>
          {compact ? "" : busy === "invite" ? "..." : "Inviter"}
        </Btn>
      )}
    </div>
  );
}
