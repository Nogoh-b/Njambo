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
  throw new Error("Usage: node scripts/process-game-banner.mjs --input source.png --out-dir public/... --name event-name");
}

await fs.mkdir(args["out-dir"], { recursive: true });
const source = sharp(args.input).rotate();

await source
  .clone()
  .resize(1440, 810, { fit: "cover", position: "centre" })
  .png({ compressionLevel: 9 })
  .toFile(path.join(args["out-dir"], `${args.name}.png`));

for (const width of [960, 480]) {
  await source
    .clone()
    .resize(width, Math.round(width * 9 / 16), { fit: "cover", position: "centre" })
    .webp({ quality: width === 960 ? 88 : 84, effort: 6 })
    .toFile(path.join(args["out-dir"], width === 960 ? `${args.name}.webp` : `${args.name}-${width}.webp`));
}

console.log(path.join(args["out-dir"], `${args.name}.webp`));
