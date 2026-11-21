"use client";

/* Appels typés de la console admin (commandes du back VPS) + upload d'images. */

import type { CosmeticDefinition, EventLifecycle, EventValidationIssue, EventVersion, SeasonDefinition } from "@/domain";
import { BACKEND_URL, BackendError, callBackend } from "@/lib/backend";
import type { EventLeaderboardData } from "@/hooks/useEventLeaderboard";
import { auth } from "@/lib/authClient";

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
  challenges?: Record<string, number>;
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
  durationMs?: number | null;
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

export interface AdminPowerCardRow {
  id: string;
  def: import("@/types/game").PowerCardDef;
  script: import("@/engine/power/types").PowerScript;
  dev: boolean;
  published: boolean;
  revision: number;
  source: string;
  hasDraft: boolean;
  updatedAt: number;
  issues: Array<{ path: string; message: string }>;
}

export interface AdminPowerCardDetail {
  cardId: string;
  published: boolean;
  revision: number;
  current: import("@/engine/power/types").PowerModule | null;
  draft: import("@/engine/power/types").PowerModule | null;
  working: import("@/engine/power/types").PowerModule | null;
  issues: Array<{ path: string; message: string }>;
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
  cosmetics: () => call<{ cosmetics: CosmeticDefinition[] }>("listCosmetics"),
  saveCosmetic: (cosmetic: CosmeticDefinition) => call<{ cosmetic: CosmeticDefinition }>("saveCosmetic", { cosmetic }),
  seasons: () => call<{ seasons: SeasonDefinition[]; now: number }>("listSeasons"),
  saveSeason: (season: SeasonDefinition) => call<{ season: SeasonDefinition }>("saveSeason", { season }),
  seasonStats: (seasonId: string) => call<{ players: number; premium: number; premiumRevenueXaf: number; averagePoints: number; tiers: Array<{ points: number; reached: number; claimedFree: number; claimedPremium: number }> }>("getSeasonStats", { seasonId }),
  powerCards: () => call<{ cards: AdminPowerCardRow[]; seeded: boolean }>("listAdminPowerCards"),
  powerCard: (cardId: string) => call<AdminPowerCardDetail>("getAdminPowerCard", { cardId }),
  savePowerCardDraft: (card: Pick<import("@/engine/power/types").PowerModule, "def" | "script" | "dev">) => call<{ cardId: string; issues: Array<{ path: string; message: string }> }>("savePowerCardDraft", { card }),
  publishPowerCard: (cardId: string) => call<{ cardId: string; revision: number; catalogRevision: number }>("publishPowerCard", { cardId }),
  duplicatePowerCard: (cardId: string, newCardId: string) => call<{ cardId: string }>("duplicatePowerCard", { cardId, newCardId }),
  discardPowerCardDraft: (cardId: string) => call<{ cardId: string }>("discardPowerCardDraft", { cardId }),
  setPowerCardStatus: (cardId: string, status: { archived?: boolean; disabled?: boolean }) => call<{ cardId: string }>("setPowerCardStatus", { cardId, ...status }),
  seedPowerCards: () => call<{ created: number; total: number; published: number; catalogRevision: number }>("seedPowerCards"),
  uploads: (kind?: string) => call<{ uploads: AdminUpload[] }>("listAdminUploads", kind ? { kind } : {}),
  animMotifs: () => call<{ motifs: AdminMotifRow[]; moments: import("@/engine/anim/moments").MomentMap }>("listAdminAnimMotifs"),
  setGameMoments: (moments: import("@/engine/anim/moments").MomentMap) => call<{ moments: import("@/engine/anim/moments").MomentMap; catalogRevision: number }>("setGameMoments", { moments }),
  saveAnimMotifDraft: (motif: import("@/engine/anim/motif").AnimMotif) => call<{ motifId: string; issues: Array<{ path: string; message: string }> }>("saveAnimMotifDraft", { motif }),
  publishAnimMotif: (motifId: string) => call<{ motifId: string; revision: number; catalogRevision: number }>("publishAnimMotif", { motifId }),
  discardAnimMotifDraft: (motifId: string) => call<{ motifId: string }>("discardAnimMotifDraft", { motifId }),
  setAnimMotifArchived: (motifId: string, archived: boolean) => call<{ motifId: string; archived: boolean }>("setAnimMotifArchived", { motifId, archived }),
};

