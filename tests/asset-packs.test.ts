import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ASSET_PACKS, DEFAULT_ASSET_PACK, assetPackUrl, readAssetPack, readAssetPacks, resolveAssetUrl } from "@/domain/assetPacks";

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

  it("résout séparément les assets système et l'interface", () => {
    const selection = { system: "wax" as const, interface: "cristal" as const };
    expect(resolveAssetUrl("/assets/njambo/economy/nkap-64.webp", selection)).toBe("/assets/njambo/packs/wax/economy/nkap-64.webp");
    expect(resolveAssetUrl("/assets/njambo/ui/icons/home-64.webp", selection)).toBe("/assets/njambo/packs/cristal/ui/icons/home-64.webp");
    expect(resolveAssetUrl("/assets/njambo/ui/brand/njambo-mark-128.webp", selection)).toBe("/assets/njambo/ui/brand/njambo-mark-128.webp");
    expect(readAssetPacks({ pack: "wax", uiPack: "soleil" })).toEqual({ system: "wax", interface: "soleil" });
  });

  it("fournit chaque asset d'interface pour chaque pack", () => {
    const icons = ["bot", "cards", "check", "code", "coin", "copy", "crown", "cut", "empty", "eye", "friends", "globe", "history", "home", "hourglass", "language",
      "message", "music", "notification", "online", "play", "plus", "profile", "search", "settings", "sound", "spark", "sparkle", "star", "trophy", "users", "wind"];
    const paths = [
      ...icons.flatMap((name) => [`ui/icons/${name}-64.webp`, `ui/icons/${name}-128.webp`]),
      ...["dark", "gold", "teal", "pink", "ghost"].map((tone) => `ui/buttons/${tone}-frame.webp`),
      "ui/buttons/icon-plate-64.webp", "ui/buttons/icon-plate-128.webp",
      ...["home", "play", "events", "shop", "social", "notification", "settings"].map((name) => `friendly/icons/${name}.svg`),
      ...["mode-online", "mode-ai", "mode-friends"].flatMap((mode) => [`menu/${mode}.webp`, `menu/${mode}-480.webp`]),
    ];
    const missing: string[] = [];
    for (const pack of ASSET_PACKS) {
      for (const path of paths) {
        const url = assetPackUrl(`/assets/njambo/${path}`, pack.id, "interface");
        if (!existsSync(join(process.cwd(), "public", url))) missing.push(url);
      }
    }
    expect(missing).toEqual([]);
  });
});
