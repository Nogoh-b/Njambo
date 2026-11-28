import { assetPackUrl, BUILTIN_POWER_ART_IDS, type AssetPackDefinition, type AssetPackId, type ImportedPowerPack } from "@/domain/assetPacks";
import { createPowerPackArchive, POWER_PACK_IMAGE_BUDGET, type PowerPackArchiveDetails, type PowerPackImage } from "@/lib/powerPackArchive";

export function powerPackOriginal(card: string): string {
  return `/assets/power-cards/v2/${card}.webp`;
}

export async function optimizePowerPackImage(file: Blob, portrait: boolean): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("Image illisible."); });
  try {
    const ratio = portrait ? 1.5 : 1;
    if (file.type === "image/webp" && file.size <= POWER_PACK_IMAGE_BUDGET && bitmap.width === 720 && bitmap.height === 720 * ratio) return file;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Le navigateur ne peut pas convertir l’image.");
    const cropWidth = Math.min(bitmap.width, bitmap.height / ratio);
    const cropHeight = cropWidth * ratio;
    for (const width of [720, 576, 480]) {
      canvas.width = width;
      canvas.height = width * ratio;
      ctx.fillStyle = "#072c22";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, (bitmap.width - cropWidth) / 2, (bitmap.height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.74, 0.62, 0.5, 0.36]) {
        const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
        if (webp?.type !== "image/webp") throw new Error("Le navigateur ne peut pas produire une image WebP.");
        if (webp.size <= POWER_PACK_IMAGE_BUDGET) return webp;
      }
    }
    throw new Error("L’image est trop détaillée pour le budget du pack.");
  } finally {
    bitmap.close();
  }
}

export function powerPackZip(details: PowerPackArchiveDetails, images: readonly PowerPackImage[]): Blob {
  return new Blob([Uint8Array.from(createPowerPackArchive(details, images))], { type: "application/zip" });
}

/** Une image pleine taille par carte. Les trois tailles sont régénérées à l’import. */
export async function exportPowerPack(pack: AssetPackDefinition & { id: AssetPackId }, imported?: ImportedPowerPack, name = pack.name): Promise<Blob> {
  const portrait = pack.portrait === true;
  const images: PowerPackImage[] = [];
  for (const card of BUILTIN_POWER_ART_IDS) {
    const url = imported ? imported.art[card]?.url : assetPackUrl(powerPackOriginal(card), pack.id, "powers");
    if (!url) continue;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await optimizePowerPackImage(await response.blob(), portrait);
      images.push({ card, data: new Uint8Array(await blob.arrayBuffer()) });
    } catch (error) {
      throw new Error(`${card.replaceAll("_", " ")} – ${error instanceof Error ? error.message : "Image indisponible"}`);
    }
  }
  return powerPackZip({ name, description: pack.description, portrait }, images);
}
