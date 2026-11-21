import { afterEach, describe, expect, it } from "vitest";
import { buildClaudeParams, claudeEffort, claudeReplayContent, createClaudeAdapter, parseClaudeResponse, toClaudeMessages } from "../server/src/ai/claude";
import { buildCompatBody, createCompatAdapter, parseCompatResponse, temperatureApplies, thinkingParams, toCompatMessages } from "../server/src/ai/openaiCompat";
import { CAPABILITIES, chatModels, pickDefaultModel, providerConfigs } from "../server/src/ai/providers";
import { createSimulationAdapter, SIMULATION_MOTIF_ID } from "../server/src/ai/simulation";
import { readContext } from "../server/src/ai/context";
import { systemPrompt } from "../server/src/ai/reference";
import { motifTrackPaths } from "../server/src/ai/tools";
import { changesIn } from "../components/admin/assistant/useAssistant";
import { AiProviderError, type AiMessage, type AiSettings, type ProviderRequest } from "../server/src/ai/types";

const settings = (patch: Partial<AiSettings> = {}): AiSettings => ({ provider: "deepseek", model: "deepseek-v4-pro", thinking: "high", temperature: null, ...patch });
const TOOLS = [{ name: "list_animation_models", description: "Liste", parameters: { type: "object", properties: {} } }];
const request = (messages: AiMessage[], patch: Partial<AiSettings> = {}): ProviderRequest => ({ model: patch.model ?? "deepseek-v4-pro", system: "SYSTÈME", tools: TOOLS, messages, settings: settings(patch) });

/** Un tour avec outil : question, appel, résultat. */
const HISTORY: AiMessage[] = [
  { role: "user", text: "Liste les modèles", at: 1 },
  {
    role: "assistant", text: "Je regarde.", reasoning: "raisonnement", toolCalls: [{ id: "call_1", name: "list_animation_models", input: {} }],
    provider: "deepseek", model: "deepseek-v4-pro", stop: "tool_calls", at: 2,
    raw: { role: "assistant", content: "Je regarde.", reasoning_content: "raisonnement", tool_calls: [{ id: "call_1", type: "function", function: { name: "list_animation_models", arguments: "{}" } }], refusal: null, annotations: [] },
  },
  { role: "tool", at: 3, results: [{ id: "call_1", name: "list_animation_models", ok: true, content: "{\"models\":[]}", summary: "0 modèle" }] },
];

const envBackup = { ...process.env };
afterEach(() => { process.env = { ...envBackup }; });

