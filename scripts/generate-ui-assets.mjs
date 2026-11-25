import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const iconDir = path.join(root, "public", "assets", "njambo", "ui", "icons");
const buttonDir = path.join(root, "public", "assets", "njambo", "ui", "buttons");
const brandDir = path.join(root, "public", "assets", "njambo", "ui", "brand");
const boardPath = path.join(root, "docs", "njambo-ui-validation-board.png");

import { ICON_NAMES, glyph } from "./lib/ui-glyphs.mjs";
export { ICON_NAMES } from "./lib/ui-glyphs.mjs";

function ornamentRing() {
  return Array.from({ length: 16 }, (_, index) => {
    const angle = index * 22.5;
    const fill = index % 4 === 0 ? "#10b7a6" : index % 2 === 0 ? "#d7a957" : "#c75b3a";
    return `<path d="M492 176l20 28 20-28-20-26Z" fill="${fill}" opacity="${index % 4 === 0 ? 0.88 : 0.62}" transform="rotate(${angle} 512 512)"/>`;
  }).join("");
}

function iconSvg(name) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <radialGradient id="wood" cx="38%" cy="28%" r="78%"><stop offset="0" stop-color="#704421"/><stop offset=".48" stop-color="#3e2414"/><stop offset="1" stop-color="#140b07"/></radialGradient>
      <linearGradient id="copper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffd98a"/><stop offset=".23" stop-color="#c7793e"/><stop offset=".58" stop-color="#6f321d"/><stop offset=".82" stop-color="#e4a558"/><stop offset="1" stop-color="#4b2116"/></linearGradient>
      <linearGradient id="glyph-metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0b4"/><stop offset=".4" stop-color="#f2bb45"/><stop offset="1" stop-color="#b85d3e"/></linearGradient>
      <radialGradient id="inner" cx="48%" cy="38%" r="70%"><stop stop-color="#15343a"/><stop offset=".52" stop-color="#10142d"/><stop offset="1" stop-color="#070711"/></radialGradient>
      <filter id="shadow" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="26" stdDeviation="22" flood-color="#020207" flood-opacity=".78"/></filter>
      <filter id="glyph-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#000" flood-opacity=".8"/></filter>
      <pattern id="weave" width="36" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 8h36M0 28h36" stroke="#d7a957" stroke-width="4" opacity=".13"/><path d="M8 0v36M28 0v36" stroke="#10b7a6" stroke-width="3" opacity=".1"/></pattern>
    </defs>
    <g filter="url(#shadow)">
      <circle cx="512" cy="486" r="438" fill="url(#wood)" stroke="#1b0d09" stroke-width="24"/>
      <circle cx="512" cy="486" r="405" fill="url(#copper)" stroke="#f2bb45" stroke-opacity=".45" stroke-width="10"/>
      <circle cx="512" cy="486" r="354" fill="url(#inner)" stroke="#2c1710" stroke-width="26"/>
      <circle cx="512" cy="486" r="337" fill="url(#weave)" opacity=".9"/>
      <circle cx="512" cy="486" r="326" fill="#080914" fill-opacity=".62" stroke="#10b7a6" stroke-opacity=".34" stroke-width="8"/>
      ${ornamentRing()}
      <path d="M246 696c74 58 163 88 266 88s192-30 266-88" fill="none" stroke="#f2bb45" stroke-opacity=".25" stroke-width="10"/>
      <g transform="translate(190 164) scale(13.42)" filter="url(#glyph-shadow)">${glyph(name)}</g>
      <ellipse cx="420" cy="192" rx="130" ry="34" fill="#fff4df" opacity=".08" transform="rotate(-18 420 192)"/>
    </g>
  </svg>`);
}

function markSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <radialGradient id="mark-bg" cx="38%" cy="28%" r="78%"><stop stop-color="#78502b"/><stop offset=".48" stop-color="#3f2313"/><stop offset="1" stop-color="#110a08"/></radialGradient>
      <linearGradient id="mark-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0b4"/><stop offset=".45" stop-color="#f2bb45"/><stop offset="1" stop-color="#c75b3a"/></linearGradient>
      <filter id="shadow" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="24" stdDeviation="22" flood-color="#020207" flood-opacity=".8"/></filter>
      <pattern id="mark-weave" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M0 24h48M24 0v48" stroke="#fff4df" stroke-opacity=".1" stroke-width="4"/><circle cx="24" cy="24" r="6" fill="#10b7a6" fill-opacity=".28"/></pattern>
    </defs>
    <g filter="url(#shadow)">
      <circle cx="512" cy="482" r="440" fill="url(#mark-bg)" stroke="#c75b3a" stroke-width="28"/>
      <circle cx="512" cy="482" r="402" fill="url(#mark-weave)" stroke="#f2bb45" stroke-width="14"/>
      <circle cx="512" cy="482" r="326" fill="#090917" fill-opacity=".88" stroke="#10b7a6" stroke-opacity=".5" stroke-width="10"/>
      <path d="M296 618c82-198 156-304 220-304 76 0 119 136 226 136 42 0 76-16 108-48-48 171-126 260-230 260-97 0-132-138-205-138-43 0-78 26-119 94Z" fill="url(#mark-gold)" stroke="#6f321d" stroke-width="9"/>
      <path d="M328 358c64-48 128-72 187-72 97 0 170 64 212 178-72-56-129-80-186-80-78 0-144 54-213 168V358Z" fill="#10b7a6" opacity=".9" stroke="#064d4b" stroke-width="9"/>
      <circle cx="260" cy="252" r="28" fill="#d83c68"/><circle cx="780" cy="686" r="28" fill="#10b7a6"/>
      <ellipse cx="416" cy="146" rx="150" ry="36" fill="#fff4df" opacity=".08" transform="rotate(-15 416 146)"/>
    </g>
  </svg>`);
}

