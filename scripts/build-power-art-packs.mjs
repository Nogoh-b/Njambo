/* Build optimized card illustrations from ImageGen masters and render QA boards. */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sources = path.join(root, "output/imagegen/power-art-packs");
const manifest = JSON.parse(await fs.readFile(path.join(sources, "manifest.json"), "utf8"));
const results = JSON.parse(await fs.readFile(path.join(sources, "results.json"), "utf8"));
const partial = process.argv.includes("--partial");
const originals = new Map(results.filter((result) => result.status === "fulfilled").map((result) => [result.id, result.source]));
const portraitPacks = new Set(manifest.packs.filter((pack) => pack.format === "portrait").map((pack) => pack.id));
let built = 0;

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

for (const job of manifest.jobs) {
  const master = path.join(sources, job.pack, job.card + ".png");
  const target = path.join(root, "public/assets/power-cards/packs", job.pack);
  await fs.mkdir(path.dirname(master), { recursive: true });
  await fs.mkdir(target, { recursive: true });
  if (!await exists(master)) {
    const source = originals.get(job.id);
    if (source && await exists(source)) await fs.copyFile(source, master);
    else if (partial) continue;
    else throw new Error("Missing artwork: " + job.id);
  }
  const masterTime = (await fs.stat(master)).mtimeMs;
  for (const size of [720, 256, 128]) {
    const file = path.join(target, job.card + (size === 720 ? "" : "-" + size) + ".webp");
    const budget = size === 720 ? 400_000 : 80_000;
    const previous = await fs.stat(file).catch(() => null);
    if (previous && previous.mtimeMs >= masterTime && previous.size < budget) continue;
    const height = portraitPacks.has(job.pack) ? size * 1.5 : size;
    const artwork = sharp(master).resize(size, height, { fit: "cover" }).flatten({ background: "#072c22" });
    let quality = size === 720 ? 88 : 84;
    let encoded = await artwork.webp({ quality }).toBuffer();
    while (encoded.length >= budget && quality > 50) {
      quality -= 5;
      encoded = await artwork.webp({ quality }).toBuffer();
    }
    if (encoded.length >= budget) throw new Error("WebP exceeds size budget: " + file);
    await fs.writeFile(file, encoded);
  }
  built++;
}

const output = path.join(sources, "validation");
await fs.mkdir(output, { recursive: true });
const overview = [];
const text = (label, width, height, size = 14) => Buffer.from(
  '<svg width="' + width + '" height="' + height + '"><text x="12" y="' + (size + 7) +
  '" fill="#fff8ea" font-family="Arial" font-size="' + size + '">' + label.replaceAll("&", "&amp;") + "</text></svg>"
);
for (const [packIndex, pack] of manifest.packs.entries()) {
  const layers = [{ input: text(pack.name, 1260, 44, 26), left: 0, top: 0 }];
  for (const [i, subject] of manifest.subjects.entries()) {
    const file = path.join(root, "public/assets/power-cards/packs", pack.id, subject.id + ".webp");
    if (!await exists(file)) continue;
    const left = i % 7 * 180;
    const top = 46 + Math.floor(i / 7) * 210;
    layers.push({ input: await sharp(file).resize(176, 176, { fit: "contain", background: "#072c22" }).toBuffer(), left, top });
    layers.push({ input: text(subject.name, 180, 28, 12), left, top: top + 177 });
  }
  await sharp({ create: { width: 1260, height: 680, channels: 4, background: "#072c22" } })
    .composite(layers).png().toFile(path.join(output, pack.id + ".png"));
  overview.push({ input: text(pack.name, 240, 40, 20), left: 4, top: packIndex * 180 + 58 });
  for (const [i, card] of ["oeil_sorcier", "tambour_appel", "bouclier_village", "masque_bluffeur", "cauris_chanceux", "totem_ancetres"].entries()) {
    const file = path.join(root, "public/assets/power-cards/packs", pack.id, card + ".webp");
    if (!await exists(file)) continue;
    overview.push({ input: await sharp(file).resize(152, 152, { fit: "contain", background: "#041712" }).toBuffer(), left: 236 + i * 160, top: packIndex * 180 + 14 });
  }
}
await sharp({ create: { width: 1200, height: manifest.packs.length * 180, channels: 4, background: "#041712" } })
  .composite(overview).png().toFile(path.join(output, "overview.png"));
console.log(built + "/" + manifest.jobs.length + " illustrations built, three WebP sizes each.");
