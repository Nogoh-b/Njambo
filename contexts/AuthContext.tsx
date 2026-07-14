"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  linkWithPhoneNumber,
  linkWithPopup,
  linkWithCredential,
  RecaptchaVerifier,
  signOut,
  updateProfile as updateFirebaseProfile,
  signInWithPhoneNumber,
  signInWithPopup,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import { EmailAuthProvider } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
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
  /** Connexion ou liaison Google */
  loginWithGoogle: () => Promise<void>;
  /** Envoie le code SMS après validation reCAPTCHA invisible */
  requestPhoneCode: (phoneNumber: string, verifierContainerId: string) => Promise<void>;
  /** Confirme le code SMS et finalise le compte permanent */
  confirmPhoneCode: (code: string, name?: string, emoji?: string) => Promise<void>;
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
    updatedAt: now,
  };
  await setDoc(doc(db, "users", uid), payload, { merge: true });
}

const AuthContext = createContext<UseAuthReturn | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const phoneConfirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  /* ── Listener auth persistant (UNE seule cascade de boot) ── */
  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (fbUser: User | null) => {
      if (cancelled) return;
      if (fbUser) {
        const profile = fbUser.isAnonymous
          ? { ...DEFAULT_PROFILE, name: fbUser.displayName || DEFAULT_PROFILE.name, emoji: fbUser.photoURL || DEFAULT_PROFILE.emoji }
          : await getUserProfile(fbUser.uid, fbUser);
        if (cancelled) return;
        // L'UI est débloquée dès la LECTURE ; la synchro du miroir
        // users/players part en tâche de fond (hors chemin critique).
        setUser({
          uid: fbUser.uid,
          name: profile.name,
          emoji: profile.emoji,
          email: fbUser.email ?? undefined,
          phoneNumber: fbUser.phoneNumber ?? undefined,
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
      const cred = await signInAnonymously(auth);
      await updateFirebaseProfile(cred.user, { displayName: name, photoURL: emoji });
      setUser({
        uid: cred.user.uid,
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
      const currentUser = auth.currentUser;
      const cred = currentUser?.isAnonymous
        ? await linkWithCredential(currentUser, EmailAuthProvider.credential(email, password))
        : await createUserWithEmailAndPassword(auth, email, password);
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
        phoneNumber: cred.user.phoneNumber ?? undefined,
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
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const profile = await getUserProfile(cred.user.uid, cred.user);
      setUser({
        uid: cred.user.uid,
        name: profile.name,
        emoji: profile.emoji,
        email,
        phoneNumber: cred.user.phoneNumber ?? undefined,
        ageBand: profile.ageBand ?? "unknown",
        isAnonymous: false,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const currentUser = auth.currentUser;
      const cred = currentUser?.isAnonymous
        ? await linkWithPopup(currentUser, provider)
        : await signInWithPopup(auth, provider);
      const profile = await getUserProfile(cred.user.uid, cred.user);
      await saveUserProfile(cred.user.uid, profile, profile);
      setUser({
        uid: cred.user.uid,
        name: profile.name,
        emoji: profile.emoji,
        email: cred.user.email ?? undefined,
        phoneNumber: cred.user.phoneNumber ?? undefined,
        ageBand: profile.ageBand ?? "unknown",
        isAnonymous: false,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const requestPhoneCode = useCallback(async (phoneNumber: string, verifierContainerId: string) => {
    setLoading(true);
    try {
      recaptchaRef.current?.clear();
      const verifier = new RecaptchaVerifier(auth, verifierContainerId, { size: "invisible" });
      recaptchaRef.current = verifier;
      const currentUser = auth.currentUser;
      phoneConfirmationRef.current = currentUser?.isAnonymous
        ? await linkWithPhoneNumber(currentUser, phoneNumber, verifier)
        : await signInWithPhoneNumber(auth, phoneNumber, verifier);
    } catch (cause) {
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
      throw cause;
    } finally {
      setLoading(false);
    }
  }, []);

  const confirmPhoneCode = useCallback(async (code: string, requestedName?: string, requestedEmoji?: string) => {
    const confirmation = phoneConfirmationRef.current;
    if (!confirmation) throw new Error("Aucun code SMS n'a été demandé");
    setLoading(true);
    try {
      const cred = await confirmation.confirm(code);
      const existing = await getUserProfile(cred.user.uid, cred.user);
      const profile = {
        ...existing,
        name: requestedName?.trim() || existing.name,
        emoji: requestedEmoji || existing.emoji,
      };
      await updateFirebaseProfile(cred.user, { displayName: profile.name, photoURL: profile.emoji });
      await saveUserProfile(cred.user.uid, profile, existing);
      setUser({
        uid: cred.user.uid,
        name: profile.name,
        emoji: profile.emoji,
        email: cred.user.email ?? undefined,
        phoneNumber: cred.user.phoneNumber ?? undefined,
        ageBand: profile.ageBand ?? "unknown",
        isAnonymous: false,
      });
      phoneConfirmationRef.current = null;
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
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
    loginWithGoogle,
    requestPhoneCode,
    confirmPhoneCode,
    logout,
    linkEmail,
    updateUserProfile,
    updateAgeBand,
  }), [user, loading, login, loginWithEmail, registerWithEmail, loginWithGoogle, requestPhoneCode, confirmPhoneCode, logout, linkEmail, updateUserProfile, updateAgeBand]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): UseAuthReturn {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé sous <AuthProvider>");
  return ctx;
}
