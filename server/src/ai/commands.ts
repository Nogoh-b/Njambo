/* ═══════════════ Assistant IA : commandes de la console admin ═══════════════
   Conversations rangées par admin dans ai_conversations/{id} (jamais lisibles
   depuis le client : le canal temps réel et les règles refusent cette
   collection). Une requête = UN appel au modèle : si l'assistant utilise des
   outils, le navigateur enchaîne aiAssistantContinue, ce qui garde chaque
   requête courte (pas de délai dépassé côté proxy) et montre la progression.
   Les propositions (publier, attribuer des moments) ne s'exécutent qu'ici,
   sur confirmation de l'admin, avec ses droits. */

import { randomUUID } from "node:crypto";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { asObject, db, requireAdmin, requiredString } from "../../../functions/src/core";
import { CAPABILITIES, adapterFor, modelsFor, providerConfigs } from "./providers";
import { CONTEXT_MODULE, readContext, workingAttachment } from "./context";
import { systemPrompt } from "./reference";
import { executeProposal, executeTool, toolSpecs } from "./tools";
import { AI_MODULES, AI_PROVIDERS, AiProviderError, type AiContext, type AiMessage, type AiModule, type AiProviderId, type AiSettings, type AiUsage, type ThinkingLevel } from "./types";

const COLLECTION = "ai_conversations";
/** Étapes d'outils au plus par message de l'admin (garde-fou de coût). */
export const MAX_TOOL_ROUNDS = 12;
const MAX_MESSAGES = 400;
const MAX_TEXT = 8000;
const MODEL_ID = /^[\w.:@/-]{1,120}$/;

export interface Conversation {
  id: string;
  uid: string;
  title: string;
  module: AiModule;
  /** Page de la console d'où la conversation est partie (absent : section Assistant IA). */
  context?: AiContext;
  settings: AiSettings;
  messages: AiMessage[];
  /** Étapes d'outils depuis le dernier message de l'admin. */
  rounds: number;
  usage: AiUsage;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export function readSettings(raw: unknown): AiSettings {
  const source = asObject(raw);
  const provider = source.provider as AiProviderId;
  if (!AI_PROVIDERS.includes(provider)) throw new HttpsError("invalid-argument", "INVALID_PROVIDER");
  const model = typeof source.model === "string" ? source.model.trim() : "";
  if (!MODEL_ID.test(model)) throw new HttpsError("invalid-argument", "INVALID_MODEL");
  const caps = CAPABILITIES[provider];
  const thinking = caps.thinking.includes(source.thinking as ThinkingLevel) ? source.thinking as ThinkingLevel : caps.defaultThinking;
  const value = typeof source.temperature === "number" && Number.isFinite(source.temperature) ? source.temperature : null;
  const temperature = caps.temperature === "never" || value === null ? null : Math.round(Math.max(0, Math.min(caps.temperatureMax, value)) * 100) / 100;
  return { provider, model, thinking, temperature, technical: source.technical === true };
}

/** Ce que voit la console : sans les réponses brutes des fournisseurs. */
function clientMessage(message: AiMessage) {
  if (message.role === "assistant") {
    const view: Record<string, unknown> = { ...message };
    delete view.raw;
    return view;
  }
  if (message.role === "tool") {
    return { ...message, results: message.results.map((result) => ({ ...result, content: result.content.length > 12_000 ? `${result.content.slice(0, 12_000)}…` : result.content })) };
  }
  return message;
}

const lastRole = (conversation: Conversation) => conversation.messages[conversation.messages.length - 1]?.role;

export function clientView(conversation: Conversation) {
  const last = lastRole(conversation);
  return {
    id: conversation.id, title: conversation.title, module: conversation.module, context: conversation.context ?? null, settings: conversation.settings,
    messages: conversation.messages.map(clientMessage), rounds: conversation.rounds, usage: conversation.usage,
    createdAt: conversation.createdAt, updatedAt: conversation.updatedAt,
    /** L'assistant attend la suite (résultats d'outils à lire). */
    pending: last === "tool" && conversation.rounds < MAX_TOOL_ROUNDS,
    /** Dernier message de l'admin resté sans réponse (erreur du fournisseur) : on peut relancer. */
    retryable: last === "user",
    limitReached: last === "tool" && conversation.rounds >= MAX_TOOL_ROUNDS,
  };
}

async function load(uid: string, id: string): Promise<Conversation> {
  const snap = await db.doc(`${COLLECTION}/${id}`).get();
  if (!snap.exists || snap.get("uid") !== uid) throw new HttpsError("not-found", "CONVERSATION_NOT_FOUND");
  return { ...(snap.data() as Omit<Conversation, "id">), id };
}

/** Écrit la conversation si personne ne l'a modifiée entre-temps (deux onglets, double clic). */
async function save(conversation: Conversation, expectedVersion: number) {
  const ref = db.doc(`${COLLECTION}/${conversation.id}`);
  const clean = JSON.parse(JSON.stringify({ ...conversation, version: expectedVersion + 1 })) as Record<string, unknown>;
  delete clean.id;
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (Number(snap.exists ? snap.get("version") ?? 0 : 0) !== expectedVersion) throw new HttpsError("aborted", "CONVERSATION_BUSY");
    transaction.set(ref, clean, { merge: false });
  });
  conversation.version = expectedVersion + 1;
}

