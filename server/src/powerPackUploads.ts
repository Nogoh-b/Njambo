/* ═══════════════ Import des illustrations d'un pack de cartes Pouvoir ═══════════════
   POST /admin/power-pack-art?pack=<import-…>&card=<id de carte intégrée>
     - en-tête Authorization: Bearer <idToken> d'un compte avec claim admin
     - corps : l'image brute (png / jpeg / webp), ≤ 3 Mo (l'admin la réduit
       à 1 080 px avant l'envoi, sous la limite Nginx client_max_body_size 3m)
     → { card, art, pack }
   POST /admin/power-pack-import : ZIP optimisé, enregistré en une fois.
   Les fichiers WebP sont servis en 720 / 256 / 128 px (cache immuable). */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import express, { type Express, type Request } from "express";
import sharp from "sharp";
import { HttpsError } from "firebase-functions/v2/https";
import { BUILTIN_POWER_ART_IDS, isImportedPowerPackId, type ImportedPowerArt, type ImportedPowerPack } from "../../domain/assetPacks";
import { requireAdmin } from "../../functions/src/core";
import { loadImportedPowerPacks, recordImportedPowerPack, recordPowerPackArt } from "../../functions/src/powerPackCommands";
import { POWER_PACK_IMAGE_BUDGET, POWER_PACK_UPLOAD_LIMIT, readPowerPackArchive } from "../../lib/powerPackArchive";
import { buildCallableRequest } from "./auth";
import { sendError } from "./httpError";
import { publicBase, sniffImage, uploadDir } from "./uploads";

export const POWER_PACK_ART_SIZES = [
  { size: 720, suffix: "", budget: POWER_PACK_IMAGE_BUDGET, quality: 86 },
  { size: 256, suffix: "-256", budget: 28_000, quality: 82 },
  { size: 128, suffix: "-128", budget: 12_000, quality: 80 },
] as const;
const ART_ENCODING_VERSION = "webp-2";

/** Décline une image source en 3 WebP recadrés pour le format du pack. */
export async function renderPowerPackArt(source: Buffer, portrait: boolean): Promise<Array<{ suffix: string; data: Buffer; width: number; height: number }>> {
  const outputs = [];
  for (const { size, suffix, budget, quality: start } of POWER_PACK_ART_SIZES) {
    const height = portrait ? Math.round(size * 1.5) : size;
    let artwork: sharp.Sharp;
    try {
      artwork = sharp(source, { limitInputPixels: 40_000_000, animated: false }).rotate().resize(size, height, { fit: "cover" }).flatten({ background: "#072c22" });
    } catch {
      throw new HttpsError("invalid-argument", "UNREADABLE_IMAGE");
    }
    let quality: number = start;
    let data: Buffer;
    try {
      data = await artwork.webp({ quality }).toBuffer();
      while (data.length > budget && quality > 38) {
        quality -= 6;
        data = await artwork.webp({ quality }).toBuffer();
      }
      if (data.length > budget) {
        artwork.blur(1.25);
        quality = 56;
        data = await artwork.webp({ quality }).toBuffer();
        while (data.length > budget && quality > 8) {
          quality -= 6;
          data = await artwork.webp({ quality }).toBuffer();
        }
      }
    } catch {
      throw new HttpsError("invalid-argument", "UNREADABLE_IMAGE");
    }
    if (data.length > budget) throw new HttpsError("invalid-argument", "IMAGE_TOO_DETAILED");
    outputs.push({ suffix, data, width: size, height });
  }
  return outputs;
}

