/* ═══════════════ Export / Import de Pack Audio NJAMBO (.zip) ═══════════════
   Permet à l'admin d'exporter toute sa configuration audio (37 emplacements
   « Sons & Audio » + sons d'activation & chorégraphies des cartes pouvoir)
   AVEC tous les fichiers audio embarqués et dédupliqués, puis de réimporter
   l'archive sur n'importe quel environnement (local, préprod, prod). */

import {
  GAME_SOUND_BY_ID,
  GAME_SOUND_SLOTS,
  isGameSoundId,
  normalizeAudioCatalogConfig,
  type AudioCatalogConfig,
  type AudioSlotOverride,
  type GameSoundId,
} from "@/domain/audioCatalog";
import { isPresetSound } from "@/lib/powerSounds";
import type { PowerModule } from "@/engine/power/types";
import { createZip, crc32, readZip, type ZipEntryInput } from "./audioZip";

export const NJAMBO_AUDIO_PACK_VERSION = 1;

export interface AudioPackSlotEntry {
  /** Chemin relatif du fichier audio embarqué dans le ZIP (ex. `audio/ui_button-a1b2c3d4.mp3`). */
  file?: string;
  /** URL conservée telle quelle si le fichier n'a pas été embarqué. */
  url?: string;
  volume?: number;
  enabled?: boolean;
}

export interface AudioPackChoreoSoundEntry {
  stepIndex: number;
  trackId: string;
  file?: string;
  sound?: string;
  volume?: number;
}

export interface AudioPackPowerCardEntry {
  sound?: {
    file?: string;
    ref?: string;
    volume?: number;
  };
  choreoSounds?: AudioPackChoreoSoundEntry[];
}

export interface NjamboAudioPackManifest {
  version: 1;
  app: "njambo";
  exportedAt: string;
  includeDefaults: boolean;
  includePowerCards: boolean;
  catalog: {
    slots: Partial<Record<GameSoundId, AudioPackSlotEntry>>;
  };
  powerCards?: Record<string, AudioPackPowerCardEntry>;
}

export interface AudioPackProgress {
  phase: "collect" | "fetch" | "zip" | "upload" | "apply";
  current: number;
  total: number;
  label: string;
}

export interface AudioPackInspection {
  manifest: NjamboAudioPackManifest;
  files: Map<string, Uint8Array>;
  slotIds: GameSoundId[];
  powerCardIds: string[];
  audioFiles: string[];
  totalAudioBytes: number;
  warnings: string[];
}

export type AudioFetchFn = (url: string) => Promise<{ bytes: Uint8Array; ext: string }>;

function extFromUrl(url: string, contentType?: string | null): string {
  const clean = url.split("?")[0] ?? "";
  const match = /\.(mp3|wav|ogg|m4a)$/i.exec(clean);
  if (match) return match[1]!.toLowerCase();
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("wav")) return "wav";
  if (ct.includes("ogg")) return "ogg";
  if (ct.includes("mp4") || ct.includes("m4a") || ct.includes("aac")) return "m4a";
  return "mp3";
}

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case "wav": return "audio/wav";
    case "ogg": return "audio/ogg";
    case "m4a": return "audio/mp4";
    default: return "audio/mpeg";
  }
}

