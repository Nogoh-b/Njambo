/* ═══════════════ Assistant IA : fournisseurs au format OpenAI ═══════════════
   Un seul adaptateur pour DeepSeek, OpenAI, Gemini (point d'accès compatible
   OpenAI) et un service libre (Mistral, OpenRouter, Ollama…) : API Chat
   Completions avec outils. Particularités gérées ici :
   - DeepSeek : réflexion par `thinking` + `reasoning_effort` ; avec des
     outils, chaque `reasoning_content` doit être renvoyé à chaque requête
     (sinon erreur 400) ;
   - Gemini : les signatures de réflexion arrivent sur les appels d'outils
     (`extra_content`) et doivent revenir telles quelles ;
   - OpenAI : `reasoning_effort` (none à xhigh), température seulement à none ;
   - GLM (Z.ai) et MiMo (Xiaomi) : réflexion activée ou coupée par
     `thinking: {type}` (GLM 5 : toujours active, profondeur par
     `reasoning_effort` low / high / max) ; leur raisonnement est renvoyé
     d'un tour à l'autre ; MiMo refuse la température réflexion active.
   Le message de l'assistant est renvoyé tel que reçu au même fournisseur,
   limité aux champs que l'API accepte en entrée. */

import { AiProviderError, userContent, type AiMessage, type AiProviderId, type AiToolCall, type ProviderAdapter, type ProviderRequest, type ProviderTurn, type ThinkingLevel } from "./types";

export type CompatFlavor = "deepseek" | "openai" | "gemini" | "glm" | "mimo" | "generic";

/** Fournisseurs dont la réflexion se règle par `thinking: {type}` et qui renvoient `reasoning_content`. */
const THINKING_TYPE_FLAVORS: ReadonlySet<CompatFlavor> = new Set(["glm", "mimo"]);

interface CompatConfig {
  id: AiProviderId;
  flavor: CompatFlavor;
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

type Json = Record<string, unknown>;

/** Paramètres de réflexion propres à chaque fournisseur. */
export function thinkingParams(flavor: CompatFlavor, level: ThinkingLevel): Json {
  if (flavor === "deepseek") {
    if (level === "off") return { thinking: { type: "disabled" } };
    const effort = level === "low" ? "low" : level === "xhigh" || level === "max" ? "max" : "high";
    return { thinking: { type: "enabled" }, reasoning_effort: effort };
  }
  if (level === "default") return {};
  if (flavor === "glm") {
    // GLM 5 : réflexion toujours active, profondeur par reasoning_effort (low / high / max).
    if (level === "off") return { thinking: { type: "disabled" } };
    if (level === "on") return { thinking: { type: "enabled" } };
    return { thinking: { type: "enabled" }, reasoning_effort: level === "low" ? "low" : level === "xhigh" || level === "max" ? "max" : "high" };
  }
  if (THINKING_TYPE_FLAVORS.has(flavor)) return { thinking: { type: level === "off" ? "disabled" : "enabled" } };
  if (level === "on") return { reasoning_effort: "medium" };
  if (flavor === "openai") return { reasoning_effort: level === "off" ? "none" : level === "max" ? "xhigh" : level };
  return { reasoning_effort: level === "off" ? "none" : level === "xhigh" || level === "max" ? "high" : level };
}

/** La température a-t-elle un effet ? (DeepSeek, OpenAI, MiMo : seulement réflexion coupée.) */
export function temperatureApplies(flavor: CompatFlavor, level: ThinkingLevel): boolean {
  if (flavor === "deepseek" || flavor === "openai" || flavor === "mimo") return level === "off";
  return true;
}

/** Champs d'un message d'assistant acceptés en entrée (le reste de la réponse est écarté). */
function replayable(flavor: CompatFlavor, message: Json): Json {
  const out: Json = { role: "assistant", content: typeof message.content === "string" || Array.isArray(message.content) ? message.content : "" };
  if (Array.isArray(message.tool_calls) && message.tool_calls.length) out.tool_calls = message.tool_calls;
  // DeepSeek et MiMo exigent le raisonnement sur chaque message de l'assistant (réflexion active) ; GLM l'accepte.
  if (flavor === "deepseek" || flavor === "mimo") out.reasoning_content = typeof message.reasoning_content === "string" ? message.reasoning_content : "";
  if (flavor === "glm" && typeof message.reasoning_content === "string" && message.reasoning_content) out.reasoning_content = message.reasoning_content;
  if (flavor === "gemini" && message.extra_content) out.extra_content = message.extra_content;
  return out;
}

export function toCompatMessages(flavor: CompatFlavor, provider: AiProviderId, system: string, messages: AiMessage[]): Json[] {
  const out: Json[] = [{ role: "system", content: system }];
  for (const message of messages) {
    if (message.role === "user") {
      out.push({ role: "user", content: userContent(message) });
    } else if (message.role === "assistant") {
      if (message.provider === provider && message.raw && typeof message.raw === "object") {
        out.push(replayable(flavor, message.raw as Json));
        continue;
      }
      // Message d'un autre fournisseur : texte et appels d'outils, sans sa réflexion.
      const converted: Json = { role: "assistant", content: message.text || "" };
      if (message.toolCalls.length) {
        converted.tool_calls = message.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.input) } }));
      }
      if (flavor === "deepseek" || flavor === "mimo") converted.reasoning_content = "";
      out.push(converted);
    } else {
      for (const result of message.results) out.push({ role: "tool", tool_call_id: result.id, content: result.content });
    }
  }
  return out;
}

