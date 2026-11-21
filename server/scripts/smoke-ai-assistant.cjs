/* Test d'intégration de l'assistant IA de la console admin contre un vrai
   Postgres, avec le fournisseur de simulation (aucune clé, aucun coût) :
   accès admin, conversations, outils (lecture, brouillons, propositions),
   confirmation par l'admin, relance après une erreur de fournisseur.
   Usage : npm --prefix server run build && DATABASE_URL=… node server/scripts/smoke-ai-assistant.cjs
   ⚠️ Écrit dans la base visée : utiliser une base JETABLE. */
const path = require("path");
process.env.AI_SIMULATION = "1";
for (const key of ["DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GLM_API_KEY", "MIMO_API_KEY", "META_API_KEY", "FREELLM_API_KEY", "FREELLM_BASE_URL", "AI_COMPAT_BASE_URL"]) delete process.env[key];
const dist = path.join(__dirname, "..", "dist");
const { createPgFirestore } = require(path.join(dist, "server/src/firestoreCompat/pg.js"));
const core = require(path.join(dist, "functions/src/core.js"));
const ai = require(path.join(dist, "server/src/ai/commands.js"));
const tools = require(path.join(dist, "server/src/ai/tools.js"));
const cards = require(path.join(dist, "functions/src/powerCardAdminCommands.js"));
const registry = require(path.join(dist, "engine/anim/registry.js"));
const key = () => "k_" + Math.random().toString(36).slice(2) + Date.now();
const as = (uid, data, isAdmin = false) => ({ auth: { uid, token: isAdmin ? { admin: true } : {} }, data: { idempotencyKey: key(), ...data } });
const assert = (cond, msg) => { if (!cond) { console.error("ÉCHEC:", msg); process.exit(1); } console.log("ok -", msg); };
const refused = async (fn, message) => { try { await fn(); return null; } catch (e) { if (e.message !== message) console.error(e); return e.message === message ? e : null; } };
const SIM = { provider: "simulation", model: "simulation", thinking: "default", temperature: null };
const ctx = { adminUid: "adm", conversationId: "test" };
const call = (name, input, module = "all") => tools.executeTool({ id: `t_${name}`, name, input }, ctx, module);
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis (base jetable)"); process.exit(1); }

async function drive(view) {
  let current = view;
  for (let i = 0; i < 8 && current.pending; i += 1) current = await ai.aiAssistantContinueHandler(as("adm", { conversationId: current.id, settings: SIM }, true));
  return current;
}

