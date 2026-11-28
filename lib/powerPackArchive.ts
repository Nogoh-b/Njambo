import { BUILTIN_POWER_ART_IDS, IMPORTED_POWER_PACK_LIMITS } from "../domain/assetPacks";
import { createZip, readZip } from "./audio/audioZip";

export const POWER_PACK_IMAGE_BUDGET = 115_000;
export const POWER_PACK_UPLOAD_LIMIT = 3 * 1024 * 1024;
export const POWER_PACK_ARCHIVE_LIMIT = 96 * 1024 * 1024;
const FORMAT = "njambo-power-pack";
const MANIFEST = "manifest.json";
const CARD_IDS: readonly string[] = BUILTIN_POWER_ART_IDS;

export interface PowerPackArchiveDetails {
  name: string;
  description: string;
  portrait: boolean;
}

export interface PowerPackImage {
  card: string;
  data: Uint8Array;
}

/** « Vent-Nord.PNG » → « vent_nord ». */
export function cardIdFromFileName(fileName: string): string | null {
  if (!/\.(png|jpe?g|webp)$/i.test(fileName)) return null;
  const base = fileName.replace(/\.[a-z0-9]+$/i, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return CARD_IDS.includes(base) ? base : null;
}

export function createPowerPackArchive(details: PowerPackArchiveDetails, images: readonly PowerPackImage[]): Uint8Array {
  const manifest = new TextEncoder().encode(JSON.stringify({ format: FORMAT, version: 1, name: details.name, description: details.description, portrait: details.portrait }));
  return createZip([{ name: MANIFEST, data: manifest }, ...images.map(({ card, data }) => ({ name: `cards/${card}.webp`, data }))]);
}

export async function readPowerPackArchive(bytes: Uint8Array, upload = false): Promise<{ details: PowerPackArchiveDetails | null; images: PowerPackImage[] }> {
  const limit = upload ? POWER_PACK_UPLOAD_LIMIT : POWER_PACK_ARCHIVE_LIMIT;
  if (bytes.length > limit) throw new Error("Ce fichier ZIP dépasse la taille maximale autorisée.");
  const files = await readZip(bytes, { entries: 160, entryBytes: upload ? POWER_PACK_IMAGE_BUDGET : 12 * 1024 * 1024, totalBytes: limit });
  let details: PowerPackArchiveDetails | null = null;
  const manifest = files.get(MANIFEST);
  if (manifest) {
    try {
      if (manifest.length > 4096) throw new Error();
      const input = JSON.parse(new TextDecoder().decode(manifest));
      if (!input || input.format !== FORMAT || input.version !== 1 || typeof input.name !== "string"
        || input.name.trim().length < 2 || input.name.trim().length > IMPORTED_POWER_PACK_LIMITS.name
        || typeof input.description !== "string" || input.description.trim().length > IMPORTED_POWER_PACK_LIMITS.description
        || typeof input.portrait !== "boolean") throw new Error();
      details = { name: input.name.trim(), description: input.description.trim(), portrait: input.portrait };
    } catch {
      throw new Error("Le manifeste du pack est invalide ou utilise une version inconnue.");
    }
  }
  const images = new Map<string, PowerPackImage>();
  for (const [path, data] of files) {
    const card = cardIdFromFileName(path.split("/").at(-1) ?? "");
    if (!card) continue;
    if (upload && (path !== `cards/${card}.webp` || data.length === 0)) throw new Error(`Illustration invalide pour ${card}.`);
    if (images.has(card)) throw new Error(`Plusieurs illustrations pour ${card.replaceAll("_", " ")}.`);
    images.set(card, { card, data });
  }
  if (details) return { details, images: [...images.values()] };
  if (upload || !images.size) throw new Error("Le ZIP doit contenir un pack Njambo ou des images nommées comme les cartes (ex. vent_nord.webp).");
  return { details: null, images: [...images.values()] };
}
