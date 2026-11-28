import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";
import {
  BUILTIN_POWER_ART_IDS, DEFAULT_ASSET_PACKS, assetPackUrl, assetPacksForScope,
  isAssetPackForScope, isPortraitPowerPack, readAssetPacks, resolveAssetUrl,
} from "@/domain/assetPacks";
import { currentAssetPacks, setAssetPacks, sysAsset } from "@/lib/assetPack";
import { CODE_POWER_MODULES } from "@/config/powers";
import { powerCardAssets, sceneManifest } from "@/lib/assets/manifests";

afterEach(() => setAssetPacks(DEFAULT_ASSET_PACKS));

describe("packs des cartes Pouvoir", () => {
  it("préserve la configuration historique et refuse les packs du mauvais réglage", () => {
    expect(readAssetPacks({ pack: "wax", uiPack: "cristal" })).toEqual({
      system: "wax", interface: "cristal", powers: "classique",
    });
    expect(readAssetPacks({ pack: "ndop-mystique", uiPack: "email-arcane", powerPack: "wax" })).toEqual(DEFAULT_ASSET_PACKS);
    expect(isAssetPackForScope("jade-astral", "powers")).toBe(true);
    expect(isAssetPackForScope("jade-astral", "system")).toBe(false);
    expect(isAssetPackForScope("email-royal", "powers")).toBe(false);
    expect(assetPacksForScope("powers").map((pack) => pack.id)).toEqual([
      "classique", "ndop-mystique", "bronze-ancestral", "email-arcane", "ivoire-grave", "jade-astral",
      "classique-joaillier", "derniere-manche", "fenetre-sur-le-wouri", "double-vue",
    ]);
  });

  it("décline les 21 illustrations intégrées et laisse les images personnalisées prioritaires", () => {
    expect([...BUILTIN_POWER_ART_IDS].sort()).toEqual(Object.keys(CODE_POWER_MODULES).sort());
    const expected = "/assets/power-cards/packs/ndop-mystique/oeil_sorcier.webp";
    expect(assetPackUrl("/assets/power-cards/v2/oeil_sorcier.webp", "ndop-mystique", "powers")).toBe(expected);
    expect(assetPackUrl("/assets/power-cards/oeil_sorcier.webp", "ndop-mystique", "powers")).toBe(expected);
    for (const url of [
      "/uploads/powers/oeil_sorcier.webp", "https://example.com/oeil_sorcier.webp",
      "/assets/power-cards/v2/ma_carte_custom.webp", "/assets/power-cards/kmer-power-sheet.webp",
    ]) {
      expect(assetPackUrl(url, "ndop-mystique", "powers")).toBe(url);
    }
    expect(assetPackUrl("/assets/power-cards/v2/oeil_sorcier.webp", "wax", "powers")).toBe("/assets/power-cards/v2/oeil_sorcier.webp");
  });

  it("applique un changement de pack aux images et au préchargement sans changer les autres réglages", () => {
    setAssetPacks({ system: "raphia-prestige", interface: "porcelaine-mboa" });
    setAssetPacks({ powers: "jade-astral" });
    const expected = "/assets/power-cards/packs/jade-astral/oeil_sorcier.webp";
    expect(currentAssetPacks()).toEqual({ system: "raphia-prestige", interface: "porcelaine-mboa", powers: "jade-astral" });
    expect(sysAsset(CODE_POWER_MODULES.oeil_sorcier.def.art)).toBe(expected);
    expect(powerCardAssets("oeil_sorcier").images.some((asset) => asset.url === expected)).toBe(true);
    expect(powerCardAssets("oeil_sorcier", "small").images[0]?.url).toBe(expected.replace(".webp", "-128.webp"));
    expect(sceneManifest("power_collection").critical.map((asset) => asset.url)).toContain(expected.replace(".webp", "-256.webp"));
    expect(resolveAssetUrl("/assets/njambo/economy/nkap-256.webp", currentAssetPacks())).toContain("/packs/raphia-prestige/");
    setAssetPacks({ powers: "classique" });
    expect(sysAsset(CODE_POWER_MODULES.oeil_sorcier.def.art)).toBe("/assets/power-cards/v2/oeil_sorcier.webp");
  });

  it("livre chaque carte dans chaque nouveau pack et dans les trois tailles", async () => {
    const missing: string[] = [];
    for (const pack of assetPacksForScope("powers").filter((pack) => pack.id !== "classique")) {
      for (const card of BUILTIN_POWER_ART_IDS) {
        for (const [suffix, size] of [["", 720], ["-256", 256], ["-128", 128]] as const) {
          const file = join(process.cwd(), "public/assets/power-cards/packs", pack.id, card + suffix + ".webp");
          if (!existsSync(file)) { missing.push(file); continue; }
          const metadata = await sharp(file).metadata();
          expect([metadata.width, metadata.height], file).toEqual([size, isPortraitPowerPack(pack.id) ? size * 1.5 : size]);
          expect(readFileSync(file).byteLength, file).toBeLessThanOrEqual(size === 720 ? 115_000 : size === 256 ? 28_000 : 12_000);
        }
      }
    }
    expect(missing).toEqual([]);
  }, 30_000);

  it("livre les deux tailles de vignettes du pack classique", async () => {
    for (const card of BUILTIN_POWER_ART_IDS) {
      for (const width of [128, 256]) {
        const file = join(process.cwd(), "public/assets/power-cards/v2", `${card}-${width}.webp`);
        expect((await sharp(file).metadata()).width, file).toBe(width);
      }
    }
  });

  it("fournit une illustration distincte par pack pour chaque pouvoir", () => {
    const packs = assetPacksForScope("powers").filter((pack) => pack.id !== "classique");
    for (const card of BUILTIN_POWER_ART_IDS) {
      const hashes = packs.map((pack) => createHash("sha256").update(
        readFileSync(join(process.cwd(), "public/assets/power-cards/packs", pack.id, card + ".webp")),
      ).digest("hex"));
      expect(new Set(hashes).size, card).toBe(packs.length);
    }
  });
});
