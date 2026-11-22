/* Test d'intégration de l'atelier d'animations (phases G3 et G4) : brouillon
   invalide, publication versionnée, modèle par défaut modifié, catalogue
   public, archivage, carte de pouvoir qui utilise un modèle publié
   (validée côté serveur avec le catalogue des modèles), puis attribution
   des moments du jeu.
   Usage : DATABASE_URL=… (base JETABLE). */
const path = require("path");
const dist = path.join(__dirname, "..", "dist");
const { createPgFirestore } = require(path.join(dist, "server/src/firestoreCompat/pg.js"));
const core = require(path.join(dist, "functions/src/core.js"));
const motifs = require(path.join(dist, "functions/src/animMotifAdminCommands.js"));
const cards = require(path.join(dist, "functions/src/powerCardAdminCommands.js"));
const animRegistry = require(path.join(dist, "engine/anim/registry.js"));
const defaults = require(path.join(dist, "engine/anim/defaults.js"));
const animV2 = require(path.join(dist, "functions/src/animV2AdminCommands.js"));
const v2Registry = require(path.join(dist, "engine/anim/v2/registry.js"));
const v2Defaults = require(path.join(dist, "engine/anim/v2/defaults.js"));
const key = () => "k_" + Math.random().toString(36).slice(2) + Date.now();
const as = (uid, data, isAdmin = false) => ({ auth: { uid, token: isAdmin ? { admin: true } : {} }, data: { idempotencyKey: key(), ...data } });
const assert = (cond, msg) => { if (!cond) { console.error("ÉCHEC:", msg); process.exit(1); } console.log("ok -", msg); };
const refused = async (fn, message) => { try { await fn(); return null; } catch (e) { if (e.message !== message) console.error(e); return e.message === message ? e : null; } };
const clone = (value) => JSON.parse(JSON.stringify(value));
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis (base jetable)"); process.exit(1); }