/* Cadres de boutons — thème solaire « Mboa ».
   Les surfaces sont des parchemins clairs teintés par la tonalité, les
   liserés reprennent la couleur de ton, l'encre reste sombre. Voir
   app/mboa-solar.css pour les tokens équivalents côté CSS. */
const buttonThemes = {
  gold: { edge: "#b88e54", light: "#fff7e4", surface1: "#f9e7bd", surface2: "#eed296", inlay: "#a9680c", warm: "#f5c344", hot: "#e45145" },
  teal: { edge: "#199b68", light: "#eaf7f0", surface1: "#ddf1e6", surface2: "#bce4d1", inlay: "#116345", warm: "#f5c344", hot: "#199b68" },
  pink: { edge: "#e45145", light: "#fdece8", surface1: "#fbdfd9", surface2: "#f4c6bc", inlay: "#a92f2a", warm: "#f5c344", hot: "#a92f2a" },
  dark: { edge: "#765033", light: "#fbf1dc", surface1: "#ecd9b5", surface2: "#d9ba82", inlay: "#765033", warm: "#f5c344", hot: "#a92f2a" },
  ghost: { edge: "#b88e54", light: "#fdf6e8", surface1: "#f7ead0", surface2: "#e6d3ae", inlay: "#b88e54", warm: "#d6b77d", hot: "#b88e54" },
};

function buttonSvg(theme, iconOnly = false) {
  const width = iconOnly ? 256 : 720;
  const height = iconOnly ? 256 : 288;
  const geometry = iconOnly
    ? `<circle cx="128" cy="128" r="114" fill="url(#surface)" stroke="url(#edge)" stroke-width="13"/><circle cx="128" cy="128" r="94" fill="url(#weave)" stroke="${theme.inlay}" stroke-opacity=".42" stroke-width="4"/><circle cx="128" cy="128" r="78" fill="#765033" fill-opacity=".10" stroke="#fffaf0" stroke-opacity=".5" stroke-width="3"/><path d="M128 10l12 17-12 17-12-17 12-17Zm0 202 12 17-12 17-12-17 12-17Z" fill="${theme.warm}" stroke="${theme.inlay}" stroke-width="3"/><path d="M10 128l17-12 17 12-17 12-17-12Zm202 0 17-12 17 12-17 12-17-12Z" fill="${theme.hot}" stroke="${theme.inlay}" stroke-width="3"/>`
    : `<path d="M72 12h576l60 60v144l-60 60H72l-60-60V72l60-60Z" fill="url(#surface)" stroke="url(#edge)" stroke-width="13"/><path d="M91 38h538l53 53v106l-53 53H91l-53-53V91l53-53Z" fill="url(#weave)" stroke="${theme.inlay}" stroke-opacity=".5" stroke-width="5"/><path d="M108 59h504l46 46v78l-46 46H108l-46-46v-78l46-46Z" fill="#765033" fill-opacity=".10" stroke="#fffaf0" stroke-opacity=".5" stroke-width="3"/><path d="M72 30h576M72 258h576" stroke="${theme.light}" stroke-opacity=".45" stroke-width="4"/><path d="M54 71l16-16 16 16-16 16-16-16Zm577 146 16-16 16 16-16 16-16-16Z" fill="${theme.warm}" stroke="${theme.inlay}" stroke-width="3"/><path d="M634 71l16-16 16 16-16 16-16-16ZM54 217l16-16 16 16-16 16-16-16Z" fill="${theme.hot}" stroke="${theme.inlay}" stroke-width="3"/><path d="M138 19h140M442 269h140" stroke="${theme.warm}" stroke-width="10" stroke-linecap="round"/><path d="M442 19h140M138 269h140" stroke="${theme.hot}" stroke-width="10" stroke-linecap="round"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="surface" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.surface1}"/><stop offset=".5" stop-color="${theme.surface2}"/><stop offset="1" stop-color="#d6b77d"/></linearGradient>
      <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.light}"/><stop offset=".38" stop-color="${theme.edge}"/><stop offset=".72" stop-color="${theme.inlay}"/><stop offset="1" stop-color="${theme.edge}"/></linearGradient>
      <pattern id="weave" width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 8h34M0 26h34" stroke="${theme.edge}" stroke-opacity=".13" stroke-width="4"/><path d="M8 0v34M26 0v34" stroke="${theme.inlay}" stroke-opacity=".1" stroke-width="3"/></pattern>
    </defs>
    <rect width="${width}" height="${height}" fill="#09080a" fill-opacity="0"/>
    ${geometry}
  </svg>`);
}

