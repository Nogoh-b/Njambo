import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const iconDir = path.join(root, "public", "assets", "njambo", "ui", "icons");
const buttonDir = path.join(root, "public", "assets", "njambo", "ui", "buttons");
const brandDir = path.join(root, "public", "assets", "njambo", "ui", "brand");
const boardPath = path.join(root, "docs", "njambo-ui-validation-board.png");

export const ICON_NAMES = [
  "bot", "cards", "check", "coin", "code", "copy", "crown", "cut",
  "empty", "eye", "friends", "globe", "history", "home", "hourglass", "language",
  "message", "music", "notification", "online", "play", "plus", "profile", "search",
  "settings", "sound", "spark", "sparkle", "star", "trophy", "users", "wind",
];

const stroke = 'fill="none" stroke="url(#glyph-metal)" stroke-width="3.25" stroke-linecap="round" stroke-linejoin="round"';
const soft = 'fill="#0b2c30" stroke="url(#glyph-metal)" stroke-width="3.25" stroke-linecap="round" stroke-linejoin="round"';
const solid = 'fill="url(#glyph-metal)" stroke="#6f361f" stroke-width="1.15" stroke-linejoin="round"';

function glyph(name) {
  switch (name) {
    case "online":
    case "globe":
      return `<circle cx="24" cy="24" r="16" ${soft}/><path d="M9 24h30M24 8c5 5 7 10 7 16s-2 11-7 16M24 8c-5 5-7 10-7 16s2 11 7 16" ${stroke}/>`;
    case "friends":
    case "users":
      return `<circle cx="18" cy="18" r="7" ${soft}/><circle cx="32" cy="20" r="6" ${stroke}/><path d="M7 38c3-8 18-8 22 0M25 37c3-5 11-5 15 0" ${stroke}/>`;
    case "bot":
      return `<rect x="11" y="15" width="26" height="22" rx="8" ${soft}/><path d="M24 15V9M18 9h12M18 27h.1M30 27h.1M18 34c4 2 8 2 12 0" ${stroke}/>`;
    case "trophy":
      return `<path d="M16 10h16v10c0 7-4 12-8 12s-8-5-8-12V10Z" ${soft}/><path d="M16 15H9c0 7 3 11 8 11M32 15h7c0 7-3 11-8 11M24 32v6M16 40h16" ${stroke}/>`;
    case "history":
      return `<path d="M12 13h24v27H12z" ${soft}/><path d="M17 9v8M31 9v8M17 24h14M17 31h10" ${stroke}/>`;
    case "notification":
      return `<path d="M15 34h18l-3-5V20c0-6-3-10-6-10s-6 4-6 10v9l-3 5Z" ${soft}/><path d="M21 38c1 2 5 2 6 0M30 12c3 2 5 5 5 9" ${stroke}/>`;
    case "message":
      return `<path d="M10 12h28v21H20l-8 7v-7h-2V12Z" ${soft}/><path d="M17 21h14M17 27h9" ${stroke}/>`;
    case "search":
      return `<circle cx="21" cy="21" r="11" ${soft}/><path d="m30 30 9 9" ${stroke}/>`;
    case "plus":
      return `<circle cx="24" cy="24" r="15" ${soft}/><path d="M24 16v16M16 24h16" ${stroke}/>`;
    case "settings":
      return `<circle cx="24" cy="24" r="6" ${soft}/><path d="M24 7v6M24 35v6M7 24h6M35 24h6M12 12l4 4M32 32l4 4M36 12l-4 4M16 32l-4 4" ${stroke}/>`;
    case "home":
      return `<path d="M9 23 24 10l15 13v17H14V25" ${soft}/><path d="M20 40V29h8v11" ${stroke}/>`;
    case "coin":
      return `<ellipse cx="24" cy="24" rx="15" ry="12" ${soft}/><path d="M18 24h12M21 18h9M21 30h9" ${stroke}/>`;
    case "cards":
      return `<rect x="14" y="9" width="18" height="27" rx="4" ${soft} transform="rotate(-8 23 23)"/><rect x="20" y="12" width="18" height="27" rx="4" fill="#0b1628" stroke="url(#glyph-metal)" stroke-width="3.25" transform="rotate(8 29 25)"/><path d="M28 22c3-5 9-2 6 3-2 3-6 6-6 6s-4-3-6-6c-3-5 3-8 6-3Z" ${solid}/>`;
    case "crown":
      return `<path d="m9 34 4-20 10 11 8-14 6 23H9Z" ${soft}/><path d="M12 39h24" ${stroke}/>`;
    case "copy":
      return `<rect x="16" y="15" width="20" height="24" rx="4" ${soft}/><path d="M12 31H9a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v2" ${stroke}/>`;
    case "code":
      return `<path d="m18 16-9 8 9 8M30 16l9 8-9 8M27 11l-6 26" ${stroke}/>`;
    case "check":
      return `<path d="M10 25 20 35 39 13" ${stroke}/>`;
    case "music":
      return `<path d="M18 31V12l19-4v20" ${stroke}/><circle cx="14" cy="34" r="5" ${soft}/><circle cx="33" cy="31" r="5" ${soft}/>`;
    case "sound":
      return `<path d="M8 28V20h8l10-8v24L16 28H8Z" ${soft}/><path d="M32 18c3 4 3 8 0 12M38 13c6 8 6 14 0 22" ${stroke}/>`;
    case "language":
      return `<path d="M8 13h18M17 9v4M24 13c-3 8-8 14-15 18M12 18c3 5 7 9 12 12M27 39l8-20 8 20M31 31h8" ${stroke}/>`;
    case "play":
      return `<path d="M17 11v26l22-13-22-13Z" ${soft}/>`;
    case "profile":
      return `<circle cx="24" cy="17" r="8" ${soft}/><path d="M10 40c4-10 24-10 28 0" ${stroke}/>`;
    case "empty":
      return `<rect x="14" y="9" width="20" height="30" rx="5" ${soft}/><path d="M19 18h10M19 25h10M19 32h6" ${stroke}/>`;
    case "eye":
      return `<path d="M5 24s7-12 19-12 19 12 19 12-7 12-19 12S5 24 5 24Z" ${soft}/><circle cx="24" cy="24" r="6" ${solid}/><circle cx="26" cy="22" r="1.6" fill="#090917"/>`;
    case "cut":
      return `<circle cx="13" cy="14" r="5" ${soft}/><circle cx="13" cy="34" r="5" ${soft}/><path d="M17 16 40 33M17 32 40 15" ${stroke}/>`;
    case "star":
      return `<path d="M24 6 30 18l13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2Z" ${soft}/>`;
    case "sparkle":
      return `<path d="M22 8c1.4 9 3 10.6 12 12-9 1.4-10.6 3-12 12-1.4-9-3-10.6-12-12 9-1.4 10.6-3 12-12Z" ${soft}/><path d="M37 29c.6 4 1.2 4.6 5 5-3.8.4-4.4 1-5 5-.6-4-1.2-4.6-5-5 3.8-.4 4.4-1 5-5Z" ${solid}/>`;
    case "wind":
      return `<path d="M6 18h20a5 5 0 1 0-5-5M6 26h29a5 5 0 1 1-5 5M6 34h16a4 4 0 1 1-4 4" ${stroke}/>`;
    case "hourglass":
      return `<path d="M14 8h20M14 40h20" ${stroke}/><path d="M16 8c0 9 8 11 8 16 0-5 8-7 8-16M16 40c0-9 8-11 8-16 0 5 8 7 8 16Z" ${soft}/>`;
    case "spark":
    default:
      return `<path d="M24 7 29 20l12 4-12 5-5 12-5-12-12-5 12-4 5-13Z" ${soft}/><path d="M11 10v7M7 14h8M38 32v6M35 35h6" ${stroke}/>`;
  }
}

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