describe("fournisseurs au format OpenAI", () => {
  it("traduit la réflexion propre à chaque fournisseur", () => {
    expect(thinkingParams("deepseek", "off")).toEqual({ thinking: { type: "disabled" } });
    expect(thinkingParams("deepseek", "medium")).toEqual({ thinking: { type: "enabled" }, reasoning_effort: "high" });
    expect(thinkingParams("deepseek", "max")).toEqual({ thinking: { type: "enabled" }, reasoning_effort: "max" });
    expect(thinkingParams("openai", "off")).toEqual({ reasoning_effort: "none" });
    expect(thinkingParams("openai", "max")).toEqual({ reasoning_effort: "xhigh" });
    expect(thinkingParams("gemini", "xhigh")).toEqual({ reasoning_effort: "high" });
    expect(thinkingParams("generic", "default")).toEqual({});
    // GLM 5 : toujours en réflexion, profondeur par reasoning_effort ; MiMo : activée ou coupée.
    expect(thinkingParams("glm", "low")).toEqual({ thinking: { type: "enabled" }, reasoning_effort: "low" });
    expect(thinkingParams("glm", "max")).toEqual({ thinking: { type: "enabled" }, reasoning_effort: "max" });
    expect(thinkingParams("glm", "off")).toEqual({ thinking: { type: "disabled" } });
    expect(thinkingParams("mimo", "on")).toEqual({ thinking: { type: "enabled" } });
    expect(thinkingParams("mimo", "off")).toEqual({ thinking: { type: "disabled" } });
    expect(temperatureApplies("mimo", "on")).toBe(false);
    expect(temperatureApplies("glm", "high")).toBe(true);
  });

  it("renvoie à MiMo son raisonnement (exigé réflexion active), à GLM seulement s'il existe", () => {
    const own = (provider: "mimo" | "glm", reasoning?: string): AiMessage => ({ role: "assistant", text: "x", toolCalls: [], provider, model: "m", stop: "stop", at: 1, raw: { role: "assistant", content: "x", ...(reasoning !== undefined ? { reasoning_content: reasoning } : {}) } });
    expect(toCompatMessages("mimo", "mimo", "S", [own("mimo")])[1]).toEqual({ role: "assistant", content: "x", reasoning_content: "" });
    expect(toCompatMessages("mimo", "mimo", "S", [own("mimo", "pensée")])[1]).toMatchObject({ reasoning_content: "pensée" });
    expect(toCompatMessages("glm", "glm", "S", [own("glm")])[1]).toEqual({ role: "assistant", content: "x" });
    expect(toCompatMessages("glm", "glm", "S", [own("glm", "pensée")])[1]).toMatchObject({ reasoning_content: "pensée" });
  });

  it("n'envoie la température que là où elle a un effet", () => {
    expect(temperatureApplies("deepseek", "high")).toBe(false);
    expect(temperatureApplies("deepseek", "off")).toBe(true);
    expect(temperatureApplies("openai", "medium")).toBe(false);
    expect(temperatureApplies("gemini", "high")).toBe(true);
    expect(buildCompatBody("deepseek", "deepseek", request([], { temperature: 0.4 }))).not.toHaveProperty("temperature");
    expect(buildCompatBody("deepseek", "deepseek", request([], { temperature: 0.4, thinking: "off" })).temperature).toBe(0.4);
  });

  it("déclare les outils au format fonction, choix automatique", () => {
    const body = buildCompatBody("openai", "openai", request([{ role: "user", text: "salut", at: 1 }], { provider: "openai", model: "gpt-x", thinking: "low" }));
    expect(body).toMatchObject({ model: "gpt-x", tool_choice: "auto", reasoning_effort: "low", tools: [{ type: "function", function: { name: "list_animation_models" } }] });
    expect((body.messages as unknown[])[0]).toEqual({ role: "system", content: "SYSTÈME" });
  });

  it("renvoie à DeepSeek son raisonnement, sans les champs que l'API refuse en entrée", () => {
    const messages = toCompatMessages("deepseek", "deepseek", "S", HISTORY);
    expect(messages[2]).toEqual({ role: "assistant", content: "Je regarde.", reasoning_content: "raisonnement", tool_calls: HISTORY[1].role === "assistant" ? (HISTORY[1].raw as { tool_calls: unknown }).tool_calls : [] });
    expect(messages[3]).toEqual({ role: "tool", tool_call_id: "call_1", content: "{\"models\":[]}" });
  });

  it("convertit un message d'un autre fournisseur (DeepSeek exige un raisonnement, même vide)", () => {
    const foreign: AiMessage[] = [{ ...(HISTORY[1] as Extract<AiMessage, { role: "assistant" }>), provider: "claude", raw: [{ type: "text", text: "x" }] }];
    const [, converted] = toCompatMessages("deepseek", "deepseek", "S", foreign);
    expect(converted).toEqual({ role: "assistant", content: "Je regarde.", reasoning_content: "", tool_calls: [{ id: "call_1", type: "function", function: { name: "list_animation_models", arguments: "{}" } }] });
    const [, openai] = toCompatMessages("openai", "openai", "S", foreign);
    expect(openai).not.toHaveProperty("reasoning_content");
  });

  it("garde les signatures de réflexion de Gemini", () => {
    const raw = { role: "assistant", content: "", tool_calls: [{ id: "f1", type: "function", function: { name: "x", arguments: "{}" }, extra_content: { google: { thought_signature: "sig" } } }], extra_content: { google: { thought_signature: "top" } } };
    const [, replayed] = toCompatMessages("gemini", "gemini", "S", [{ role: "assistant", text: "", toolCalls: [], provider: "gemini", model: "g", raw, stop: "tool_calls", at: 1 }]);
    expect(replayed).toEqual(raw);
  });

  it("lit une réponse : texte, raisonnement, outils, arguments illisibles, consommation", () => {
    const turn = parseCompatResponse({
      model: "deepseek-v4-pro",
      choices: [{ finish_reason: "tool_calls", message: { content: "Ok", reasoning_content: "pensée", tool_calls: [
        { id: "a", type: "function", function: { name: "get_animation_model", arguments: "{\"id\":\"play\"}" } },
        { id: "b", type: "function", function: { name: "get_animation_model", arguments: "{pas du json" } },
      ] } }],
      usage: { prompt_tokens: 120, completion_tokens: 30 },
    }, "défaut");
    expect(turn).toMatchObject({ text: "Ok", reasoning: "pensée", stop: "tool_calls", usage: { inputTokens: 120, outputTokens: 30 } });
    expect(turn.toolCalls[0]).toEqual({ id: "a", name: "get_animation_model", input: { id: "play" } });
    expect(turn.toolCalls[1].invalidInput).toBe("{pas du json");
  });

  it("appelle le service, et traduit une erreur HTTP en erreur de fournisseur", async () => {
    const calls: Array<{ url: string; body: unknown; auth: string | null }> = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init.headers).get("authorization") });
      if (url.endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: "deepseek-v4-pro" }, { id: "deepseek-flash" }] }));
      if ((calls.at(-1)!.body as { model: string }).model === "inconnu") return new Response(JSON.stringify({ error: { message: "Model Not Exist" } }), { status: 400 });
      return new Response(JSON.stringify({ model: "deepseek-v4-pro", choices: [{ finish_reason: "stop", message: { content: "Bonjour" } }] }));
    }) as typeof fetch;
    const adapter = createCompatAdapter({ id: "deepseek", flavor: "deepseek", baseUrl: "https://api.deepseek.com/", apiKey: "sk-test", fetchImpl: fakeFetch });
    expect((await adapter.complete(request([{ role: "user", text: "salut", at: 1 }]))).text).toBe("Bonjour");
    expect(calls[0]).toMatchObject({ url: "https://api.deepseek.com/chat/completions", auth: "Bearer sk-test" });
    expect(await adapter.listModels()).toEqual(["deepseek-v4-pro", "deepseek-flash"]);
    await expect(adapter.complete(request([{ role: "user", text: "salut", at: 1 }], { model: "inconnu" }))).rejects.toMatchObject({ name: "AiProviderError", status: 400, message: "Model Not Exist" });
  });
});

