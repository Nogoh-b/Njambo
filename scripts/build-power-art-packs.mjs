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
const variants = [
  { width: 720, suffix: "", budget: 115_000, quality: 86 },
  { width: 256, suffix: "-256", budget: 28_000, quality: 82 },
  { width: 128, suffix: "-128", budget: 12_000, quality: 80 },
];
let built = 0;

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function writeVariant(source, target, variant, resize, flatten = false) {
  const previous = await fs.stat(target).catch(() => null);
  if (previous && previous.mtimeMs >= (await fs.stat(source)).mtimeMs && previous.size <= variant.budget) return;
  const artwork = sharp(source).resize(resize);
  if (flatten) artwork.flatten({ background: "#072c22" });
  let quality = variant.quality;
  let encoded = await artwork.webp({ quality }).toBuffer();
  while (encoded.length > variant.budget && quality > 38) {
    quality -= 6;
    encoded = await artwork.webp({ quality }).toBuffer();
  }
  if (encoded.length > variant.budget) {
    artwork.blur(1.25);
    quality = 56;
    encoded = await artwork.webp({ quality }).toBuffer();
    while (encoded.length > variant.budget && quality > 8) {
      quality -= 6;
      encoded = await artwork.webp({ quality }).toBuffer();
    }
  }
  if (encoded.length > variant.budget) throw new Error("WebP exceeds size budget: " + target);
  await fs.writeFile(target, encoded);
}

const classic = path.join(root, "public/assets/power-cards/v2");
for (const { id } of manifest.subjects) {
  for (const variant of variants.slice(1)) {
    await writeVariant(path.join(classic, `${id}.webp`), path.join(classic, `${id}${variant.suffix}.webp`), variant, { width: variant.width });
  }
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
  for (const variant of variants) {
    const { width, suffix } = variant;
    const height = portraitPacks.has(job.pack) ? width * 1.5 : width;
    await writeVariant(master, path.join(target, `${job.card}${suffix}.webp`), variant, { width, height, fit: "cover" }, true);
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
