/* ═══════════════ Assistant IA de l'admin : types communs ═══════════════
   Format neutre des conversations, indépendant du fournisseur : chaque
   adaptateur (Claude, compatible OpenAI, simulation) le traduit dans le
   format de son API. L'historique est en AJOUT SEUL : un message enregistré
   n'est jamais modifié dans ce qui est renvoyé au modèle (exigence des
   blocs de réflexion de Claude et de DeepSeek). */

export const AI_PROVIDERS = ["deepseek", "claude", "openai", "gemini", "glm", "mimo", "meta", "freellm", "compat", "simulation"] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

/** Profondeur de réflexion demandée ; chaque fournisseur n'en accepte qu'une partie (« on » : activée, sans niveau). */
export const THINKING_LEVELS = ["default", "off", "on", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** Domaine de la conversation : oriente le prompt système et les outils proposés. */
export const AI_MODULES = ["animations", "powers", "all"] as const;
export type AiModule = (typeof AI_MODULES)[number];

/** Page de la console d'où part la conversation : « ce modèle », « cette carte » désignent l'élément ouvert. */
export const AI_CONTEXT_KINDS = ["animation_model", "power_card", "animation_library", "power_catalog"] as const;
export type AiContextKind = (typeof AI_CONTEXT_KINDS)[number];

export interface AiContext {
  kind: AiContextKind;
  /** Identifiant du modèle ou de la carte ouverte (pages de détail). */
  id?: string;
  /** Nom affiché (aide à la lecture, jamais utilisé pour retrouver l'élément). */
  label?: string;
}

export interface ProviderCapabilities {
  /** Niveaux de réflexion proposés pour ce fournisseur. */
  thinking: ThinkingLevel[];
  defaultThinking: ThinkingLevel;
  /** always : toujours appliquée ; when_off : seulement réflexion coupée ; never : refusée par l'API. */
  temperature: "always" | "when_off" | "never";
  temperatureMax: number;
  note: string;
}

export interface AiSettings {
  provider: AiProviderId;
  model: string;
  thinking: ThinkingLevel;
  /** null : celle du fournisseur. Ignorée là où elle n'a pas d'effet (Claude, réflexion active…). */
  temperature: number | null;
}

export interface AiToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** Arguments illisibles renvoyés par le modèle (l'outil répond alors par une erreur). */
  invalidInput?: string;
}

/** Action qui touche les joueurs : jamais exécutée par l'assistant, l'admin la confirme. */
export interface AiProposal {
  id: string;
  kind: "publish_motif" | "publish_power_card" | "set_moments";
  label: string;
  payload: Record<string, unknown>;
  /** Métadonnée d'affichage (jamais renvoyée au modèle). */
  status: "pending" | "confirmed" | "dismissed";
}

export interface AiToolResult {
  id: string;
  name: string;
  ok: boolean;
  /** Ce que le modèle lit (JSON compact) : immuable une fois enregistré. */
  content: string;
  /** Résumé lisible pour l'admin. */
  summary: string;
  proposal?: AiProposal;
  /** Brouillon écrit par l'outil (lien vers l'éditeur). */
  draft?: { kind: "motif" | "power_card"; id: string };
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export type AiMessage =
  | {
      role: "user";
      text: string;
      at: number;
      note?: boolean;
      /** Copie de travail jointe par la page (modifications pas encore enregistrées) : lue par le modèle à la suite du texte. */
      attachment?: string;
    }
  | {
      role: "assistant";
      text: string;
      /** Réflexion lisible (résumé chez Claude, raisonnement chez DeepSeek). */
      reasoning?: string;
      toolCalls: AiToolCall[];
      provider: AiProviderId;
      model: string;
      /** Réponse brute du fournisseur, renvoyée telle quelle au même fournisseur. */
      raw?: unknown;
      stop: string;
      usage?: AiUsage;
      at: number;
    }
  | { role: "tool"; results: AiToolResult[]; at: number };

export type AssistantMessage = Extract<AiMessage, { role: "assistant" }>;
export type UserMessage = Extract<AiMessage, { role: "user" }>;

/** Ce que lit le modèle pour un message de l'admin : son texte, puis la copie de travail jointe. */
export const userContent = (message: UserMessage) => (message.attachment ? `${message.text}\n\n${message.attachment}` : message.text);

/** Schéma JSON d'un outil (sous-ensemble utilisé ici). */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ProviderRequest {
  model: string;
  system: string;
  tools: ToolSpec[];
  messages: AiMessage[];
  settings: AiSettings;
}

/** Un tour du modèle : texte, réflexion, appels d'outils. */
export interface ProviderTurn {
  text: string;
  reasoning?: string;
  toolCalls: AiToolCall[];
  raw: unknown;
  stop: string;
  usage?: AiUsage;
  model: string;
}

export interface ProviderAdapter {
  id: AiProviderId;
  complete(request: ProviderRequest): Promise<ProviderTurn>;
  listModels(): Promise<string[]>;
}

/** Erreur d'un fournisseur, avec son statut HTTP (clé refusée, quota, modèle inconnu…). */
export class AiProviderError extends Error {
  constructor(readonly provider: AiProviderId, readonly status: number, message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}
