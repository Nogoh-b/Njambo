"use client";

import { useCallback, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  linkWithCredential,
  signOut,
  updateProfile as updateFirebaseProfile,
  type User,
} from "firebase/auth";
import { EmailAuthProvider } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { setPlayerPresence } from "@/lib/playerData";
import type { AuthUser } from "@/types/game";

/* ═══════════════ useAuth — Firebase Auth ═══════════════
   Gère l'authentification : anonyme auto, email+password,
   liaison compte anonyme → email. Profil stocké dans Firestore. */

interface UseAuthReturn {
  user: AuthUser | null;
  loading: boolean;
  /** Connexion anonyme avec profil local (name, emoji) */
  login: (name: string, emoji: string) => Promise<void>;
  /** Connexion email + mot de passe */
  loginWithEmail: (email: string, password: string) => Promise<void>;
  /** Création de compte email + mot de passe */
  registerWithEmail: (email: string, password: string, name: string, emoji: string) => Promise<void>;
  /** Déconnexion */
  logout: () => Promise<void>;
  /** Lier le compte anonyme courant à un email */
  linkEmail: (email: string, password: string) => Promise<void>;
  /** Mettre à jour le pseudo/avatar persistant */
  updateUserProfile: (profile: { name: string; emoji: string }) => Promise<void>;
}

interface UserProfile {
  name: string;
  emoji: string;
  balance: number;
  stats: { played: number; won: number; bestWin: number };
  createdAt: number;
}

const DEFAULT_PROFILE: UserProfile = {
  name: "Joueur",
  emoji: "😎",
  balance: 5000,
  stats: { played: 0, won: 0, bestWin: 0 },
  createdAt: 0,
};

/** Lit le profil Firestore d'un utilisateur */
async function getUserProfile(uid: string, fbUser?: User | null): Promise<UserProfile> {
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) {
    return snap.data() as UserProfile;
  }

  const playerSnap = await getDoc(doc(db, "players", uid));
  if (playerSnap.exists()) {
    return playerSnap.data() as UserProfile;
  }

  const displayName = fbUser?.displayName?.trim();
  return {
    ...DEFAULT_PROFILE,
    name: displayName || DEFAULT_PROFILE.name,
    emoji: fbUser?.photoURL || DEFAULT_PROFILE.emoji,
  };
}

/** Crée ou met à jour le profil Firestore */
async function saveUserProfile(uid: string, profile: Partial<UserProfile>): Promise<void> {
  const existing = await getUserProfile(uid, auth.currentUser);
  const now = Date.now();
  const payload = {
    ...existing,
    ...profile,
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, "users", uid), payload, { merge: true });
  await setDoc(doc(db, "players", uid), {
    ...payload,
    uid,
    online: true,
    lastSeen: now,
  }, { merge: true });
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  /* ── Listener auth persistant ── */
  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (fbUser: User | null) => {
      if (cancelled) return;
      if (fbUser) {
        const profile = await getUserProfile(fbUser.uid, fbUser);
        await saveUserProfile(fbUser.uid, {
          name: profile.name,
          emoji: profile.emoji,
          balance: profile.balance,
          stats: profile.stats,
        });
        if (cancelled) return;
        setUser({
          uid: fbUser.uid,
          name: profile.name,
          emoji: profile.emoji,
          email: fbUser.email ?? undefined,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) return;

    void setPlayerPresence(user.uid, true);
    const interval = setInterval(() => {
      void setPlayerPresence(user.uid, true);
    }, 30000);

    return () => {
      clearInterval(interval);
      void setPlayerPresence(user.uid, false);
    };
  }, [user?.uid]);

  /* ── Connexion anonyme ── */
  const login = useCallback(async (name: string, emoji: string) => {
    setLoading(true);
    try {
      const cred = await signInAnonymously(auth);
      await updateFirebaseProfile(cred.user, { displayName: name, photoURL: emoji });
      await saveUserProfile(cred.user.uid, { name, emoji });
      setUser({
        uid: cred.user.uid,
        name,
        emoji,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Inscription email ── */
  const registerWithEmail = useCallback(async (
    email: string,
    password: string,
    name: string,
    emoji: string,
  ) => {
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateFirebaseProfile(cred.user, { displayName: name, photoURL: emoji });
      await saveUserProfile(cred.user.uid, { name, emoji, createdAt: Date.now() });
      setUser({
        uid: cred.user.uid,
        name,
        emoji,
        email,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Connexion email ── */
  const loginWithEmail = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const profile = await getUserProfile(cred.user.uid, cred.user);
      setUser({
        uid: cred.user.uid,
        name: profile.name,
        emoji: profile.emoji,
        email,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Lier compte anonyme → email ── */
  const linkEmail = useCallback(async (email: string, password: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Aucun utilisateur connecté");
    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(email, password);
      const cred = await linkWithCredential(currentUser, credential);
      const profile = await getUserProfile(cred.user.uid, cred.user);
      setUser({
        uid: cred.user.uid,
        name: profile.name,
        emoji: profile.emoji,
        email,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Déconnexion ── */
  const logout = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (uid) await setPlayerPresence(uid, false);
    await signOut(auth);
    setUser(null);
  }, []);

  const updateUserProfile = useCallback(async (profile: { name: string; emoji: string }) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Aucun utilisateur connecté");

    await updateFirebaseProfile(currentUser, {
      displayName: profile.name,
      photoURL: profile.emoji,
    });
    await saveUserProfile(currentUser.uid, profile);
    setUser((prev) => prev ? { ...prev, ...profile } : prev);
  }, []);

  return { user, loading, login, loginWithEmail, registerWithEmail, logout, linkEmail, updateUserProfile };
}
