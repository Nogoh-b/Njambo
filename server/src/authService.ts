/* ═══════════════ FILE: server/src/authService.ts ═══════════════
   Comptes et sessions dans Postgres (remplace Firebase Auth) + routes HTTP :

     POST /auth/guest     { name?, photo? }                 → session invité
     POST /auth/register  { email, password, name?, photo? } → session compte
     POST /auth/login     { email, password }                → session compte
     POST /auth/upgrade   { email, password, name?, photo? } (Bearer invité)
                          → l'invité devient un compte en GARDANT son uid
     POST /auth/refresh   { refreshToken }                   → nouveau jeton d'accès
     POST /auth/logout    { refreshToken }                   → révoque la session
     POST /auth/profile   { name?, photo? } (Bearer)         → pseudo / avatar

   Réponse de session : { accessToken, expiresAt, refreshToken, user }.
   Les codes d'erreur reprennent ceux de Firebase (auth/…) pour que les
   messages du front restent inchangés. */

import type { Express, Request, Response } from "express";
import express from "express";
import { Pool } from "pg";
import {
  dummyPasswordHash,
  hashPassword,
  hashSessionToken,
  newSessionToken,
  newUid,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "./authTokens";

const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS auth_users (
  uid TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  admin BOOLEAN NOT NULL DEFAULT false,
  disabled BOOLEAN NOT NULL DEFAULT false,
  display_name TEXT,
  photo TEXT,
  created_at BIGINT NOT NULL,
  last_login_at BIGINT
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES auth_users(uid) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL,
  last_used_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS auth_sessions_uid_idx ON auth_sessions (uid);
`;

interface UserRow {
  uid: string;
  email: string | null;
  password_hash: string | null;
  is_anonymous: boolean;
  admin: boolean;
  disabled: boolean;
  display_name: string | null;
  photo: string | null;
}

class AuthError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

let pool: Pool | null = null;

export async function initAuthStore(connectionString: string): Promise<void> {
  pool = new Pool({ connectionString, max: 5 });
  await pool.query(SCHEMA_SQL);
}

function store(): Pool {
  if (!pool) throw new AuthError(503, "auth/backend-unavailable");
  return pool;
}

/* ── Lectures utilisées par les commandes admin (functions/src/authDirectory) ── */

export async function findUserEmail(uid: string): Promise<string | null> {
  const { rows } = await store().query<{ email: string | null }>("SELECT email FROM auth_users WHERE uid = $1", [uid]);
  return rows[0]?.email ?? null;
}

export async function findUserByEmail(email: string): Promise<{ uid: string; email: string | null } | null> {
  const { rows } = await store().query<{ uid: string; email: string | null }>(
    "SELECT uid, email FROM auth_users WHERE email = $1",
    [email.trim().toLowerCase()],
  );
  return rows[0] ?? null;
}

/* ── Limitation des tentatives (mémoire du process) ── */

const attempts = new Map<string, number[]>();
function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= max) throw new AuthError(429, "auth/too-many-requests");
  recent.push(now);
  attempts.set(key, recent);
}
setInterval(() => {
  const now = Date.now();
  for (const [key, list] of attempts) if (list.every((at) => now - at > 60 * 60 * 1000)) attempts.delete(key);
}, 10 * 60 * 1000).unref();

/* ── Helpers ── */

function body(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, max);
  return text || null;
}

function readCredentials(input: Record<string, unknown>) {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!EMAIL_RE.test(email) || email.length > 254) throw new AuthError(400, "auth/invalid-email");
  if (password.length < 6 || password.length > 200) throw new AuthError(400, "auth/weak-password");
  return { email, password };
}

function clientIp(req: Request): string {
  return (req.header("x-forwarded-for")?.split(",")[0] ?? req.socket.remoteAddress ?? "unknown").trim();
}

function publicUser(user: UserRow) {
  return {
    uid: user.uid,
    email: user.email,
    isAnonymous: user.is_anonymous,
    admin: user.admin,
    displayName: user.display_name,
    photoURL: user.photo,
  };
}

function bearerClaims(req: Request) {
  const match = /^Bearer (.+)$/.exec(req.header("authorization") ?? "");
  const decoded = match ? verifyAccessToken(match[1]) : null;
  if (!decoded) throw new AuthError(401, "auth/invalid-user-token");
  return decoded;
}

async function getUser(uid: string): Promise<UserRow | null> {
  const { rows } = await store().query<UserRow>("SELECT * FROM auth_users WHERE uid = $1", [uid]);
  return rows[0] ?? null;
}

async function openSession(user: UserRow, req: Request) {
  const refreshToken = newSessionToken();
  const sid = newSessionToken().slice(0, 22);
  const now = Date.now();
  await store().query(
    `INSERT INTO auth_sessions (id, uid, token_hash, created_at, last_used_at, expires_at, user_agent)
     VALUES ($1, $2, $3, $4, $4, $5, $6)`,
    [sid, user.uid, hashSessionToken(refreshToken), now, now + SESSION_TTL_MS, cleanText(req.header("user-agent"), 300)],
  );
  await store().query("UPDATE auth_users SET last_login_at = $2 WHERE uid = $1", [user.uid, now]);
  return { ...accessFor(user, sid), refreshToken };
}

function accessFor(user: UserRow, sid: string) {
  const { token, expiresAt } = signAccessToken({
    uid: user.uid,
    sid,
    admin: user.admin,
    anonymous: user.is_anonymous,
    email: user.email,
  });
  return { accessToken: token, expiresAt, user: publicUser(user) };
}

/* ── Handlers ── */

async function guest(req: Request) {
  rateLimit(`guest:${clientIp(req)}`, 20, 60 * 60 * 1000);
  const input = body(req);
  const { rows } = await store().query<UserRow>(
    `INSERT INTO auth_users (uid, is_anonymous, display_name, photo, created_at)
     VALUES ($1, true, $2, $3, $4) RETURNING *`,
    [newUid(), cleanText(input.name, 40), cleanText(input.photo, 120), Date.now()],
  );
  return openSession(rows[0], req);
}

async function register(req: Request) {
  rateLimit(`register:${clientIp(req)}`, 10, 60 * 60 * 1000);
  const input = body(req);
  const { email, password } = readCredentials(input);
  const passwordHash = await hashPassword(password);
  try {
    const { rows } = await store().query<UserRow>(
      `INSERT INTO auth_users (uid, email, password_hash, display_name, photo, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [newUid(), email, passwordHash, cleanText(input.name, 40), cleanText(input.photo, 120), Date.now()],
    );
    return openSession(rows[0], req);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new AuthError(409, "auth/email-already-in-use");
    throw error;
  }
}

