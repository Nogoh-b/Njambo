/* ═══════════════ FILE: server/src/authTokens.ts ═══════════════
   Primitives de l'authentification maison (remplace Firebase Auth) :
   - jetons d'accès JWT HS256 signés par le serveur (vérification locale,
     aucune requête en base — aussi rapide que verifyIdToken de Firebase) ;
   - hachage des mots de passe en scrypt (module crypto natif de Node) ;
   - jetons de session opaques (seul leur SHA-256 est stocké en base).
   Le contenu du JWT reprend les champs lus par les commandes (`uid`, `admin`)
   pour que `request.auth.token` reste identique à l'ère Firebase. */

import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

export const ACCESS_TOKEN_TTL_SECONDS = 30 * 60;

export interface AccessClaims {
  uid: string;
  sid: string;
  admin: boolean;
  anonymous: boolean;
  email: string | null;
}

export interface DecodedAccessToken extends AccessClaims {
  sub: string;
  iat: number;
  exp: number;
}

/* Secret de signature : AUTH_JWT_SECRET (server/.env). Absent en dev, un
   secret éphémère est tiré : les jetons d'accès deviennent invalides au
   redémarrage, le client les renouvelle avec son jeton de session. */
let secret: Buffer | null = null;
function signingSecret(): Buffer {
  if (secret) return secret;
  const configured = process.env.AUTH_JWT_SECRET?.trim();
  if (configured && configured.length >= 32) {
    secret = Buffer.from(configured, "utf8");
  } else {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_JWT_SECRET (32 caractères min.) requis en production");
    console.warn("njambo-server: AUTH_JWT_SECRET absent — secret éphémère (dev uniquement)");
    secret = randomBytes(48);
  }
  return secret;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");
const JWT_HEADER = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

export function signAccessToken(claims: AccessClaims): { token: string; expiresAt: number } {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ACCESS_TOKEN_TTL_SECONDS;
  const payload = b64url(JSON.stringify({ ...claims, sub: claims.uid, iat, exp }));
  const signature = createHmac("sha256", signingSecret()).update(`${JWT_HEADER}.${payload}`).digest("base64url");
  return { token: `${JWT_HEADER}.${payload}.${signature}`, expiresAt: exp * 1000 };
}

/** Renvoie le contenu du jeton, ou null s'il est mal formé, falsifié ou expiré. */
export function verifyAccessToken(token: string): DecodedAccessToken | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== JWT_HEADER) return null;
  const expected = createHmac("sha256", signingSecret()).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as DecodedAccessToken;
    if (typeof decoded.uid !== "string" || typeof decoded.exp !== "number") return null;
    if (decoded.exp * 1000 <= Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

/* ── Mots de passe : scrypt N=2^15, r=8, p=1 (≈ 64 Mo, ~80 ms) ── */

const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 };

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const key = await scrypt(password, salt, keylen, { N, r, p, maxmem: 128 * N * r * 2 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const N = Number(n), R = Number(r), P = Number(p);
  const expected = Buffer.from(keyB64, "base64url");
  const key = await scrypt(password, Buffer.from(saltB64, "base64url"), expected.length, { N, r: R, p: P, maxmem: 128 * N * R * 2 });
  return timingSafeEqual(key, expected);
}

/** Hash factice : vérifié quand l'email est inconnu, pour un temps de réponse constant. */
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  return dummyHash ?? (dummyHash = hashPassword(randomBytes(12).toString("hex")));
}

/* ── Identifiants & jetons de session ── */

const UID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** uid de 28 caractères alphanumériques, même forme que les uid Firebase. */
export function newUid(): string {
  const bytes = randomBytes(28);
  let uid = "";
  for (const byte of bytes) uid += UID_ALPHABET[byte % UID_ALPHABET.length];
  return uid;
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
