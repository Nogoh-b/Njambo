/* Test d'intégration de l'upload audio (cartes pouvoir) : nécessite ffmpeg + ffprobe.
   Usage : npm --prefix server run build && DATABASE_URL=… node server/scripts/smoke-audio-upload.cjs
   ⚠️ Écrit dans la base visée : utiliser une base JETABLE. (Jeton Firebase simulé.) */
const path = require("path"); const fs = require("fs");
const dist = path.join(__dirname, "..", "dist");
const authMod = require(path.join(dist, "server/src/auth.js"));
authMod.buildCallableRequest = async (header) => ({ auth: header === "Bearer admin" ? { uid: "adm", token: { admin: true } } : header === "Bearer user" ? { uid: "u", token: {} } : undefined });
const os = require("os");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "njambo-audio-test-"));
process.env.UPLOAD_DIR = path.join(work, "uploads");
const express = require(path.join(__dirname, "..", "node_modules", "express"));
const core = require(path.join(dist, "functions/src/core.js"));
const { createPgFirestore } = require(path.join(dist, "server/src/firestoreCompat/pg.js"));
const { mountUploads } = require(path.join(dist, "server/src/uploads.js"));
const { mountAudioUploads } = require(path.join(dist, "server/src/audioUploads.js"));
const { execFileSync } = require("child_process");
const ok = (c, m) => { if (!c) { console.error("ÉCHEC:", m); process.exit(1); } console.log("ok -", m); };
(async () => {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis (base jetable)"); process.exit(1); }
  core.setDbBackend(await createPgFirestore(process.env.DATABASE_URL));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=8", "-ac", "1", "-ar", "11025", path.join(work, "tone8.wav")]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=660:duration=2", "-b:a", "64k", path.join(work, "short.mp3")]);
  const app = express(); app.use(express.json()); mountUploads(app); mountAudioUploads(app);
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
  const post = (auth, type, body) => fetch(`${base}/admin/upload-audio`, { method: "POST", headers: { Authorization: `Bearer ${auth}`, "Content-Type": type }, body });
  const wav = fs.readFileSync(path.join(work, "tone8.wav"));
  let r = await post("user", "audio/wav", fs.readFileSync(path.join(work, "short.mp3"))); ok(r.status === 403, "non-admin refusé");
  r = await post("admin", "image/png", wav); ok(r.status === 400, "type non audio refusé");
  r = await post("admin", "audio/mpeg", Buffer.from("ceci n'est pas un mp3, juste du texte")); ok(r.status === 400 && (await r.json()).message === "NOT_AN_AUDIO_FILE", "faux MP3 refusé (signature)");
  r = await post("admin", "audio/wav", Buffer.concat([wav, wav, wav])); ok(r.status === 413, "fichier > 500 Ko refusé (413)");
  r = await post("admin", "audio/wav", wav); const body = await r.json();
  ok(r.status === 200 && body.converted && /\/uploads\/audio\/[0-9a-f-]{36}\.mp3$/.test(body.url), "WAV de 8 s accepté et converti en MP3 : " + body.path);
  ok(body.durationMs >= 4800 && body.durationMs <= 5200, `coupé à 5 s (${body.durationMs} ms)`);
  const served = await fetch(base + body.path); const bytes = Buffer.from(await served.arrayBuffer());
  ok(served.status === 200 && /immutable/.test(served.headers.get("cache-control")) && bytes.length === body.bytes, "servi avec cache immuable");
  const file = path.join(process.env.UPLOAD_DIR, "audio", path.basename(body.path));
  const info = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=channels,sample_rate,codec_name", "-of", "csv=p=0", file]).toString().trim();
  ok(info === "mp3,44100,1", `MP3 mono 44,1 kHz (${info})`);
  const lib = await core.db.collection("admin_uploads").where("kind", "==", "audio").get();
  ok(lib.size === 1, "ajouté à la bibliothèque des sons");
  server.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
