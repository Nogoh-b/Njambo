/* ═══════════════ Assistant IA : fournisseurs ═══════════════
   Les clés restent côté serveur (server/.env, modèle : server/.env.example),
   jamais dans le navigateur. Un fournisseur sans clé est affiché, mais
   désactivé. Les modèles sont lus en direct chez le fournisseur (cache de
   10 min), avec une liste de repli si l'appel échoue. */

import { createClaudeAdapter } from "./claude";
import { createCompatAdapter, type CompatFlavor } from "./openaiCompat";
import { createSimulationAdapter } from "./simulation";
import { AiProviderError, type AiProviderId, type ProviderAdapter, type ProviderCapabilities } from "./types";

export const CAPABILITIES: Record<AiProviderId, ProviderCapabilities> = {
  deepseek: { thinking: ["off", "low", "high", "max"], defaultThinking: "high", temperature: "when_off", temperatureMax: 2, note: "La température n'a d'effet que réflexion coupée." },
  claude: { thinking: ["low", "medium", "high", "xhigh", "max"], defaultThinking: "high", temperature: "never", temperatureMax: 1, note: "Claude règle sa réflexion par l'effort ; l'API n'accepte plus de température." },
  openai: { thinking: ["off", "low", "medium", "high", "xhigh"], defaultThinking: "medium", temperature: "when_off", temperatureMax: 2, note: "Température acceptée seulement réflexion coupée (selon le modèle)." },
  gemini: { thinking: ["default", "off", "low", "medium", "high"], defaultThinking: "default", temperature: "always", temperatureMax: 2, note: "« Coupée » n'existe pas sur tous les modèles (Gemini 3 : réflexion toujours active)." },
  compat: { thinking: ["default", "off", "low", "medium", "high"], defaultThinking: "default", temperature: "always", temperatureMax: 2, note: "« Par défaut » n'envoie aucun réglage de réflexion (sûr pour un modèle local)." },
  simulation: { thinking: ["default"], defaultThinking: "default", temperature: "never", temperatureMax: 1, note: "Fournisseur de test : réponses scriptées, sans clé ni coût (développement)." },
};

interface ProviderConfig {
  id: AiProviderId;
  label: string;
  enabled: boolean;
  /** Pourquoi le fournisseur est indisponible (clé absente…). */
  reason?: string;
  defaultModel?: string;
  fallbackModels: string[];
  create(): ProviderAdapter;
}

const env = (name: string) => process.env[name]?.trim() || undefined;

function compat(id: AiProviderId, label: string, flavor: CompatFlavor, keyVar: string, baseUrl: string | undefined, defaultModel: string | undefined, fallbackModels: string[], keyRequired = true): ProviderConfig {
  const apiKey = env(keyVar);
  const enabled = Boolean(baseUrl) && (!keyRequired || Boolean(apiKey));
  return {
    id, label, enabled, defaultModel, fallbackModels,
    reason: !baseUrl ? "Adresse du service absente (server/.env)." : enabled ? undefined : `Clé absente : ${keyVar} (server/.env).`,
    create: () => createCompatAdapter({ id, flavor, baseUrl: baseUrl!, apiKey }),
  };
}

