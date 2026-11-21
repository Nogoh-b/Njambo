/* Test d'intégration des cosmétiques contre un vrai Postgres.
   Usage : npm --prefix server run build && DATABASE_URL=… node server/scripts/smoke-cosmetics.cjs
   ⚠️ Écrit dans la base visée : utiliser une base JETABLE. */
const path = require("path");
const dist = path.join(__dirname, "..", "dist");
const { createPgFirestore } = require(path.join(dist, "server/src/firestoreCompat/pg.js"));
const core = require(path.join(dist, "functions/src/core.js"));
const cos = require(path.join(dist, "functions/src/cosmeticCommands.js"));
const match = require(path.join(dist, "functions/src/matchCommands.js"));
const key = () => "k_" + Math.random().toString(36).slice(2) + Date.now();
const as = (uid, data, isAdmin = false) => ({ auth: { uid, token: isAdmin ? { admin: true } : {} }, data: { idempotencyKey: key(), ...data } });
const assert = (cond, msg) => { if (!cond) { console.error("ÉCHEC:", msg); process.exit(1); } console.log("ok -", msg); };
const refused = async (fn, message) => { try { await fn(); return false; } catch (e) { if (e.message !== message) console.error(e); return e.message === message; } };
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis (base jetable)"); process.exit(1); }

