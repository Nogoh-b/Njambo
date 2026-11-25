/* Rebuild Salon Royal packs from transparent ImageGen masters.
   UI glyphs reuse the existing native icon system. No network calls. */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ICON_NAMES, glyph } from "./lib/ui-glyphs.mjs";

const root = process.cwd();
const sources = path.join(root, "output/imagegen/salon-royal-assets");
const destination = path.join(root, "public/assets/njambo/packs");
const manifest = JSON.parse(await fs.readFile(path.join(sources, "manifest.json"), "utf8"));
const only = process.argv.find((arg) => arg.startsWith("--pack="))?.slice(7);
const packIds = manifest.packs.map((pack) => pack.id);
if (only && !packIds.includes(only)) throw new Error("Unknown pack: " + only);
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const ranks = ["braise", "mboa", "tambour", "notable", "chef-table", "legende-237", "ancetre"];
const rankColours = ["#c5783c", "#b9d1c8", "#35c996", "#4b8eff", "#ffcf40", "#986bff", "#fff0a8"];
const tones = { dark: "#0f523f", gold: "#b5770f", teal: "#087a65", pink: "#9e163a", ghost: "#193b30" };

function gradient(id, colours) {
  return '<linearGradient id="' + id + '" x1="0" y1="0" x2=".85" y2="1">' +
    colours.map((colour, i) => '<stop offset="' + i / (colours.length - 1) + '" stop-color="' + colour + '"/>').join("") +
    "</linearGradient>";
}

function theme(id) {
  const porcelain = id === "porcelaine-mboa";
  const wood = id === "acajou-sculpte";
  const raffia = id === "raphia-prestige";
  const obsidian = id === "obsidienne-royale";
  const copper = id === "cuivre-du-ter";
  return {
    id, porcelain, wood,
    face: raffia ? ["#f7eccd", "#c3a66a", "#786335"] : obsidian ? ["#263c35", "#0a1b15", "#030a07"] : copper ? ["#efb77d", "#b66b3c", "#69341d"] : porcelain ? ["#fffef5", "#fff8ea", "#e1cfa5"] : wood ? ["#a8572d", "#6d361b", "#32190e"] : ["#2aaf87", "#0f674b", "#072c22"],
    ink: porcelain || raffia ? "#0f523f" : "#fff8ea",
    texture: raffia ? "basket" : obsidian ? "facets" : copper ? "hammered" : id === "ndop-heritage" ? "weave" : wood ? "grain" : id === "jade-imperial" ? "veins" : "gloss",
    radius: obsidian ? 18 : wood ? 28 : id === "jade-imperial" ? 62 : 48,
  };
}

function definitions(t) {
  return "<defs>" + gradient("metal", ["#fff0a8", "#ffcf40", "#a85e08", "#ffcf40"]) +
    gradient("surface", t.face) + gradient("glyph-metal", [t.ink, t.ink]) +
    '<pattern id="basket" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 6h24M0 18h24" stroke="#fff8ea" stroke-opacity=".45" stroke-width="7"/><path d="M6 0v24M18 0v24" stroke="#573e22" stroke-opacity=".25" stroke-width="4"/></pattern>' +
    '<pattern id="facets" width="180" height="180" patternUnits="userSpaceOnUse"><path d="M0 0h180L90 90Z" fill="#fff8ea" opacity=".07"/><path d="m0 180 90-90 90 90Z" fill="#041712" opacity=".3"/></pattern>' +
    '<pattern id="hammered" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="5" fill="#fff0a8" opacity=".13"/><circle cx="23" cy="24" r="6" fill="#572612" opacity=".18"/></pattern>' +
    '<pattern id="weave" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M0 4h16M0 12h16M4 0v16M12 0v16" stroke="#fff8ea" stroke-opacity=".16" stroke-width="2"/></pattern>' +
    '<pattern id="grain" width="100" height="32" patternUnits="userSpaceOnUse"><path d="M-15 4Q40 20 110 7M-10 15Q45 33 115 20M-10 28Q45 42 115 31" fill="none" stroke="#291209" stroke-opacity=".32" stroke-width="2"/></pattern>' +
    '<pattern id="veins" width="150" height="150" patternUnits="userSpaceOnUse"><path d="m-30 130 65-60 24 8 23-48 68-40M35 70l32 45 70 10M82 30l25 38 53-16" fill="none" stroke="#83e6b7" stroke-opacity=".22" stroke-width="2"/></pattern>' +
    '<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff8ea" stop-opacity=".24"/><stop offset=".45" stop-color="#fff8ea" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>' +
    '<filter id="shadow" x="-.2" y="-.2" width="1.4" height="1.5"><feDropShadow dx="0" dy="6" stdDeviation="3" flood-color="#041712" flood-opacity=".5"/></filter></defs>';
}