describe("Claude", () => {
  it("règle la réflexion par l'effort (jamais coupée)", () => {
    expect(claudeEffort("off")).toBe("low");
    expect(claudeEffort("xhigh")).toBe("xhigh");
    expect(claudeEffort("default")).toBeNull();
  });

  it("construit la requête : réflexion adaptative résumée, pas de température, cache, repli serveur", () => {
    const params = buildClaudeParams(request([{ role: "user", text: "salut", at: 1 }], { provider: "claude", model: "claude-opus-5-5", thinking: "high", temperature: 0.5 }));
    expect(params).toMatchObject({ model: "claude-opus-5-5", thinking: { type: "adaptive", display: "summarized" }, output_config: { effort: "high" }, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    expect(params).not.toHaveProperty("temperature");
    expect(params.system).toEqual([{ type: "text", text: "SYSTÈME", cache_control: { type: "ephemeral" } }]);
    expect(params.tools?.[0]).toMatchObject({ name: "list_animation_models", input_schema: { type: "object" } });
    const haiku = buildClaudeParams(request([], { provider: "claude", model: "claude-haiku-5-5", thinking: "default" }));
    expect(haiku).not.toHaveProperty("fallbacks");
    expect(haiku).not.toHaveProperty("output_config");
  });

  it("renvoie l'historique Claude tel quel, sauf ce qui précède le dernier repli", () => {
    const raw = [{ type: "thinking", thinking: "a", signature: "s" }, { type: "tool_use", id: "t0", name: "x", input: {} }, { type: "fallback", from: { model: "m1" }, to: { model: "m2" } }, { type: "text", text: "Réponse" }];
    expect(claudeReplayContent(raw)).toEqual([{ type: "text", text: "Réponse" }]);
    const plain = [{ type: "thinking", thinking: "a", signature: "s" }, { type: "text", text: "ok" }];
    expect(claudeReplayContent(plain)).toEqual(plain);
  });

  it("traduit l'historique : réponse brute de Claude, appels d'un autre fournisseur, résultats d'outils", () => {
    const own: AiMessage = { role: "assistant", text: "x", toolCalls: [], provider: "claude", model: "claude-opus-5-5", raw: [{ type: "thinking", thinking: "t", signature: "s" }, { type: "text", text: "x" }], stop: "end_turn", at: 1 };
    const messages = toClaudeMessages([HISTORY[0], HISTORY[1], { role: "tool", at: 3, results: [{ id: "call_1", name: "list_animation_models", ok: false, content: "{\"error\":\"x\"}", summary: "x" }] }, own]);
    expect(messages[1]).toEqual({ role: "assistant", content: [{ type: "text", text: "Je regarde." }, { type: "tool_use", id: "call_1", name: "list_animation_models", input: {} }] });
    expect(messages[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: "{\"error\":\"x\"}", is_error: true }] });
    expect(messages[3]).toEqual({ role: "assistant", content: own.role === "assistant" ? own.raw : [] });
  });

  it("lit une réponse ; un refus n'exécute aucun outil et le dit", () => {
    const base = { model: "claude-opus-5-5", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 } } as never;
    const turn = parseClaudeResponse({ ...(base as object), stop_reason: "tool_use", content: [{ type: "thinking", thinking: "résumé", signature: "s" }, { type: "text", text: "Je lis." }, { type: "tool_use", id: "t1", name: "get_reference", input: { topic: "jeu" } }] } as never);
    expect(turn).toMatchObject({ text: "Je lis.", reasoning: "résumé", stop: "tool_use", usage: { inputTokens: 100, outputTokens: 5 } });
    expect(turn.toolCalls).toEqual([{ id: "t1", name: "get_reference", input: { topic: "jeu" } }]);
    const refused = parseClaudeResponse({ ...(base as object), stop_reason: "refusal", stop_details: { category: "cyber" }, content: [{ type: "tool_use", id: "t2", name: "x", input: {} }] } as never);
    expect(refused.toolCalls).toEqual([]);
    expect(refused.text).toContain("cyber");
  });

  it("passe par le client fourni et enveloppe ses erreurs", async () => {
    const adapter = createClaudeAdapter({
      apiKey: "x",
      client: {
        beta: { messages: { create: async () => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "Bonjour" }], usage: { input_tokens: 1, output_tokens: 1 } }) as never } },
        models: { async *list() { yield { id: "claude-opus-5-5" }; yield { id: "claude-haiku-5-5" }; } },
      },
    });
    expect((await adapter.complete(request([{ role: "user", text: "salut", at: 1 }], { provider: "claude", model: "claude-opus-5-5" }))).text).toBe("Bonjour");
    expect(await adapter.listModels()).toEqual(["claude-opus-5-5", "claude-haiku-5-5"]);
    const failing = createClaudeAdapter({ apiKey: "x", client: { beta: { messages: { create: async () => { throw new Error("réseau"); } } }, models: { async *list() { /* rien */ } } } });
    await expect(failing.complete(request([], { provider: "claude", model: "claude-opus-5-5" }))).rejects.toBeInstanceOf(AiProviderError);
  });
});

