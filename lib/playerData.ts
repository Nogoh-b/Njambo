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
import { db, serverTimestamp } from "@/lib/firebase";
import type {
  GameMode,
  MatchHistoryEntry,
  OnlinePlayerProfile,
  PlayerStats,
  Result,
} from "@/types/game";

/** Mismatch solde client/serveur détecté en transaction — porte le solde serveur
    post-gain pour que l'appelant puisse se resynchroniser et réessayer. */
export class BalanceMismatchError extends Error {
  constructor(message: string, public readonly serverBalance: number) {
    super(message);
    this.name = "BalanceMismatchError";
  }
}

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

/**
 * Met à jour la présence d'un joueur dans la sous-collection dédiée.
 * Cette sous-collection est libre en écriture (règle: self only),
 * tandis que le document players/{uid} principal est en lecture seule.
 */
export async function setPlayerPresence(uid: string, online: boolean): Promise<void> {
  const payload = {
    online,
    lastSeen: serverTimestamp(),
  };
  await setDoc(doc(db, "players_presence", uid), payload, { merge: true });
}

/**
 * Enregistre le résultat d'une partie avec validation incrémentale du solde.
 *
 * Pattern sécurisé : au lieu d'écraser le solde (currentBalance), on lit
 * le solde actuel depuis Firestore et on ajoute le gain net calculé.
 * Les Security Rules interdisent l'écriture directe de players/{uid},
 * donc on écrit dans players/{uid} via une transaction qui vérifie
 * la cohérence du gain.
 *
 * @returns true si le settlement a réussi, false sinon
 */
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
}): Promise<{ success: boolean; error?: string; serverBalance?: number }> {
  const { uid, name, emoji, currentBalance, result, mode, stake, roomId, matchKey } = params;
  const won = result.winner.isYou;
  const totalGain = result.gain + (result.doubles ? stake * (result.playersCount - 1) : 0);
  // Delta net appliqué au solde. DOIT correspondre EXACTEMENT au calcul client
  // (NjamboApp.handleResult), sinon la transaction rejette (« Balance mismatch »)
  // et le solde serveur se fige pendant que le client avance (drift) :
  //  • result.gain est le pot BRUT (la mise du gagnant y est incluse) → on
  //    retire la mise du gagnant : il ne récupère pas sa propre mise.
  //  • un perdant paie sa mise, plus une pénalité doublée si la manche est doublée,
  //    moins un éventuel remboursement Cauris Chanceux (result.refund).
  const lossPenalty = stake + (result.doubles ? stake : 0);
  const refund = won ? 0 : (result.refund ?? 0);
  const gain = won ? totalGain - stake : -lossPenalty + refund;
  const createdAt = Date.now();

  // Sanity check : le gain est-il raisonnable ?
  // Perte max = mise + pénalité doubles ; gain borné arbitrairement à 50000.
  if (gain < -lossPenalty) {
    return { success: false, error: `Perte suspecte: ${gain}` };
  }
  if (gain > 50000) {
    return { success: false, error: `Gain excessif: ${gain}` };
  }

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

  try {
    await runTransaction(db, async (transaction) => {
      // 1. Lire le solde ACTUEL depuis Firestore (pas depuis le client)
      const playerSnap = await transaction.get(playerRef);
      const existingPlayer = playerSnap.exists() ? playerSnap.data() : {};
      const actualCurrentBalance = typeof existingPlayer.balance === "number" ? existingPlayer.balance : 5000;

      // 2. Vérifier la cohérence avec le solde passé en paramètre
      // Le solde client doit correspondre au solde serveur + les gains/pertes cumulés
      const expectedBalance = actualCurrentBalance + gain;
      if (Math.abs(expectedBalance - currentBalance) > 1) {
        // Décalage > 1 FCFA → possible triche ou drift
        throw new BalanceMismatchError(
          `Balance mismatch: expected ${expectedBalance}, got ${currentBalance}`,
          expectedBalance,
        );
      }

      // 3. Calculer les stats
      const currentStats = normalizeStats(existingPlayer.stats);
      const nextStats: PlayerStats = {
        played: currentStats.played + 1,
        won: currentStats.won + (won ? 1 : 0),
        bestWin: Math.max(currentStats.bestWin, won ? totalGain : 0),
      };

      const profilePayload = {
        name,
        emoji,
        balance: expectedBalance,
        stats: nextStats,
        updatedAt: serverTimestamp(),
      };

      // 4. Écrire les 3 documents dans une seule transaction
      transaction.set(matchRef, match, { merge: true });
      transaction.set(userRef, profilePayload, { merge: true });
      transaction.set(playerRef, {
        ...profilePayload,
        uid,
        online: true,
        lastSeen: createdAt,
      }, { merge: true });
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[playerData] recordMatchResult failed:", message);
    if (err instanceof BalanceMismatchError) {
      return { success: false, error: message, serverBalance: err.serverBalance };
    }
    return { success: false, error: message };
  }
}

/**
 * Réclame le bonus quotidien (1 fois / cooldown). Transaction sur players/{uid} :
 * lit balance + lastBonusAt, et si le cooldown est écoulé, ajoute `amount` et
 * met à jour lastBonusAt. Miroir sur users/{uid}. Idempotent par la fenêtre.
 */
export async function claimDailyBonus(
  uid: string,
  amount: number,
  cooldownMs: number,
): Promise<{ granted: boolean; amount: number; balance: number; nextAt: number }> {
  const playerRef = doc(db, "players", uid);
  const userRef = doc(db, "users", uid);
  const now = Date.now();

  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(playerRef);
      const data = snap.exists() ? snap.data() : {};
      const balance = typeof data.balance === "number" ? data.balance : 5000;
      const lastBonusAt = typeof data.lastBonusAt === "number" ? data.lastBonusAt : 0;

      if (now - lastBonusAt < cooldownMs) {
        return { granted: false, amount: 0, balance, nextAt: lastBonusAt + cooldownMs };
      }

      const nextBalance = balance + amount;
      const payload = { balance: nextBalance, lastBonusAt: now, updatedAt: serverTimestamp() };
      transaction.set(playerRef, { ...payload, uid, online: true, lastSeen: now }, { merge: true });
      transaction.set(userRef, payload, { merge: true });
      return { granted: true, amount, balance: nextBalance, nextAt: now + cooldownMs };
    });
  } catch (err) {
    console.error("[playerData] claimDailyBonus failed:", err);
    return { granted: false, amount: 0, balance: 0, nextAt: 0 };
  }
}

/**
 * Anti-faillite : si le solde est sous `floor`, le remonte au plancher pour que
 * le joueur puisse toujours rejouer la plus petite mise. Renvoie le solde final.
 */
export async function topUpIfBroke(uid: string, floor: number): Promise<number> {
  const playerRef = doc(db, "players", uid);
  const userRef = doc(db, "users", uid);
  const now = Date.now();

  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(playerRef);
      const data = snap.exists() ? snap.data() : {};
      const balance = typeof data.balance === "number" ? data.balance : floor;
      if (balance >= floor) return balance;

      const payload = { balance: floor, updatedAt: serverTimestamp() };
      transaction.set(playerRef, { ...payload, uid, online: true, lastSeen: now }, { merge: true });
      transaction.set(userRef, payload, { merge: true });
      return floor;
    });
  } catch (err) {
    console.error("[playerData] topUpIfBroke failed:", err);
    return floor;
  }
}
