/* ═══════════════ Upload d'images admin (événements, boss, cosmétiques) ═══════════════
   POST /admin/upload?kind=event|boss|cosmetic|season
     - en-tête Authorization: Bearer <idToken> d'un compte avec claim admin
     - corps : le fichier brut (Content-Type image/png | image/jpeg | image/webp), ≤ 2 Mo
     → { url, path, width, height, bytes }
   L'image est ré-encodée en WebP (sharp) : nom aléatoire, métadonnées retirées,
   largeur max 1600 px. Le fichier va dans UPLOAD_DIR/<kind>/ et est servi en
   GET /uploads/<kind>/<nom>.webp avec un cache long (nom immuable).

   Variables : UPLOAD_DIR (défaut ./uploads), PUBLIC_BASE_URL (ex.
   https://api.njambo.example ; défaut : déduit de la requête). */

import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import express, { type Express, type Request } from "express";
import sharp from "sharp";
import { HttpsError } from "firebase-functions/v2/https";
import { db, requireAdmin } from "../../functions/src/core";
import { buildCallableRequest } from "./auth";
import { sendError } from "./httpError";

export const UPLOAD_KINDS = ["event", "boss", "cosmetic", "season", "power"] as const;
type UploadKind = typeof UPLOAD_KINDS[number];
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_WIDTH = 1600;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export function uploadDir() {
  return resolve(process.env.UPLOAD_DIR ?? "uploads");
}

/** Vérifie la signature binaire (on ne fait pas confiance au Content-Type). */
export function sniffImage(buffer: Buffer): "png" | "jpeg" | "webp" | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function publicBase(req: Request) {
  const configured = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const proto = (req.header("x-forwarded-proto") ?? req.protocol).split(",")[0].trim();
  return `${proto}://${req.header("x-forwarded-host") ?? req.header("host")}`;
}

export function mountUploads(app: Express) {
  const dir = uploadDir();

  app.use("/uploads", express.static(dir, {
    immutable: true, maxAge: "365d", index: false, dotfiles: "deny", fallthrough: false,
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      // Fichiers publics : le front (autre origine) les lit en fetch CORS (sons WebAudio, préchargement).
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  }));

  app.post("/admin/upload", express.raw({ type: () => true, limit: MAX_BYTES }), async (req, res) => {
    try {
      const request = await buildCallableRequest(req.header("authorization"), {});
      const uid = requireAdmin(request);
      const kind = String(req.query.kind ?? "event") as UploadKind;
      if (!UPLOAD_KINDS.includes(kind)) throw new HttpsError("invalid-argument", "INVALID_KIND");
      const contentType = (req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!ACCEPTED.includes(contentType)) throw new HttpsError("invalid-argument", "UNSUPPORTED_TYPE");
      const body = req.body as unknown;
      if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpsError("invalid-argument", "EMPTY_FILE");
      if (!sniffImage(body)) throw new HttpsError("invalid-argument", "NOT_AN_IMAGE");

      let output: { data: Buffer; info: sharp.OutputInfo };
      try {
        output = await sharp(body, { limitInputPixels: 40_000_000, animated: false })
          .rotate()
          .resize({ width: MAX_WIDTH, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true });
      } catch {
        throw new HttpsError("invalid-argument", "UNREADABLE_IMAGE");
      }

      const name = `${randomUUID()}.webp`;
      await mkdir(join(dir, kind), { recursive: true });
      await writeFile(join(dir, kind, name), output.data, { flag: "wx" });
      const path = `/uploads/${kind}/${name}`;
      const url = `${publicBase(req)}${path}`;
      const now = Date.now();
      await db.doc(`admin_uploads/${name.replace(".webp", "")}`).set({
        kind, path, url, width: output.info.width, height: output.info.height, bytes: output.data.length,
        originalBytes: body.length, uploadedBy: uid, createdAt: now,
      });
      await db.collection("admin_audit").doc().set({ uid, action: "upload_image", kind, path, createdAt: now });
      res.status(200).json({ url, path, width: output.info.width, height: output.info.height, bytes: output.data.length });
    } catch (error) {
      if ((error as { type?: string }).type === "entity.too.large") {
        res.status(413).json({ code: "invalid-argument", message: "FILE_TOO_LARGE" });
        return;
      }
      sendError(res, error);
    }
  });

  /* Erreur de parsing (fichier > 2 Mo) levée par express.raw avant le handler. */
  app.use("/admin/upload", ((error, _req, res, next) => {
    if ((error as { type?: string })?.type === "entity.too.large") {
      res.status(413).json({ code: "invalid-argument", message: "FILE_TOO_LARGE" });
      return;
    }
    next(error);
  }) as express.ErrorRequestHandler);
}