const buttonThemes = {
  gold: { edge: "#d0a35d", light: "#f0d59a", surface1: "#5a3b22", surface2: "#1d130e", inlay: "#aa7041", warm: "#e1b548", hot: "#a94135" },
  teal: { edge: "#609d93", light: "#b5d5ca", surface1: "#30423c", surface2: "#101917", inlay: "#b68a50", warm: "#dfaa3e", hot: "#b24739" },
  pink: { edge: "#ad6972", light: "#d8afb0", surface1: "#452d2d", surface2: "#19100f", inlay: "#b68a50", warm: "#e0ae43", hot: "#9f382f" },
  dark: { edge: "#8c6746", light: "#c5a574", surface1: "#3d291d", surface2: "#120d0b", inlay: "#675443", warm: "#d7a33c", hot: "#a43c32" },
  ghost: { edge: "#5f5144", light: "#8e7960", surface1: "#25201c", surface2: "#0b0a0b", inlay: "#4c453d", warm: "#b98a36", hot: "#87382f" },
};

function buttonSvg(theme, iconOnly = false) {
  const width = iconOnly ? 256 : 720;
  const height = iconOnly ? 256 : 288;
  const geometry = iconOnly
    ? `<circle cx="128" cy="128" r="114" fill="url(#surface)" stroke="url(#edge)" stroke-width="13"/><circle cx="128" cy="128" r="94" fill="url(#weave)" stroke="${theme.inlay}" stroke-opacity=".42" stroke-width="4"/><circle cx="128" cy="128" r="78" fill="#08090d" fill-opacity=".48" stroke="#e8d4af" stroke-opacity=".09" stroke-width="3"/><path d="M128 10l12 17-12 17-12-17 12-17Zm0 202 12 17-12 17-12-17 12-17Z" fill="${theme.warm}" stroke="#5d3519" stroke-width="3"/><path d="M10 128l17-12 17 12-17 12-17-12Zm202 0 17-12 17 12-17 12-17-12Z" fill="${theme.hot}" stroke="#4d1e1a" stroke-width="3"/>`
    : `<path d="M72 12h576l60 60v144l-60 60H72l-60-60V72l60-60Z" fill="url(#surface)" stroke="url(#edge)" stroke-width="13"/><path d="M91 38h538l53 53v106l-53 53H91l-53-53V91l53-53Z" fill="url(#weave)" stroke="${theme.inlay}" stroke-opacity=".5" stroke-width="5"/><path d="M108 59h504l46 46v78l-46 46H108l-46-46v-78l46-46Z" fill="#07080d" fill-opacity=".3" stroke="#ead8b8" stroke-opacity=".08" stroke-width="3"/><path d="M72 30h576M72 258h576" stroke="${theme.light}" stroke-opacity=".2" stroke-width="4"/><path d="M54 71l16-16 16 16-16 16-16-16Zm577 146 16-16 16 16-16 16-16-16Z" fill="${theme.warm}" stroke="#5d3519" stroke-width="3"/><path d="M634 71l16-16 16 16-16 16-16-16ZM54 217l16-16 16 16-16 16-16-16Z" fill="${theme.hot}" stroke="#4d1e1a" stroke-width="3"/><path d="M138 19h140M442 269h140" stroke="${theme.warm}" stroke-width="10" stroke-linecap="round"/><path d="M442 19h140M138 269h140" stroke="${theme.hot}" stroke-width="10" stroke-linecap="round"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="surface" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.surface1}"/><stop offset=".5" stop-color="${theme.surface2}"/><stop offset="1" stop-color="#070609"/></linearGradient>
      <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.light}"/><stop offset=".38" stop-color="${theme.edge}"/><stop offset=".72" stop-color="#5d402b"/><stop offset="1" stop-color="${theme.edge}"/></linearGradient>
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