/** Modèle d'animation vu par l'admin (atelier, phase G3). */
export interface AdminMotifRow {
  id: string;
  motif: import("@/engine/anim/motif").AnimMotif;
  published: boolean;
  revision: number;
  hasDraft: boolean;
  isDefault: boolean;
  archived: boolean;
  updatedAt: number;
  issues: Array<{ path: string; message: string }>;
}

export async function uploadImage(file: File, kind: "event" | "boss" | "cosmetic" | "season" | "power") {
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

export async function uploadAudio(file: File) {
  const user = auth.currentUser;
  if (!user) throw new BackendError("unauthenticated", "AUTH_REQUIRED");
  if (file.size > 500 * 1024) throw new BackendError("invalid-argument", "FILE_TOO_LARGE");
  const response = await fetch(`${BACKEND_URL}/admin/upload-audio`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": file.type || "audio/mpeg" },
    body: file,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new BackendError(body.code ?? "internal", body.message ?? `HTTP_${response.status}`);
  return body as { url: string; path: string; durationMs: number | null; bytes: number; converted: boolean };
}

const ERROR_LABELS: Record<string, string> = {
  EVENT_INVALID: "La fiche contient des erreurs : corrige-les avant de publier.",
  EVENT_ALREADY_ENDED: "La date de fin est déjà passée.",
  DRAFT_NOT_FOUND: "Aucun brouillon à publier : enregistre d'abord.",
  ANIM_MOTIF_INVALID: "Le modèle contient des erreurs : corrige-les avant de publier.",
  ANIM_MOTIF_NOT_FOUND: "Modèle introuvable (jamais enregistré).",
  ANIM_MOTIF_MOMENT_CONFLICT: "Un moment du jeu utilise ce modèle : cette version ne lui convient plus (départ, arrivée ou durée). Change d'abord l'attribution des moments.",
  GAME_MOMENTS_INVALID: "L'attribution des moments contient des erreurs.",
  INVALID_MOTIFID: "Identifiant du modèle : 3 à 48 caractères a-z, 0-9 ou _.",
  EVENT_ID_TAKEN: "Cet identifiant est déjà utilisé.",
  NOTHING_SCHEDULED: "Aucune publication programmée.",
  ADMIN_REQUIRED: "Droits admin requis.",
  FILE_TOO_LARGE: "Fichier trop lourd (image : 2 Mo, son : 500 Ko).",
  NOT_AN_AUDIO_FILE: "Ce fichier n’est pas un son MP3, OGG, WAV ou M4A.",
  UNREADABLE_AUDIO: "Son illisible.",
  AUDIO_TOO_LONG: "Son trop long (60 s maximum avant découpe à 5 s).",
  NOT_AN_IMAGE: "Ce fichier n'est pas une image PNG, JPEG ou WebP.",
  UNSUPPORTED_TYPE: "Format accepté : PNG, JPEG ou WebP.",
  UNREADABLE_IMAGE: "Image illisible.",
  INVALID_EVENTID: "Identifiant invalide (a-z, 0-9, _ ; 3 à 64 caractères).",
  EVENT_REQUIRED_FOR_AUDIENCE: "Choisis un événement pour cibler ses participants.",
  CAMPAIGN_NOT_SCHEDULED: "Cette campagne n’est plus en attente.",
  COSMETIC_INVALID: "Le cosmétique contient des erreurs.",
  COSMETIC_TYPE_LOCKED: "Le type d’un cosmétique existant ne peut pas changer.",
  SEASON_INVALID: "La saison contient des erreurs.",
  POWER_CARD_INVALID: "La carte contient des erreurs : corrige-les avant de publier.",
  POWER_CARD_ID_TAKEN: "Cet identifiant de carte est déjà utilisé.",
  POWER_CARD_NOT_FOUND: "Carte introuvable.",
  INVALID_CARDID: "Identifiant invalide (a-z, 0-9, _ ; 3 à 48 caractères).",
  INVALID_NEWCARDID: "Nouvel identifiant invalide (a-z, 0-9, _ ; 3 à 48 caractères).",
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

/* Catalogue des cosmétiques partagé par les RewardPicker (chargé une fois). */
let cosmeticCache: Promise<CosmeticDefinition[]> | null = null;
export function loadCosmeticCatalog(force = false) {
  if (!cosmeticCache || force) cosmeticCache = adminApi.cosmetics().then((result) => result.cosmetics).catch(() => { cosmeticCache = null; return []; });
  return cosmeticCache;
}