function svg(t, content, width = 512, height = width) {
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + " " + height + '">' + definitions(t) + content + "</svg>");
}

function motif(t, x, y, width, height) {
  if (t.id === "raphia-prestige") return '<path d="M' + (x + 17) + " " + (y + 18) + "v" + (height - 36) + "M" + (x + width - 17) + " " + (y + 18) + "v" + (height - 36) + '" fill="none" stroke="#0f523f" stroke-width="12" stroke-dasharray="10 4"/>';
  if (t.id === "obsidienne-royale") return '<path d="M' + (x + 17) + " " + (y + 62) + "l45-45h" + (width - 124) + "M" + (x + 62) + " " + (y + height - 17) + "h" + (width - 124) + 'l45-45" fill="none" stroke="#ffcf40" stroke-opacity=".7" stroke-width="3"/>';
  if (t.id === "ndop-heritage") {
    return [x + 10, x + width - 30].map((left) =>
      '<rect x="' + left + '" y="' + (y + 14) + '" width="20" height="' + (height - 28) + '" rx="3" fill="#1b46a8"/>' +
      Array.from({ length: Math.max(1, Math.floor((height - 40) / 24)) }, (_, i) =>
        '<path d="m' + (left + 3) + " " + (y + 28 + i * 24) + ' 7 7 7-7m-14 10 7 7 7-7" fill="none" stroke="#fff8ea" stroke-width="2.5"/>').join("")
    ).join("");
  }
  if (t.wood) return '<path d="M' + (x + 12) + " " + (y + 44) + "v-26h26M" + (x + width - 12) + " " + (y + height - 44) + 'v26h-26" fill="none" stroke="url(#metal)" stroke-width="6"/>';
  if (t.id === "jade-imperial") return '<path d="M' + (x + 14) + " " + (y + height - 15) + "q10-30 34-30-2 25-34 30M" + (x + width - 14) + " " + (y + 15) + 'q-10 30-34 30 2-25 34-30" fill="url(#metal)"/>';
  return "";
}

function plate(t, x, y, width, height, face = "url(#surface)") {
  const radius = Math.min(t.radius, height / 3);
  return '<g filter="url(#shadow)"><rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" rx="' + radius + '" fill="' + face + '" stroke="url(#metal)" stroke-width="12"/>' +
    '<rect x="' + (x + 10) + '" y="' + (y + 10) + '" width="' + (width - 20) + '" height="' + (height - 20) + '" rx="' + Math.max(8, radius - 7) + '" fill="url(#' + t.texture + ')" stroke="#fff8ea" stroke-opacity=".22" stroke-width="2"/>' +
    motif(t, x, y, width, height) + "</g>";
}

function symbol(t, name, x, y, size) {
  const fill = t.porcelain ? "#fff8ea" : t.id === "raphia-prestige" ? "#ead8ad" : "#0f523f";
  const geometry = glyph(name)
    .replaceAll('fill="#0b2c30"', 'fill="' + fill + '"')
    .replaceAll('fill="#0b1628"', 'fill="' + fill + '"')
    .replaceAll("url(#glyph-metal)", t.ink)
    .replaceAll('stroke="#6f361f"', 'stroke="#a85e08"');
  return '<g transform="translate(' + x + " " + y + ") scale(" + size / 48 + ')">' + geometry + "</g>";
}

function embedded(data, x, y, width, height = width) {
  return '<image x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" xlink:href="data:image/png;base64,' + data.toString("base64") + '"/>';
}

function stars(count, x, y, colour, radius = 15) {
  return Array.from({ length: count }, (_, i) => {
    const cx = x + i * (radius * 2.6);
    const points = Array.from({ length: 10 }, (_, p) => {
      const angle = p * Math.PI / 5 - Math.PI / 2;
      const r = p % 2 ? radius * .45 : radius;
      return (cx + Math.cos(angle) * r) + "," + (y + Math.sin(angle) * r);
    }).join(" ");
    return '<polygon points="' + points + '" fill="' + colour + '" stroke="#5c370b" stroke-width="1.5"/>';
  }).join("");
}