(async () => {
  core.setDbBackend(await createPgFirestore(process.env.DATABASE_URL));

  // Accès et configuration
  assert(await refused(() => ai.aiAssistantConfigHandler(as("joueur", {})), "ADMIN_REQUIRED"), "configuration réservée aux admins");
  const config = await ai.aiAssistantConfigHandler(as("adm", {}, true));
  const ids = config.providers.map((p) => p.id).join(",");
  assert(ids === "deepseek,claude,openai,gemini,glm,mimo,meta,freellm,compat,simulation", `10 fournisseurs proposés (${ids})`);
  const deepseek = config.providers.find((p) => p.id === "deepseek");
  assert(!deepseek.enabled && /DEEPSEEK_API_KEY/.test(deepseek.reason) && deepseek.models.includes("deepseek-v4-pro"), "DeepSeek désactivé sans clé, avec sa liste de repli");
  assert(ai.readSettings({ ...SIM, technical: true }).technical === true && ai.readSettings(SIM).technical === false, "mode d'explication : simple par défaut, technique sur demande");
  assert(config.providers.find((p) => p.id === "simulation").enabled && config.providers.find((p) => p.id === "claude").capabilities.temperature === "never", "simulation active ; Claude sans température");
  assert(await refused(() => ai.aiAssistantSendHandler(as("adm", { module: "animations", text: "x", settings: { ...SIM, provider: "inconnu" } }, true)), "INVALID_PROVIDER"), "fournisseur inconnu refusé");

  // Conversation en lecture seule : un appel d'outil, puis la réponse
  let view = await ai.aiAssistantSendHandler(as("adm", { module: "animations", text: "Liste les modèles", settings: SIM }, true));
  assert(view.pending && view.messages.map((m) => m.role).join(",") === "user,assistant,tool" && view.messages[2].results[0].ok, "premier envoi : appel d'outil exécuté, suite en attente");
  assert(!("raw" in view.messages[1]), "la console ne reçoit pas les réponses brutes du fournisseur");
  view = await drive(view);
  const readOnly = view;
  assert(!view.pending && /Simulation terminée/.test(view.messages.at(-1).text), "la suite produit la réponse finale");

  // Brouillon puis proposition, confirmée par l'admin
  view = await drive(await ai.aiAssistantSendHandler(as("adm", { module: "animations", text: "Crée un brouillon d'essai", settings: SIM }, true)));
  const results = view.messages.filter((m) => m.role === "tool").flatMap((m) => m.results);
  assert(results.map((r) => r.name).join(",") === "list_animation_models,save_animation_model_draft,propose_publish_animation_model", "scénario : lecture, brouillon, proposition");
  const motifDoc = (await core.db.doc("anim_motifs/simulation_essai").get()).data();
  assert(motifDoc && motifDoc.draft && motifDoc.published === false, "brouillon écrit, rien de publié");
  const audit = (await core.db.collection("admin_audit").get()).docs.map((d) => d.data());
  assert(audit.some((a) => a.action === "assistant_tool_write" && a.target === "simulation_essai" && a.uid === "adm") && audit.some((a) => a.action === "anim_motif_save_draft" && a.uid === "adm"), "écriture tracée au nom de l'admin (et « via l'assistant »)");
  const proposal = results.find((r) => r.proposal).proposal;
  assert(proposal.status === "pending" && proposal.kind === "publish_motif", "proposition de publication en attente");
  assert(await refused(() => ai.aiAssistantResolveHandler(as("adm2", { conversationId: view.id, proposalId: proposal.id, outcome: "confirmed" }, true)), "CONVERSATION_NOT_FOUND"), "un autre admin ne voit pas la conversation");
  view = await ai.aiAssistantResolveHandler(as("adm", { conversationId: view.id, proposalId: proposal.id, outcome: "confirmed" }, true));
  const published = (await core.db.doc("anim_motifs/simulation_essai").get()).data();
  assert(published.published === true && published.revision === 1 && registry.getMotif("simulation_essai"), "confirmée : modèle publié (révision 1), présent au registre");
  assert(view.messages.at(-1).note && /publié \(révision 1\)/.test(view.messages.at(-1).text), "la confirmation est notée dans la conversation");
  assert(await refused(() => ai.aiAssistantResolveHandler(as("adm", { conversationId: view.id, proposalId: proposal.id, outcome: "confirmed" }, true)), "PROPOSAL_ALREADY_RESOLVED"), "une proposition ne s'exécute qu'une fois");

  // Historique par admin
  const listed = await ai.aiAssistantConversationsHandler(as("adm", {}, true));
  assert(listed.conversations.length === 2 && (await ai.aiAssistantConversationsHandler(as("adm2", {}, true))).conversations.length === 0, "historique rangé par admin");

  // Erreur de fournisseur : le message est gardé, on peut relancer
  assert(await refused(() => ai.aiAssistantSendHandler(as("adm", { conversationId: readOnly.id, text: "Et les cartes ?", settings: { ...SIM, provider: "deepseek", model: "deepseek-v4-pro" } }, true)), "AI_PROVIDER_ERROR"), "fournisseur sans clé : erreur explicite");
  view = await ai.aiAssistantConversationHandler(as("adm", { conversationId: readOnly.id }, true));
  assert(view.retryable && view.messages.at(-1).text === "Et les cartes ?", "message gardé, relance possible");
  view = await drive(await ai.aiAssistantContinueHandler(as("adm", { conversationId: readOnly.id, settings: SIM }, true)));
  assert(!view.retryable && /Simulation terminée/.test(view.messages.at(-1).text), "relance avec un autre fournisseur");

  // Outils : référence, garde-fous
  for (const [topic, marker] of [["jeu", "Njambo"], ["admin", "Console admin"], ["modeles", "AnimMotif"], ["moments", "Moments du jeu"], ["styles", "AnimStyle"], ["cartes", "PowerModule"], ["choregraphies", "ChoreoTrack"]]) {
    const ref = await call("get_reference", { topic });
    assert(ref.ok && JSON.parse(ref.content).text.includes(marker), `référence « ${topic} » lue dans le code`);
  }
  assert(!(await call("get_animation_model", { id: "inexistant" })).ok, "modèle inconnu : erreur lisible");
  assert(!(await call("list_power_cards", {}, "animations")).ok, "outil hors module refusé");
  assert(!(await tools.executeTool({ id: "x", name: "get_reference", input: {}, invalidInput: "{oops" }, ctx, "all")).ok, "arguments illisibles : erreur lisible");
  const validated = await call("validate_animation_model", { model: { ...registry.getMotif("play_classic"), id: "essai_x", durationMs: 99999 } });
  assert(validated.ok && JSON.parse(validated.content).valid === false, "validation à blanc d'un modèle invalide");

  // Cartes de pouvoir : lecture, brouillon, proposition, confirmation
  await cards.seedPowerCardsHandler(as("adm", {}, true));
  const cardList = JSON.parse((await call("list_power_cards", {}, "powers")).content).cards;
  assert(cardList.length > 0 && cardList.some((c) => c.id === "vent_nord"), `catalogue des cartes lu (${cardList.length} cartes)`);
  const card = JSON.parse((await call("get_power_card", { id: "vent_nord" }, "powers")).content).working;
  assert(JSON.parse((await call("validate_power_card", { card }, "powers")).content).valid, "carte existante valide");
  const saved = await call("save_power_card_draft", { card: { ...card, def: { ...card.def, name: "Vent du Nord (assistant)" } } }, "powers");
  assert(saved.ok && saved.draft.id === "vent_nord", "brouillon de carte écrit");
  const cardProposal = await call("propose_publish_power_card", { id: "vent_nord", reason: "test" }, "powers");
  assert(cardProposal.ok && cardProposal.proposal.kind === "publish_power_card", "proposition de publication de carte");
  assert(/publiée \(révision 2\)/.test(await tools.executeProposal(cardProposal.proposal, ctx)), "confirmée : carte publiée (révision 2)");

  // Moments : attribution validée comme par le serveur
  assert(!(await call("propose_game_moments", { moments: { play: "draw" }, reason: "x" }, "animations")).ok, "attribution incompatible refusée");
  const momentsProposal = await call("propose_game_moments", { moments: { play: "play_classic" }, reason: "x" }, "animations");
  assert(momentsProposal.ok && momentsProposal.proposal.kind === "set_moments", "attribution valide proposée");
  await tools.executeProposal(momentsProposal.proposal, ctx);
  assert(registry.momentMap().play === "play_classic", "confirmée : moment attribué");

  // Conversation ouverte depuis la page d'un modèle : contexte gardé, copie de travail jointe pour le modèle
  view = await drive(await ai.aiAssistantSendHandler(as("adm", { context: { kind: "animation_model", id: "play_classic", label: "Jouer une carte" }, working: { id: "play_classic", durationMs: 420 }, text: "Explique ce modèle", settings: SIM }, true)));
  assert(view.context && view.context.id === "play_classic" && view.module === "all" && !view.pending, "page d'origine gardée (module animations + cartes), réponse complète");
  const stored = (await core.db.doc(`ai_conversations/${view.id}`).get()).data();
  assert(stored.messages[0].text === "Explique ce modèle" && /PAS ENCORE ENREGISTRÉES/.test(stored.messages[0].attachment) && /"durationMs":420/.test(stored.messages[0].attachment), "copie de travail jointe au message, texte de l'admin inchangé");
  assert((await ai.aiAssistantConversationsHandler(as("adm", {}, true))).conversations.some((item) => item.context && item.context.id === "play_classic"), "historique : page d'origine visible");
  assert(await refused(() => ai.aiAssistantSendHandler(as("adm", { context: { kind: "power_card" }, text: "x", settings: SIM }, true)), "INVALID_CONTEXT"), "carte sans identifiant refusée");
  assert(await refused(() => ai.aiAssistantSendHandler(as("adm", { module: "animations", working: { a: 1 }, text: "x", settings: SIM }, true)), "INVALID_WORKING_COPY"), "copie de travail sans élément ouvert refusée");

  // Usages d'un modèle : moments du jeu et chorégraphies des cartes (brouillon compris)
  await core.db.doc("power_cards/essai_usage").set({ draft: { def: { name: "Essai d'usage" }, script: { steps: [{ choreo: { tracks: [{ kind: "motif", motifId: "play_classic", id: "t1" }] } }] } } });
  const usage = await call("find_animation_usage", { id: "play_classic" }, "powers");
  const found = JSON.parse(usage.content);
  assert(usage.ok && found.moments.some((item) => item.moment === "play") && found.cards.some((item) => item.id === "essai_usage" && item.version === "brouillon" && item.tracks[0] === "script.steps.0.choreo.tracks.0"), "usages : moment « carte jouée » et piste de la carte en brouillon");
  assert(!(await call("find_animation_usage", { id: "inexistant" })).ok, "usages d'un modèle inconnu : erreur lisible");
  await core.db.doc("power_cards/essai_usage").delete();

  // Suppression
  await ai.aiAssistantDeleteHandler(as("adm", { conversationId: readOnly.id }, true));
  assert(!(await core.db.doc(`ai_conversations/${readOnly.id}`).get()).exists, "conversation supprimée");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