async function login(req: Request) {
  const { email, password } = readCredentials(body(req));
  rateLimit(`login-ip:${clientIp(req)}`, 30, 15 * 60 * 1000);
  rateLimit(`login-email:${email}`, 10, 15 * 60 * 1000);
  const { rows } = await store().query<UserRow>("SELECT * FROM auth_users WHERE email = $1", [email]);
  const user = rows[0];
  const valid = await verifyPassword(password, user?.password_hash ?? await dummyPasswordHash());
  if (!user || !valid) throw new AuthError(401, "auth/invalid-credential");
  if (user.disabled) throw new AuthError(403, "auth/user-disabled");
  return openSession(user, req);
}

async function upgrade(req: Request) {
  const claims = bearerClaims(req);
  rateLimit(`register:${clientIp(req)}`, 10, 60 * 60 * 1000);
  const input = body(req);
  const { email, password } = readCredentials(input);
  const current = await getUser(claims.uid);
  if (!current || !current.is_anonymous) throw new AuthError(400, "auth/provider-already-linked");
  const passwordHash = await hashPassword(password);
  try {
    const { rows } = await store().query<UserRow>(
      `UPDATE auth_users
          SET email = $2, password_hash = $3, is_anonymous = false,
              display_name = COALESCE($4, display_name), photo = COALESCE($5, photo)
        WHERE uid = $1 RETURNING *`,
      [current.uid, email, passwordHash, cleanText(input.name, 40), cleanText(input.photo, 120)],
    );
    // Les sessions invité de ce compte sont remplacées par une session complète.
    await store().query("UPDATE auth_sessions SET revoked_at = $2 WHERE uid = $1 AND revoked_at IS NULL", [current.uid, Date.now()]);
    return openSession(rows[0], req);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new AuthError(409, "auth/email-already-in-use");
    throw error;
  }
}

async function refresh(req: Request) {
  const token = body(req).refreshToken;
  if (typeof token !== "string" || token.length < 20) throw new AuthError(401, "auth/invalid-refresh-token");
  const now = Date.now();
  const { rows } = await store().query<UserRow & { sid: string }>(
    `UPDATE auth_sessions s
        SET last_used_at = $2, expires_at = $2 + $3
       FROM auth_users u
      WHERE s.token_hash = $1 AND s.uid = u.uid
        AND s.revoked_at IS NULL AND s.expires_at > $2
    RETURNING u.*, s.id AS sid`,
    [hashSessionToken(token), now, SESSION_TTL_MS],
  );
  const row = rows[0];
  if (!row) throw new AuthError(401, "auth/invalid-refresh-token");
  if (row.disabled) throw new AuthError(403, "auth/user-disabled");
  return accessFor(row, row.sid);
}

async function logout(req: Request) {
  const token = body(req).refreshToken;
  if (typeof token === "string") {
    await store().query("UPDATE auth_sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL", [hashSessionToken(token), Date.now()]);
  }
  return { ok: true };
}

async function profile(req: Request) {
  const claims = bearerClaims(req);
  const input = body(req);
  const { rows } = await store().query<UserRow>(
    `UPDATE auth_users SET display_name = COALESCE($2, display_name), photo = COALESCE($3, photo)
      WHERE uid = $1 RETURNING *`,
    [claims.uid, cleanText(input.name, 40), cleanText(input.photo, 120)],
  );
  if (!rows[0]) throw new AuthError(404, "auth/user-not-found");
  return { user: publicUser(rows[0]) };
}

export function mountAuthRoutes(app: Express) {
  const router = express.Router();
  const routes: Record<string, (req: Request) => Promise<unknown>> = { guest, register, login, upgrade, refresh, logout, profile };
  for (const [name, handler] of Object.entries(routes)) {
    router.post(`/${name}`, async (req: Request, res: Response) => {
      try {
        res.status(200).json(await handler(req));
      } catch (error) {
        if (error instanceof AuthError) {
          res.status(error.status).json({ code: error.code, message: error.code });
          return;
        }
        console.error(`auth/${name}`, error);
        res.status(500).json({ code: "auth/internal-error", message: "INTERNAL_ERROR" });
      }
    });
  }
  app.use("/auth", router);
}