export async function defaultFetchAudio(url: string): Promise<{ bytes: Uint8Array; ext: string }> {
  const isLocal = url.startsWith("/");
  const res = await fetch(url, isLocal ? { credentials: "same-origin" } : { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error(`Échec du téléchargement de ${url} (HTTP ${res.status})`);
  const buf = await res.arrayBuffer();
  return { bytes: new Uint8Array(buf), ext: extFromUrl(url, res.headers.get("content-type")) };
}

function slug(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "son";
}

export interface ExportAudioPackOptions {
  catalog: AudioCatalogConfig;
  powerCards?: ReadonlyArray<Pick<PowerModule, "def" | "script">>;
  includeDefaults?: boolean;
  includePowerCards?: boolean;
  fetchAudio?: AudioFetchFn;
  onProgress?: (progress: AudioPackProgress) => void;
}

/** Exporte la configuration audio + tous les fichiers audio dédupliqués dans une archive ZIP. */
export async function exportAudioPackZip(options: ExportAudioPackOptions): Promise<{
  zipBytes: Uint8Array;
  manifest: NjamboAudioPackManifest;
  fileCount: number;
  warnings: string[];
}> {
  const includeDefaults = Boolean(options.includeDefaults);
  const includePowerCards = Boolean(options.includePowerCards && options.powerCards);
  const fetchAudio = options.fetchAudio ?? defaultFetchAudio;
  const warnings: string[] = [];

  // 1. Collecte des URLs uniques à embarquer
  const urlToHint = new Map<string, string>();

  for (const slot of GAME_SOUND_SLOTS) {
    const ov = options.catalog.slots[slot.id];
    const url = ov?.url ?? (includeDefaults ? slot.defaultUrl : null);
    if (url && !urlToHint.has(url)) urlToHint.set(url, slot.id);
  }

  if (includePowerCards && options.powerCards) {
    for (const card of options.powerCards) {
      const ref = card.def.sound?.ref;
      if (ref && !isPresetSound(ref) && !urlToHint.has(ref)) {
        urlToHint.set(ref, `power_${card.def.id}`);
      }
      for (const step of card.script.steps ?? []) {
        for (const track of step.choreo?.tracks ?? []) {
          if (track.kind === "sound" && track.sound && !isPresetSound(track.sound) && !urlToHint.has(track.sound)) {
            urlToHint.set(track.sound, `choreo_${card.def.id}`);
          }
        }
      }
    }
  }

  // 2. Téléchargement & déduplication par empreinte CRC+taille
  const urlToZipPath = new Map<string, string>();
  const hashToZipPath = new Map<string, string>();
  const zipEntries: ZipEntryInput[] = [];
  const entriesList = [...urlToHint.entries()];

  for (let i = 0; i < entriesList.length; i += 1) {
    const [url, hint] = entriesList[i]!;
    options.onProgress?.({ phase: "fetch", current: i + 1, total: entriesList.length, label: hint });
    try {
      const { bytes, ext } = await fetchAudio(url);
      const sig = `${bytes.length}:${crc32(bytes).toString(16).padStart(8, "0")}`;
      const existing = hashToZipPath.get(sig);
      if (existing) {
        urlToZipPath.set(url, existing);
      } else {
        const zipPath = `audio/${slug(hint)}-${crc32(bytes).toString(16).padStart(8, "0")}.${ext}`;
        hashToZipPath.set(sig, zipPath);
        urlToZipPath.set(url, zipPath);
        zipEntries.push({ name: zipPath, data: bytes });
      }
    } catch (cause) {
      warnings.push(`Fichier ignoré (${hint}) : ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  // 3. Construction du manifeste
  const manifestSlots: Partial<Record<GameSoundId, AudioPackSlotEntry>> = {};
  for (const slot of GAME_SOUND_SLOTS) {
    const ov = options.catalog.slots[slot.id];
    const effectiveUrl = ov?.url ?? (includeDefaults ? slot.defaultUrl : null);
    const hasCustom = Boolean(ov && (ov.url || ov.volume !== undefined || ov.enabled === false));
    if (!hasCustom && !includeDefaults) continue;

    const entry: AudioPackSlotEntry = {};
    if (effectiveUrl) {
      const packed = urlToZipPath.get(effectiveUrl);
      if (packed) entry.file = packed;
      else if (ov?.url) entry.url = ov.url;
    }
    if (ov?.volume !== undefined) entry.volume = ov.volume;
    else if (includeDefaults) entry.volume = slot.defaultVolume;
    if (ov?.enabled === false) entry.enabled = false;
    if (Object.keys(entry).length > 0) manifestSlots[slot.id] = entry;
  }

  let powerCardsManifest: Record<string, AudioPackPowerCardEntry> | undefined;
  if (includePowerCards && options.powerCards) {
    powerCardsManifest = {};
    for (const card of options.powerCards) {
      const cardEntry: AudioPackPowerCardEntry = {};
      if (card.def.sound?.ref) {
        const ref = card.def.sound.ref;
        if (isPresetSound(ref)) {
          cardEntry.sound = {
            ref,
            ...(card.def.sound.volume !== undefined ? { volume: card.def.sound.volume } : {}),
          };
        } else {
          const packed = urlToZipPath.get(ref);
          cardEntry.sound = {
            ...(packed ? { file: packed } : { ref }),
            ...(card.def.sound.volume !== undefined ? { volume: card.def.sound.volume } : {}),
          };
        }
      }
      const choreoSounds: AudioPackChoreoSoundEntry[] = [];
      (card.script.steps ?? []).forEach((step, stepIndex) => {
        for (const track of step.choreo?.tracks ?? []) {
          if (track.kind !== "sound") continue;
          const packed = !isPresetSound(track.sound) ? urlToZipPath.get(track.sound) : undefined;
          choreoSounds.push({
            stepIndex,
            trackId: track.id,
            ...(packed ? { file: packed } : { sound: track.sound }),
            ...(track.volume !== undefined ? { volume: track.volume } : {}),
          });
        }
      });
      if (choreoSounds.length > 0) cardEntry.choreoSounds = choreoSounds;
      if (cardEntry.sound || cardEntry.choreoSounds) {
        powerCardsManifest[card.def.id] = cardEntry;
      }
    }
  }

  const manifest: NjamboAudioPackManifest = {
    version: NJAMBO_AUDIO_PACK_VERSION,
    app: "njambo",
    exportedAt: new Date().toISOString(),
    includeDefaults,
    includePowerCards,
    catalog: { slots: manifestSlots },
    ...(powerCardsManifest ? { powerCards: powerCardsManifest } : {}),
  };

  options.onProgress?.({ phase: "zip", current: 1, total: 1, label: "Création de l'archive ZIP…" });
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  const zipBytes = createZip([{ name: "manifest.json", data: manifestBytes }, ...zipEntries]);

  return { zipBytes, manifest, fileCount: zipEntries.length, warnings };
}

/** Inspecte une archive ZIP avant import afin d'afficher un résumé clair à l'admin. */
export async function inspectAudioPackZip(zipBytes: Uint8Array): Promise<AudioPackInspection> {
  const files = await readZip(zipBytes);
  const rawManifest = files.get("manifest.json");
  if (!rawManifest) {
    throw new Error("Ce ZIP ne contient pas de fichier manifest.json NJAMBO.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(rawManifest));
  } catch {
    throw new Error("Le fichier manifest.json du pack audio est illisible.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Format de manifest.json invalide.");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.app !== "njambo" || obj.version !== NJAMBO_AUDIO_PACK_VERSION) {
    throw new Error("Ce pack audio n'est pas compatible avec cette version de NJAMBO.");
  }
  const catalogObj = obj.catalog as { slots?: Record<string, AudioPackSlotEntry> } | undefined;
  if (!catalogObj || !catalogObj.slots || typeof catalogObj.slots !== "object") {
    throw new Error("Le manifeste ne contient aucun catalogue audio.");
  }

  const warnings: string[] = [];
  const slotIds: GameSoundId[] = [];
  const referencedAudio = new Set<string>();

  for (const [id, entry] of Object.entries(catalogObj.slots)) {
    if (!isGameSoundId(id)) {
      warnings.push(`Emplacement inconnu ignoré : ${id}`);
      continue;
    }
    slotIds.push(id);
    if (entry?.file) {
      if (files.has(entry.file)) referencedAudio.add(entry.file);
      else warnings.push(`Fichier audio manquant dans l'archive pour ${id} : ${entry.file}`);
    }
  }

  const powerCardsMap = (obj.powerCards && typeof obj.powerCards === "object" && !Array.isArray(obj.powerCards))
    ? (obj.powerCards as Record<string, AudioPackPowerCardEntry>)
    : undefined;
  const powerCardIds: string[] = [];
  if (powerCardsMap) {
    for (const [cardId, cardEntry] of Object.entries(powerCardsMap)) {
      powerCardIds.push(cardId);
      if (cardEntry?.sound?.file) {
        if (files.has(cardEntry.sound.file)) referencedAudio.add(cardEntry.sound.file);
        else warnings.push(`Audio d'activation manquant pour la carte ${cardId} : ${cardEntry.sound.file}`);
      }
      for (const ch of cardEntry?.choreoSounds ?? []) {
        if (ch.file) {
          if (files.has(ch.file)) referencedAudio.add(ch.file);
          else warnings.push(`Audio de chorégraphie manquant pour ${cardId} : ${ch.file}`);
        }
      }
    }
  }

  const audioFiles = [...referencedAudio];
  const totalAudioBytes = audioFiles.reduce((sum, path) => sum + (files.get(path)?.length ?? 0), 0);

  return {
    manifest: parsed as NjamboAudioPackManifest,
    files,
    slotIds,
    powerCardIds,
    audioFiles,
    totalAudioBytes,
    warnings,
  };
}

export type AudioUploadFn = (
  file: File,
  role: "sfx" | "music",
  options?: { rawGain?: boolean; label?: string },
) => Promise<{ url: string }>;

export interface ImportAudioPackOptions {
  inspection: AudioPackInspection;
  currentCatalog: AudioCatalogConfig;
  mode: "replace" | "merge";
  importPowerCards: boolean;
  uploadAudio: AudioUploadFn;
  onProgress?: (progress: AudioPackProgress) => void;
}

export interface ImportedPowerCardPatch {
  cardId: string;
  sound?: { ref: string; volume?: number };
  choreoSounds?: Array<{ stepIndex: number; trackId: string; sound: string; volume?: number }>;
}

/** Importe un pack inspecté : envoie chaque fichier audio unique au serveur, puis renvoie la config remappée. */
export async function importAudioPackZip(options: ImportAudioPackOptions): Promise<{
  nextCatalog: AudioCatalogConfig;
  powerCardPatches: ImportedPowerCardPatch[];
  uploadedCount: number;
  warnings: string[];
}> {
  const { inspection, mode, importPowerCards, uploadAudio } = options;
  const { manifest, files } = inspection;
  const warnings: string[] = [...inspection.warnings];

  // Détermine le rôle (music ou sfx) de chaque fichier embarqué
  const fileRoles = new Map<string, "sfx" | "music">();
  for (const slotId of inspection.slotIds) {
    const entry = manifest.catalog.slots[slotId];
    if (entry?.file && files.has(entry.file)) {
      const slot = GAME_SOUND_BY_ID[slotId];
      // Si un fichier est utilisé par au moins un slot musique, on l'envoie en mode musique (non coupé à 5 s)
      if (slot.kind === "music" || !fileRoles.has(entry.file)) {
        fileRoles.set(entry.file, slot.kind);
      }
    }
  }
  if (importPowerCards && manifest.powerCards) {
    for (const cardEntry of Object.values(manifest.powerCards)) {
      if (cardEntry.sound?.file && files.has(cardEntry.sound.file) && !fileRoles.has(cardEntry.sound.file)) {
        fileRoles.set(cardEntry.sound.file, "sfx");
      }
      for (const ch of cardEntry.choreoSounds ?? []) {
        if (ch.file && files.has(ch.file) && !fileRoles.has(ch.file)) {
          fileRoles.set(ch.file, "sfx");
        }
      }
    }
  }

  // 1. Upload dédupliqué fichier par fichier (compatible Nginx)
  const zipPathToUrl = new Map<string, string>();
  const toUpload = [...fileRoles.entries()];
  for (let i = 0; i < toUpload.length; i += 1) {
    const [zipPath, role] = toUpload[i]!;
    const raw = files.get(zipPath)!;
    const filename = zipPath.split("/").pop() ?? "audio.mp3";
    const ext = extFromUrl(filename);
    const copy = new Uint8Array(raw.length);
    copy.set(raw);
    const fileObj = new File([copy], filename, { type: mimeFromExt(ext) });
    options.onProgress?.({ phase: "upload", current: i + 1, total: toUpload.length, label: filename });
    const uploaded = await uploadAudio(fileObj, role, { label: filename });
    zipPathToUrl.set(zipPath, uploaded.url);
  }

  // 2. Reconstruction du catalogue global
  const baseSlots: Partial<Record<GameSoundId, AudioSlotOverride>> =
    mode === "merge" ? { ...options.currentCatalog.slots } : {};

  for (const slotId of inspection.slotIds) {
    const entry = manifest.catalog.slots[slotId];
    if (!entry) continue;
    const nextOv: AudioSlotOverride = {};
    if (entry.file) {
      const url = zipPathToUrl.get(entry.file);
      if (url) nextOv.url = url;
    } else if (entry.url) {
      nextOv.url = entry.url;
    }
    if (typeof entry.volume === "number") nextOv.volume = entry.volume;
    if (entry.enabled === false) nextOv.enabled = false;
    baseSlots[slotId] = nextOv;
  }

  const nextCatalog = normalizeAudioCatalogConfig({ slots: baseSlots });

  // 3. Patches audio des cartes pouvoir (si demandé)
  const powerCardPatches: ImportedPowerCardPatch[] = [];
  if (importPowerCards && manifest.powerCards) {
    for (const [cardId, cardEntry] of Object.entries(manifest.powerCards)) {
      const patch: ImportedPowerCardPatch = { cardId };
      if (cardEntry.sound) {
        const ref = cardEntry.sound.file ? zipPathToUrl.get(cardEntry.sound.file) : cardEntry.sound.ref;
        if (ref) {
          patch.sound = {
            ref,
            ...(typeof cardEntry.sound.volume === "number" ? { volume: cardEntry.sound.volume } : {}),
          };
        }
      }
      if (cardEntry.choreoSounds && cardEntry.choreoSounds.length > 0) {
        const mapped = cardEntry.choreoSounds
          .map((ch) => {
            const sound = ch.file ? zipPathToUrl.get(ch.file) : ch.sound;
            if (!sound) return null;
            return {
              stepIndex: ch.stepIndex,
              trackId: ch.trackId,
              sound,
              ...(typeof ch.volume === "number" ? { volume: ch.volume } : {}),
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);
        if (mapped.length > 0) patch.choreoSounds = mapped;
      }
      if (patch.sound || patch.choreoSounds) powerCardPatches.push(patch);
    }
  }

  return { nextCatalog, powerCardPatches, uploadedCount: toUpload.length, warnings };
}
