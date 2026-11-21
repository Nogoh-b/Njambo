"use client";

/* Fil et saisie d'une conversation avec l'assistant : réglages de l'IA
   (fournisseur, modèle, réflexion, température), messages, état, relance,
   zone de saisie. Pleine page dans la section « Assistant IA », compact
   dans le panneau des pages Animations et Cartes de pouvoir. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ChangelogAdminSection } from "@/domain";
import type { ThinkingLevel } from "../adminApi";
import { AssistantMessages } from "./AssistantMessages";
import type { AssistantHandle } from "./useAssistant";
import styles from "../AdminConsole.module.css";

export const THINKING_LABELS: Record<ThinkingLevel, string> = { default: "Par défaut", off: "Coupée", on: "Activée", low: "Faible", medium: "Moyenne", high: "Élevée", xhigh: "Très élevée", max: "Maximale" };

export interface AssistantExample {
  /** Libellé court (puce du panneau) ; à défaut, le texte entier. */
  label?: string;
  text: string;
}

export function AssistantChat({ assistant, compact = false, examples, sendExamples = false, intro, notice, onSend, onOpenSection, onOpenDraft }: {
  assistant: AssistantHandle;
  compact?: boolean;
  examples: AssistantExample[];
  /** Un exemple s'envoie d'un clic (panneau) au lieu de remplir la saisie. */
  sendExamples?: boolean;
  intro?: ReactNode;
  /** Ligne d'information au-dessus de la saisie (copie de travail jointe…). */
  notice?: ReactNode;
  onSend(text: string): boolean;
  onOpenSection?(section: ChangelogAdminSection): void;
  onOpenDraft?(draft: { kind: "motif" | "power_card"; id: string }): void;
}) {
  const { config, settings, setSettings, chooseProvider, provider, providerLabels, conversation, busy, status, error } = assistant;
  const [text, setText] = useState("");
  const [showSettings, setShowSettings] = useState(!compact);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Le panneau fait défiler son propre fil ; la pleine page fait défiler la page.
    if (compact && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    else endRef.current?.scrollIntoView({ block: "end" });
  }, [conversation?.messages.length, conversation?.id, compact]);

  if (!config || !settings) {
    return error ? <div className={`${styles.notice} ${styles.error}`}>{error}</div> : <p className={styles.hint}>Chargement des fournisseurs…</p>;
  }

  const caps = provider?.capabilities;
  const temperatureActive = Boolean(caps && (caps.temperature === "always" || (caps.temperature === "when_off" && settings.thinking === "off")));
  const temperatureHint = !caps ? "" : caps.temperature === "never" ? "Non acceptée par ce fournisseur." : caps.temperature === "when_off" && settings.thinking !== "off" ? "Sans effet tant que la réflexion est active." : "";
  const ready = !busy && Boolean(settings.model) && Boolean(provider?.enabled);
  const submit = (value: string) => { if (ready && onSend(value)) setText(""); };
  const pick = (example: AssistantExample) => (sendExamples ? submit(example.text) : setText(example.text));

  const settingsRow = (
    <div className={styles.row} style={{ gap: 8, alignItems: "end", flexWrap: "wrap" }} data-testid="ai-settings">
      <label className={styles.field} style={{ minWidth: compact ? 140 : 170, flex: compact ? 1 : undefined }}><span>IA</span>
        <select data-testid="ai-provider" value={settings.provider} disabled={busy} onChange={(event) => chooseProvider(event.target.value)}>
          {config.providers.map((item) => <option key={item.id} value={item.id} disabled={!item.enabled}>{item.label}{item.enabled ? "" : " (non configuré)"}</option>)}
        </select>
      </label>
      <label className={styles.field} style={{ minWidth: compact ? 160 : 210, flex: 1 }}><span>Modèle{provider && !provider.live ? " (liste de repli)" : ""}</span>
        <input data-testid="ai-model" list={compact ? "ai-models-panel" : "ai-models"} value={settings.model} disabled={busy} onChange={(event) => setSettings({ ...settings, model: event.target.value.trim() })} />
        <datalist id={compact ? "ai-models-panel" : "ai-models"}>{provider?.models.map((model) => <option key={model} value={model} />)}</datalist>
      </label>
      <label className={styles.field} style={{ minWidth: 130, flex: compact ? 1 : undefined }}><span>Réflexion</span>
        <select data-testid="ai-thinking" value={settings.thinking} disabled={busy} onChange={(event) => setSettings({ ...settings, thinking: event.target.value as ThinkingLevel })}>
          {caps?.thinking.map((level) => <option key={level} value={level}>{THINKING_LABELS[level]}</option>)}
        </select>
      </label>
      <label className={styles.field} style={{ minWidth: 170, flex: compact ? 1 : undefined }} title={temperatureHint}>
        <span>Température {settings.temperature === null ? "(par défaut)" : settings.temperature.toFixed(2)}</span>
        <div className={styles.row} style={{ gap: 6, flexWrap: "nowrap" }}>
          <input type="checkbox" aria-label="Fixer la température" style={{ width: "auto", flex: "none" }} disabled={busy || caps?.temperature === "never"} checked={settings.temperature !== null}
            onChange={(event) => setSettings({ ...settings, temperature: event.target.checked ? 0.7 : null })} />
          <input type="range" aria-label="Température" min={0} max={caps?.temperatureMax ?? 2} step={0.05} style={{ flex: 1, minWidth: 0 }}
            disabled={busy || settings.temperature === null} value={settings.temperature ?? 0.7} onChange={(event) => setSettings({ ...settings, temperature: Number(event.target.value) })} />
        </div>
      </label>
    </div>
  );

  const technical = settings.technical === true;
  const technicalSwitch = (
    <label className={styles.check} style={{ fontSize: 12, flex: "none" }} data-testid="ai-technical"
      title="Coupé : réponses en langage simple, sans code ni identifiants, détails des outils masqués. Activé : explications techniques (champs, identifiants, JSON).">
      <input type="checkbox" checked={technical} onChange={(event) => setSettings({ ...settings, technical: event.target.checked })} /> Explications techniques
    </label>
  );

  const hints = (
    <p className={styles.hint} style={{ margin: 0 }}>
      {caps?.note}{temperatureHint && settings.temperature !== null && !temperatureActive ? ` ${temperatureHint}` : ""}
      {provider && !provider.enabled && provider.reason ? ` ${provider.reason}` : ""}
      {technical && conversation && conversation.usage.inputTokens + conversation.usage.outputTokens > 0 ? ` · ${conversation.usage.inputTokens.toLocaleString("fr-FR")} jetons lus, ${conversation.usage.outputTokens.toLocaleString("fr-FR")} écrits` : ""}
    </p>
  );

  const thread = (
    <>
      {intro}
      {conversation ? (
        <AssistantMessages messages={conversation.messages} providerLabels={providerLabels} busy={busy} technical={technical} onResolve={assistant.resolve} onOpenSection={onOpenSection} onOpenDraft={onOpenDraft} />
      ) : (
        <div style={{ display: "grid", gap: 8 }} data-testid="ai-examples">
          {examples.map((example) => (
            <button key={example.text} type="button" disabled={sendExamples && !ready} onClick={() => pick(example)}
              style={{ textAlign: "left", padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "#110d0a", color: "var(--ink)", font: "inherit", cursor: "pointer" }}>
              {sendExamples && example.label ? <><b>{example.label}</b><br /><span className={styles.hint}>{example.text}</span></> : example.text}
            </button>
          ))}
        </div>
      )}
      <div ref={endRef} />
    </>
  );

  const footer = (
    <>
      {status && <div className={styles.hint} data-testid="ai-status">{status}</div>}
      {error && (
        <div className={`${styles.notice} ${styles.error}`} data-testid="ai-error" style={{ margin: 0 }}>
          {error}
          {(conversation?.retryable || conversation?.pending) && <button type="button" className={`${styles.btn} ${styles.small}`} style={{ marginLeft: 8 }} disabled={busy} onClick={assistant.resume}>Relancer</button>}
        </div>
      )}
      {!error && !busy && conversation?.retryable && (
        <div className={styles.hint}>Ton dernier message est resté sans réponse. <button type="button" className={`${styles.btn} ${styles.small}`} onClick={assistant.resume}>Relancer</button></div>
      )}
      {!error && !busy && conversation?.pending && (
        <div className={styles.hint}>L&apos;assistant s&apos;est arrêté en cours de route. <button type="button" className={`${styles.btn} ${styles.small}`} onClick={assistant.resume}>Poursuivre</button></div>
      )}
      {compact && conversation && examples.length > 0 && (
        <div className={styles.row} style={{ gap: 4 }} data-testid="ai-quick">
          {examples.map((example) => (
            <button key={example.text} type="button" className={styles.chip} style={{ padding: "4px 9px", fontSize: 11.5 }} title={example.text} disabled={!ready} onClick={() => pick(example)}>{example.label ?? example.text}</button>
          ))}
        </div>
      )}
      {notice && <div className={styles.hint} style={{ color: "var(--gold)" }}>{notice}</div>}
      <div style={{ display: "grid", gap: 6 }}>
        <textarea data-testid="ai-input" value={text} rows={compact ? 2 : 3} placeholder="Écris ta question ou ta demande… (Ctrl+Entrée pour envoyer)" disabled={busy}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submit(text); } }}
          style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: 10, borderRadius: 10, border: "1px solid var(--line)", background: "#0c0906", color: "var(--ink)", font: "inherit" }} />
        <div className={styles.row} style={{ justifyContent: "flex-end", gap: 6 }}>
          {busy && <button type="button" className={styles.btn} onClick={assistant.stop}>Arrêter</button>}
          <button type="button" data-testid="ai-send" className={`${styles.btn} ${styles.primary}`} disabled={!ready || !text.trim()} onClick={() => submit(text)}>Envoyer</button>
        </div>
      </div>
    </>
  );

  const noKeys = !config.providers.some((item) => item.enabled && item.id !== "simulation") && (
    <div className={`${styles.notice} ${styles.error}`} style={{ margin: 0 }}>Aucune clé d&apos;IA n&apos;est configurée sur le serveur : ajoute-les dans server/.env (voir server/.env.example), puis redémarre le serveur.</div>
  );

  if (compact) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, flex: 1 }}>
        <div className={styles.row} style={{ gap: 8, flexWrap: "nowrap", alignItems: "center" }}>
          <button type="button" className={styles.hint} data-testid="ai-settings-toggle" onClick={() => setShowSettings(!showSettings)}
            style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left", background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit", fontSize: 12 }}>
            ⚙ {provider?.label ?? settings.provider} · {settings.model || "modèle ?"} · réflexion {THINKING_LABELS[settings.thinking].toLowerCase()} {showSettings ? "▴" : "▾"}
          </button>
          {technicalSwitch}
        </div>
        {showSettings && <>{settingsRow}{hints}</>}
        {noKeys}
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: "auto", display: "grid", gap: 8, alignContent: "start", paddingRight: 2 }}>{thread}</div>
        {footer}
      </div>
    );
  }

  return (
    <section className={styles.panel} style={{ flex: "999 1 420px", minWidth: 0, display: "grid", gap: 10, minHeight: "70svh", alignContent: "start" }}>
      {settingsRow}
      {technicalSwitch}
      {hints}
      {noKeys}
      <div style={{ minHeight: 280 }}>{thread}</div>
      {footer}
    </section>
  );
}
