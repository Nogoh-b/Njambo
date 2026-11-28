/* ═══════════════ Upload de sons (Sons & Audio, cartes pouvoir, chorégraphies) ═══════════════
   POST /admin/upload-audio — en-tête Authorization: Bearer <idToken admin>,
   corps = fichier brut (MP3 / OGG / WAV / M4A), 5 Mo max (SFX) / 12 Mo max (musique).
   Paramètres query optionnels :
     - kind=sfx|music (défaut sfx)
     - rawGain=1 (conserve le gain édité dans le studio sans loudnorm, avec limiteur doux)
     - name=<nom d'affichage court> (stocké dans admin_uploads.label)
   → { url, path, durationMs, bytes, converted, role, label }
   Contrôle de la signature binaire, durée & canaux lus par ffprobe (source ≤ 60 s SFX / 240 s musique),
   puis ffmpeg : MP3 44,1 kHz (préserve mono/stéréo jusqu'à 2 canaux : 128 kb/s SFX stéréo, 96 kb/s mono,
   160 kb/s musique), volume normalisé (loudnorm sauf rawGain=1), coupé à 5 s (SFX) avec fondu de fin.
   Sans ffmpeg sur la machine : fichier gardé tel quel (extension d'origine).
   Stockage UPLOAD_DIR/audio/<uuid>.<ext>, servi par /uploads (cache immuable) ; bibliothèque admin_uploads. */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import express, { type Express, type Request } from "express";
import { HttpsError } from "firebase-functions/v2/https";
import { db, requireAdmin } from "../../functions/src/core";
import { buildCallableRequest } from "./auth";
import { sendError } from "./httpError";
import { uploadDir } from "./uploads";

const run = promisify(execFile);
const MAX_SFX_BYTES = 5 * 1024 * 1024;
const MAX_MUSIC_BYTES = 12 * 1024 * 1024;
const MAX_SFX_SOURCE_SECONDS = 60;
const MAX_MUSIC_SOURCE_SECONDS = 240;
const MAX_SFX_SECONDS = 5;
const ACCEPTED = ["audio/mpeg", "audio/mp3", "audio/ogg", "audio/wav", "audio/x-wav", "audio/wave", "audio/mp4", "audio/x-m4a", "audio/aac"];

/** Format d'après la signature binaire (on ne fait pas confiance au Content-Type). */
export function sniffAudio(buffer: Buffer): "mp3" | "ogg" | "wav" | "m4a" | null {
  if (buffer.length < 12) return null;
  if (buffer.toString("ascii", 0, 3) === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return "mp3";
  if (buffer.toString("ascii", 0, 4) === "OggS") return "ogg";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE") return "wav";
  if (buffer.toString("ascii", 4, 8) === "ftyp") return "m4a";
  return null;
}

async function probeAudio(file: string): Promise<{ seconds: number; channels: number } | "missing" | null> {
  try {
    const { stdout } = await run(
      "ffprobe",
      ["-v", "error", "-select_streams", "a:0", "-show_entries", "format=duration:stream=channels", "-of", "json", file],
      { timeout: 10_000 },
    );
    const parsed = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Array<{ channels?: number }> };
    const seconds = Number.parseFloat(parsed.format?.duration ?? "");
    if (!Number.isFinite(seconds)) return null;
    const rawCh = parsed.streams?.[0]?.channels;
    const channels = typeof rawCh === "number" && rawCh >= 1 ? Math.min(2, rawCh) : 1;
    return { seconds, channels };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    return null;
  }
}

function sanitizeLabel(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().replace(/[^\w\-. ()[\]]+/g, "_").slice(0, 96);
  return trimmed || undefined;
}

function publicBase(req: Request) {
  const configured = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const proto = (req.header("x-forwarded-proto") ?? req.protocol).split(",")[0].trim();
  return `${proto}://${req.header("x-forwarded-host") ?? req.header("host")}`;
}

