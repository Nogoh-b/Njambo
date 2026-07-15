"use client";

/* ═══════════════ FILE: lib/backend.ts ═══════════════
   Appel des commandes du backend VPS (server/) — remplace httpsCallable.
   Même forme de retour ({ data }) pour minimiser le diff des appelants.
   Un idempotencyKey est ajouté automatiquement s'il n'est pas fourni. */

import { auth } from "@/lib/firebase";

export const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8081").replace(/\/$/, "");

export class BackendError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "BackendError";
  }
}

export async function callBackend<T = unknown>(name: string, payload: Record<string, unknown> = {}): Promise<{ data: T }> {
  const user = auth.currentUser;
  if (!user) throw new BackendError("unauthenticated", "AUTH_REQUIRED");
  const token = await user.getIdToken();
  const response = await fetch(`${BACKEND_URL}/api/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ idempotencyKey: `${name}_${crypto.randomUUID()}`, ...payload }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({} as Record<string, unknown>));
    throw new BackendError(
      typeof body.code === "string" ? body.code : "internal",
      typeof body.message === "string" ? body.message : `HTTP_${response.status}`,
    );
  }
  return { data: await response.json() as T };
}