(async () => {
  core.setDbBackend(await createPgFirestore(process.env.DATABASE_URL));

  // Accès réservé aux admins
  assert(await refused(() => motifs.listAdminAnimMotifsHandler(as("joueur", {})), "ADMIN_REQUIRED"), "liste réservée aux admins");

  // Liste : les modèles par défaut sont proposés sans rien en base
  const initial = await motifs.listAdminAnimMotifsHandler(as("adm", {}, true));
  assert(initial.motifs.length >= 20 && initial.motifs.every((row) => row.issues.length === 0), "les 20 modèles par défaut sont listés et valides");

  // Nouveau modèle : brouillon invalide enregistré, publication refusée
  const id = "pluie_de_cauris";
  const motif = { ...clone(defaults.DEFAULT_MOTIFS_BY_ID.to_player), id, name: "Pluie de cauris", group: "custom", description: "Trois cartes tombent sur l'avatar." , count: 3, staggerMs: 120 };
  const saved = await motifs.saveAnimMotifDraftHandler(as("adm", { motif: { ...motif, durationMs: 9000 } }, true));
  assert(saved.issues.some((issue) => issue.path === "motif.durationMs"), "brouillon invalide enregistré avec ses erreurs");
  const err = await refused(() => motifs.publishAnimMotifHandler(as("adm", { motifId: id }, true)), "ANIM_MOTIF_INVALID");
  assert(err && err.details.issues.length > 0, "publication refusée tant que le modèle est invalide");
  assert(!animRegistry.getMotif(id), "modèle absent du registre avant publication");

  // Publication
  await motifs.saveAnimMotifDraftHandler(as("adm", { motif }, true));
  const pub = await motifs.publishAnimMotifHandler(as("adm", { motifId: id }, true));
  assert(pub.revision === 1 && animRegistry.getMotif(id).count === 3, "modèle publié (révision 1) et présent au registre");
  const catalog = (await core.db.doc("anim_catalog/current").get()).data();
  assert(catalog.published === true && catalog.motifs.some((m) => m.id === id), "catalogue public republié");
  assert((await core.db.doc(`anim_motif_versions/${id}_v1`).get()).exists, "révision immuable conservée");

  // Modèle par défaut modifié : le jeu entier prend la nouvelle version
  const classic = { ...clone(defaults.DEFAULT_MOTIFS_BY_ID.play_classic), durationMs: 420 };
  await motifs.saveAnimMotifDraftHandler(as("adm", { motif: classic }, true));
  await motifs.publishAnimMotifHandler(as("adm", { motifId: "play_classic" }, true));
  assert(animRegistry.getMotif("play_classic").durationMs === 420, "« Jouer une carte · vol actuel » remplacé par la version publiée");

  // Abandon d'un brouillon jamais publié : la fiche disparaît
  await motifs.saveAnimMotifDraftHandler(as("adm", { motif: { ...motif, id: "brouillon_jetable" } }, true));
  await motifs.discardAnimMotifDraftHandler(as("adm", { motifId: "brouillon_jetable" }, true));
  assert(!(await core.db.doc("anim_motifs/brouillon_jetable").get()).exists, "brouillon jamais publié supprimé");

  // Carte de pouvoir qui utilise le modèle publié : acceptée par le serveur
  await cards.seedPowerCardsHandler(as("adm", {}, true));
  const card = (await cards.getAdminPowerCardHandler(as("adm", { cardId: "vent_nord" }, true))).working;
  card.script.steps[0].choreo = { tracks: [{ id: "pluie", kind: "motif", startMs: 0, durationMs: 700, motifId: id, cards: "ghost", mode: "display" }] };
  await cards.savePowerCardDraftHandler(as("adm", { card }, true));
  const pubCard = await cards.publishPowerCardHandler(as("adm", { cardId: "vent_nord" }, true));
  const inCatalog = (await core.db.doc("power_catalog/current").get()).data().cards.find((c) => c.def.id === "vent_nord");
  assert(pubCard.revision >= 2 && inCatalog.script.steps[0].choreo.tracks[0].motifId === id, "carte publiée avec une piste « modèle » (modèle publié reconnu)");
  const unknown = clone(card);
  unknown.script.steps[0].choreo.tracks[0].motifId = "modele_inexistant";
  await cards.savePowerCardDraftHandler(as("adm", { card: unknown }, true));
  const badCard = await refused(() => cards.publishPowerCardHandler(as("adm", { cardId: "vent_nord" }, true)), "POWER_CARD_INVALID");
  assert(badCard && badCard.details.issues.some((issue) => issue.path.endsWith("choreo.tracks.0.motifId")), "carte refusée si le modèle n'existe pas");

  // Archivage : retiré de la bibliothèque, toujours jouable
  const archived = await motifs.setAnimMotifArchivedHandler(as("adm", { motifId: id, archived: true }, true));
  const afterArchive = (await core.db.doc("anim_catalog/current").get()).data();
  assert(archived.archived && afterArchive.archivedIds.includes(id) && afterArchive.motifs.some((m) => m.id === id), "archivé : signalé au catalogue mais toujours présent");
  assert(animRegistry.isMotifArchived(id) && animRegistry.getMotif(id) && !animRegistry.listMotifs().some((m) => m.id === id), "registre : hors bibliothèque, toujours jouable");

  // Moments du jeu (phase G4) : attribution réservée aux admins, validée, diffusée par le catalogue
  assert(await refused(() => motifs.setGameMomentsHandler(as("joueur", { moments: {} })), "ADMIN_REQUIRED"), "attribution des moments réservée aux admins");
  const incompatible = await refused(() => motifs.setGameMomentsHandler(as("adm", { moments: { play: "draw" } }, true)), "GAME_MOMENTS_INVALID");
  assert(incompatible && incompatible.details.issues[0].path === "moments.play", "modèle qui ne part pas de la main refusé (chemin du moment)");
  await motifs.saveAnimMotifDraftHandler(as("adm", { motif: { ...classic, id: "jouer_brouillon", name: "Jouer · brouillon", group: "custom" } }, true));
  const notPublished = await refused(() => motifs.setGameMomentsHandler(as("adm", { moments: { play: "jouer_brouillon" } }, true)), "GAME_MOMENTS_INVALID");
  assert(notPublished, "brouillon jamais publié refusé (les joueurs ne l'ont pas)");
  const set = await motifs.setGameMomentsHandler(as("adm", { moments: { play: "play_classic", trickWin: "trick_win_glow", trickCollect: "trick_end_settle" } }, true));
  assert(set.moments.play === "play_classic" && animRegistry.getMomentMotif("play").durationMs === 420, "attribution enregistrée : « Carte jouée » joue la version publiée");
  const withMoments = (await core.db.doc("anim_catalog/current").get()).data();
  assert(withMoments.moments.trickCollect === "trick_end_settle" && withMoments.motifs.some((m) => m.id === id), "catalogue public republié avec les moments");
  assert((await motifs.listAdminAnimMotifsHandler(as("adm", {}, true))).moments.trickWin === "trick_win_glow", "la liste admin renvoie l'attribution");

  // Une nouvelle version qui ne convient plus à son moment est refusée
  await motifs.saveAnimMotifDraftHandler(as("adm", { motif: { ...classic, durationMs: 1200 } }, true));
  const conflict = await refused(() => motifs.publishAnimMotifHandler(as("adm", { motifId: "play_classic" }, true)), "ANIM_MOTIF_MOMENT_CONFLICT");
  assert(conflict && conflict.details.issues[0].path === "moments.play", "version trop longue pour « Carte jouée » refusée");
  assert(animRegistry.getMotif("play_classic").durationMs === 420, "la version publiée reste en place");
  await motifs.discardAnimMotifDraftHandler(as("adm", { motifId: "play_classic" }, true));

  // Animation V2 (étape V2-3) : références « v2:<id> », mêlées aux modèles V1
  const v2Set = await motifs.setGameMomentsHandler(as("adm", { moments: { play: "v2:v2_rapide", deal: "v2:v2_arc", trickWin: "trick_win_glow" } }, true));
  assert(v2Set.moments.play === "v2:v2_rapide" && animRegistry.getMomentAnimV2("play").id === "v2_rapide" && animRegistry.getMomentMotif("play") === null, "« Carte jouée » en V2 : enregistrée, le registre la joue en V2");
  assert(animRegistry.getMomentAnimV2("deal").motion.durationMs > 0 && animRegistry.getMomentMotif("trickWin").id === "trick_win_glow", "V1 et V2 mêlées dans la même attribution");
  const v2Catalog = (await core.db.doc("anim_catalog/current").get()).data();
  assert(v2Catalog.moments.play === "v2:v2_rapide" && v2Catalog.moments.deal === "v2:v2_arc", "catalogue public republié avec les références V2");
  const v2OnPlace = await refused(() => motifs.setGameMomentsHandler(as("adm", { moments: { trickWin: "v2:v2_fluide" } }, true)), "GAME_MOMENTS_INVALID");
  assert(v2OnPlace && v2OnPlace.details.issues[0].path === "moments.trickWin", "V2 refusée sur un moment sur place (pli gagné)");
  const v2Unknown = await refused(() => motifs.setGameMomentsHandler(as("adm", { moments: { play: "v2:inexistant" } }, true)), "GAME_MOMENTS_INVALID");
  assert(v2Unknown && v2Unknown.details.issues[0].path === "moments.play", "modèle V2 inconnu refusé");
  assert(animRegistry.getMomentAnimV2("play").id === "v2_rapide", "une attribution refusée ne change rien");
  const legacy = await motifs.setGameMomentsHandler(as("adm", { moments: { play: "play_classic" } }, true));
  assert(legacy.moments.play === "play_classic" && animRegistry.getMomentAnimV2("play") === null && animRegistry.getMomentMotif("play").id === "play_classic", "retour à la V1 (ancien format) sans rechargement");

  // Atelier V2 (étape V2-4) : brouillon, publication versionnée, catalogue, moments, archivage
  assert(await refused(() => animV2.listAdminAnimsV2Handler(as("joueur", {})), "ADMIN_REQUIRED"), "atelier V2 réservé aux admins");
  const v2List = await animV2.listAdminAnimsV2Handler(as("adm", {}, true));
  assert(v2List.models.length === 3 && v2List.models.every((row) => row.isDefault && row.issues.length === 0), "les 3 modèles V2 par défaut sont listés et valides");
  const maison = { ...clone(v2Defaults.DEFAULT_ANIMS_V2_BY_ID.v2_fluide), id: "v2_maison", name: "Maison" };
  const v2Bad = await animV2.saveAnimV2DraftHandler(as("adm", { model: { ...maison, motion: { ...maison.motion, curve: 3 } } }, true));
  assert(v2Bad.issues.some((issue) => issue.path === "anim.motion.curve"), "brouillon V2 invalide enregistré avec ses erreurs");
  assert(await refused(() => animV2.publishAnimV2Handler(as("adm", { modelId: "v2_maison" }, true)), "ANIM_V2_INVALID"), "publication V2 refusée tant que le modèle est invalide");
  const v2Unpublished = await refused(() => motifs.setGameMomentsHandler(as("adm", { moments: { play: "v2:v2_maison" } }, true)), "GAME_MOMENTS_INVALID");
  assert(v2Unpublished, "brouillon V2 jamais publié refusé dans les moments (les joueurs ne l'ont pas)");
  await animV2.saveAnimV2DraftHandler(as("adm", { model: maison }, true));
  const v2Pub = await animV2.publishAnimV2Handler(as("adm", { modelId: "v2_maison" }, true));
  assert(v2Pub.revision === 1 && v2Registry.getAnimV2("v2_maison").name === "Maison", "modèle V2 publié (révision 1) et présent au registre");
  const v2Cat = (await core.db.doc("anim_catalog/current").get()).data();
  assert(v2Cat.animsV2.some((model) => model.id === "v2_maison") && v2Cat.motifs.some((m) => m.id === id), "catalogue public : modèles V2 à côté des modèles V1");
  assert((await core.db.doc("anim_v2_versions/v2_maison_v1").get()).exists, "révision V2 immuable conservée");
  await motifs.setGameMomentsHandler(as("adm", { moments: { play: "v2:v2_maison" } }, true));
  assert(animRegistry.getMomentAnimV2("play").name === "Maison", "modèle V2 publié attribuable à « Carte jouée »");
  await animV2.saveAnimV2DraftHandler(as("adm", { model: { ...maison, motion: { ...maison.motion, durationMs: 1200 } } }, true));
  const v2Conflict = await refused(() => animV2.publishAnimV2Handler(as("adm", { modelId: "v2_maison" }, true)), "ANIM_V2_MOMENT_CONFLICT");
  assert(v2Conflict && v2Conflict.details.issues[0].path === "moments.play", "version V2 trop longue pour « Carte jouée » refusée");
  assert(v2Registry.getAnimV2("v2_maison").motion.durationMs === 750, "la version V2 publiée reste en place");
  await animV2.discardAnimV2DraftHandler(as("adm", { modelId: "v2_maison" }, true));
  const v2Archived = await animV2.setAnimV2ArchivedHandler(as("adm", { modelId: "v2_maison", archived: true }, true));
  assert(v2Archived.archived && v2Registry.isAnimV2Archived("v2_maison") && v2Registry.getAnimV2("v2_maison") && animRegistry.getMomentAnimV2("play").name === "Maison", "V2 archivé : hors bibliothèque, toujours joué par son moment");
  const v2Again = await animV2.listAdminAnimsV2Handler(as("adm", {}, true));
  assert(v2Again.models.some((row) => row.id === "v2_maison" && row.published && row.archived && !row.hasDraft) && v2Again.moments.play === "v2:v2_maison", "liste V2 : statut et attribution");
  // Carte de pouvoir animée en V2 (V2-5, version simplifiée) : un modèle par carte
  const v2Card = (await cards.getAdminPowerCardHandler(as("adm", { cardId: "troc_cible" }, true))).working;
  await cards.savePowerCardDraftHandler(as("adm", { card: { ...v2Card, def: { ...v2Card.def, animV2: "v2_inexistant" } } }, true));
  const v2CardBad = await refused(() => cards.publishPowerCardHandler(as("adm", { cardId: "troc_cible" }, true)), "POWER_CARD_INVALID");
  assert(v2CardBad && v2CardBad.details.issues.some((issue) => issue.path === "def.animV2"), "carte refusée si son modèle V2 n'est pas publié");
  await cards.savePowerCardDraftHandler(as("adm", { card: { ...v2Card, def: { ...v2Card.def, animV2: "v2_maison" } } }, true));
  await cards.publishPowerCardHandler(as("adm", { cardId: "troc_cible" }, true));
  const v2InCatalog = (await core.db.doc("power_catalog/current").get()).data().cards.find((c) => c.def.id === "troc_cible");
  assert(v2InCatalog && v2InCatalog.def.animV2 === "v2_maison", "carte publiée avec son modèle V2 (même archivé : toujours jouable)");

  // Modèle V2 par défaut modifié : le jeu entier prend la nouvelle version
  await animV2.saveAnimV2DraftHandler(as("adm", { model: { ...clone(v2Defaults.DEFAULT_ANIMS_V2_BY_ID.v2_rapide), motion: { ...v2Defaults.DEFAULT_ANIMS_V2_BY_ID.v2_rapide.motion, durationMs: 380 } } }, true));
  await animV2.publishAnimV2Handler(as("adm", { modelId: "v2_rapide" }, true));
  assert(v2Registry.getAnimV2("v2_rapide").motion.durationMs === 380, "modèle V2 du jeu modifié par publication");

  // Retour à l'animation actuelle du jeu
  const cleared = await motifs.setGameMomentsHandler(as("adm", { moments: {} }, true));
  assert(Object.keys(cleared.moments).length === 0 && animRegistry.getMomentMotif("play") === null && animRegistry.getMomentAnimV2("play") === null, "attribution vidée : animation actuelle du jeu partout");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