export function providerConfigs(): ProviderConfig[] {
  const claudeKey = env("ANTHROPIC_API_KEY");
  const simulation = env("AI_SIMULATION") === "1" || (process.env.NODE_ENV !== "production" && env("AI_SIMULATION") !== "0");
  return [
    compat("deepseek", "DeepSeek", "deepseek", "DEEPSEEK_API_KEY", env("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com", env("AI_DEEPSEEK_MODEL") ?? "deepseek-v4-pro", ["deepseek-v4-pro", "deepseek-flash"]),
    {
      id: "claude", label: "Claude (Anthropic)", enabled: Boolean(claudeKey),
      reason: claudeKey ? undefined : "Clé absente : ANTHROPIC_API_KEY (server/.env).",
      defaultModel: env("AI_CLAUDE_MODEL") ?? "claude-opus-5-5",
      fallbackModels: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"],
      create: () => createClaudeAdapter({ apiKey: claudeKey! }),
    },
    compat("openai", "OpenAI", "openai", "OPENAI_API_KEY", env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1", env("AI_OPENAI_MODEL"), []),
    compat("gemini", "Gemini (Google)", "gemini", "GEMINI_API_KEY", env("GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai", env("AI_GEMINI_MODEL"), []),
    compat("compat", env("AI_COMPAT_LABEL") ?? "Compatible OpenAI", "generic", "AI_COMPAT_API_KEY", env("AI_COMPAT_BASE_URL"), env("AI_COMPAT_MODEL"), env("AI_COMPAT_MODEL") ? [env("AI_COMPAT_MODEL")!] : [], false),
    {
      id: "simulation", label: "Simulation (test)", enabled: simulation,
      reason: simulation ? undefined : "Réservée au développement (AI_SIMULATION=1 pour l'activer).",
      defaultModel: "simulation", fallbackModels: ["simulation"],
      create: () => createSimulationAdapter(),
    },
  ];
}

const adapters = new Map<AiProviderId, ProviderAdapter>();

export function adapterFor(id: AiProviderId): ProviderAdapter {
  const config = providerConfigs().find((item) => item.id === id);
  if (!config) throw new AiProviderError(id, 400, "Fournisseur inconnu.");
  if (!config.enabled) throw new AiProviderError(id, 400, config.reason ?? "Fournisseur indisponible.");
  let adapter = adapters.get(id);
  if (!adapter) {
    adapter = config.create();
    adapters.set(id, adapter);
  }
  return adapter;
}

/** Remplace un adaptateur (tests). */
export function setAdapterForTests(id: AiProviderId, adapter: ProviderAdapter | null) {
  if (adapter) adapters.set(id, adapter); else adapters.delete(id);
}

/* ─────────────── Modèles ─────────────── */

const MODEL_CACHE_MS = 10 * 60_000;
const modelCache = new Map<AiProviderId, { at: number; models: string[] }>();

/** Ne garde que les modèles de conversation (pas d'images, de voix, d'embeddings…). */
export function chatModels(id: AiProviderId, ids: string[]): string[] {
  const clean = [...new Set(ids.map((model) => model.replace(/^models\//, "")))];
  const excluded = /(embed|audio|tts|whisper|transcribe|dall-e|image|imagen|veo|realtime|moderation|search|aqa|vision-exp|computer-use|live)/i;
  const kept = clean.filter((model) => !excluded.test(model));
  if (id === "openai") return kept.filter((model) => /^(gpt-|o\d|chatgpt)/.test(model)).sort().reverse();
  if (id === "gemini") return kept.filter((model) => /^gemini-/.test(model)).sort().reverse();
  if (id === "claude") return kept.filter((model) => /^claude-/.test(model));
  return kept;
}

/** Modèle par défaut quand server/.env n'en fixe pas : le plus récent de la gamme principale. */
export function pickDefaultModel(id: AiProviderId, models: string[]): string | undefined {
  const version = (model: string) => Number(/(\d+(?:\.\d+)?)/.exec(model)?.[1] ?? 0);
  const best = (pattern: RegExp) => models.filter((model) => pattern.test(model)).sort((a, b) => version(b) - version(a))[0];
  if (id === "openai") return best(/^gpt-\d+(\.\d+)?$/) ?? models[0];
  if (id === "gemini") return best(/^gemini-\d+(\.\d+)?-pro$/) ?? best(/^gemini-\d+(\.\d+)?-flash$/) ?? models[0];
  return models[0];
}

export async function modelsFor(id: AiProviderId): Promise<{ models: string[]; defaultModel?: string; live: boolean }> {
  const config = providerConfigs().find((item) => item.id === id);
  if (!config) return { models: [], live: false };
  const cached = modelCache.get(id);
  let models: string[] | null = cached && Date.now() - cached.at < MODEL_CACHE_MS ? cached.models : null;
  let live = Boolean(models);
  if (!models && config.enabled) {
    try {
      models = chatModels(id, await adapterFor(id).listModels());
      if (models.length) { modelCache.set(id, { at: Date.now(), models }); live = true; } else models = null;
    } catch {
      models = null;
    }
  }
  const list = models ?? config.fallbackModels;
  const withDefault = config.defaultModel && !list.includes(config.defaultModel) ? [config.defaultModel, ...list] : list;
  return { models: withDefault, defaultModel: config.defaultModel ?? pickDefaultModel(id, withDefault), live };
}