describe("registre des fournisseurs", () => {
  it("désactive un fournisseur sans clé, l'active avec", () => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(providerConfigs().find((item) => item.id === "deepseek")).toMatchObject({ enabled: false, reason: expect.stringContaining("DEEPSEEK_API_KEY") });
    process.env.DEEPSEEK_API_KEY = "sk-test";
    expect(providerConfigs().find((item) => item.id === "deepseek")?.enabled).toBe(true);
    expect(providerConfigs().find((item) => item.id === "compat")).toMatchObject({ enabled: false, reason: expect.stringContaining("Adresse") });
    process.env.AI_COMPAT_BASE_URL = "http://localhost:11434/v1";
    expect(providerConfigs().find((item) => item.id === "compat")?.enabled).toBe(true);
    // Gemini accepte GOOGLE_API_KEY en secours ; FreeLLM exige son adresse.
    delete process.env.GEMINI_API_KEY;
    process.env.GOOGLE_API_KEY = "g-test";
    expect(providerConfigs().find((item) => item.id === "gemini")?.enabled).toBe(true);
    delete process.env.FREELLM_BASE_URL;
    process.env.FREELLM_API_KEY = "f-test";
    expect(providerConfigs().find((item) => item.id === "freellm")).toMatchObject({ enabled: false, reason: expect.stringContaining("Adresse") });
  });

  it("ne garde que les modèles de conversation et choisit un modèle par défaut", () => {
    expect(chatModels("openai", ["gpt-5.5", "text-embedding-3", "gpt-5.4-mini", "dall-e-3", "whisper-1", "gpt-5.4"])).toEqual(["gpt-5.5", "gpt-5.4-mini", "gpt-5.4"]);
    expect(pickDefaultModel("openai", ["gpt-5.5-pro", "gpt-5.4", "gpt-5.5", "gpt-5.5-mini"])).toBe("gpt-5.5");
    expect(chatModels("gemini", ["models/gemini-3-pro", "models/gemini-3-flash", "models/text-embedding-004", "models/imagen-4"])).toEqual(["gemini-3-pro", "gemini-3-flash"]);
    expect(pickDefaultModel("gemini", ["gemini-3-flash", "gemini-2.5-pro", "gemini-3-pro"])).toBe("gemini-3-pro");
    // Modèles vus chez les fournisseurs : la reconnaissance vocale de MiMo est écartée, les plus récents choisis.
    expect(chatModels("mimo", ["mimo-v2.5-asr", "mimo-v2.6-flash", "mimo-v2.6-pro"])).toEqual(["mimo-v2.6-flash", "mimo-v2.6-pro"]);
    expect(pickDefaultModel("mimo", ["mimo-v2.6-flash", "mimo-v2.6-pro", "mimo-v2.6-pro-ultraspeed"])).toBe("mimo-v2.6-pro");
    expect(pickDefaultModel("glm", ["glm-4.5", "glm-4.5-air", "glm-5", "glm-5-turbo", "glm-5.3"])).toBe("glm-5.3");
    expect(pickDefaultModel("meta", ["muse-ember-1.0", "muse-spark-1.3-contributor", "muse-spark-1.3", "muse-spark-1.2"])).toBe("muse-spark-1.3");
  });

  it("déclare des capacités cohérentes (Claude sans température ni réflexion coupée)", () => {
    expect(CAPABILITIES.claude).toMatchObject({ temperature: "never" });
    expect(CAPABILITIES.claude.thinking).not.toContain("off");
    for (const caps of Object.values(CAPABILITIES)) expect(caps.thinking).toContain(caps.defaultThinking);
  });
});