/** Un appel au modèle, puis l'exécution de ses outils. */
export async function runStep(conversation: Conversation, adminUid: string): Promise<void> {
  const { settings } = conversation;
  let turn;
  try {
    turn = await adapterFor(settings.provider).complete({
      model: settings.model, system: systemPrompt(conversation.module, conversation.context, settings.technical === true), tools: toolSpecs(conversation.module), messages: conversation.messages, settings,
    });
  } catch (error) {
    if (error instanceof AiProviderError) throw new HttpsError("unavailable", "AI_PROVIDER_ERROR", { provider: error.provider, status: error.status, message: error.message });
    throw error;
  }
  const now = Date.now();
  conversation.messages.push({
    role: "assistant", text: turn.text, ...(turn.reasoning ? { reasoning: turn.reasoning } : {}), toolCalls: turn.toolCalls,
    provider: settings.provider, model: turn.model, ...(turn.raw !== undefined ? { raw: turn.raw } : {}), stop: turn.stop,
    ...(turn.usage ? { usage: turn.usage } : {}), at: now,
  });
  if (turn.usage) {
    conversation.usage = { inputTokens: conversation.usage.inputTokens + turn.usage.inputTokens, outputTokens: conversation.usage.outputTokens + turn.usage.outputTokens };
  }
  if (turn.toolCalls.length) {
    const results = [];
    for (const call of turn.toolCalls) results.push(await executeTool(call, { adminUid, conversationId: conversation.id }, conversation.module));
    conversation.messages.push({ role: "tool", results, at: Date.now() });
    conversation.rounds += 1;
  }
  conversation.updatedAt = Date.now();
}

/* ─────────────── Commandes ─────────────── */

const withTimeout = <T>(promise: Promise<T>, ms: number) => Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

export async function aiAssistantConfigHandler(request: CallableRequest<unknown>) {
  requireAdmin(request);
  const providers = await Promise.all(providerConfigs().map(async (config) => {
    const fallback = { models: config.fallbackModels, defaultModel: config.defaultModel ?? config.fallbackModels[0], live: false };
    const models = config.enabled ? await withTimeout(modelsFor(config.id), 15_000).catch(() => fallback) : fallback;
    return { id: config.id, label: config.label, enabled: config.enabled, reason: config.reason ?? null, capabilities: CAPABILITIES[config.id], ...models };
  }));
  return { providers, modules: AI_MODULES, maxToolRounds: MAX_TOOL_ROUNDS };
}

export async function aiAssistantConversationsHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const snap = await db.collection(COLLECTION).where("uid", "==", uid).orderBy("updatedAt", "desc").limit(50).get();
  return {
    conversations: snap.docs.map((doc) => {
      const data = doc.data() ?? {};
      return { id: doc.id, title: String(data.title ?? "Conversation"), module: data.module ?? "all", context: data.context ?? null, updatedAt: Number(data.updatedAt ?? 0), provider: data.settings?.provider ?? null, model: data.settings?.model ?? null, count: Array.isArray(data.messages) ? data.messages.length : 0 };
    }),
  };
}

export async function aiAssistantConversationHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  return clientView(await load(uid, requiredString(asObject(request.data), "conversationId", 64)));
}

