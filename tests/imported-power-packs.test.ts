import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  assetPackUrl,
  assetPacksForScope,
  importedPowerPackIdFor,
  isAssetPackForScope,
  isPackedPowerArt,
  isPortraitPowerPack,
  powerPackThumbUrl,
  readAssetPacks,
  readImportedPowerPacks,
  setImportedPowerPacks,
} from "../domain/assetPacks";
import { cardIdFromFileName } from "../components/admin/PowerPackImporter";
import { renderPowerPackArt } from "../server/src/powerPackUploads";

const base = "https://back.example/uploads/power-packs/import-masques/vent_nord-abc123";
const art = { url: `${base}.webp`, thumb: `${base}-256.webp`, small: `${base}-128.webp`, v: "abc123", updatedAt: 1 };
const doc = {
  packs: [
    { id: "import-masques", name: "Masques", description: "Bois sculpté", portrait: true, art: { vent_nord: art, carte_inconnue: art, oeil_sorcier: { url: "javascript:alert(1)" } }, createdAt: 1, updatedAt: 2 },
    { id: "classique", name: "Usurpation" },
    { id: "import-vide", name: " " },
  ],
};

afterEach(() => setImportedPowerPacks([]));

describe("packs de cartes Pouvoir importés depuis l'admin", () => {
  it("lit le document en ignorant les entrées invalides", () => {
    const packs = readImportedPowerPacks(doc);
    expect(packs.map((pack) => pack.id)).toEqual(["import-masques"]);
    expect(Object.keys(packs[0].art)).toEqual(["vent_nord"]);
    expect(packs[0]).toMatchObject({ name: "Masques", portrait: true, scopes: ["powers"] });
  });

  it("donne un identifiant unique, sans accents, à un nouveau pack", () => {
    expect(importedPowerPackIdFor("Masques du Ndé !", [])).toBe("import-masques-du-nde");
    expect(importedPowerPackIdFor("Masques", ["import-masques"])).toBe("import-masques-2");
    expect(importedPowerPackIdFor("✦", [])).toBe("import-pack");
  });

  it("n'est reconnu qu'une fois sa définition connue, pour les cartes Pouvoir seulement", () => {
    expect(isAssetPackForScope("import-masques", "powers")).toBe(false);
    expect(readAssetPacks({ powerPack: "import-masques" }).powers).toBe("classique");
    setImportedPowerPacks(readImportedPowerPacks(doc));
    expect(isAssetPackForScope("import-masques", "powers")).toBe(true);
    expect(isAssetPackForScope("import-masques", "system")).toBe(false);
    expect(readAssetPacks({ powerPack: "import-masques" }).powers).toBe("import-masques");
    expect(assetPacksForScope("powers").at(-1)?.id).toBe("import-masques");
    expect(isPortraitPowerPack("import-masques")).toBe(true);
  });

  it("sert l'image importée, et l'illustration d'origine pour une carte sans image", () => {
    setImportedPowerPacks(readImportedPowerPacks(doc));
    expect(assetPackUrl("/assets/power-cards/v2/vent_nord.webp", "import-masques", "powers")).toBe(art.url);
    expect(assetPackUrl("/assets/power-cards/v2/feu_camp.webp", "import-masques", "powers")).toBe("/assets/power-cards/v2/feu_camp.webp");
    expect(powerPackThumbUrl("/assets/power-cards/v2/vent_nord.webp", "import-masques")).toBe(art.thumb);
    expect(powerPackThumbUrl("/assets/power-cards/v2/vent_nord.webp", "ndop-mystique")).toBe("/assets/power-cards/packs/ndop-mystique/vent_nord-256.webp");
    expect(isPackedPowerArt(art.url)).toBe(true);
    expect(isPackedPowerArt("/assets/power-cards/v2/feu_camp.webp")).toBe(false);
  });

  it("reconnaît la carte d'après le nom du fichier", () => {
    expect(cardIdFromFileName("vent_nord.png")).toBe("vent_nord");
    expect(cardIdFromFileName("Vent-Nord.PNG")).toBe("vent_nord");
    expect(cardIdFromFileName("oeil sorcier.webp")).toBe("oeil_sorcier");
    expect(cardIdFromFileName("apercu.png")).toBeNull();
  });

  it("décline l'image en 720 / 256 / 128 px, au format du pack et sous les budgets", async () => {
    const source = await sharp({ create: { width: 1080, height: 1080, channels: 4, background: { r: 30, g: 120, b: 90, alpha: 1 } } }).png().toBuffer();
    const square = await renderPowerPackArt(source, false);
    expect(square.map((out) => [out.suffix, out.width, out.height])).toEqual([["", 720, 720], ["-256", 256, 256], ["-128", 128, 128]]);
    const portrait = await renderPowerPackArt(source, true);
    const meta = await sharp(portrait[0].data).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 720, 1080]);
    expect(portrait[0].data.length).toBeLessThan(400_000);
    expect(portrait[1].data.length).toBeLessThan(80_000);
  });
});
