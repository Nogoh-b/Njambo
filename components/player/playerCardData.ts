import type {
  ConversationEntry,
  FriendRequest,
  NotificationEntry,
  OnlinePlayerProfile,
  PlayerStats,
  PublicPlayerProfile,
  RoomPlayer,
  SocialFriendEntry,
  SocialUserLite,
} from "@/types/game";

/**
 * Type pivot de la carte joueur.
 *
 * Les sources du projet sont hétérogènes : certaines exposent un objet joueur
 * structuré (`OnlinePlayerProfile`), d'autres aplatissent l'identité dans
 * l'entité porteuse (`FriendRequest.fromUid`, `NotificationEntry.actorUid`).
 * Ce fichier est le SEUL endroit qui connaît ces formes ; `PlayerCard` ne voit
 * que `PlayerCardData`.
 */
export interface PlayerCardData {
  uid: string;
  name: string;
  /** Graine de l'avatar (le champ s'appelle `emoji` côté données). */
  emoji: string;
  /** `undefined` ⇒ aucune pastille de présence n'est affichée. */
  online?: boolean;
  crowns?: number;
  balance?: number;
  stats?: PlayerStats;
}

/** Repli lorsqu'une méta de participant manque (cf. MessagesScreen). */
export const UNKNOWN_PLAYER: Pick<PlayerCardData, "name" | "emoji"> = { name: "Joueur", emoji: "😎" };

export function fromPublicProfile(p: PublicPlayerProfile | OnlinePlayerProfile): PlayerCardData {
  return {
    uid: p.uid,
    name: p.name,
    emoji: p.emoji,
    online: p.online,
    crowns: p.crowns,
    balance: p.balance,
    stats: p.stats,
  };
}

export function fromFriendEntry(f: SocialFriendEntry): PlayerCardData {
  return { uid: f.uid, name: f.name, emoji: f.emoji, online: f.online };
}

export function fromSocialLite(u: SocialUserLite): PlayerCardData {
  return { uid: u.uid, name: u.name, emoji: u.emoji };
}

export function fromRoomPlayer(p: RoomPlayer): PlayerCardData {
  return { uid: p.uid, name: p.name, emoji: p.emoji, balance: p.balance };
}

/** `FriendRequest` porte une identité aplatie des deux côtés. */
export function fromFriendRequest(r: FriendRequest, side: "from" | "to"): PlayerCardData {
  return side === "from"
    ? { uid: r.fromUid, name: r.fromName, emoji: r.fromEmoji }
    : { uid: r.toUid, name: r.toName, emoji: r.toEmoji };
}

/** `NotificationEntry` aplatit l'auteur sous `actor*`. */
export function fromNotification(n: NotificationEntry): PlayerCardData {
  return { uid: n.actorUid, name: n.actorName, emoji: n.actorEmoji };
}

export function fromConversation(c: ConversationEntry, peerUid: string): PlayerCardData {
  const meta = c.participantMeta[peerUid] ?? UNKNOWN_PLAYER;
  return { uid: peerUid, name: meta.name, emoji: meta.emoji };
}

/** Pont vers `SocialActions`, qui attend un `SocialUserLite`. */
export function toSocialLite(d: PlayerCardData): SocialUserLite {
  return { uid: d.uid, name: d.name, emoji: d.emoji };
}
