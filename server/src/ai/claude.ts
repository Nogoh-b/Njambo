/* ═══════════════ Assistant IA : Claude (Anthropic) ═══════════════
   SDK officiel (@anthropic-ai/sdk). Particularités de l'API actuelle :
   - réflexion adaptative (`thinking: {type: "adaptive"}`), résumé lisible
     demandé (`display: "summarized"`) ; la profondeur se règle par l'effort
     (`output_config.effort`). Sur Claude Opus 5.5, la réflexion ne se coupe
     pas : « coupée » devient l'effort le plus bas ;
   - aucune température (refusée par l'API depuis le 2026-10-21) ;
   - les blocs de réflexion sont renvoyés tels quels (historique en ajout
     seul) ; après un repli, les blocs placés avant le dernier `fallback`
     (réflexion, appels d'outils) ne sont pas renvoyés ;
   - repli serveur en cas de refus (`fallbacks: "default"`) sur les modèles
     qui l'acceptent. */

import Anthropic from "@anthropic-ai/sdk";
import { AiProviderError, type AiMessage, type AiToolCall, type ProviderAdapter, type ProviderRequest, type ProviderTurn, type ThinkingLevel } from "./types";

type BlockParam = Anthropic.Beta.BetaContentBlockParam;
type MessageParam = Anthropic.Beta.BetaMessageParam;
type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** Modèles qui acceptent le repli serveur `fallbacks: "default"` (Claude API). */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** Blocs à ne pas renvoyer quand ils précèdent le dernier repli (règle de l'API). */
const DROP_BEFORE_FALLBACK = new Set(["thinking", "redacted_thinking", "tool_use", "server_tool_use"]);

export function claudeEffort(level: ThinkingLevel): Effort | null {
  if (level === "default") return null;
  if (level === "off") return "low";
  return level;
}

/** Contenu d'une réponse tel qu'il peut être renvoyé (et lu) : règle des tours repliés appliquée. */
export function claudeReplayContent(raw: unknown): BlockParam[] | null {
  if (!Array.isArray(raw)) return null;
  const blocks = raw as Array<{ type: string }>;
  const lastFallback = blocks.map((block) => block.type).lastIndexOf("fallback");
  return blocks.filter((block, index) => block.type !== "fallback" && !(index < lastFallback && DROP_BEFORE_FALLBACK.has(block.type))) as unknown as BlockParam[];
}

export function toClaudeMessages(messages: AiMessage[]): MessageParam[] {
  const out: MessageParam[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      out.push({ role: "user", content: message.text });
    } else if (message.role === "assistant") {
      const replay = message.provider === "claude" ? claudeReplayContent(message.raw) : null;
      if (replay && replay.length) {
        out.push({ role: "assistant", content: replay });
        continue;
      }
      // Message d'un autre fournisseur : texte et appels d'outils.
      const content: BlockParam[] = [];
      if (message.text) content.push({ type: "text", text: message.text });
      for (const call of message.toolCalls) content.push({ type: "tool_use", id: call.id, name: call.name, input: call.input });
      out.push({ role: "assistant", content: content.length ? content : [{ type: "text", text: "…" }] });
    } else {
      out.push({
        role: "user",
        content: message.results.map((result) => ({ type: "tool_result" as const, tool_use_id: result.id, content: result.content, ...(result.ok ? {} : { is_error: true }) })),
      });
    }
  }
  return out;
}

export function parseClaudeResponse(response: Pick<Anthropic.Beta.BetaMessage, "content" | "stop_reason" | "usage" | "model"> & { stop_details?: unknown }): ProviderTurn {
  const blocks = (claudeReplayContent(response.content) ?? []) as unknown as Array<Record<string, unknown>>;
  const text = blocks.filter((block) => block.type === "text").map((block) => String(block.text ?? "")).join("\n\n");
  const reasoning = blocks.filter((block) => block.type === "thinking").map((block) => String(block.thinking ?? "")).filter(Boolean).join("\n\n");
  const toolCalls: AiToolCall[] = blocks.filter((block) => block.type === "tool_use").map((block) => ({
    id: String(block.id), name: String(block.name),
    input: block.input && typeof block.input === "object" && !Array.isArray(block.input) ? block.input as Record<string, unknown> : {},
  }));
  const stop = response.stop_reason ?? "unknown";
  let finalText = text;
  if (stop === "refusal") {
    const details = (response.stop_details ?? null) as { category?: string | null } | null;
    finalText = `${text ? `${text}\n\n` : ""}_(Claude a refusé de répondre${details?.category ? ` : catégorie « ${details.category} »` : ""}.)_`;
  }
  const usage = response.usage;
  return {
    text: finalText, reasoning: reasoning || undefined, toolCalls: stop === "refusal" ? [] : toolCalls,
    raw: response.content, stop,
    usage: usage ? { inputTokens: (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0), outputTokens: usage.output_tokens ?? 0 } : undefined,
    model: response.model,
  };
}

export function buildClaudeParams(request: ProviderRequest): Anthropic.Beta.MessageCreateParamsNonStreaming {
  const effort = claudeEffort(request.settings.thinking);
  const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
    model: request.model,
    max_tokens: 16000,
    // Le cache couvre les outils et le système (ordre de rendu : outils, système, messages).
    system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
    tools: request.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters as Anthropic.Beta.BetaTool.InputSchema })),
    messages: toClaudeMessages(request.messages),
    thinking: { type: "adaptive", display: "summarized" },
    ...(effort ? { output_config: { effort } } : {}),
  };
  if (FALLBACK_MODELS.has(request.model)) {
    params.betas = [FALLBACK_BETA];
    params.fallbacks = "default";
  }
  return params;
}

interface ClaudeClient {
  beta: { messages: { create(params: Anthropic.Beta.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.BetaMessage> } };
  models: { list(): AsyncIterable<{ id: string }> };
}

export function createClaudeAdapter(config: { apiKey: string; client?: ClaudeClient }): ProviderAdapter {
  const client: ClaudeClient = config.client ?? (new Anthropic({ apiKey: config.apiKey, timeout: 240_000 }) as unknown as ClaudeClient);
  const wrap = (error: unknown): never => {
    if (error instanceof Anthropic.APIError) throw new AiProviderError("claude", error.status ?? 502, error.message);
    throw new AiProviderError("claude", 502, error instanceof Error ? error.message : String(error));
  };
  return {
    id: "claude",
    async complete(request) {
      try {
        return parseClaudeResponse(await client.beta.messages.create(buildClaudeParams(request)));
      } catch (error) {
        return wrap(error);
      }
    },
    async listModels() {
      try {
        const ids: string[] = [];
        for await (const model of client.models.list()) ids.push(model.id);
        return ids;
      } catch (error) {
        return wrap(error);
      }
    },
  };
}