export function mountAudioUploads(app: Express) {
  app.post("/admin/upload-audio", express.raw({ type: () => true, limit: MAX_MUSIC_BYTES }), async (req, res) => {
    let work: string | null = null;
    try {
      const request = await buildCallableRequest(req.header("authorization"), {});
      const uid = requireAdmin(request);
      const role = req.query.kind === "music" ? "music" : "sfx";
      const rawGain = req.query.rawGain === "1" || req.query.rawGain === "true";
      const label = sanitizeLabel(req.query.name);
      const maxBytes = role === "music" ? MAX_MUSIC_BYTES : MAX_SFX_BYTES;
      const maxSourceSeconds = role === "music" ? MAX_MUSIC_SOURCE_SECONDS : MAX_SFX_SOURCE_SECONDS;

      const contentType = (req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!ACCEPTED.includes(contentType)) throw new HttpsError("invalid-argument", "UNSUPPORTED_TYPE");
      const body = req.body as unknown;
      if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpsError("invalid-argument", "EMPTY_FILE");
      if (body.length > maxBytes) {
        res.status(413).json({ code: "invalid-argument", message: "FILE_TOO_LARGE" });
        return;
      }
      const format = sniffAudio(body);
      if (!format) throw new HttpsError("invalid-argument", "NOT_AN_AUDIO_FILE");

      work = await mkdtemp(join(tmpdir(), "njambo-audio-"));
      const input = join(work, `in.${format}`);
      await writeFile(input, body);
      const probed = await probeAudio(input);
      if (probed === null) throw new HttpsError("invalid-argument", "UNREADABLE_AUDIO");
      const seconds = probed === "missing" ? -1 : probed.seconds;
      const sourceChannels = probed === "missing" ? 1 : probed.channels;
      if (seconds > maxSourceSeconds) throw new HttpsError("invalid-argument", "AUDIO_TOO_LONG");

      let data: Buffer = body;
      let extension: string = format;
      const clippedSeconds = role === "music" ? seconds : Math.min(seconds, MAX_SFX_SECONDS);
      let durationMs = seconds > 0 ? Math.round(clippedSeconds * 1000) : null;
      let converted = false;
      if (seconds !== -1) {
        const output = join(work, "out.mp3");
        const outChannels = role === "music" ? 2 : sourceChannels;
        const bitrate = role === "music" ? "160k" : outChannels === 2 ? "128k" : "96k";
        const fade = role === "sfx" && seconds > MAX_SFX_SECONDS ? `,afade=t=out:st=${MAX_SFX_SECONDS - 0.25}:d=0.25` : "";
        const baseFilter = rawGain ? "alimiter=limit=0.95:attack=3:release=40" : "loudnorm=I=-16:TP=-1.5:LRA=11";
        const ffmpegArgs = [
          "-v", "error", "-y", "-i", input,
          ...(role === "sfx" ? ["-t", String(MAX_SFX_SECONDS)] : []),
          "-vn",
          "-ac", String(outChannels),
          "-ar", "44100",
          "-af", `${baseFilter}${fade}`,
          "-codec:a", "libmp3lame",
          "-b:a", bitrate,
          output,
        ];
        try {
          await run("ffmpeg", ffmpegArgs, { timeout: role === "music" ? 60_000 : 30_000 });
          data = await readFile(output);
          extension = "mp3";
          converted = true;
          const outProbed = await probeAudio(output);
          if (outProbed && outProbed !== "missing" && outProbed.seconds > 0) {
            durationMs = Math.round(outProbed.seconds * 1000);
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new HttpsError("invalid-argument", "UNREADABLE_AUDIO");
        }
      }

      const name = `${randomUUID()}.${extension}`;
      const dir = join(uploadDir(), "audio");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, name), data, { flag: "wx" });
      const path = `/uploads/audio/${name}`;
      const url = `${publicBase(req)}${path}`;
      const now = Date.now();
      await db.doc(`admin_uploads/${name.replace(/\.\w+$/, "")}`).set({
        kind: "audio",
        audioRole: role,
        ...(label ? { label } : {}),
        path,
        url,
        durationMs,
        bytes: data.length,
        originalBytes: body.length,
        converted,
        uploadedBy: uid,
        createdAt: now,
      });
      await db.collection("admin_audit").doc().set({ uid, action: "upload_audio", role, path, ...(label ? { label } : {}), createdAt: now });
      res.status(200).json({ url, path, durationMs, bytes: data.length, converted, role, ...(label ? { label } : {}) });
    } catch (error) {
      if ((error as { type?: string }).type === "entity.too.large") {
        res.status(413).json({ code: "invalid-argument", message: "FILE_TOO_LARGE" });
        return;
      }
      sendError(res, error);
    } finally {
      if (work) await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  app.use("/admin/upload-audio", ((error, _req, res, next) => {
    if ((error as { type?: string })?.type === "entity.too.large") {
      res.status(413).json({ code: "invalid-argument", message: "FILE_TOO_LARGE" });
      return;
    }
    next(error);
  }) as express.ErrorRequestHandler);
}
