"use client";

/* Conversation avec l'assistant, partagée par la section « Assistant IA » et
   le panneau des pages Animations et Cartes de pouvoir : fournisseurs,
   réglages (gardés dans le navigateur), envoi, enchaînement des étapes
   d'outils, relance, propositions. Signale à la page ce que l'assistant a
   écrit (brouillons, publications confirmées) pour qu'elle se recharge. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackendError } from "@/lib/backend";
import {
  adminApi, adminErrorText,
  type AiConfigView, type AiContext, type AiConversationView, type AiModule, type AiProviderView, type AiSettings, type AiViewMessage,
} from "../adminApi";

const STORAGE_KEY = "njambo.assistant.settings";
/** Conversation à ouvrir dans la section « Assistant IA » (bouton « Ouvrir en grand » du panneau). */
export const FOCUS_KEY = "njambo.assistant.focus";

/** Ce que l'assistant a changé : la page concernée se recharge. */
export type AssistantChange = { kind: "motif" | "power_card"; id: string } | { kind: "moments" };

let configRequest: Promise<AiConfigView> | null = null;
/** Fournisseurs et modèles, lus une fois par visite de la console (le serveur garde la liste 10 min). */
function loadConfig(): Promise<AiConfigView> {
  configRequest ??= adminApi.aiConfig().catch((error: unknown) => { configRequest = null; throw error; });
  return configRequest;
}

function storedSettings(): Partial<AiSettings> {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<AiSettings>; } catch { return {}; }
}

export function settingsFor(provider: AiProviderView, base: Partial<AiSettings> = {}): AiSettings {
  const caps = provider.capabilities;
  return {
    provider: provider.id,
    model: base.provider === provider.id && base.model ? base.model : provider.defaultModel ?? provider.models[0] ?? "",
    thinking: base.provider === provider.id && base.thinking && caps.thinking.includes(base.thinking) ? base.thinking : caps.defaultThinking,
    temperature: caps.temperature === "never" ? null : base.provider === provider.id ? base.temperature ?? null : null,
    technical: base.technical === true,
  };
}

export function assistantErrorText(cause: unknown): string {
  if (cause instanceof BackendError && cause.message === "AI_PROVIDER_ERROR") {
    const details = cause.details as { provider?: string; status?: number; message?: string } | undefined;
    return `Le fournisseur (${details?.provider ?? "?"}) a répondu ${details?.status ?? "une erreur"} : ${details?.message ?? "erreur inconnue"}`;
  }
  return adminErrorText(cause);
}

/** Brouillons écrits par les outils dans ces messages. */
export function changesIn(messages: AiViewMessage[]): AssistantChange[] {
  return messages.flatMap((message) => (message.role === "tool" ? message.results : []))
    .flatMap((result) => (result.ok && result.draft ? [{ kind: result.draft.kind, id: result.draft.id }] : []));
}

function proposalChange(conversation: AiConversationView, proposalId: string): AssistantChange | null {
  const proposal = conversation.messages.flatMap((message) => (message.role === "tool" ? message.results : [])).find((result) => result.proposal?.id === proposalId)?.proposal;
  if (!proposal) return null;
  if (proposal.kind === "set_moments") return { kind: "moments" };
  const id = String(proposal.kind === "publish_motif" ? proposal.payload.motifId : proposal.payload.cardId);
  return { kind: proposal.kind === "publish_motif" ? "motif" : "power_card", id };
}

export interface SendOptions {
  module: AiModule;
  /** Page d'origine (nouvelle conversation seulement : elle reste attachée à la conversation). */
  context?: AiContext;
  /** Copie de travail non enregistrée de l'élément ouvert, jointe au message. */
  working?: unknown;
}