describe("simulation", () => {
  it("suit son scénario : lecture, brouillon, proposition, résumé", async () => {
    const adapter = createSimulationAdapter();
    const messages: AiMessage[] = [{ role: "user", text: "Crée un brouillon d'essai", at: 1 }];
    const names: string[] = [];
    for (let step = 0; step < 5; step += 1) {
      const turn = await adapter.complete(request(messages, { provider: "simulation", model: "simulation", thinking: "default" }));
      messages.push({ role: "assistant", text: turn.text, toolCalls: turn.toolCalls, provider: "simulation", model: "simulation", stop: turn.stop, at: step });
      if (!turn.toolCalls.length) break;
      names.push(...turn.toolCalls.map((call) => call.name));
      messages.push({ role: "tool", at: step, results: turn.toolCalls.map((call) => ({ id: call.id, name: call.name, ok: true, content: "{}", summary: "ok" })) });
    }
    expect(names).toEqual(["list_animation_models", "save_animation_model_draft", "propose_publish_animation_model"]);
    const last = messages.at(-1);
    expect(last?.role === "assistant" && last.text).toContain("Simulation terminée");
    const draftCall = messages.find((message) => message.role === "assistant" && message.toolCalls[0]?.name === "save_animation_model_draft");
    expect(draftCall?.role === "assistant" && (draftCall.toolCalls[0].input.model as { id: string }).id).toBe(SIMULATION_MOTIF_ID);
  });
});

