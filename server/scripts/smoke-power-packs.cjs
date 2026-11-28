/* Packs de cartes Pouvoir importés depuis l'admin, sans réseau externe ni base réelle.
   Usage : npm --prefix server run build && node server/scripts/smoke-power-packs.cjs */
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { mkdtemp, realpath, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const express = require("express");
const sharp = require("sharp");
const dist = path.join(__dirname, "../dist");
const core = require(path.join(dist, "functions/src/core.js"));
const data = new Map();
let serial = 0;
const clone = (value) => value === undefined ? undefined : structuredClone(value);
const merge = (a, b) => {
  const result = { ...a };
  for (const [key, value] of Object.entries(b)) result[key] = value && typeof value === "object" && !Array.isArray(value) ? merge(result[key], value) : clone(value);
  return result;
};
const snapshot = (ref) => ({ id: ref.id, ref, exists: data.has(ref.path), data: () => clone(data.get(ref.path)), get: (field) => clone(field.split(".").reduce((value, key) => value?.[key], data.get(ref.path))) });
const doc = (refPath) => ({ path: refPath, id: refPath.split("/").at(-1), get: async () => snapshot(doc(refPath)), set: async (value, options) => data.set(refPath, options?.merge ? merge(data.get(refPath), value) : clone(value)) });
const collection = (refPath) => ({ doc: (id = `generated_${++serial}`) => doc(`${refPath}/${id}`) });
const store = {
  doc, collection,
  runTransaction: async (fn) => {
    const writes = [];
    const result = await fn({
      get: async (ref) => { assert.equal(writes.length, 0, "toutes les lectures doivent précéder les écritures"); return snapshot(ref); },
      create: (ref, value) => writes.push(() => { assert.ok(!data.has(ref.path), `doublon ${ref.path}`); data.set(ref.path, clone(value)); }),
      set: (ref, value, options) => writes.push(() => data.set(ref.path, options?.merge ? merge(data.get(ref.path), value) : clone(value))),
    });
    writes.forEach((write) => write());
    return result;
  },
};
core.setDbBackend(store);
const { savePowerPackHandler, deletePowerPackHandler, recordPowerPackArt } = require(path.join(dist, "functions/src/powerPackCommands.js"));
const { saveAssetPackHandler } = require(path.join(dist, "functions/src/cosmeticCommands.js"));
const { createPowerPackArchive } = require(path.join(dist, "lib/powerPackArchive.js"));
const { signAccessToken } = require(path.join(dist, "server/src/authTokens.js"));
const { mountPowerPackUploads } = require(path.join(dist, "server/src/powerPackUploads.js"));
const { mountUploads } = require(path.join(dist, "server/src/uploads.js"));
const request = (uid, payload, admin = false) => ({ auth: { uid, token: { admin } }, data: { idempotencyKey: `test_key_${++serial}`, ...payload } });
const art = (v) => ({ url: `https://back.example/uploads/power-packs/x/vent_nord-${v}.webp`, thumb: `https://back.example/t-${v}.webp`, small: `https://back.example/s-${v}.webp`, v, updatedAt: Date.now() });

async function checkArchiveUpload() {
  const tempRoot = await realpath(tmpdir());
  const target = await mkdtemp(path.join(tempRoot, "njambo-power-packs-"));
  process.env.UPLOAD_DIR = target;
  process.env.PUBLIC_BASE_URL = "";
  process.env.AUTH_JWT_SECRET = "local-smoke-power-packs-signing-secret";
  const app = express();
  app.use(express.json());
  mountUploads(app);
  mountPowerPackUploads(app);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = (admin) => signAccessToken({ uid: "archive-tester", sid: "test", admin, anonymous: false, email: null }).token;
    const makeImage = (background) => sharp({ create: { width: 320, height: 480, channels: 3, background } }).webp().toBuffer();
    const image = await makeImage("#185448");
    const details = { name: "Pack ZIP", description: "Deux cartes", portrait: true };
    const archive = createPowerPackArchive(details, [{ card: "vent_nord", data: image }, { card: "feu_camp", data: image }]);
    const importZip = (body, key, admin = true) => fetch(`${base}/admin/power-pack-import`, {
      method: "POST", body, headers: { "Content-Type": "application/zip", "Idempotency-Key": key, Authorization: `Bearer ${token(admin)}` },
    });
    assert.equal((await importZip(archive, "smoke_zip_admin", false)).status, 403);
    assert.equal((await importZip(archive.slice(0, -1), "smoke_zip_invalid")).status, 400);
    const invalidImage = createPowerPackArchive(details, [{ card: "vent_nord", data: image }, { card: "feu_camp", data: Uint8Array.of(0) }]);
    assert.equal((await importZip(invalidImage, "smoke_zip_bad_art")).status, 400);
    assert.equal(data.get("runtime_config/power_packs").packs.length, 1, "un ZIP invalide ne crée aucun pack");
    const response = await importZip(archive, "smoke_zip_valid");
    assert.equal(response.status, 201);
    const { pack } = await response.json();
    assert.equal(pack.id, "import-pack-zip");
    assert.match(pack.art.vent_nord.url, /\/uploads\/power-packs\//);
    assert.equal((await (await importZip(archive, "smoke_zip_valid")).json()).pack.id, pack.id);
    assert.equal(data.get("runtime_config/power_packs").packs.length, 2, "une nouvelle tentative ne duplique pas le pack");
    const thumb = await fetch(pack.art.vent_nord.small);
    assert.equal(thumb.status, 200);
    assert.equal((await sharp(Buffer.from(await thumb.arrayBuffer())).metadata()).width, 128);
    const replacement = await fetch(`${base}/admin/power-pack-art?pack=${pack.id}&card=vent_nord`, {
      method: "POST", body: await makeImage("#e6cb3d"), headers: { "Content-Type": "image/webp", Authorization: `Bearer ${token(true)}` },
    });
    assert.equal(replacement.status, 200);
    const { pack: edited } = await replacement.json();
    assert.notEqual(edited.art.vent_nord.url, pack.art.vent_nord.url);
    assert.deepEqual(edited.art.feu_camp, pack.art.feu_camp);
  } finally {
    server.close();
    assert.equal(path.dirname(target), tempRoot);
    await rm(target, { force: true, recursive: true });
  }
}

async function main() {
  await assert.rejects(() => savePowerPackHandler(request("user", { pack: { name: "Masques" } })), /ADMIN_REQUIRED/);
  await assert.rejects(() => savePowerPackHandler(request("admin", { pack: { name: "M" } }, true)), /POWER_PACK_NAME_INVALID/);

  const { pack } = await savePowerPackHandler(request("admin", { pack: { name: "Masques du Ndé", description: "Bois", portrait: true } }, true));
  assert.equal(pack.id, "import-masques-du-nde");
  const twin = await savePowerPackHandler(request("admin", { pack: { name: "Masques du Ndé" } }, true));
  assert.equal(twin.pack.id, "import-masques-du-nde-2", "id unique");

  // Renommer : garde l'id et les images.
  await recordPowerPackArt("admin", pack.id, "vent_nord", art("a1"));
  const renamed = await savePowerPackHandler(request("admin", { pack: { id: pack.id, name: "Masques", description: "", portrait: true } }, true));
  assert.equal(renamed.pack.name, "Masques");
  assert.equal(renamed.pack.art.vent_nord.v, "a1");
  // Format verrouillé dès qu'une image est importée (recadrage).
  await assert.rejects(() => savePowerPackHandler(request("admin", { pack: { id: pack.id, name: "Masques", portrait: false } }, true)), /POWER_PACK_FORMAT_LOCKED/);
  // Nouvelle image d'une carte : remplace la précédente.
  const replaced = await recordPowerPackArt("admin", pack.id, "vent_nord", art("b2"));
  assert.equal(replaced.art.vent_nord.v, "b2");
  await assert.rejects(() => recordPowerPackArt("admin", pack.id, "carte_inconnue", art("c3")), /POWER_PACK_CARD_UNKNOWN/);
  await assert.rejects(() => recordPowerPackArt("admin", "import-absent", "vent_nord", art("c3")), /POWER_PACK_UNKNOWN/);

  // Activation pour les cartes Pouvoir seulement.
  await assert.rejects(() => saveAssetPackHandler(request("admin", { pack: pack.id, scope: "system" }, true)), /ASSET_PACK_SCOPE_MISMATCH/);
  await saveAssetPackHandler(request("admin", { pack: pack.id, scope: "powers" }, true));
  assert.equal(data.get("runtime_config/asset_pack").powerPack, pack.id);

  // Suppression refusée tant que le pack est utilisé.
  await assert.rejects(() => deletePowerPackHandler(request("admin", { packId: pack.id }, true)), /POWER_PACK_ACTIVE/);
  await saveAssetPackHandler(request("admin", { pack: "ndop-mystique", scope: "powers" }, true));
  await deletePowerPackHandler(request("admin", { packId: pack.id }, true));
  assert.deepEqual(data.get("runtime_config/power_packs").packs.map((item) => item.id), ["import-masques-du-nde-2"]);
  await assert.rejects(() => saveAssetPackHandler(request("admin", { pack: pack.id, scope: "powers" }, true)), /ASSET_PACK_UNKNOWN/);
  await checkArchiveUpload();
  console.log("smoke-power-packs OK");
}

main().catch((error) => { console.error(error); process.exit(1); });