export function useAssistant(options: { onChanged?(changes: AssistantChange[]): void; onActivity?(): void } = {}) {
  const [config, setConfig] = useState<AiConfigView | null>(null);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [conversation, setConversation] = useState<AiConversationView | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; });
  // Un panneau fermé en cours de route s'arrête après l'étape en cours.
  useEffect(() => () => { stopRef.current = true; }, []);

  useEffect(() => {
    let alive = true;
    loadConfig().then((loaded) => {
      if (!alive) return;
      setConfig(loaded);
      const saved = storedSettings();
      const provider = loaded.providers.find((item) => item.id === saved.provider && item.enabled) ?? loaded.providers.find((item) => item.enabled) ?? loaded.providers[0];
      if (provider) setSettings(settingsFor(provider, saved));
    }, (cause: unknown) => { if (alive) setError(assistantErrorText(cause)); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!settings) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* stockage indisponible */ }
  }, [settings]);

  const provider = config?.providers.find((item) => item.id === settings?.provider) ?? null;
  const providerLabels = useMemo(() => Object.fromEntries((config?.providers ?? []).map((item) => [item.id, item.label])), [config]);

  const report = (view: AiConversationView, from: number) => {
    const changes = changesIn(view.messages.slice(from));
    if (changes.length) optionsRef.current.onChanged?.(changes);
  };

  /** Enchaîne les étapes tant que l'assistant utilise des outils (une requête = un appel au modèle). */
  const drive = async (view: AiConversationView, from: number) => {
    let current = view;
    setConversation(current);
    report(current, from);
    while (current.pending && !stopRef.current) {
      setStatus(`L'assistant travaille… étape ${current.rounds + 1} sur ${config?.maxToolRounds ?? 12} au plus`);
      const seen = current.messages.length;
      current = await adminApi.aiContinue(current.id, settings ?? undefined);
      setConversation(current);
      report(current, seen);
    }
    if (stopRef.current && current.pending) setStatus("Arrêté. Écris-lui pour reprendre, ou poursuis.");
    else setStatus(current.limitReached ? "Limite d'étapes atteinte pour ce message : écris-lui pour continuer." : null);
  };

  const guard = async (job: () => Promise<void>, conversationId?: string) => {
    setBusy(true);
    setError(null);
    stopRef.current = false;
    try {
      await job();
    } catch (cause) {
      setError(assistantErrorText(cause));
      setStatus(null);
      // Le serveur a gardé le message : on recharge pour pouvoir relancer.
      const id = conversationId ?? conversation?.id;
      if (id) setConversation(await adminApi.aiConversation(id).catch(() => conversation));
    } finally {
      setBusy(false);
      optionsRef.current.onActivity?.();
    }
  };

  const send = (text: string, extra: SendOptions) => {
    const message = text.trim();
    if (!message || !settings || busy) return false;
    setStatus("L'assistant réfléchit…");
    const from = conversation?.messages.length ?? 0;
    void guard(async () => {
      const view = await adminApi.aiSend({
        conversationId: conversation?.id, module: conversation?.module ?? extra.module, text: message, settings,
        ...(!conversation && extra.context ? { context: extra.context } : {}), ...(extra.working ? { working: extra.working } : {}),
      });
      await drive(view, conversation?.id === view.id ? from : 0);
    });
    return true;
  };

  /** Relance le dernier message resté sans réponse, ou poursuit les étapes d'outils interrompues. */
  const resume = () => conversation && settings && void guard(async () => {
    setStatus(conversation.retryable ? "Nouvel essai…" : "Reprise…");
    await drive(await adminApi.aiContinue(conversation.id, settings), conversation.messages.length);
  }, conversation.id);

  const resolve = (proposalId: string, outcome: "confirmed" | "dismissed") => conversation && void guard(async () => {
    setStatus(outcome === "confirmed" ? "Exécution de l'action…" : null);
    const change = outcome === "confirmed" ? proposalChange(conversation, proposalId) : null;
    setConversation(await adminApi.aiResolve(conversation.id, proposalId, outcome));
    setStatus(null);
    if (change) optionsRef.current.onChanged?.([change]);
  }, conversation.id);

  // Le mode d'explication reste celui de l'admin, pas celui enregistré avec la conversation.
  const applySettings = useCallback((view: AiConversationView) => {
    const viewProvider = config?.providers.find((item) => item.id === view.settings.provider && item.enabled);
    if (viewProvider) setSettings((current) => settingsFor(viewProvider, { ...view.settings, technical: current?.technical === true }));
  }, [config]);

  const open = (id: string) => void guard(async () => {
    const view = await adminApi.aiConversation(id);
    setConversation(view);
    applySettings(view);
  }, id);

  const reset = () => { setConversation(null); setError(null); setStatus(null); };

  const remove = (id: string) => void guard(async () => {
    await adminApi.aiDelete(id);
    if (conversation?.id === id) setConversation(null);
  });

  const stop = () => { stopRef.current = true; setStatus("Arrêt après l'étape en cours…"); };

  const chooseProvider = (id: string) => {
    const next = config?.providers.find((item) => item.id === id);
    if (next) setSettings(settingsFor(next, settings ?? {}));
  };

  return {
    config, settings, setSettings, chooseProvider, provider, providerLabels,
    conversation, busy, status, error,
    send, resume, resolve, open, reset, remove, stop,
  };
}

export type AssistantHandle = ReturnType<typeof useAssistant>;
