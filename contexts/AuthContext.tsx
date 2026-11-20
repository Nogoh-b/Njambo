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
  auth,
  onAuthStateChanged,
  registerWithEmail as registerAccount,
  signInAsGuest,
  signInWithEmail,
  signOut,
  updateAuthProfile,
  type AuthClientUser,
} from "@/lib/authClient";
import { doc, getDoc } from "@/lib/firestoreClient";
import { db } from "@/lib/firebase";
import { callBackend } from "@/lib/backend";
import { setPlayerPresence } from "@/lib/playerData";
import type { AuthUser } from "@/types/game";

/* ═══════════════ AuthContext — comptes Njambo (instance UNIQUE) ═══════════════
   Gère l'authentification via le backend (lib/authClient.ts, comptes dans
   Postgres) : invité, email+password, passage invité → compte en gardant
   son uid. Profil stocké dans users/{uid} via le backend.

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
  /** Déclare la tranche d'âge utilisée pour bloquer le checkout des mineurs. */
  updateAgeBand: (ageBand: "13_17" | "18_plus") => Promise<void>;
}

interface UserProfile {
  name: string;
  emoji: string;
  createdAt: number;
  locale?: "fr" | "en";
  ageBand?: "unknown" | "13_17" | "18_plus";
}

const DEFAULT_PROFILE: UserProfile = {
  name: "Joueur",
  emoji: "😎",
  createdAt: 0,
};

function profileFromAccount(fbUser: AuthClientUser): UserProfile {
  return {
    ...DEFAULT_PROFILE,
    name: fbUser.displayName?.trim() || DEFAULT_PROFILE.name,
    emoji: fbUser.photoURL || DEFAULT_PROFILE.emoji,
  };
}

/** Lit le profil Firestore d'un utilisateur */
async function getUserProfile(uid: string, fbUser?: AuthClientUser | null): Promise<UserProfile> {
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) {
    return snap.data() as UserProfile;
  }

  const playerSnap = await getDoc(doc(db, "players", uid));
  if (playerSnap.exists()) {
    return playerSnap.data() as UserProfile;
  }

  return fbUser ? profileFromAccount(fbUser) : DEFAULT_PROFILE;
}

/**
 * Crée ou met à jour uniquement le profil privé modifiable par le client.
 * `base` : profil déjà connu de l'appelant — évite une relecture Firestore.
 * Le profil public, les statistiques et l'économie sont créés par les Functions.
 */
async function saveUserProfile(
  uid: string,
  profile: Partial<UserProfile>,
  base?: UserProfile,
): Promise<void> {
  const existing = base ?? await getUserProfile(uid, auth.currentUser);
  const now = Date.now();
  const payload = {
    name: profile.name ?? existing.name,
    emoji: profile.emoji ?? existing.emoji,
    locale: existing.locale ?? "fr",
    ageBand: profile.ageBand ?? existing.ageBand ?? "unknown",
    createdAt: (profile.createdAt ?? existing.createdAt) || now,
  };
  await callBackend("saveProfile", payload);
}

const AuthContext = createContext<UseAuthReturn | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  /* ── Listener auth persistant (UNE seule cascade de boot) ── */
  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (fbUser: AuthClientUser | null) => {
      if (cancelled) return;
      if (fbUser) {
        let profile = profileFromAccount(fbUser);
        if (!fbUser.isAnonymous) {
          try {
            profile = await getUserProfile(fbUser.uid, fbUser);
          } catch (error) {
            // L'API de profil ne doit jamais laisser toute l'interface Auth
            // bloquée sur « Chargement… » quand le backend redémarre.
            console.error("[AuthContext] lecture profil échouée, profil du compte utilisé:", error);
          }
        }
        if (cancelled) return;
        // L'UI est débloquée dès la LECTURE ; la synchro du miroir
        // users/players part en tâche de fond (hors chemin critique).
        setUser({
          uid: fbUser.uid,
          name: profile.name,
          emoji: profile.emoji,
          email: fbUser.email ?? undefined,
          ageBand: profile.ageBand ?? "unknown",
          isAnonymous: fbUser.isAnonymous,
        });
        setLoading(false);
        if (!fbUser.isAnonymous) void saveUserProfile(fbUser.uid, {
          name: profile.name,
          emoji: profile.emoji,
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
    if (!user?.uid || user.isAnonymous) return;

    void setPlayerPresence(user.uid, true);
    const interval = setInterval(() => {
      void setPlayerPresence(user.uid, true);
    }, 30000);

    return () => {
      clearInterval(interval);
      void setPlayerPresence(user.uid, false);
    };
  }, [user?.uid, user?.isAnonymous]);

  /* ── Connexion anonyme ── */
  const login = useCallback(async (name: string, emoji: string) => {
    setLoading(true);
    try {
      const account = await signInAsGuest({ name, photo: emoji });
      setUser({
        uid: account.uid,
        name,
        emoji,
        isAnonymous: true,
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
      const account = await registerAccount(email, password, { name, photo: emoji });
      await saveUserProfile(
        account.uid,
        { name, emoji, createdAt: Date.now() },
        { ...DEFAULT_PROFILE, name, emoji },
      );
      setUser({
        uid: account.uid,
        name,
        emoji,
        email,
        ageBand: "unknown",
        isAnonymous: false,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Connexion email ── */
  const loginWithEmail = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const account = await signInWithEmail(email, password);
      const profile = await getUserProfile(account.uid, account);
      setUser({
        uid: account.uid,
        name: profile.name,
        emoji: profile.emoji,
        email: account.email ?? email,
        ageBand: profile.ageBand ?? "unknown",
        isAnonymous: false,
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
      const account = await registerAccount(email, password, {});
      const profile = await getUserProfile(account.uid, account);
      setUser({
        uid: account.uid,
        name: profile.name,
        emoji: profile.emoji,
        email,
        ageBand: profile.ageBand ?? "unknown",
        isAnonymous: false,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Déconnexion ── */
  const logout = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (currentUser && !currentUser.isAnonymous) await setPlayerPresence(currentUser.uid, false);
    await signOut();
    setUser(null);
  }, []);

  const updateUserProfile = useCallback(async (profile: { name: string; emoji: string }) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Aucun utilisateur connecté");

    await updateAuthProfile({ name: profile.name, photo: profile.emoji });
    await saveUserProfile(currentUser.uid, profile);
    setUser((prev) => prev ? { ...prev, ...profile } : prev);
  }, []);

  const updateAgeBand = useCallback(async (ageBand: "13_17" | "18_plus") => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.isAnonymous) throw new Error("Un compte permanent est requis");
    const existing = await getUserProfile(currentUser.uid, currentUser);
    await saveUserProfile(currentUser.uid, { ageBand }, existing);
    setUser((previous) => previous ? { ...previous, ageBand } : previous);
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
    updateAgeBand,
  }), [user, loading, login, loginWithEmail, registerWithEmail, logout, linkEmail, updateUserProfile, updateAgeBand]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): UseAuthReturn {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé sous <AuthProvider>");
  return ctx;
}
