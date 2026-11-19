"use client";

import { useState } from "react";
import { useGame } from "@/contexts/GameContext";
import { useLobby } from "@/contexts/LobbyContext";
import { useAuth } from "@/hooks/useAuth";
import { sendFriendRequest, sendRoomInvite } from "@/lib/socialData";
import { NjamboIcon } from "@/components/ui/Art";
import type { PublicPlayerProfile, SocialUserLite } from "@/types/game";
import styles from "./SocialActions.module.css";

interface SocialActionsProps {
  player: PublicPlayerProfile | SocialUserLite;
  compact?: boolean;
  showProfile?: boolean;
  showInvite?: boolean;
  /** Masque « Ajouter » lorsque le joueur fait déjà partie du cercle d'amis. */
  isFriend?: boolean;
  /** Affiche un état « Envoyé » si une demande est déjà en attente. */
  requestSent?: boolean;
  tone?: "gold" | "teal" | "pink" | "cobalt";
  onFeedback?: (message: string, tone?: "gold" | "emerald" | "ruby") => void;
}

function toLite(player: PublicPlayerProfile | SocialUserLite): SocialUserLite {
  return { uid: player.uid, name: player.name, emoji: player.emoji };
}

export function SocialActions({
  player,
  compact = false,
  showProfile = true,
  showInvite = true,
  isFriend = false,
  requestSent = false,
  tone,
  onFeedback,
}: SocialActionsProps) {
  const { user } = useAuth();
  const { navigateTo, setSocialTarget, cfg } = useGame();
  const { currentRoom, createRoom } = useLobby();
  const [busy, setBusy] = useState<"friend" | "invite" | null>(null);
  const [sentFriend, setSentFriend] = useState(false);
  const [sentInvite, setSentInvite] = useState(false);

  const isSelf = !user || user.uid === player.uid;
  const me = user ? { uid: user.uid, name: user.name, emoji: user.emoji } : null;
  const target = toLite(player);
  const alreadyRequested = requestSent || sentFriend;

  const openProfile = () => {
    setSocialTarget({ playerUid: player.uid, peerUid: player.uid, peerName: player.name, peerEmoji: player.emoji });
    navigateTo("public_profile");
  };

  const openChat = () => {
    setSocialTarget({ peerUid: player.uid, peerName: player.name, peerEmoji: player.emoji });
    navigateTo("chat");
  };

  const addFriend = async () => {
    if (!me || isSelf || alreadyRequested) return;
    setBusy("friend");
    try {
      await sendFriendRequest(me, target);
      setSentFriend(true);
      onFeedback?.(`Demande envoyée à ${player.name}`, "gold");
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
      setSentInvite(true);
      onFeedback?.(`Invitation de table envoyée à ${player.name}`, "emerald");
      if (!currentRoom?.id) navigateTo("lobby");
    } finally {
      setBusy(null);
    }
  };

  const iconSize = compact ? 15 : 17;
  const profileTone = tone ?? "gold";
  const sizeClass = compact ? ` ${styles.compact}` : "";

  return (
    <div
      role="group"
      aria-label={`Actions pour ${player.name}`}
      className={styles.group}
    >
      {showProfile && (
        <button
          data-nj-skin="none"
          type="button"
          className={`${styles.btn} ${styles.profile}${sizeClass}`}
          aria-label={`Voir le profil de ${player.name}`}
          title={`Profil de ${player.name}`}
          onClick={openProfile}
        >
          <NjamboIcon name="profile" tone={profileTone} size={iconSize} />
          {!compact && <span>Profil</span>}
        </button>
      )}

      {!isFriend && (
        <button
          data-nj-skin="none"
          type="button"
          className={`${styles.btn} ${alreadyRequested ? styles.addDone : styles.add}${sizeClass}`}
          aria-label={alreadyRequested ? `Demande déjà envoyée à ${player.name}` : `Ajouter ${player.name} aux amis`}
          title={alreadyRequested ? "Demande envoyée" : "Ajouter aux amis"}
          onClick={addFriend}
          disabled={isSelf || busy === "friend" || alreadyRequested}
        >
          {alreadyRequested ? (
            <span className={styles.checkMark} aria-hidden="true">✓</span>
          ) : (
            <NjamboIcon name="plus" tone="gold" size={iconSize} />
          )}
          {!compact && (
            <span>{busy === "friend" ? "…" : alreadyRequested ? "Envoyée" : "Ajouter"}</span>
          )}
        </button>
      )}

      <button
        data-nj-skin="none"
        type="button"
        className={`${styles.btn} ${styles.message}${sizeClass}`}
        aria-label={`Écrire à ${player.name}`}
        title={`Écrire à ${player.name}`}
        onClick={openChat}
        disabled={isSelf}
      >
        <NjamboIcon name="message" tone="teal" size={iconSize} />
        {!compact && <span>Message</span>}
      </button>

      {showInvite && (
        <button
          data-nj-skin="none"
          type="button"
          className={`${styles.btn} ${sentInvite ? styles.inviteDone : styles.invite}${sizeClass}`}
          aria-label={`Inviter ${player.name} à une table`}
          title={`Inviter ${player.name} à une table`}
          onClick={invite}
          disabled={isSelf || busy === "invite"}
        >
          {sentInvite ? (
            <span className={styles.checkMark} aria-hidden="true">✓</span>
          ) : (
            <NjamboIcon name="cards" tone="light" size={iconSize} />
          )}
          {!compact && (
            <span>{busy === "invite" ? "…" : sentInvite ? "Invité" : "Inviter"}</span>
          )}
        </button>
      )}
    </div>
  );
}
