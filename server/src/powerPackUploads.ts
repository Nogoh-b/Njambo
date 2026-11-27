/* ═══════════════ Import des illustrations d'un pack de cartes Pouvoir ═══════════════
   POST /admin/power-pack-art?pack=<import-…>&card=<id de carte intégrée>
     - en-tête Authorization: Bearer <idToken> d'un compte avec claim admin
     - corps : l'image brute (png / jpeg / webp), ≤ 3 Mo (l'admin la réduit
       à 1 080 px avant l'envoi, sous la limite Nginx client_max_body_size 3m)
     → { card, art, pack }
   Comme scripts/build-power-art-packs.mjs : recadrage « cover » en 720 / 256 /
   128 px de large (hauteur × 1,5 pour un pack portrait), fond #072c22, WebP sous
   400 Ko (720) et 80 Ko (vignettes). Fichiers dans UPLOAD_DIR/power-packs/<pack>/,
   nommés avec l'empreinte de l'image (cache immuable), puis URL enregistrées dans
   runtime_config/power_packs. */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import express, { type Express } from "express";
import sharp from "sharp";
import { HttpsError } from "firebase-functions/v2/https";
import { BUILTIN_POWER_ART_IDS, isImportedPowerPackId, type ImportedPowerArt } from "../../domain/assetPacks";
import { requireAdmin } from "../../functions/src/core";
import { loadImportedPowerPacks, recordPowerPackArt } from "../../functions/src/powerPackCommands";
import { buildCallableRequest } from "./auth";
import { sendError } from "./httpError";
import { publicBase, sniffImage, uploadDir } from "./uploads";

const MAX_BYTES = 3 * 1024 * 1024;
export const POWER_PACK_ART_SIZES = [
  { size: 720, suffix: "", budget: 400_000, quality: 88 },
  { size: 256, suffix: "-256", budget: 80_000, quality: 84 },
  { size: 128, suffix: "-128", budget: 80_000, quality: 84 },
] as const;

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
      while (data.length >= budget && quality > 50) {
        quality -= 5;
        data = await artwork.webp({ quality }).toBuffer();
      }
    } catch {
      throw new HttpsError("invalid-argument", "UNREADABLE_IMAGE");
    }
    if (data.length >= budget) throw new HttpsError("invalid-argument", "IMAGE_TOO_DETAILED");
    outputs.push({ suffix, data, width: size, height });
  }
  return outputs;
}

export function mountPowerPackUploads(app: Express) {
  app.post("/admin/power-pack-art", express.raw({ type: () => true, limit: MAX_BYTES }), async (req, res) => {
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

      const outputs = await renderPowerPackArt(body, pack.portrait);
      const v = createHash("sha1").update(body).update(pack.portrait ? "portrait" : "square").digest("hex").slice(0, 10);
      const folder = join(uploadDir(), "power-packs", packId);
      await mkdir(folder, { recursive: true });
      const base = `${publicBase(req)}/uploads/power-packs/${packId}/${card}-${v}`;
      for (const output of outputs) await writeFile(join(folder, `${card}-${v}${output.suffix}.webp`), output.data);
      const art: ImportedPowerArt = { url: `${base}.webp`, thumb: `${base}-256.webp`, small: `${base}-128.webp`, v, updatedAt: Date.now() };
      const updated = await recordPowerPackArt(uid, packId, card, art);
      res.status(200).json({ card, art, pack: updated });
    } catch (error) {
      sendError(res, error);
    }
  });

  /* Fichier > 3 Mo : refusé par express.raw avant le handler. */
  app.use("/admin/power-pack-art", ((error, _req, res, next) => {
    if ((error as { type?: string })?.type === "entity.too.large") {
      res.status(413).json({ code: "invalid-argument", message: "FILE_TOO_LARGE" });
      return;
    }
    next(error);
  }) as express.ErrorRequestHandler);
}
