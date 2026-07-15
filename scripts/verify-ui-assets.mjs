import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const artPath = path.join(root, "components", "ui", "Art.tsx");
const buttonPath = path.join(root, "components", "ui", "Btn.tsx");
const iconDir = path.join(root, "public", "assets", "njambo", "ui", "icons");
const buttonDir = path.join(root, "public", "assets", "njambo", "ui", "buttons");

const artSource = await fs.readFile(artPath, "utf8");
const namesBlock = artSource.match(/export const NJAMBO_ICON_NAMES = \[([\s\S]*?)\] as const;/)?.[1];
if (!namesBlock) throw new Error("NJAMBO_ICON_NAMES est introuvable dans Art.tsx");
const iconNames = [...namesBlock.matchAll(/"([a-z-]+)"/g)].map((match) => match[1]);

if (iconNames.length !== 32 || new Set(iconNames).size !== iconNames.length) {
  throw new Error(`Catalogue d'icônes invalide : ${iconNames.length} noms, ${new Set(iconNames).size} uniques`);
}
if (artSource.includes("renderIcon")) throw new Error("Le rendu SVG générique renderIcon est encore présent");

for (const name of iconNames) {
  for (const size of [64, 128]) {
    const file = path.join(iconDir, `${name}-${size}.webp`);
    const [stat, metadata] = await Promise.all([fs.stat(file), sharp(file).metadata()]);
    if (metadata.width !== size || metadata.height !== size || !metadata.hasAlpha) {
      throw new Error(`${path.relative(root, file)} doit être un WebP ${size}×${size} avec alpha`);
    }
    const budget = size === 64 ? 8_000 : 16_000;
    if (stat.size > budget) throw new Error(`${path.relative(root, file)} dépasse le budget de ${budget} octets`);
  }
  await fs.stat(path.join(iconDir, `${name}.png`));
}

for (const name of ["gold", "teal", "pink", "dark", "ghost"]) {
  const file = path.join(buttonDir, `${name}-frame.webp`);
  const metadata = await sharp(file).metadata();
  if (metadata.width !== 360 || metadata.height !== 144 || !metadata.hasAlpha) {
    throw new Error(`${path.relative(root, file)} doit être un WebP 360×144 avec alpha`);
  }
}

const buttonSource = await fs.readFile(buttonPath, "utf8");
if (!buttonSource.includes('"teal"')) throw new Error("La variante Btn teal est absente");

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "admin") files.push(...await walk(fullPath));
    } else if (entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

for (const file of await walk(path.join(root, "components"))) {
  const source = await fs.readFile(file, "utf8");
  const openings = source.match(/<button\b[^>]*>/g) ?? [];
  const unskinned = openings.find((opening) => !opening.includes("data-nj-skin="));
  if (unskinned) throw new Error(`Bouton sans surface image dans ${path.relative(root, file)} : ${unskinned.slice(0, 90)}`);
}

console.log(`UI assets OK : ${iconNames.length} icônes, 5 cadres et une politique de surface explicite pour chaque bouton public.`);