async function writeImage(packRoot, relative, input, sizes = [512, 256, 128, 64]) {
  const file = path.join(packRoot, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  for (const size of sizes) {
    const suffix = size === 512 ? "" : "-" + size;
    await sharp(input).resize(size, size, { fit: "contain", background: transparent })
      .webp({ quality: size <= 128 ? 84 : 90, alphaQuality: 100, effort: 4 }).toFile(file + suffix + ".webp");
  }
}

async function readSprite(pack, asset) {
  const file = path.join(sources, pack, asset + ".png");
  const metadata = await sharp(file).metadata();
  if (!metadata.hasAlpha) throw new Error("Expected transparent master: " + file);
  const stats = await sharp(file).stats();
  if (stats.channels[3]?.min !== 0) throw new Error("No transparent background: " + file);
  return sharp(file).trim({ background: "#00000000", threshold: 8 }).resize(456, 456, { fit: "inside" })
    .extend({ top: 28, bottom: 28, left: 28, right: 28, background: transparent })
    .resize(512, 512, { fit: "contain", background: transparent }).png().toBuffer();
}

function wheel(t) {
  const wedges = Array.from({ length: 8 }, (_, i) => {
    const a = (i * 45 - 90) * Math.PI / 180;
    const b = ((i + 1) * 45 - 90) * Math.PI / 180;
    return '<path d="M256 256L' + (256 + 194 * Math.cos(a)) + " " + (256 + 194 * Math.sin(a)) + "A194 194 0 0 1 " + (256 + 194 * Math.cos(b)) + " " + (256 + 194 * Math.sin(b)) + 'Z" fill="' + (i % 2 ? "#fff8ea" : "#0f523f") + '" stroke="#ffcf40" stroke-width="3"/>';
  }).join("");
  return svg(t, '<circle cx="256" cy="256" r="224" fill="url(#surface)" stroke="url(#metal)" stroke-width="18"/>' + wedges +
    Array.from({ length: 8 }, (_, i) => '<g transform="rotate(' + (i * 45 + 22.5) + ' 256 256)">' + stars(1, 256, 108, "#ffcf40", 20) + "</g>").join("") +
    '<circle cx="256" cy="256" r="58" fill="#0f523f" stroke="url(#metal)" stroke-width="10"/>' + symbol({ ...t, ink: "#fff8ea" }, "spark", 216, 216, 80));
}

async function buildPack(pack) {
  const t = theme(pack.id);
  const packRoot = path.join(destination, pack.id);
  const core = {};
  for (const asset of ["economy/nkap", "economy/cauri", "economy/energy-flask", "tickets/ticket-or", "books/book-rare", "ranks/rank-legende-237"]) {
    core[asset] = await readSprite(pack.id, asset);
    await writeImage(packRoot, asset, core[asset]);
  }
  await writeImage(packRoot, "economy/nkap-stack", svg(t, [
    [30, 210, 228], [246, 135, 228], [164, 25, 240], [106, 238, 240],
  ].map(([x, y, size]) => embedded(core["economy/nkap"], x, y, size)).join("")));
  await writeImage(packRoot, "economy/cauris-pouch", svg(t,
    '<path d="M174 92q82 24 164 0l-24 60q100 102 78 220-18 73-136 77-118-4-136-77-22-118 78-220Z" fill="url(#surface)" stroke="url(#metal)" stroke-width="10"/>' +
    '<path d="M174 92q82 24 164 0l-24 60q-58 30-116 0Z" fill="url(#' + t.texture + ')"/><path d="M194 158q62 20 124 0" fill="none" stroke="#ffcf40" stroke-width="12"/>' +
    embedded(core["economy/cauri"], 108, 182, 240) + embedded(core["economy/cauri"], 266, 312, 190)));
  await writeImage(packRoot, "economy/loyalty-wheel", wheel(t));
  for (const [i, name] of ["quartier", "mboa", "chefferie"].entries()) {
    const box = plate(t, 64, 184, 384, 252) +
      '<path d="M64 184l60-86h264l60 86Z" fill="url(#surface)" stroke="url(#metal)" stroke-width="10"/><path d="M256 100v332" stroke="url(#metal)" stroke-width="36"/>' +
      embedded(core["economy/nkap"], 75, 115, 160) + embedded(core["economy/cauri"], 280, 124, 145) +
      '<rect x="177" y="308" width="158" height="66" rx="22" fill="#0f523f" stroke="#ffcf40" stroke-width="5"/>' +
      stars(i + 1, 256 - i * 21, 340, "#ffcf40", 16);
    await writeImage(packRoot, "economy/pack-" + name, svg(t, box));
  }
  for (const [i, tier] of ["bronze", "argent"].entries()) {
    const colour = ["#cc854b", "#d6e6e0"][i];
    await writeImage(packRoot, "tickets/ticket-" + tier, svg(t, embedded(core["tickets/ticket-or"], 0, 0, 512) +
      '<path d="M102 362h308v62H102Z" fill="' + colour + '" stroke="#684623" stroke-width="4"/>' +
      stars(i + 1, 256 - i * 25, 392, "#fff8ea", 19)));
  }
  for (const [name, count, colour] of [["normal", 1, "#d6e6e0"], ["exceptionnel", 3, "#986bff"]]) {
    await writeImage(packRoot, "books/book-" + name, svg(t, embedded(core["books/book-rare"], 0, 0, 512) +
      '<rect x="118" y="370" width="264" height="66" rx="20" fill="#0f523f" stroke="' + colour + '" stroke-width="6"/>' +
      stars(count, 250 - (count - 1) * 24, 403, colour, 18)));
  }
  const cardBack = plate(t, 112, 42, 288, 428) +
    '<path d="m256 116 88 130-88 130-88-130Z" fill="#0f523f" stroke="url(#metal)" stroke-width="8"/>' +
    symbol({ ...t, porcelain: false, ink: "#fff8ea" }, "cards", 184, 175, 144);
  await writeImage(packRoot, "books/card-back", svg(t, cardBack));
  for (const [i, name] of ranks.entries()) {
    if (name === "legende-237") continue;
    const colour = rankColours[i];
    const count = Math.min(4, i + 1);
    const medallion = '<path d="M126 148h260v194l-130 108-130-108Z" fill="url(#surface)" stroke="' + colour + '" stroke-width="14"/>' +
      embedded(core["ranks/rank-legende-237"], 76, 45, 360) +
      '<path d="M138 338h236v56H138Z" fill="#072c22" stroke="' + colour + '" stroke-width="5"/>' +
      stars(count, 256 - (count - 1) * 19, 366, colour, 14) +
      (name === "ancetre" ? '<path d="M105 352q-70-100-20-190M407 352q70-100 20-190" fill="none" stroke="#fff0a8" stroke-width="20" stroke-dasharray="16 10"/>' : "");
    await writeImage(packRoot, "ranks/rank-" + name, svg(t, medallion));
  }
  for (const name of ICON_NAMES) {
    const art = svg(t, plate(t, 30, 26, 452, 452) + symbol(t, name, 96, 92, 320));
    await writeImage(packRoot, "ui/icons/" + name, art, [128, 64]);
  }
  for (const [name, colour] of Object.entries(tones)) {
    const face = name === "dark" || name === "ghost" ? "url(#surface)" : colour;
    const art = svg(t, plate(t, 12, 12, 696, 264, face), 720, 288);
    const file = path.join(packRoot, "ui/buttons", name + "-frame.webp");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await sharp(art).resize(360, 144).webp({ lossless: true, effort: 4 }).toFile(file);
  }
  await writeImage(packRoot, "ui/buttons/icon-plate", svg(t, plate(t, 30, 26, 452, 452)), [128, 64]);
  const friendly = { home: "home", play: "play", events: "trophy", shop: "coin", social: "friends", notification: "notification", settings: "settings" };
  for (const [name, icon] of Object.entries(friendly)) {
    const file = path.join(packRoot, "friendly/icons", name + ".svg");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, svg(t, plate(t, 30, 26, 452, 452) + symbol(t, icon, 96, 92, 320)));
  }
  for (const [mode, icon] of [["online", "globe"], ["ai", "bot"], ["friends", "friends"]]) {
    const art = svg(t, plate(t, 20, 20, 600, 360) +
      '<path d="M72 294q250-100 496 0v42H72Z" fill="#072c22" opacity=".65"/>' +
      symbol(t, icon, 202, 48, 236) +
      '<g transform="rotate(-16 126 244)">' + embedded(core["books/card-back"] ?? await sharp(svg(t, cardBack)).png().toBuffer(), 50, 162, 140, 194) + "</g>" +
      embedded(core["economy/nkap"], 442, 215, 126), 640, 400);
    const file = path.join(packRoot, "menu/mode-" + mode);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await sharp(art).webp({ quality: 90, effort: 4 }).toFile(file + ".webp");
    await sharp(art).resize(480, 300).webp({ quality: 88, effort: 4 }).toFile(file + "-480.webp");
  }
  console.log(pack.id + ": 176 production assets built");
}

for (const pack of manifest.packs.filter((pack) => !only || pack.id === only)) await buildPack(pack);
