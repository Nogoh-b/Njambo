"use client";

/* ═══════════════ FILE: lib/authClient.ts ═══════════════
   Client de l'authentification maison (server/src/authService.ts) — remplace
   le SDK Firebase Auth. Expose le même sous-ensemble d'API que celui utilisé
   par l'app (`auth.currentUser`, `user.getIdToken()`, `onAuthStateChanged`,
   `getIdTokenResult`) pour que les appelants ne changent pas.

   - La session (jeton de renouvellement + dernier jeton d'accès) est gardée
     dans localStorage, comme la persistance « local » de Firebase.
   - Le jeton d'accès (30 min) est renouvelé automatiquement 60 s avant
     expiration ; les appels concurrents partagent le même renouvellement.
   - Les autres onglets sont synchronisés via l'évènement `storage`.
   - Les erreurs portent un `code` « auth/… » identique à Firebase. */

import { BACKEND_URL } from "@/lib/backend";

const STORAGE_KEY = "njambo-auth-session";
const REFRESH_MARGIN_MS = 60_000;

interface SessionUser {
  uid: string;
  email: string | null;
  isAnonymous: boolean;
  admin: boolean;
  displayName: string | null;
  photoURL: string | null;
}

interface StoredSession {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  user: SessionUser;
}

export interface AuthClientUser extends SessionUser {
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}

export class AuthClientError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AuthClientError";
  }
}

type Listener = (user: AuthClientUser | null) => void;

let session: StoredSession | null = null;
let currentUser: AuthClientUser | null = null;
let restored = false;
let refreshing: Promise<string> | null = null;
const listeners = new Set<Listener>();

function readStorage(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as StoredSession : null;
    return parsed?.refreshToken && parsed.user?.uid ? parsed : null;
  } catch {
    return null;
  }
}

function writeStorage(next: StoredSession | null) {
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Navigation privée / stockage bloqué : la session reste en mémoire.
  }
}

function buildUser(stored: StoredSession): AuthClientUser {
  return { ...stored.user, getIdToken };
}

/** Applique une nouvelle session ; notifie seulement si l'utilisateur change. */
function applySession(next: StoredSession | null, persist = true) {
  const previousUid = currentUser?.uid ?? null;
  const previousAnonymous = currentUser?.isAnonymous;
  session = next;
  currentUser = next ? buildUser(next) : null;
  if (persist) writeStorage(next);
  if (previousUid !== (currentUser?.uid ?? null) || previousAnonymous !== currentUser?.isAnonymous) {
    listeners.forEach((listener) => listener(currentUser));
  }
}

function restore() {
  if (restored || typeof window === "undefined") return;
  restored = true;
  const stored = readStorage();
  session = stored;
  currentUser = stored ? buildUser(stored) : null;
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) applySession(readStorage(), false);
  });
}

async function post<T>(path: string, body: Record<string, unknown>, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthClientError("auth/network-request-failed");
  }
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new AuthClientError(typeof payload.code === "string" ? payload.code : "auth/internal-error");
  return payload as T;
}

async function getIdToken(forceRefresh = false): Promise<string> {
  restore();
  const active = session;
  if (!active) throw new AuthClientError("auth/no-current-user");
  if (!forceRefresh && active.expiresAt - REFRESH_MARGIN_MS > Date.now()) return active.accessToken;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const fresh = await post<Omit<StoredSession, "refreshToken">>("refresh", { refreshToken: active.refreshToken });
      // Une déconnexion a pu survenir pendant le renouvellement.
      if (session?.refreshToken !== active.refreshToken) throw new AuthClientError("auth/no-current-user");
      applySession({ ...fresh, refreshToken: active.refreshToken });
      return fresh.accessToken;
    } catch (error) {
      const code = (error as AuthClientError).code;
      if (code === "auth/invalid-refresh-token" || code === "auth/user-disabled") applySession(null);
      throw error;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/* ── API compatible Firebase ── */

export const auth = {
  get currentUser(): AuthClientUser | null {
    restore();
    return currentUser;
  },
};

export function onAuthStateChanged(_auth: typeof auth, listener: Listener): () => void {
  restore();
  listeners.add(listener);
  // Comme Firebase : premier appel asynchrone avec l'état restauré.
  queueMicrotask(() => { if (listeners.has(listener)) listener(currentUser); });
  return () => { listeners.delete(listener); };
}

export async function getIdTokenResult(user: AuthClientUser, forceRefresh = false) {
  await user.getIdToken(forceRefresh);
  return { claims: { admin: session?.user.admin === true } };
}

/* ── Actions de compte ── */

export async function signInAsGuest(profile: { name?: string; photo?: string }): Promise<AuthClientUser> {
  applySession(await post<StoredSession>("guest", profile));
  return currentUser!;
}

export async function registerWithEmail(email: string, password: string, profile: { name?: string; photo?: string }): Promise<AuthClientUser> {
  restore();
  // Un invité garde son uid (et donc sa progression) en créant son compte.
  const next = currentUser?.isAnonymous
    ? await post<StoredSession>("upgrade", { email, password, ...profile }, await getIdToken())
    : await post<StoredSession>("register", { email, password, ...profile });
  applySession(next);
  return currentUser!;
}

export async function signInWithEmail(email: string, password: string): Promise<AuthClientUser> {
  applySession(await post<StoredSession>("login", { email, password }));
  return currentUser!;
}

export async function updateAuthProfile(profile: { name?: string; photo?: string }): Promise<void> {
  const { user } = await post<{ user: SessionUser }>("profile", profile, await getIdToken());
  if (session) applySession({ ...session, user });
}

export async function signOut(): Promise<void> {
  restore();
  const refreshToken = session?.refreshToken;
  applySession(null);
  if (refreshToken) await post("logout", { refreshToken }).catch(() => undefined);
}