describe("assistant dans les pages (contexte)", () => {
  it("lit la page d'origine : genre connu, identifiant exigé pour un modèle ou une carte, nom nettoyé", () => {
    expect(readContext(undefined)).toBeUndefined();
    expect(readContext({ kind: "animation_model", id: "play_classic", label: "Jouer « vite »" })).toEqual({ kind: "animation_model", id: "play_classic", label: "Jouer vite" });
    expect(readContext({ kind: "power_catalog", id: "ignoré" })).toEqual({ kind: "power_catalog" });
    expect(() => readContext({ kind: "power_card" })).toThrow("INVALID_CONTEXT");
    expect(() => readContext({ kind: "power_card", id: "../x" })).toThrow("INVALID_CONTEXT");
    expect(() => readContext({ kind: "inconnu" })).toThrow("INVALID_CONTEXT");
  });

  it("dit au modèle quel élément est ouvert, et comment lire la copie de travail", () => {
    const prompt = systemPrompt("all", { kind: "animation_model", id: "play_classic", label: "Jouer une carte" });
    expect(prompt).toContain("`play_classic`");
    expect(prompt).toContain("find_animation_usage");
    expect(prompt).toContain("copie de travail");
    expect(systemPrompt("powers", { kind: "power_card", id: "vent_nord" })).toContain("get_power_card");
    expect(systemPrompt("animations")).not.toContain("L'admin t'écrit depuis");
  });

  it("explique simplement par défaut, techniquement sur demande", () => {
    const simple = systemPrompt("animations");
    expect(simple).toContain("Mode d'explication : SIMPLE");
    expect(simple).toContain("N'affiche jamais de JSON");
    expect(simple).not.toContain("accents graves");
    const technical = systemPrompt("animations", undefined, true);
    expect(technical).toContain("Mode d'explication : TECHNIQUE");
    expect(technical).toContain("accents graves");
  });

  it("joint la copie de travail au message lu par le modèle, pas au texte affiché", () => {
    const messages: AiMessage[] = [{ role: "user", text: "Pourquoi ça clignote ?", attachment: "[Copie de travail]\n{\"id\":\"x\"}", at: 1 }];
    expect(toCompatMessages("deepseek", "deepseek", "S", messages)[1]).toEqual({ role: "user", content: "Pourquoi ça clignote ?\n\n[Copie de travail]\n{\"id\":\"x\"}" });
    expect(toClaudeMessages(messages)[0]).toEqual({ role: "user", content: "Pourquoi ça clignote ?\n\n[Copie de travail]\n{\"id\":\"x\"}" });
  });

  it("trouve les pistes de chorégraphie qui reprennent un modèle", () => {
    const script = { steps: [{ choreo: { tracks: [{ kind: "motif", motifId: "play_classic" }, { kind: "cardPath" }] } }, { choreo: { tracks: [{ kind: "motif", motifId: "draw" }] } }] };
    expect(motifTrackPaths(script, "play_classic")).toEqual(["script.steps.0.choreo.tracks.0"]);
    expect(motifTrackPaths(script, "absent")).toEqual([]);
    expect(motifTrackPaths(undefined, "draw")).toEqual([]);
  });

  it("repère les brouillons écrits par l'assistant pour recharger la page", () => {
    expect(changesIn([
      { role: "tool", at: 1, results: [
        { id: "a", name: "save_animation_model_draft", ok: true, content: "{}", summary: "", draft: { kind: "motif", id: "essai" } },
        { id: "b", name: "save_power_card_draft", ok: false, content: "{}", summary: "", draft: { kind: "power_card", id: "raté" } },
        { id: "c", name: "list_power_cards", ok: true, content: "{}", summary: "" },
      ] },
    ])).toEqual([{ kind: "motif", id: "essai" }]);
  });
});