async function writePowerPackArt(req: Request, folderName: string, card: string, body: Buffer, portrait: boolean, prepared?: Awaited<ReturnType<typeof renderPowerPackArt>>): Promise<ImportedPowerArt> {
  const outputs = prepared ?? await renderPowerPackArt(body, portrait);
  const v = createHash("sha256").update(body).update(portrait ? "portrait" : "square").update(ART_ENCODING_VERSION).digest("hex").slice(0, 16);
  const folder = join(uploadDir(), "power-packs", folderName);
  await mkdir(folder, { recursive: true });
  const base = `${publicBase(req)}/uploads/power-packs/${folderName}/${card}-${v}`;
  for (const output of outputs) {
    const destination = join(folder, `${card}-${v}${output.suffix}.webp`);
    const temp = join(folder, `.${randomUUID()}.tmp`);
    try {
      await writeFile(temp, output.data, { flag: "wx" });
      await rename(temp, destination);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => {});
      throw error;
    }
  }
  return { url: `${base}.webp`, thumb: `${base}-256.webp`, small: `${base}-128.webp`, v, updatedAt: Date.now() };
}

export function mountPowerPackUploads(app: Express) {
  const raw = express.raw({ type: () => true, limit: POWER_PACK_UPLOAD_LIMIT });
  app.post("/admin/power-pack-art", raw, async (req, res) => {
    try {
      const request = await buildCallableRequest(req.header("authorization"), {});
      const uid = requireAdmin(request);
      const packId = String(req.query.pack ?? "");
      const card = String(req.query.card ?? "");
      if (!isImportedPowerPackId(packId)) throw new HttpsError("invalid-argument", "POWER_PACK_UNKNOWN");
      if (!BUILTIN_POWER_ART_IDS.some((id) => id === card)) throw new HttpsError("invalid-argument", "POWER_PACK_CARD_UNKNOWN");
      const pack = (await loadImportedPowerPacks()).find((item) => item.id === packId);
      if (!pack) throw new HttpsError("not-found", "POWER_PACK_UNKNOWN");
      const body = req.body as unknown;
      if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpsError("invalid-argument", "EMPTY_FILE");
      if (!sniffImage(body)) throw new HttpsError("invalid-argument", "NOT_AN_IMAGE");

      const art = await writePowerPackArt(req, packId, card, body, pack.portrait);
      const updated = await recordPowerPackArt(uid, packId, card, art, pack.portrait);
      res.status(200).json({ card, art, pack: updated });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/admin/power-pack-import", raw, async (req, res) => {
    try {
      const request = await buildCallableRequest(req.header("authorization"), {});
      const uid = requireAdmin(request);
      const key = req.header("Idempotency-Key");
      if (!key || key.length < 8 || key.length > 160) throw new HttpsError("invalid-argument", "INVALID_IDEMPOTENCY_KEY");
      if (!Buffer.isBuffer(req.body)) throw new HttpsError("invalid-argument", "EMPTY_FILE");
      const { details, images } = await readPowerPackArchive(req.body, true).catch((error: Error) => {
        throw new HttpsError("invalid-argument", error.message);
      });
      if (!details) throw new HttpsError("invalid-argument", "POWER_PACK_MANIFEST_REQUIRED");
      const art: ImportedPowerPack["art"] = {};
      const prepared = [];
      for (const { card, data } of images) {
        const source = Buffer.from(data);
        if (sniffImage(source) !== "webp") throw new HttpsError("invalid-argument", `Illustration WebP requise pour ${card}.`);
        try {
          prepared.push({ card, source, outputs: await renderPowerPackArt(source, details.portrait) });
        } catch (error) {
          if (error instanceof HttpsError) throw new HttpsError("invalid-argument", `${card} – ${error.message}`);
          throw error;
        }
      }
      const folder = createHash("sha256").update(`${uid}:${key}:`).update(req.body).digest("hex").slice(0, 24);
      for (const { card, source, outputs } of prepared) art[card] = await writePowerPackArt(req, folder, card, source, details.portrait, outputs);
      res.status(201).json(await recordImportedPowerPack(uid, key, details, art));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.use(["/admin/power-pack-art", "/admin/power-pack-import"], ((error, _req, res, next) => {
    if ((error as { type?: string })?.type === "entity.too.large") {
      res.status(413).json({ code: "invalid-argument", message: "FILE_TOO_LARGE" });
      return;
    }
    next(error);
  }) as express.ErrorRequestHandler);
}
