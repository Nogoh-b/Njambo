import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ICON_NAMES } from "./lib/ui-glyphs.mjs";

const root = process.cwd();
const sources = path.join(root, "output/imagegen/salon-royal-assets");
const manifest = JSON.parse(await fs.readFile(path.join(sources, "manifest.json"), "utf8"));
const output = path.join(sources, "validation");
await fs.mkdir(output, { recursive: true });
const system = [
  "economy/nkap", "economy/nkap-stack", "economy/cauri", "economy/cauris-pouch", "economy/energy-flask", "economy/loyalty-wheel",
  "economy/pack-quartier", "economy/pack-mboa", "economy/pack-chefferie", "books/card-back",
  "tickets/ticket-bronze", "tickets/ticket-argent", "tickets/ticket-or", "books/book-normal", "books/book-rare", "books/book-exceptionnel",
  "ranks/rank-braise", "ranks/rank-mboa", "ranks/rank-tambour", "ranks/rank-notable", "ranks/rank-chef-table", "ranks/rank-legende-237", "ranks/rank-ancetre",
];
const overview = [];
for (const [index, pack] of manifest.packs.entries()) {
  const packRoot = path.join(root, "public/assets/njambo/packs", pack.id);
  const layers = [];
  const label = (text, x, y, size = 13) => layers.push({
    input: Buffer.from('<svg width="1200" height="40"><text x="' + x + '" y="' + y + '" fill="#fff8ea" font-family="Arial" font-size="' + size + '">' + text + "</text></svg>"),
    left: 0, top: 0,
  });
  label(pack.name, 30, 35, 26);
  for (const [i, asset] of system.entries()) {
    const left = 28 + i % 12 * 96;
    const top = 60 + Math.floor(i / 12) * 122;
    layers.push({ input: await sharp(path.join(packRoot, asset + "-128.webp")).resize(90, 90).toBuffer(), left, top });
    layers.push({ input: Buffer.from('<svg width="96" height="24"><text x="48" y="15" text-anchor="middle" fill="#b0cdc2" font-family="Arial" font-size="9">' + asset.split("/").at(-1).replace("rank-", "") + "</text></svg>"), left, top: top + 94 });
  }
  for (const [i, name] of ICON_NAMES.entries()) layers.push({
    input: path.join(packRoot, "ui/icons", name + "-64.webp"),
    left: 28 + i % 16 * 72, top: 325 + Math.floor(i / 16) * 74,
  });
  for (const [i, tone] of ["dark", "gold", "teal", "pink", "ghost"].entries()) layers.push({
    input: await sharp(path.join(packRoot, "ui/buttons", tone + "-frame.webp")).resize(210, 84).toBuffer(),
    left: 28 + i * 230, top: 490,
  });
  for (const [i, mode] of ["online", "ai", "friends"].entries()) layers.push({
    input: await sharp(path.join(packRoot, "menu/mode-" + mode + "-480.webp")).resize(240, 150).toBuffer(),
    left: 120 + i * 360, top: 610,
  });
  const board = await sharp({ create: { width: 1200, height: 790, channels: 4, background: "#072c22" } }).composite(layers).png().toBuffer();
  await fs.writeFile(path.join(output, pack.id + ".png"), board);
  overview.push({ input: await sharp(board).resize(600, 395).toBuffer(), left: index % 2 * 600, top: Math.floor(index / 2) * 395 });
}
await sharp({ create: { width: 1200, height: Math.ceil(manifest.packs.length / 2) * 395, channels: 4, background: "#041712" } }).composite(overview).png().toFile(path.join(output, "overview.png"));
console.log(path.join(output, "overview.png"));
