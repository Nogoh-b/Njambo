"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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

/* ═══════════════ AuthContext — Firebase Auth (instance UNIQUE) ═══════════════
   Gère l'authentification : anonyme auto, email+password, liaison
   anonyme → email. Profil stocké dans Firestore.

   IMPORTANT : c'est un Provider, pas un hook autonome. L'ancienne version
   (hook local) était appelée par ~20 composants : chaque instance relançait
   sa propre cascade getDoc/setDoc au boot et son propre battement de
   présence — la cause n° 1 des lenteurs de chargement hors table. */

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

/**
 * Crée ou met à jour le profil Firestore (users/{uid} + miroir players/{uid}).
 * `base` : profil déjà connu de l'appelant — évite une relecture Firestore.
 * Les deux écritures partent en parallèle.
 */
async function saveUserProfile(
  uid: string,
  profile: Partial<UserProfile>,
  base?: UserProfile,
): Promise<void> {
  const existing = base ?? await getUserProfile(uid, auth.currentUser);
  const now = Date.now();
  const payload = {
    ...existing,
    ...profile,
    updatedAt: serverTimestamp(),
  };

  await Promise.all([
    setDoc(doc(db, "users", uid), payload, { merge: true }),
    setDoc(doc(db, "players", uid), {
      ...payload,
      uid,
      online: true,
      lastSeen: now,
    }, { merge: true }),
  ]);
}

const AuthContext = createContext<UseAuthReturn | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  /* ── Listener auth persistant (UNE seule cascade de boot) ── */
  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (fbUser: User | null) => {
      if (cancelled) return;
      if (fbUser) {
        const profile = await getUserProfile(fbUser.uid, fbUser);
        if (cancelled) return;
        // L'UI est débloquée dès la LECTURE ; la synchro du miroir
        // users/players part en tâche de fond (hors chemin critique).
        setUser({
          uid: fbUser.uid,
          name: profile.name,
          emoji: profile.emoji,
          email: fbUser.email ?? undefined,
        });
        setLoading(false);
        void saveUserProfile(fbUser.uid, {
          name: profile.name,
          emoji: profile.emoji,
          balance: profile.balance,
          stats: profile.stats,
        }, profile).catch((err) => {
          console.error("[AuthContext] sync profil échouée:", err);
        });
      } else {
        setUser(null);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  /* ── Battement de présence UNIQUE pour toute l'app ── */
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
      await saveUserProfile(cred.user.uid, { name, emoji }, { ...DEFAULT_PROFILE, name, emoji });
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
      await saveUserProfile(
        cred.user.uid,
        { name, emoji, createdAt: Date.now() },
        { ...DEFAULT_PROFILE, name, emoji },
      );
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

  const value = useMemo<UseAuthReturn>(() => ({
    user,
    loading,
    login,
    loginWithEmail,
    registerWithEmail,
    logout,
    linkEmail,
    updateUserProfile,
  }), [user, loading, login, loginWithEmail, registerWithEmail, logout, linkEmail, updateUserProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): UseAuthReturn {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé sous <AuthProvider>");
  return ctx;
}
