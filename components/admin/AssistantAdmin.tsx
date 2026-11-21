"use client";

/* Section « Assistant IA » : poser des questions sur les animations et les
   cartes de pouvoir, en créer ou en modifier (brouillons), comprendre leurs
   effets en jeu. Choix de l'IA (DeepSeek, Claude, OpenAI, Gemini, service
   compatible OpenAI), du modèle, de la réflexion et de la température.
   L'assistant n'écrit que des brouillons : publier ou attribuer un moment
   passe par une proposition que l'admin confirme. Les clés restent sur le
   serveur. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangelogAdminSection } from "@/domain";
import { BackendError } from "@/lib/backend";
import {
  adminApi, adminErrorText,
  type AiConfigView, type AiConversationSummary, type AiConversationView, type AiModule, type AiProviderView, type AiSettings, type ThinkingLevel,
} from "./adminApi";
import { AssistantMessages } from "./assistant/AssistantMessages";
import styles from "./AdminConsole.module.css";

const MODULE_LABELS: Record<AiModule, string> = { animations: "Animations", powers: "Cartes de pouvoir", all: "Animations + cartes" };
const THINKING_LABELS: Record<ThinkingLevel, string> = { default: "Par défaut", off: "Coupée", low: "Faible", medium: "Moyenne", high: "Élevée", xhigh: "Très élevée", max: "Maximale" };
const EXAMPLES: Record<AiModule, string[]> = {
  animations: [
    "Explique-moi le moment « Pli gagné » : qui le voit, combien de temps, quelles contraintes ?",
    "Crée en brouillon une variante de « Jouer une carte · vol actuel » avec un petit rebond à l'arrivée.",
    "Quels modèles conviennent à la carte jouée, et lequel me conseilles-tu ?",
  ],
  powers: [
    "Quelles cartes de pouvoir ciblent un adversaire, et que font-elles exactement ?",
    "Explique-moi pas à pas ce que fait la carte vent_nord en partie.",
    "Propose une nouvelle carte de défense, en brouillon, inspirée de bouclier_village.",
  ],
  all: [
    "Comment une carte de pouvoir peut-elle réutiliser un modèle de l'atelier dans sa chorégraphie ?",
    "Fais-moi un état des lieux : modèles en brouillon, cartes avec des erreurs.",
  ],
};
const STORAGE_KEY = "njambo.assistant.settings";

function storedSettings(): Partial<AiSettings> {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<AiSettings>; } catch { return {}; }
}

function settingsFor(provider: AiProviderView, base: Partial<AiSettings> = {}): AiSettings {
  const caps = provider.capabilities;
  return {
    provider: provider.id,
    model: base.provider === provider.id && base.model ? base.model : provider.defaultModel ?? provider.models[0] ?? "",
    thinking: base.provider === provider.id && base.thinking && caps.thinking.includes(base.thinking) ? base.thinking : caps.defaultThinking,
    temperature: caps.temperature === "never" ? null : base.provider === provider.id ? base.temperature ?? null : null,
  };
}

function errorText(cause: unknown): string {
  if (cause instanceof BackendError && cause.message === "AI_PROVIDER_ERROR") {
    const details = cause.details as { provider?: string; status?: number; message?: string } | undefined;
    return `Le fournisseur (${details?.provider ?? "?"}) a répondu ${details?.status ?? "une erreur"} : ${details?.message ?? "erreur inconnue"}`;
  }
  return adminErrorText(cause);
}

export function AssistantAdmin({ onOpenSection }: { onOpenSection(section: ChangelogAdminSection): void }) {
  const [config, setConfig] = useState<AiConfigView | null>(null);
  const [list, setList] = useState<AiConversationSummary[] | null>(null);
  const [conversation, setConversation] = useState<AiConversationView | null>(null);
  const [module, setModule] = useState<AiModule>("animations");
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    const result = await adminApi.aiConversations();
    setList(result.conversations);
    return result.conversations;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await adminApi.aiConfig();
        setConfig(loaded);
        const saved = storedSettings();
        const provider = loaded.providers.find((item) => item.id === saved.provider && item.enabled) ?? loaded.providers.find((item) => item.enabled) ?? loaded.providers[0];
        if (provider) setSettings(settingsFor(provider, saved));
        await loadList();
      } catch (cause) {
        setError(errorText(cause));
      }
    })();
  }, [loadList]);

  useEffect(() => {
    if (!settings) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* stockage indisponible */ }
  }, [settings]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [conversation?.messages.length]);

  const provider = config?.providers.find((item) => item.id === settings?.provider) ?? null;
  const providerLabels = useMemo(() => Object.fromEntries((config?.providers ?? []).map((item) => [item.id, item.label])), [config]);
  const caps = provider?.capabilities;
  const temperatureActive = Boolean(caps && settings && (caps.temperature === "always" || (caps.temperature === "when_off" && settings.thinking === "off")));
  const temperatureHint = !caps ? "" : caps.temperature === "never" ? "Non acceptée par ce fournisseur." : caps.temperature === "when_off" && settings?.thinking !== "off" ? "Sans effet tant que la réflexion est active." : "";

  /** Enchaîne les étapes tant que l'assistant utilise des outils (une requête = un appel au modèle). */
  const drive = async (view: AiConversationView) => {
    let current = view;
    setConversation(current);
    while (current.pending && !stopRef.current) {
      setStatus(`L'assistant travaille… étape ${current.rounds + 1} sur ${config?.maxToolRounds ?? 12} au plus`);
      current = await adminApi.aiContinue(current.id, settings ?? undefined);
      setConversation(current);
    }
    if (stopRef.current && current.pending) setStatus("Arrêté. Écris-lui pour reprendre, ou relance.");
    else setStatus(current.limitReached ? "Limite d'étapes atteinte pour ce message : écris-lui pour continuer." : null);
  };

  const guard = async (job: () => Promise<void>, conversationId?: string) => {
    setBusy(true);
    setError(null);
    stopRef.current = false;
    try {
      await job();
    } catch (cause) {
      setError(errorText(cause));
      setStatus(null);
      // Le serveur a gardé le message : on recharge pour pouvoir relancer.
      const id = conversationId ?? conversation?.id ?? (await loadList().catch(() => []))[0]?.id;
      if (id) setConversation(await adminApi.aiConversation(id).catch(() => conversation));
    } finally {
      setBusy(false);
      void loadList().catch(() => undefined);
    }
  };

  const send = () => {
    const message = text.trim();
    if (!message || !settings || busy) return;
    setText("");
    setStatus("L'assistant réfléchit…");
    void guard(async () => {
      await drive(await adminApi.aiSend({ conversationId: conversation?.id, module: conversation?.module ?? module, text: message, settings }));
    });
  };

  const retry = () => conversation && settings && void guard(async () => {
    setStatus("Nouvel essai…");
    await drive(await adminApi.aiContinue(conversation.id, settings));
  }, conversation.id);

  const resolve = (proposalId: string, outcome: "confirmed" | "dismissed") => conversation && void guard(async () => {
    setStatus(outcome === "confirmed" ? "Exécution de l'action…" : null);
    setConversation(await adminApi.aiResolve(conversation.id, proposalId, outcome));
    setStatus(null);
  }, conversation.id);

  const open = (id: string) => void guard(async () => {
    const view = await adminApi.aiConversation(id);
    setConversation(view);
    const viewProvider = config?.providers.find((item) => item.id === view.settings.provider && item.enabled);
    if (viewProvider) setSettings(settingsFor(viewProvider, view.settings));
  }, id);

  const remove = (item: AiConversationSummary) => {
    if (!window.confirm(`Supprimer la conversation « ${item.title} » ? Elle ne pourra pas être récupérée.`)) return;
    void guard(async () => {
      await adminApi.aiDelete(item.id);
      if (conversation?.id === item.id) setConversation(null);
    });
  };

  const chooseProvider = (id: string) => {
    const next = config?.providers.find((item) => item.id === id);
    if (next) setSettings(settingsFor(next, settings ?? {}));
  };

  if (!config || !settings) {
    return (
      <div>
        <div className={styles.pageHead}><div><h1>Assistant IA</h1><p>Chargement des fournisseurs…</p></div></div>
        {error && <div className={`${styles.notice} ${styles.error}`}>{error}</div>}
      </div>
    );
  }

  const currentModule = conversation?.module ?? module;
  return (
    <div>
      <div className={styles.pageHead}>
        <div>
          <h1>Assistant IA</h1>
          <p>Pose tes questions sur les animations et les cartes de pouvoir, fais-en créer ou modifier (en brouillon), comprends leurs effets en jeu. Rien n&apos;arrive aux joueurs sans ta confirmation.</p>
        </div>
      </div>
      {/* Deux colonnes qui se replient (liste au-dessus) quand la place manque. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start" }}>
        <aside className={styles.panel} style={{ flex: "1 1 220px", maxWidth: 320, padding: 10, maxHeight: "calc(100svh - 40px)", overflow: "auto" }}>
          <label className={styles.field}><span>Nouvelle conversation</span>
            <select value={module} onChange={(event) => setModule(event.target.value as AiModule)}>
              {config.modules.map((item) => <option key={item} value={item}>{MODULE_LABELS[item]}</option>)}
            </select>
          </label>
          <button type="button" className={`${styles.btn} ${styles.primary}`} style={{ width: "100%", marginTop: 8 }} disabled={busy} onClick={() => { setConversation(null); setError(null); setStatus(null); }}>+ Nouvelle</button>
          <div style={{ marginTop: 12, display: "grid", gap: 4 }}>
            {list === null ? <p className={styles.hint}>Chargement…</p> : list.length === 0 ? <p className={styles.hint}>Aucune conversation.</p> : list.map((item) => (
              <div key={item.id} style={{ display: "flex", gap: 4, alignItems: "start" }}>
                <button type="button" onClick={() => open(item.id)} disabled={busy}
                  style={{ flex: 1, minWidth: 0, textAlign: "left", padding: "6px 8px", borderRadius: 9, border: `1px solid ${conversation?.id === item.id ? "var(--gold)" : "transparent"}`, background: conversation?.id === item.id ? "#2a1d12" : "none", color: "var(--ink)", cursor: "pointer" }}>
                  <b style={{ display: "block", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</b>
                  <small className={styles.hint}>{MODULE_LABELS[item.module]} · {new Date(item.updatedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</small>
                </button>
                <button type="button" className={`${styles.btn} ${styles.small}`} title="Supprimer" disabled={busy} onClick={() => remove(item)}>✕</button>
              </div>
            ))}
          </div>
        </aside>

        <section className={styles.panel} style={{ flex: "999 1 420px", minWidth: 0, display: "grid", gap: 10, minHeight: "70svh", alignContent: "start" }}>
          <div className={styles.row} style={{ gap: 8, alignItems: "end", flexWrap: "wrap" }} data-testid="ai-settings">
            <label className={styles.field} style={{ minWidth: 170 }}><span>IA</span>
              <select data-testid="ai-provider" value={settings.provider} disabled={busy} onChange={(event) => chooseProvider(event.target.value)}>
                {config.providers.map((item) => <option key={item.id} value={item.id} disabled={!item.enabled}>{item.label}{item.enabled ? "" : " (non configuré)"}</option>)}
              </select>
            </label>
            <label className={styles.field} style={{ minWidth: 210, flex: 1 }}><span>Modèle{provider && !provider.live ? " (liste de repli)" : ""}</span>
              <input data-testid="ai-model" list="ai-models" value={settings.model} disabled={busy} onChange={(event) => setSettings({ ...settings, model: event.target.value.trim() })} />
              <datalist id="ai-models">{provider?.models.map((model) => <option key={model} value={model} />)}</datalist>
            </label>
            <label className={styles.field} style={{ minWidth: 140 }}><span>Réflexion</span>
              <select data-testid="ai-thinking" value={settings.thinking} disabled={busy} onChange={(event) => setSettings({ ...settings, thinking: event.target.value as ThinkingLevel })}>
                {caps?.thinking.map((level) => <option key={level} value={level}>{THINKING_LABELS[level]}</option>)}
              </select>
            </label>
            <label className={styles.field} style={{ minWidth: 190 }} title={temperatureHint}>
              <span>Température {settings.temperature === null ? "(par défaut)" : settings.temperature.toFixed(2)}</span>
              <div className={styles.row} style={{ gap: 6, flexWrap: "nowrap" }}>
                <input type="checkbox" aria-label="Fixer la température" style={{ width: "auto", flex: "none" }} disabled={busy || caps?.temperature === "never"} checked={settings.temperature !== null}
                  onChange={(event) => setSettings({ ...settings, temperature: event.target.checked ? 0.7 : null })} />
                <input type="range" aria-label="Température" min={0} max={caps?.temperatureMax ?? 2} step={0.05} style={{ flex: 1, minWidth: 0 }}
                  disabled={busy || settings.temperature === null} value={settings.temperature ?? 0.7} onChange={(event) => setSettings({ ...settings, temperature: Number(event.target.value) })} />
              </div>
            </label>
          </div>
          <p className={styles.hint} style={{ margin: 0 }}>
            {caps?.note}{temperatureHint && settings.temperature !== null && !temperatureActive ? ` ${temperatureHint}` : ""}
            {provider && !provider.enabled && provider.reason ? ` ${provider.reason}` : ""}
            {conversation ? ` · Module : ${MODULE_LABELS[currentModule]} · ${conversation.usage.inputTokens.toLocaleString("fr-FR")} jetons lus, ${conversation.usage.outputTokens.toLocaleString("fr-FR")} écrits` : ""}
          </p>
          {!config.providers.some((item) => item.enabled && item.id !== "simulation") && (
            <div className={`${styles.notice} ${styles.error}`}>Aucune clé d&apos;IA n&apos;est configurée sur le serveur : ajoute-les dans server/.env (voir server/.env.example), puis redémarre le serveur.</div>
          )}

          <div style={{ minHeight: 280 }}>
            {conversation ? (
              <AssistantMessages messages={conversation.messages} providerLabels={providerLabels} busy={busy} onResolve={resolve} onOpenSection={onOpenSection} />
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                <p className={styles.hint} style={{ margin: 0 }}>Nouvelle conversation · {MODULE_LABELS[module]}. Exemples :</p>
                {EXAMPLES[module].map((example) => (
                  <button key={example} type="button" onClick={() => setText(example)}
                    style={{ textAlign: "left", padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "#110d0a", color: "var(--ink)", font: "inherit", cursor: "pointer" }}>{example}</button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {status && <div className={styles.hint} data-testid="ai-status">{status}</div>}
          {error && (
            <div className={`${styles.notice} ${styles.error}`} data-testid="ai-error">
              {error}
              {conversation?.retryable && <button type="button" className={`${styles.btn} ${styles.small}`} style={{ marginLeft: 8 }} disabled={busy} onClick={retry}>Relancer</button>}
            </div>
          )}
          {!error && conversation?.retryable && !busy && (
            <div className={styles.hint}>Ton dernier message est resté sans réponse. <button type="button" className={`${styles.btn} ${styles.small}`} onClick={retry}>Relancer</button></div>
          )}

          <div style={{ display: "grid", gap: 6 }}>
            <textarea data-testid="ai-input" value={text} rows={3} placeholder="Écris ta question ou ta demande… (Ctrl+Entrée pour envoyer)" disabled={busy}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); send(); } }}
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: 10, borderRadius: 10, border: "1px solid var(--line)", background: "#0c0906", color: "var(--ink)", font: "inherit" }} />
            <div className={styles.row} style={{ justifyContent: "flex-end", gap: 6 }}>
              {busy && <button type="button" className={styles.btn} onClick={() => { stopRef.current = true; setStatus("Arrêt après l'étape en cours…"); }}>Arrêter</button>}
              <button type="button" data-testid="ai-send" className={`${styles.btn} ${styles.primary}`} disabled={busy || !text.trim() || !settings.model || !provider?.enabled} onClick={send}>Envoyer</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
