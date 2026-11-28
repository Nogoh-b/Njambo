/* ═══════════════ Codec ZIP minimaliste (100 % TypeScript, navigateur + Node) ═══════════════
   Permet de partager les packs d'assets sans dépendance externe.
   - Écriture : format PKZIP standard (méthode STORE, UTF-8, CRC-32 IEEE) —
     parfait pour les MP3/M4A/OGG déjà compressés et quasi instantané.
   - Lecture : supporte STORE (0) ET DEFLATE (8, via DecompressionStream) afin
     d'accepter aussi les archives re-zippées depuis l'Explorateur Windows / macOS. */

export interface ZipEntryInput {
  name: string;
  data: Uint8Array;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time: dosTime, date: dosDate };
}

/** Crée une archive ZIP standard (méthode STORE) à partir d'une liste d'entrées. */
export function createZip(entries: readonly ZipEntryInput[]): Uint8Array {
  const { time, date } = dosDateTime();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const cleanName = entry.name.replace(/^\/+/, "").replace(/\\/g, "/");
    const nameBytes = textEncoder.encode(cleanName);
    const data = entry.data;
    const crc = crc32(data);

    // Local File Header (30 octets + nom + données)
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed 2.0
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // method 0 = STORE
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    localParts.push(local, data);

    // Central Directory Header (46 octets + nom)
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true); // UTF-8
    cv.setUint16(10, 0, true); // STORE
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + data.length;
  }

  const centralSize = centralParts.reduce((acc, part) => acc + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralSize + eocd.length;
  const out = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of localParts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  out.set(eocd, cursor);
  return out;
}

async function inflateRaw(compressed: Uint8Array, limit: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Décompression DEFLATE indisponible dans cet environnement.");
  }
  const reader = new Blob([Uint8Array.from(compressed)]).stream()
    .pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error("Une entrée du ZIP dépasse sa taille annoncée.");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    merged.set(chunk, pos);
    pos += chunk.length;
  }
  return merged;
}

/** Lit une archive ZIP standard (STORE ou DEFLATE) et retourne une map `chemin → octets`. */
export async function readZip(bytes: Uint8Array, limits: { entries?: number; entryBytes?: number; totalBytes?: number } = {}): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Cherche la signature EOCD (0x06054b50) depuis la fin
  const minPos = Math.max(0, bytes.length - 65557);
  let eocdPos = -1;
  for (let i = bytes.length - 22; i >= minPos; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) throw new Error("Fichier ZIP invalide ou corrompu (signature introuvable).");

  const entryCount = view.getUint16(eocdPos + 10, true);
  const centralOffset = view.getUint32(eocdPos + 16, true);
  const centralEnd = centralOffset + view.getUint32(eocdPos + 12, true);
  if (entryCount > (limits.entries ?? Infinity) || centralEnd > eocdPos) throw new Error("Répertoire central ZIP invalide.");
  const result = new Map<string, Uint8Array>();
  let totalBytes = 0;

  let ptr = centralOffset;
  for (let idx = 0; idx < entryCount; idx += 1) {
    if (ptr + 46 > centralEnd || view.getUint32(ptr, true) !== 0x02014b50) {
      throw new Error("Répertoire central ZIP corrompu.");
    }
    const method = view.getUint16(ptr + 10, true);
    const expectedCrc = view.getUint32(ptr + 16, true);
    const compSize = view.getUint32(ptr + 20, true);
    const size = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const rawName = textDecoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen)).replace(/\\/g, "/");
    ptr += 46 + nameLen + extraLen + commentLen;
    if (ptr > centralEnd) throw new Error("Répertoire central ZIP corrompu.");

    // Ignore dossiers vides et métadonnées macOS
    if (!rawName || rawName.endsWith("/") || rawName.startsWith("__MACOSX/") || rawName.includes("..")) continue;

    totalBytes += size;
    if (size > (limits.entryBytes ?? Infinity) || totalBytes > (limits.totalBytes ?? Infinity)) throw new Error("Le contenu du ZIP est trop volumineux.");
    if (result.has(rawName)) throw new Error(`Entrée ZIP en double : ${rawName}`);

    if (localHeaderOffset + 30 > bytes.length || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error(`Entrée ZIP corrompue : ${rawName}`);
    }
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compSize > centralOffset || (method === 0 && compSize !== size)) throw new Error(`Taille ZIP invalide : ${rawName}`);
    const rawSlice = bytes.subarray(dataStart, dataStart + compSize);

    let data: Uint8Array;
    if (method === 0) {
      data = new Uint8Array(rawSlice);
    } else if (method === 8) {
      data = await inflateRaw(rawSlice, size);
    } else {
      throw new Error(`Méthode de compression ZIP non supportée (${method}) pour ${rawName}.`);
    }

    if (data.length !== size || crc32(data) !== expectedCrc) {
      throw new Error(`Somme de contrôle CRC invalide pour ${rawName}.`);
    }
    result.set(rawName, data);
  }

  return result;
}