(async () => {
  core.setDbBackend(await createPgFirestore(process.env.DATABASE_URL));
  const uid = "joueurCosmetique000001";
  await core.db.doc(`players/${uid}`).set({ uid, name: "Ngo Bassa", emoji: "🌺" });
  await core.db.doc(`economies/${uid}`).set({ nkap: 50000, cauris: 0 });
  await core.db.doc(`inventories/${uid}`).set({ tickets: { bronze: 0 } });

  assert(await refused(() => cos.saveCosmeticHandler(as("adm", { cosmetic: { id: "cadre_or", type: "avatar_frame", name: "Cadre d'or", rarity: "epique", published: true } }, true)), "COSMETIC_INVALID"), "cadre sans image refusé");
  await cos.saveCosmeticHandler(as("adm", { cosmetic: { id: "cadre_or", type: "avatar_frame", name: "Cadre d'or", rarity: "epique", imageUrl: "/uploads/cosmetic/cadre.webp", published: true } }, true));
  await cos.saveCosmeticHandler(as("adm", { cosmetic: { id: "titre_legende", type: "title", name: "Légende du Mboa", rarity: "legendaire", published: true } }, true));
  await cos.saveCosmeticHandler(as("adm", { cosmetic: { id: "dos_ndop", type: "card_back", name: "Dos Ndop", rarity: "rare", imageUrl: "/uploads/cosmetic/ndop.webp", published: false } }, true));
  const list = await cos.listCosmeticsHandler(as("adm", {}, true));
  assert(list.cosmetics.length === 3, "catalogue admin : 3 cosmétiques");
  // (le style d'animation est ajouté plus bas : le catalogue en compte alors 4)
  assert(await refused(() => cos.saveCosmeticHandler(as("adm", { cosmetic: { id: "cadre_or", type: "badge", name: "Badge or", rarity: "rare", imageUrl: "/a.webp", published: true } }, true)), "COSMETIC_TYPE_LOCKED"), "type d'un cosmétique existant verrouillé");

  // Style d'animation (phase G5) : liste blanche, sans image, réglages enregistrés
  const braise = { id: "style_braise", type: "anim_style", name: "Braise", rarity: "epique", published: true, style: { trail: "sparks", tone: "pink", impact: "burst" } };
  assert(await refused(() => cos.saveCosmeticHandler(as("adm", { cosmetic: { ...braise, style: { ...braise.style, durationMs: 120 } } }, true)), "COSMETIC_INVALID"), "style qui touche à la durée refusé");
  assert(await refused(() => cos.saveCosmeticHandler(as("adm", { cosmetic: { id: "dos_feu", type: "card_back", name: "Dos feu", rarity: "rare", imageUrl: "/a.webp", published: true, style: { trail: "light" } } }, true)), "COSMETIC_INVALID"), "réglages d'animation refusés sur un dos de carte");
  await cos.saveCosmeticHandler(as("adm", { cosmetic: braise }, true));
  const savedStyle = (await core.db.doc("cosmetics/style_braise").get()).data();
  assert(savedStyle.type === "anim_style" && savedStyle.style.trail === "sparks" && !savedStyle.imageUrl, "style d'animation enregistré sans image");

  // Gain via applyReward (même code que règlement de table, classement, saisons)
  let economy = core.economyFrom((await core.db.doc(`economies/${uid}`).get()).data(), Date.now());
  let inventory = (await core.db.doc(`inventories/${uid}`).get()).data();
  for (const reward of [{ type: "cosmetic", cosmeticId: "cadre_or", rarity: "epique" }, { type: "cosmetic", cosmeticId: "titre_legende", rarity: "legendaire" }, { type: "cosmetic", cosmeticId: "cadre_or", rarity: "epique" }]) {
    ({ economy, inventory } = core.applyReward(economy, inventory, reward, Date.now()));
  }
  assert(inventory.cosmetics.join() === "cadre_or,titre_legende", "cosmétiques ajoutés à l'inventaire");
  assert(economy.cauris === 60, "doublon épique converti en 60 cauris");
  ({ economy, inventory } = core.applyReward(economy, inventory, { type: "cosmetic", cosmeticId: "style_braise", rarity: "epique" }, Date.now()));
  assert(inventory.cosmetics.includes("style_braise"), "style d'animation gagné comme un autre cosmétique");
  await core.db.doc(`inventories/${uid}`).set(inventory);

  assert(await refused(() => cos.equipCosmeticHandler(as(uid, { slot: "cardBack", cosmeticId: "dos_ndop" })), "COSMETIC_NOT_OWNED"), "impossible d'équiper un cosmétique non possédé");
  assert(await refused(() => cos.equipCosmeticHandler(as(uid, { slot: "badge", cosmeticId: "cadre_or" })), "COSMETIC_WRONG_SLOT"), "mauvais emplacement refusé");
  await cos.equipCosmeticHandler(as(uid, { slot: "avatarFrame", cosmeticId: "cadre_or" }));
  await cos.equipCosmeticHandler(as(uid, { slot: "title", cosmeticId: "titre_legende" }));
  assert(await refused(() => cos.equipCosmeticHandler(as(uid, { slot: "title", cosmeticId: "style_braise" })), "COSMETIC_WRONG_SLOT"), "un style ne va que dans l'emplacement « style »");
  await cos.equipCosmeticHandler(as(uid, { slot: "animStyle", cosmeticId: "style_braise" }));
  const coll = await cos.getCosmeticCollectionHandler(as(uid, {}));
  assert(coll.owned.length === 3 && coll.equipped.avatarFrame.imageUrl === "/uploads/cosmetic/cadre.webp" && coll.equipped.title.name === "Légende du Mboa", "collection et équipement");
  assert(JSON.stringify(coll.equipped.animStyle.style) === JSON.stringify(braise.style), "style équipé avec ses réglages");

  // Visible à la table par les autres
  const started = await match.startMatchHandler(as(uid, { mode: "bot", botCount: 1, stake: 100 }));
  const me = started.match.participants.find((p) => p.uid === uid);
  assert(me.cosmetics && me.cosmetics.avatarFrame.id === "cadre_or" && me.cosmetics.title.name === "Légende du Mboa", "cosmétiques copiés sur le participant (vus par tous)");
  assert(me.cosmetics.animStyle && me.cosmetics.animStyle.style.tone === "pink", "style d'animation copié sur le participant (vu par tous à la table)");

  await cos.equipCosmeticHandler(as(uid, { slot: "title", cosmeticId: null }));
  const player = (await core.db.doc(`players/${uid}`).get()).data();
  assert(!player.equippedCosmetics.title && player.equippedCosmetics.avatarFrame, "retirer un titre garde le cadre");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
