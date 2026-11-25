import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";
import { assetPacksForScope, DEFAULT_ASSET_PACK, assetPackUrl, readAssetPack, readAssetPacks, resolveAssetUrl, crispAssetUrl } from "@/domain/assetPacks";

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
    for (const pack of assetPacksForScope("system")) {
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
    expect(readAssetPacks({ pack: "wax", uiPack: "soleil" })).toEqual({ system: "wax", interface: "soleil", powers: "classique" });
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
    for (const pack of assetPacksForScope("system")) {
      for (const path of paths) {
        const url = assetPackUrl(`/assets/njambo/${path}`, pack.id, "interface");
        if (!existsSync(join(process.cwd(), "public", url))) missing.push(url);
      }
    }
    expect(missing).toEqual([]);
  });

  it("sert une déclinaison plus nette pour les petites vignettes", () => {
    expect(crispAssetUrl("/assets/njambo/economy/nkap-stack-64.webp")).toBe("/assets/njambo/economy/nkap-stack-256.webp");
    expect(crispAssetUrl("/assets/njambo/packs/wax/ranks/rank-mboa-128.webp")).toBe("/assets/njambo/packs/wax/ranks/rank-mboa-256.webp");
    expect(crispAssetUrl("/assets/njambo/ui/icons/coin-64.webp")).toBe("/assets/njambo/ui/icons/coin-128.webp");
    expect(crispAssetUrl("/assets/njambo/economy/loyalty-wheel.webp")).toBe("/assets/njambo/economy/loyalty-wheel.webp");
  });

  it("livre les nouveaux packs avec des images nettes et un vrai fond transparent", async () => {
    const packs = assetPacksForScope("system").filter((pack) => !["classique", "soleil", "wax", "cristal"].includes(pack.id));
    for (const pack of packs) {
      for (const asset of SYSTEM_ASSETS) {
        const file = join(process.cwd(), "public", assetPackUrl("/assets/njambo/" + asset + "-256.webp", pack.id));
        const metadata = await sharp(file).metadata();
        expect([metadata.width, metadata.height, metadata.hasAlpha], file).toEqual([256, 256, true]);
        const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        // Opaque presentation-board backgrounds must never become item sprites.
        const corners = [0, info.width - 1, (info.height - 1) * info.width, info.width * info.height - 1];
        expect(corners.every((pixel) => data[pixel * 4 + 3] === 0), file).toBe(true);
        expect(data.some((value, index) => index % 4 === 3 && value > 200), file).toBe(true);
      }
      for (const name of ["home", "trophy", "settings", "friends", "star"]) {
        const file = join(process.cwd(), "public/assets/njambo/packs", pack.id, "ui/icons", name + "-128.webp");
        const metadata = await sharp(file).metadata();
        expect([metadata.width, metadata.height, metadata.hasAlpha], file).toEqual([128, 128, true]);
      }
    }
  }, 30_000);

  it("distingue visuellement les paliers de tickets, de livres et de rangs", () => {
    const groups = [
      ["tickets/ticket-bronze", "tickets/ticket-argent", "tickets/ticket-or"],
      ["books/book-normal", "books/book-rare", "books/book-exceptionnel"],
      SYSTEM_ASSETS.filter((asset) => asset.startsWith("ranks/")),
    ];
    for (const pack of assetPacksForScope("system")) {
      for (const assets of groups) {
        const hashes = assets.map((asset) => {
          const file = join(process.cwd(), "public", assetPackUrl("/assets/njambo/" + asset + "-128.webp", pack.id));
          return createHash("sha256").update(readFileSync(file)).digest("hex");
        });
        expect(new Set(hashes).size, pack.id + ": " + assets.join(", ")).toBe(assets.length);
      }
    }
  });
});
