import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ASSET_PACKS, DEFAULT_ASSET_PACK, assetPackUrl, readAssetPack } from "@/domain/assetPacks";

const SYSTEM_ASSETS = [
  "economy/nkap", "economy/nkap-stack", "economy/cauri", "economy/cauris-pouch", "economy/energy-flask", "economy/loyalty-wheel",
  "economy/pack-quartier", "economy/pack-mboa", "economy/pack-chefferie",
  "tickets/ticket-bronze", "tickets/ticket-argent", "tickets/ticket-or",
  "books/book-normal", "books/book-rare", "books/book-exceptionnel", "books/card-back",
  "ranks/rank-braise", "ranks/rank-tambour", "ranks/rank-mboa", "ranks/rank-notable", "ranks/rank-chef-table", "ranks/rank-ancetre", "ranks/rank-legende-237",
];

describe("packs d'assets système", () => {
  it("laisse le pack classique et les chemins hors système inchangés", () => {
    expect(assetPackUrl("/assets/njambo/economy/nkap-64.webp", "classique")).toBe("/assets/njambo/economy/nkap-64.webp");
    expect(assetPackUrl("/assets/power-cards/v2/oeil_sorcier.webp", "wax")).toBe("/assets/power-cards/v2/oeil_sorcier.webp");
  });

  it("redirige les assets système vers le dossier du pack", () => {
    expect(assetPackUrl("/assets/njambo/ranks/rank-mboa-128.webp", "cristal")).toBe("/assets/njambo/packs/cristal/ranks/rank-mboa-128.webp");
  });

  it("retombe sur le pack classique pour une valeur inconnue", () => {
    expect(readAssetPack({ pack: "inconnu" })).toBe(DEFAULT_ASSET_PACK);
    expect(readAssetPack(undefined)).toBe(DEFAULT_ASSET_PACK);
    expect(readAssetPack({ pack: "wax" })).toBe("wax");
  });

  it("fournit chaque asset système dans toutes les tailles pour chaque pack", () => {
    const missing: string[] = [];
    for (const pack of ASSET_PACKS) {
      for (const asset of SYSTEM_ASSETS) {
        for (const suffix of ["", "-64", "-128", "-256"]) {
          const url = assetPackUrl(`/assets/njambo/${asset}${suffix}.webp`, pack.id);
          if (!existsSync(join(process.cwd(), "public", url))) missing.push(url);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
