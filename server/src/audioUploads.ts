/* ═══════════════ Upload de sons (cartes pouvoir, chorégraphies) ═══════════════
   POST /admin/upload-audio — en-tête Authorization: Bearer <idToken admin>,
   corps = fichier brut (MP3 / OGG / WAV / M4A), 500 Ko max.
   → { url, path, durationMs, bytes, converted }
   Contrôle de la signature binaire, durée lue par ffprobe (source ≤ 60 s),
   puis ffmpeg : MP3 mono 44,1 kHz 96 kb/s, volume normalisé (loudnorm),
   coupé à 5 s avec fondu de fin. Sans ffmpeg sur la machine : fichier gardé
   tel quel (extension d'origine). Stockage UPLOAD_DIR/audio/<uuid>.<ext>,
   servi par /uploads (cache immuable) ; bibliothèque admin_uploads (kind audio). */

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
const MAX_SFX_BYTES = 500 * 1024;
const MAX_MUSIC_BYTES = 6 * 1024 * 1024;
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

async function probeSeconds(file: string): Promise<number | null> {
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { timeout: 10_000 });
    const seconds = Number.parseFloat(stdout.trim());
    return Number.isFinite(seconds) ? seconds : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return -1; // ffprobe absent
    return null;
  }
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
      const seconds = await probeSeconds(input);
      if (seconds === null) throw new HttpsError("invalid-argument", "UNREADABLE_AUDIO");
      if (seconds > maxSourceSeconds) throw new HttpsError("invalid-argument", "AUDIO_TOO_LONG");

      let data: Buffer = body;
      let extension: string = format;
      const clippedSeconds = role === "music" ? seconds : Math.min(seconds, MAX_SFX_SECONDS);
      let durationMs = seconds > 0 ? Math.round(clippedSeconds * 1000) : null;
      let converted = false;
      if (seconds !== -1) {
        const output = join(work, "out.mp3");
        const fade = role === "sfx" && seconds > MAX_SFX_SECONDS ? `,afade=t=out:st=${MAX_SFX_SECONDS - 0.25}:d=0.25` : "";
        const ffmpegArgs = [
          "-v", "error", "-y", "-i", input,
          ...(role === "sfx" ? ["-t", String(MAX_SFX_SECONDS)] : []),
          "-vn",
          "-ac", role === "music" ? "2" : "1",
          "-ar", "44100",
          "-af", `loudnorm=I=-16:TP=-1.5:LRA=11${fade}`,
          "-codec:a", "libmp3lame",
          "-b:a", role === "music" ? "128k" : "96k",
          output,
        ];
        try {
          await run("ffmpeg", ffmpegArgs, { timeout: role === "music" ? 60_000 : 30_000 });
          data = await readFile(output);
          extension = "mp3";
          converted = true;
          const outSeconds = await probeSeconds(output);
          if (outSeconds && outSeconds > 0) durationMs = Math.round(outSeconds * 1000);
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
        kind: "audio", audioRole: role, path, url, durationMs, bytes: data.length, originalBytes: body.length, converted, uploadedBy: uid, createdAt: now,
      });
      await db.collection("admin_audit").doc().set({ uid, action: "upload_audio", role, path, createdAt: now });
      res.status(200).json({ url, path, durationMs, bytes: data.length, converted, role });
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
