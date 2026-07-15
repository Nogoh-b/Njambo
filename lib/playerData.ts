"use client";

import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "@/lib/firestoreClient";
import { db } from "@/lib/firebase";
import { callBackend } from "@/lib/backend";
import type { MatchHistoryEntry, OnlinePlayerProfile, PlayerStats } from "@/types/game";

function normalizeStats(raw: unknown): PlayerStats {
  const stats = raw && typeof raw === "object" ? raw as Partial<PlayerStats> : {};
  return {
    played: typeof stats.played === "number" ? stats.played : 0,
    won: typeof stats.won === "number" ? stats.won : 0,
    bestWin: typeof stats.bestWin === "number" ? stats.bestWin : 0,
  };
}

function normalizePlayer(id: string, raw: Record<string, unknown>): OnlinePlayerProfile {
  return {
    uid: typeof raw.uid === "string" ? raw.uid : id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : "Joueur",
    emoji: typeof raw.emoji === "string" && raw.emoji.trim() ? raw.emoji : "😎",
    balance: typeof raw.nkap === "number" ? raw.nkap : typeof raw.balance === "number" ? raw.balance : 0,
    crowns: typeof raw.crowns === "number" ? raw.crowns : 1_000,
    online: raw.online === true,
    lastSeen: typeof raw.lastSeen === "number" ? raw.lastSeen : 0,
    stats: normalizeStats(raw.stats),
    lastBonusAt: typeof raw.lastBonusAt === "number" ? raw.lastBonusAt : 0,
  };
}

function normalizeMatch(id: string, raw: Record<string, unknown>): MatchHistoryEntry {
  return {
    id,
    mode: raw.mode === "online" || raw.mode === "friends" || raw.mode === "bot" ? raw.mode : "bot",
    stake: typeof raw.stake === "number" ? raw.stake : 0,
    gain: typeof raw.gain === "number" ? raw.gain : 0,
    won: raw.won === true,
    winnerName: typeof raw.winnerName === "string" && raw.winnerName.trim() ? raw.winnerName : "Joueur",
    playersCount: typeof raw.playersCount === "number" ? raw.playersCount : 0,
    resultType: raw.resultType === "instant" || raw.resultType === "lastTrick" ? raw.resultType : "lastTrick",
    doubles: raw.doubles === true,
    roomId: typeof raw.roomId === "string" ? raw.roomId : undefined,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
  };
}

export function listenPlayers(currentUid: string | undefined, cb: (players: OnlinePlayerProfile[]) => void): Unsubscribe {
  const playersQuery = query(collection(db, "players"), orderBy("name", "asc"), limit(100));
  return onSnapshot(playersQuery, (snapshot) => {
    cb(snapshot.docs
      .map((playerDoc) => normalizePlayer(playerDoc.id, playerDoc.data()))
      .filter((player) => player.uid !== currentUid));
  });
}

export function listenLeaderboard(cb: (players: OnlinePlayerProfile[]) => void): Unsubscribe {
  const leaderboardQuery = query(collection(db, "players"), orderBy("crowns", "desc"), limit(50));
  return onSnapshot(leaderboardQuery, (snapshot) => cb(snapshot.docs.map((playerDoc) => normalizePlayer(playerDoc.id, playerDoc.data()))));
}

export function listenMatchHistory(uid: string, cb: (matches: MatchHistoryEntry[]) => void): Unsubscribe {
  const historyQuery = query(collection(db, "users", uid, "matches"), orderBy("createdAt", "desc"), limit(30));
  return onSnapshot(historyQuery, (snapshot) => cb(snapshot.docs.map((matchDoc) => normalizeMatch(matchDoc.id, matchDoc.data()))));
}

/** Présence : commande serveur (le backend horodate lastSeen lui-même). */
export async function setPlayerPresence(_uid: string, online: boolean): Promise<void> {
  await callBackend("setPresence", { online });
}
