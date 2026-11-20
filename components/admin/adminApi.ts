"use client";

/* Appels typés de la console admin (commandes du back VPS) + upload d'images. */

import type { EventLifecycle, EventValidationIssue, EventVersion } from "@/domain";
import { BACKEND_URL, BackendError, callBackend } from "@/lib/backend";
import type { EventLeaderboardData } from "@/hooks/useEventLeaderboard";
import { auth } from "@/lib/firebase";

export interface AdminEventSummary {
  eventId: string;
  title: string;
  mode: "pve" | "pvp";
  imageUrl: string | null;
  startsAt: number;
  endsAt: number;
  lifecycle: EventLifecycle;
  activeRevision: number | null;
  latestRevision: number;
  scheduledRevision: number | null;
  scheduledAt: number | null;
  hasDraft: boolean;
  draftUpdatedAt: number | null;
  updatedAt: number;
}

export interface AdminEventDetail {
  summary: AdminEventSummary;
  active: EventVersion | null;
  draft: EventVersion | null;
  working: EventVersion | null;
  issues: EventValidationIssue[];
}

export interface AdminEventStats {
  eventId: string;
  runs: number;
  players: number;
  active: number;
  eliminated: number;
  completed: number;
  abandoned: number;
  revives: number;
  reviveCauris: number;
  perfect: number;
  byStatus: Record<string, number>;
  funnel: number[];
}

export interface AdminUpload {
  id: string;
  kind: string;
  path: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: number;
}

export interface AdminPlayerHit { uid: string; name: string; emoji: string; email: string | null }

export interface AdminPlayerRun {
  runId: string;
  eventId: string;
  eventTitle: string;
  revision: number;
  status: string;
  stageIndex: number;
  stageCount: number;
  losses: number;
  allowedLosses: number;
  inMatch: boolean;
  ticketTier: string;
  createdAt: number;
  updatedAt: number;
}

export interface AdminPlayerDetail {
  uid: string;
  email: string | null;
  name: string;
  emoji: string;
  crowns: number;
  nkap: number;
  cauris: number;
  tickets: Record<"bronze" | "argent" | "or", number>;
  runs: AdminPlayerRun[];
}

export interface AdminCampaign {
  id: string;
  source: "event" | "manual";
  eventId?: string;
  eventTitle?: string;
  notificationId?: string;
  title: string;
  body: string;
  audience: "all" | "active_run" | "not_joined";
  sendAt: number;
  status: "scheduled" | "sending" | "sent" | "cancelled";
  cancelledReason?: string;
  sentAt?: number;
  stats?: { targeted: number; inApp: number; pushSent: number; pushFailed: number; optedOut: number; tokensInvalidated: number };
}

const call = async <T,>(name: string, payload: Record<string, unknown> = {}) => (await callBackend<T>(name, payload)).data;

export const adminApi = {
  listEvents: () => call<{ events: AdminEventSummary[]; now: number }>("listAdminEvents"),
  getEvent: (eventId: string) => call<AdminEventDetail>("getAdminEvent", { eventId }),
  saveDraft: (event: EventVersion) => call<{ eventId: string; revision: number; issues: EventValidationIssue[] }>("saveEventDraft", { event }),
  publish: (eventId: string, publishAt?: number | null) =>
    call<{ eventId: string; revision: number; scheduled: boolean; publishAt: number }>("publishEventDraft", { eventId, publishAt: publishAt ?? null }),
  cancelSchedule: (eventId: string) => call<{ eventId: string }>("cancelScheduledEvent", { eventId }),
  duplicate: (eventId: string, newEventId: string) => call<{ eventId: string }>("duplicateEvent", { eventId, newEventId }),
  archive: (eventId: string, archived: boolean) => call<{ eventId: string; archived: boolean }>("archiveEvent", { eventId, archived }),
  discardDraft: (eventId: string) => call<{ eventId: string }>("discardEventDraft", { eventId }),
  stats: (eventId: string) => call<AdminEventStats>("getAdminEventStats", { eventId }),
  searchPlayers: (query: string) => call<{ players: AdminPlayerHit[] }>("adminSearchPlayers", { query }),
  getPlayer: (uid: string) => call<AdminPlayerDetail>("adminGetPlayer", { uid }),
  grantTicket: (uid: string, tier: string, amount: number, reason: string) =>
    call<{ uid: string; tickets: Record<string, number> }>("adminGrantTicket", { uid, tier, amount, reason }),
  resetRun: (runId: string, mode: "restart" | "close", reason: string) =>
    call<{ runId: string; status: string }>("adminResetEventRun", { runId, mode, reason }),
  leaderboard: (eventId: string) => call<EventLeaderboardData>("getEventLeaderboard", { eventId }),
  campaigns: () => call<{ campaigns: AdminCampaign[] }>("listCampaigns"),
  createCampaign: (input: { title: string; body: string; audience: string; eventId?: string; sendAt?: number | null }) =>
    call<{ campaignId: string; sendAt: number }>("createCampaign", input),
  cancelCampaign: (campaignId: string) => call<{ campaignId: string }>("cancelCampaign", { campaignId }),
  uploads: (kind?: string) => call<{ uploads: AdminUpload[] }>("listAdminUploads", kind ? { kind } : {}),
};

