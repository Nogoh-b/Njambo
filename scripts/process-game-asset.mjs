import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, values) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), values[index + 1]]);
    return pairs;
  }, []),
);

if (!args.input || !args["out-dir"] || !args.name) {
  throw new Error("Usage: node scripts/process-game-asset.mjs --input source.png --out-dir public/... --name asset-name [--key 00ff00]");
}

const key = (args.key ?? "00ff00").replace("#", "");
const keyRgb = [0, 2, 4].map((offset) => Number.parseInt(key.slice(offset, offset + 2), 16));
const transparentThreshold = 12;
const opaqueThreshold = 220;

const { data, info } = await sharp(args.input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

for (let index = 0; index < data.length; index += 4) {
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  const sourceAlpha = data[index + 3];
  const distance = Math.hypot(red - keyRgb[0], green - keyRgb[1], blue - keyRgb[2]);
  const matte = Math.max(0, Math.min(1, (distance - transparentThreshold) / (opaqueThreshold - transparentThreshold)));

  if (keyRgb[1] > keyRgb[0] && keyRgb[1] > keyRgb[2]) {
    const spill = Math.max(0, green - Math.max(red, blue));
    data[index + 1] = Math.round(green - spill * (1 - matte * 0.35));
  }
  data[index + 3] = Math.round(sourceAlpha * matte);
}

await fs.mkdir(args["out-dir"], { recursive: true });
const masterPath = path.join(args["out-dir"], `${args.name}.png`);
const keyed = sharp(data, { raw: info });

await keyed
  .clone()
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9, palette: false })
  .toFile(masterPath);

await sharp(masterPath)
  .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .webp({ quality: 90, alphaQuality: 100, effort: 6 })
  .toFile(path.join(args["out-dir"], `${args.name}.webp`));

for (const size of [256, 128, 64]) {
  await sharp(masterPath)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: size === 256 ? 88 : 84, alphaQuality: 100, effort: 6 })
    .toFile(path.join(args["out-dir"], `${args.name}-${size}.webp`));
}

console.log(masterPath);