function parseToolCall(raw: Json, index: number): AiToolCall {
  const fn = (raw.function ?? {}) as Json;
  const id = typeof raw.id === "string" && raw.id ? raw.id : `call_${index}`;
  const name = typeof fn.name === "string" ? fn.name : "";
  const args = typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments ?? {});
  try {
    const input = args.trim() ? JSON.parse(args) : {};
    return input && typeof input === "object" && !Array.isArray(input) ? { id, name, input } : { id, name, input: {}, invalidInput: args.slice(0, 400) };
  } catch {
    return { id, name, input: {}, invalidInput: args.slice(0, 400) };
  }
}

export function parseCompatResponse(json: Json, fallbackModel: string): ProviderTurn {
  const choice = (Array.isArray(json.choices) ? json.choices[0] : undefined) as Json | undefined;
  const message = (choice?.message ?? {}) as Json;
  const content = message.content;
  const text = typeof content === "string" ? content
    : Array.isArray(content) ? content.map((part) => (part && typeof part === "object" && typeof (part as Json).text === "string" ? (part as Json).text as string : "")).join("") : "";
  const reasoning = typeof message.reasoning_content === "string" ? message.reasoning_content : typeof message.reasoning === "string" ? message.reasoning : undefined;
  const toolCalls = (Array.isArray(message.tool_calls) ? message.tool_calls as Json[] : []).map(parseToolCall);
  const usage = json.usage as Json | undefined;
  return {
    text, reasoning: reasoning || undefined, toolCalls,
    raw: message,
    stop: typeof choice?.finish_reason === "string" ? choice.finish_reason : "unknown",
    usage: usage ? { inputTokens: Number(usage.prompt_tokens ?? 0), outputTokens: Number(usage.completion_tokens ?? 0) } : undefined,
    model: typeof json.model === "string" ? json.model : fallbackModel,
  };
}

export function buildCompatBody(flavor: CompatFlavor, provider: AiProviderId, request: ProviderRequest): Json {
  const body: Json = {
    model: request.model,
    messages: toCompatMessages(flavor, provider, request.system, request.messages),
    ...thinkingParams(flavor, request.settings.thinking),
  };
  if (request.tools.length) {
    body.tools = request.tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
    body.tool_choice = "auto";
  }
  if (request.settings.temperature !== null && temperatureApplies(flavor, request.settings.thinking)) body.temperature = request.settings.temperature;
  return body;
}

async function errorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const json = JSON.parse(text) as Json;
    const error = json.error as Json | string | undefined;
    if (typeof error === "string") return error;
    if (error && typeof error.message === "string") return error.message;
  } catch { /* texte brut */ }
  return text.slice(0, 300) || `HTTP ${response.status}`;
}

export function createCompatAdapter(config: CompatConfig): ProviderAdapter {
  const doFetch = config.fetchImpl ?? fetch;
  const base = config.baseUrl.replace(/\/+$/, "");
  const headers = { "Content-Type": "application/json", ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) };
  const call = async (path: string, init: RequestInit) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 240_000);
    try {
      const response = await doFetch(`${base}${path}`, { ...init, headers, signal: controller.signal });
      if (!response.ok) throw new AiProviderError(config.id, response.status, await errorMessage(response));
      return await response.json() as Json;
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      const aborted = error instanceof Error && error.name === "AbortError";
      throw new AiProviderError(config.id, aborted ? 504 : 502, aborted ? "Le fournisseur n'a pas répondu à temps." : `Fournisseur injoignable : ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    id: config.id,
    async complete(request) {
      const json = await call("/chat/completions", { method: "POST", body: JSON.stringify(buildCompatBody(config.flavor, config.id, request)) });
      return parseCompatResponse(json, request.model);
    },
    async listModels() {
      const json = await call("/models", { method: "GET" });
      const data = Array.isArray(json.data) ? json.data as Json[] : Array.isArray(json.models) ? json.models as Json[] : [];
      return data.map((item) => String(item.id ?? item.name ?? "")).filter(Boolean);
    },
  };
}