export async function uploadImage(file: File, kind: "event" | "boss" | "cosmetic" | "season") {
  const user = auth.currentUser;
  if (!user) throw new BackendError("unauthenticated", "AUTH_REQUIRED");
  if (file.size > 2 * 1024 * 1024) throw new BackendError("invalid-argument", "FILE_TOO_LARGE");
  const response = await fetch(`${BACKEND_URL}/admin/upload?kind=${kind}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": file.type },
    body: file,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new BackendError(body.code ?? "internal", body.message ?? `HTTP_${response.status}`);
  return body as { url: string; path: string; width: number; height: number; bytes: number };
}

const ERROR_LABELS: Record<string, string> = {
  EVENT_INVALID: "La fiche contient des erreurs : corrige-les avant de publier.",
  EVENT_ALREADY_ENDED: "La date de fin est déjà passée.",
  DRAFT_NOT_FOUND: "Aucun brouillon à publier : enregistre d'abord.",
  EVENT_ID_TAKEN: "Cet identifiant est déjà utilisé.",
  NOTHING_SCHEDULED: "Aucune publication programmée.",
  ADMIN_REQUIRED: "Droits admin requis.",
  FILE_TOO_LARGE: "Image trop lourde (2 Mo maximum).",
  NOT_AN_IMAGE: "Ce fichier n'est pas une image PNG, JPEG ou WebP.",
  UNSUPPORTED_TYPE: "Format accepté : PNG, JPEG ou WebP.",
  UNREADABLE_IMAGE: "Image illisible.",
  INVALID_EVENTID: "Identifiant invalide (a-z, 0-9, _ ; 3 à 64 caractères).",
  EVENT_REQUIRED_FOR_AUDIENCE: "Choisis un événement pour cibler ses participants.",
  CAMPAIGN_NOT_SCHEDULED: "Cette campagne n’est plus en attente.",
  PLAYER_NOT_FOUND: "Joueur introuvable.",
  RUN_IN_MATCH: "Le joueur est en pleine partie : attends la fin de la partie.",
  INVALID_REASON: "Indique un motif (200 caractères max).",
  EVENT_RUN_NOT_FOUND: "Parcours introuvable.",
  INVALID_NEWEVENTID: "Nouvel identifiant invalide (a-z, 0-9, _ ; 3 à 64 caractères).",
};

export function adminErrorText(error: unknown): string {
  if (error instanceof BackendError) return ERROR_LABELS[error.message] ?? `${error.message} (${error.code})`;
  return error instanceof Error ? error.message : "Erreur inconnue";
}

export function issuesFromError(error: unknown): EventValidationIssue[] {
  if (!(error instanceof BackendError)) return [];
  const details = error.details as { issues?: EventValidationIssue[] } | undefined;
  return Array.isArray(details?.issues) ? details.issues : [];
}
