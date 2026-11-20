"use client";

/* ═══════════════ FILE: lib/backend.ts ═══════════════
   Appel des commandes du backend VPS (server/) — remplace httpsCallable.
   Même forme de retour ({ data }) pour minimiser le diff des appelants.
   Un idempotencyKey est ajouté automatiquement s'il n'est pas fourni. */

import { generateSecureId } from "@/lib/cryptoUtils";
import { auth } from "@/lib/authClient";

const defaultLocalBackend =
  typeof window !== "undefined" && window.location.hostname
    ? `http://${window.location.hostname}:8081`
    : "http://localhost:8081";

export const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? defaultLocalBackend).replace(/\/$/, "");

export class BackendError extends Error {
  constructor(readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = "BackendError";
  }
}

export async function callBackend<T = unknown>(name: string, payload: Record<string, unknown> = {}): Promise<{ data: T }> {
  const user = auth.currentUser;
  if (!user) throw new BackendError("unauthenticated", "AUTH_REQUIRED");
  const body = JSON.stringify({ idempotencyKey: `${name}_${generateSecureId(24)}`, ...payload });
  const send = async (forceRefresh: boolean) => fetch(`${BACKEND_URL}/api/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken(forceRefresh)}` },
    body,
  });
  let response = await send(false);
  // Jeton refusé (secret du serveur changé, horloge décalée…) : un seul
  // nouvel essai avec un jeton fraîchement renouvelé.
  if (response.status === 401) response = await send(true);
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as Record<string, unknown>));
    throw new BackendError(
      typeof body.code === "string" ? body.code : "internal",
      typeof body.message === "string" ? body.message : `HTTP_${response.status}`,
      body.details,
    );
  }
  return { data: await response.json() as T };
}