async function writeRasterVariants(svg, directory, name, sizes) {
  const master = path.join(directory, `${name}.png`);
  await sharp(svg).png({ compressionLevel: 9 }).toFile(master);
  for (const size of sizes) {
    const raster = sharp(master).resize(size.width, size.height, { fit: "fill" });
    await (size.lossless
      ? raster.webp({ lossless: true, effort: 2 })
      : raster.webp({ quality: 88, alphaQuality: 100, effort: 2 }))
      .toFile(path.join(directory, size.suffix ? `${name}-${size.suffix}.webp` : `${name}.webp`));
  }
}

await Promise.all([iconDir, buttonDir, brandDir, path.dirname(boardPath)].map((directory) => fs.mkdir(directory, { recursive: true })));

for (const name of ICON_NAMES) {
  await writeRasterVariants(iconSvg(name), iconDir, name, [
    { width: 128, height: 128, suffix: 128 },
    { width: 64, height: 64, suffix: 64 },
  ]);
}

await writeRasterVariants(markSvg(), brandDir, "njambo-mark", [
  { width: 256, height: 256, suffix: 256 },
  { width: 128, height: 128, suffix: 128 },
  { width: 64, height: 64, suffix: 64 },
]);

for (const [name, theme] of Object.entries(buttonThemes)) {
  await writeRasterVariants(buttonSvg(theme), buttonDir, name, [{ width: 360, height: 144, suffix: "frame", lossless: true }]);
}
await writeRasterVariants(buttonSvg(buttonThemes.dark, true), buttonDir, "icon-plate", [
  { width: 128, height: 128, suffix: 128, lossless: true },
  { width: 64, height: 64, suffix: 64, lossless: true },
]);

const cellWidth = 180;
const cellHeight = 176;
const boardWidth = cellWidth * 8;
const boardHeight = cellHeight * 4;
const boardSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${boardWidth}" height="${boardHeight}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#26140b"/><stop offset=".5" stop-color="#10142d"/><stop offset="1" stop-color="#05060b"/></linearGradient><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M0 20h40M20 0v40" stroke="#f2bb45" stroke-opacity=".035" stroke-width="2"/></pattern></defs><rect width="100%" height="100%" fill="url(#bg)"/><rect width="100%" height="100%" fill="url(#grid)"/></svg>`);
const composites = [];
for (const [index, name] of ICON_NAMES.entries()) {
  const left = (index % 8) * cellWidth + 26;
  const top = Math.floor(index / 8) * cellHeight + 10;
  composites.push({ input: path.join(iconDir, `${name}-128.webp`), left, top });
  composites.push({
    input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cellWidth}" height="32"><text x="90" y="22" text-anchor="middle" fill="#fff0d0" font-size="17" font-family="Segoe UI, sans-serif" font-weight="700">${name}</text></svg>`),
    left: (index % 8) * cellWidth,
    top: Math.floor(index / 8) * cellHeight + 139,
  });
}
const boardTempPath = `${boardPath}.tmp.png`;
await sharp(boardSvg).composite(composites).png({ compressionLevel: 8 }).toFile(boardTempPath);
await fs.rm(boardPath, { force: true });
await fs.rename(boardTempPath, boardPath);

console.log(JSON.stringify({ icons: ICON_NAMES.length, buttons: Object.keys(buttonThemes).length + 1, board: boardPath }));
