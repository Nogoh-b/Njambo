"use client";

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  GameMode,
  MatchHistoryEntry,
  OnlinePlayerProfile,
  PlayerStats,
  Result,
} from "@/types/game";

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
    balance: typeof raw.balance === "number" ? raw.balance : 5000,
    online: raw.online === true,
    lastSeen: typeof raw.lastSeen === "number" ? raw.lastSeen : 0,
    stats: normalizeStats(raw.stats),
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

export function listenPlayers(
  currentUid: string | undefined,
  cb: (players: OnlinePlayerProfile[]) => void,
): Unsubscribe {
  const q = query(collection(db, "players"), orderBy("lastSeen", "desc"));
  return onSnapshot(q, (snap) => {
    const players = snap.docs
      .map((playerDoc) => normalizePlayer(playerDoc.id, playerDoc.data()))
      .filter((player) => player.uid !== currentUid);
    cb(players);
  });
}

export function listenLeaderboard(cb: (players: OnlinePlayerProfile[]) => void): Unsubscribe {
  const q = query(collection(db, "players"), orderBy("balance", "desc"), limit(50));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((playerDoc) => normalizePlayer(playerDoc.id, playerDoc.data())));
  });
}

export function listenMatchHistory(
  uid: string,
  cb: (matches: MatchHistoryEntry[]) => void,
): Unsubscribe {
  const q = query(collection(db, "users", uid, "matches"), orderBy("createdAt", "desc"), limit(30));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((matchDoc) => normalizeMatch(matchDoc.id, matchDoc.data())));
  });
}

export async function setPlayerPresence(uid: string, online: boolean): Promise<void> {
  const payload = {
    uid,
    online,
    lastSeen: Date.now(),
  };
  await setDoc(doc(db, "players", uid), payload, { merge: true });
}

export async function recordMatchResult(params: {
  uid: string;
  name: string;
  emoji: string;
  currentBalance: number;
  result: Result;
  mode: GameMode;
  stake: number;
  roomId?: string;
  matchKey: string;
}): Promise<void> {
  const { uid, name, emoji, currentBalance, result, mode, stake, roomId, matchKey } = params;
  const won = result.winner.isYou;
  const totalGain = result.gain + (result.doubles ? stake * (result.playersCount - 1) : 0);
  const gain = won ? totalGain : -stake;
  const createdAt = Date.now();

  const match: MatchHistoryEntry = {
    id: matchKey,
    mode,
    stake,
    gain,
    won,
    winnerName: result.winner.name,
    playersCount: result.playersCount,
    resultType: result.type,
    doubles: result.doubles,
    roomId,
    createdAt,
  };

  const userRef = doc(db, "users", uid);
  const playerRef = doc(db, "players", uid);
  const matchRef = doc(db, "users", uid, "matches", matchKey);

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    const existing = userSnap.exists() ? userSnap.data() : {};
    const currentStats = normalizeStats(existing.stats);
    const nextStats: PlayerStats = {
      played: currentStats.played + 1,
      won: currentStats.won + (won ? 1 : 0),
      bestWin: Math.max(currentStats.bestWin, won ? totalGain : 0),
    };
    const balance = currentBalance;
    const profilePayload = {
      name,
      emoji,
      balance,
      stats: nextStats,
      updatedAt: createdAt,
    };

    transaction.set(matchRef, match, { merge: true });
    transaction.set(userRef, profilePayload, { merge: true });
    transaction.set(playerRef, {
      ...profilePayload,
      uid,
      online: true,
      lastSeen: createdAt,
    }, { merge: true });
  });
}