export async function aiAssistantSendHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const text = requiredString(data, "text", MAX_TEXT);
  const settings = readSettings(data.settings);
  const now = Date.now();
  let conversation: Conversation;
  if (typeof data.conversationId === "string" && data.conversationId) {
    conversation = await load(uid, data.conversationId);
    if (conversation.messages.length >= MAX_MESSAGES) throw new HttpsError("failed-precondition", "CONVERSATION_TOO_LONG");
  } else {
    const context = readContext(data.context);
    const chosen = context ? CONTEXT_MODULE[context.kind] : AI_MODULES.includes(data.module as AiModule) ? data.module as AiModule : "all";
    conversation = {
      id: randomUUID(), uid, title: text.replace(/\s+/g, " ").slice(0, 70), module: chosen, ...(context ? { context } : {}), settings,
      messages: [], rounds: 0, usage: { inputTokens: 0, outputTokens: 0 }, version: 0, createdAt: now, updatedAt: now,
    };
  }
  const attachment = workingAttachment(conversation.context, data.working);
  conversation.settings = settings;
  conversation.messages.push({ role: "user", text, at: now, ...(attachment ? { attachment } : {}) });
  conversation.rounds = 0;
  conversation.updatedAt = now;
  // Le message de l'admin est gardé même si le fournisseur échoue ensuite (on peut relancer).
  await save(conversation, conversation.version ?? 0);
  const version = conversation.version;
  await runStep(conversation, uid);
  await save(conversation, version);
  return clientView(conversation);
}

export async function aiAssistantContinueHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const conversation = await load(uid, requiredString(data, "conversationId", 64));
  if (data.settings) conversation.settings = readSettings(data.settings);
  const last = lastRole(conversation);
  if (last === "tool" && conversation.rounds >= MAX_TOOL_ROUNDS) throw new HttpsError("failed-precondition", "TOOL_ROUNDS_LIMIT");
  if (last !== "tool" && last !== "user") throw new HttpsError("failed-precondition", "NOTHING_TO_CONTINUE");
  const version = conversation.version ?? 0;
  await runStep(conversation, uid);
  await save(conversation, version);
  return clientView(conversation);
}

/** L'admin confirme (l'action s'exécute avec ses droits) ou écarte une proposition de l'assistant. */
export async function aiAssistantResolveHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const data = asObject(request.data);
  const conversation = await load(uid, requiredString(data, "conversationId", 64));
  const proposalId = requiredString(data, "proposalId", 64);
  const outcome = data.outcome === "confirmed" ? "confirmed" : data.outcome === "dismissed" ? "dismissed" : null;
  if (!outcome) throw new HttpsError("invalid-argument", "INVALID_OUTCOME");
  const result = conversation.messages.flatMap((message) => (message.role === "tool" ? message.results : [])).find((item) => item.proposal?.id === proposalId);
  if (!result?.proposal) throw new HttpsError("not-found", "PROPOSAL_NOT_FOUND");
  if (result.proposal.status !== "pending") throw new HttpsError("failed-precondition", "PROPOSAL_ALREADY_RESOLVED");
  const version = conversation.version ?? 0;
  let note: string;
  if (outcome === "confirmed") {
    const done = await executeProposal(result.proposal, { adminUid: uid, conversationId: conversation.id });
    note = `[Action de l'admin] J'ai confirmé ta proposition « ${result.proposal.label} ». ${done}`;
  } else {
    note = `[Action de l'admin] J'ai écarté ta proposition « ${result.proposal.label} ».`;
  }
  // Le statut est une métadonnée d'affichage : ce que lit le modèle ne change pas, la note s'ajoute à la suite.
  result.proposal.status = outcome;
  conversation.messages.push({ role: "user", text: note, at: Date.now(), note: true });
  conversation.updatedAt = Date.now();
  await save(conversation, version);
  return clientView(conversation);
}

export async function aiAssistantDeleteHandler(request: CallableRequest<unknown>) {
  const uid = requireAdmin(request);
  const id = requiredString(asObject(request.data), "conversationId", 64);
  await load(uid, id);
  await db.doc(`${COLLECTION}/${id}`).delete();
  return { conversationId: id, deleted: true };
}
