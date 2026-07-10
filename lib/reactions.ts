"use client";

import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

/* ═══════════════ lib/reactions.ts ═══════════════
   Réactions émoji éphémères en partie en ligne. Sous-collection dédiée
   rooms/{roomId}/reactions — totalement découplée du moteur de jeu
   (FirestoreGameSync) : le document de round n'est jamais touché. */

export interface PlayerReaction {
  id: string;
  fromUid: string;
  emoji: string;
  createdAt: number;
}

export const REACTION_EMOJIS = ["👍", "😂", "🔥", "😮", "🙏"];

export async function sendReaction(roomId: string, fromUid: string, emoji: string): Promise<void> {
  if (!roomId || !fromUid || !emoji) return;
  await addDoc(collection(db, "rooms", roomId, "reactions"), {
    fromUid,
    emoji,
    createdAt: Date.now(),
  });
}

/** Écoute les réactions créées APRÈS `sinceMs` (évite de rejouer l'historique). */
export function listenReactions(
  roomId: string,
  sinceMs: number,
  cb: (reactions: PlayerReaction[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, "rooms", roomId, "reactions"),
    where("createdAt", ">", sinceMs),
    orderBy("createdAt", "desc"),
    limit(12),
  );
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: d.id,
          fromUid: typeof raw.fromUid === "string" ? raw.fromUid : "",
          emoji: typeof raw.emoji === "string" ? raw.emoji : "",
          createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
        };
      }),
    );
  });
}
