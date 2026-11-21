"use client";

/* Fil d'une conversation avec l'assistant : messages de l'admin, réponses
   (réflexion repliable), appels d'outils avec leur résultat, brouillons
   écrits (lien vers la section) et propositions à confirmer. */

import type { ChangelogAdminSection } from "@/domain";
import type { AiProposal, AiToolResult, AiViewMessage } from "../adminApi";
import { Markdown } from "./Markdown";
import styles from "../AdminConsole.module.css";

const TOOL_LABELS: Record<string, string> = {
  get_reference: "Référence",
  list_animation_models: "Bibliothèque des modèles",
  get_animation_model: "Modèle d'animation",
  validate_animation_model: "Validation d'un modèle",
  save_animation_model_draft: "Brouillon de modèle",
  propose_publish_animation_model: "Proposition de publication",
  find_animation_usage: "Usages en jeu",
  get_game_moments: "Moments du jeu",
  propose_game_moments: "Proposition de moments",
  list_power_cards: "Catalogue des cartes",
  get_power_card: "Carte de pouvoir",
  validate_power_card: "Validation d'une carte",
  save_power_card_draft: "Brouillon de carte",
  propose_publish_power_card: "Proposition de publication",
};

function pretty(text: string): string {
  try { return JSON.stringify(JSON.parse(text), null, 2).slice(0, 12_000); } catch { return text.slice(0, 12_000); }
}

/** Bloc de détail : défile, et revient à la ligne quand le JSON n'a pas pu être mis en forme (contenu tronqué). */
const DETAIL_STYLE = { margin: 0, maxHeight: 240, overflow: "auto", fontSize: 11, background: "#0c0906", border: "1px solid var(--line)", borderRadius: 8, padding: 8, whiteSpace: "pre-wrap", wordBreak: "break-word" } as const;

function ProposalCard({ proposal, busy, onResolve }: { proposal: AiProposal; busy: boolean; onResolve(outcome: "confirmed" | "dismissed"): void }) {
  const reason = typeof proposal.payload.reason === "string" ? proposal.payload.reason : "";
  return (
    <div data-testid="ai-proposal" style={{ border: `1px solid ${proposal.status === "pending" ? "var(--gold)" : "var(--line)"}`, borderRadius: 12, padding: 10, margin: "6px 0", background: proposal.status === "pending" ? "#2a1d12" : "transparent" }}>
      <div style={{ fontWeight: 800 }}>{proposal.label}</div>
      {reason && <div className={styles.hint} style={{ marginTop: 2 }}>{reason}</div>}
      {proposal.status === "pending" ? (
        <div className={styles.row} style={{ marginTop: 8, gap: 6 }}>
          <button type="button" className={`${styles.btn} ${styles.primary} ${styles.small}`} disabled={busy} onClick={() => onResolve("confirmed")}>Confirmer</button>
          <button type="button" className={`${styles.btn} ${styles.small}`} disabled={busy} onClick={() => onResolve("dismissed")}>Écarter</button>
          <span className={styles.hint}>L&apos;assistant n&apos;agit pas sans toi : l&apos;action part chez les joueurs quand tu confirmes.</span>
        </div>
      ) : (
        <div className={styles.hint} style={{ marginTop: 6, color: proposal.status === "confirmed" ? "var(--ok, #6fd39a)" : undefined }}>{proposal.status === "confirmed" ? "✓ Confirmée" : "Écartée"}</div>
      )}
    </div>
  );
}

type DraftRef = NonNullable<AiToolResult["draft"]>;

function ToolResultLine({ name, input, result, busy, technical, onResolve, onOpenSection, onOpenDraft }: {
  name: string; input: Record<string, unknown>; result?: AiToolResult; busy: boolean; technical: boolean;
  onResolve(proposalId: string, outcome: "confirmed" | "dismissed"): void; onOpenSection?(section: ChangelogAdminSection): void; onOpenDraft?(draft: DraftRef): void;
}) {
  const label = TOOL_LABELS[name] ?? name;
  return (
    <div style={{ margin: "4px 0" }}>
      {/* Mode simple : ce que l'assistant a consulté ou fait, sans données ni identifiants. */}
      {!technical && <div className={styles.hint} style={{ fontSize: 12 }}>{result ? (result.ok ? "✓" : "↻") : "…"} {label}</div>}
      {technical && <details>
        <summary className={styles.hint} style={{ cursor: "pointer", color: result && !result.ok ? "var(--danger)" : undefined }}>
          {result ? (result.ok ? "✓" : "⚠") : "…"} <b>{label}</b> — {result?.summary ?? "en cours"}
        </summary>
        <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
          {Object.keys(input).length > 0 && <pre style={DETAIL_STYLE}>{pretty(JSON.stringify(input))}</pre>}
          {result && <pre style={DETAIL_STYLE}>{pretty(result.content)}</pre>}
        </div>
      </details>}
      {result?.draft && onOpenDraft && (
        <button type="button" className={`${styles.btn} ${styles.small}`} style={{ marginTop: 4 }} onClick={() => onOpenDraft(result.draft!)}>
          Voir {result.draft.kind === "motif" ? "le modèle" : "la carte"}{technical ? ` · ${result.draft.id}` : ""}
        </button>
      )}
      {result?.draft && !onOpenDraft && onOpenSection && (
        <button type="button" className={`${styles.btn} ${styles.small}`} style={{ marginTop: 4 }} onClick={() => onOpenSection(result.draft!.kind === "motif" ? "animations" : "powers")}>
          Ouvrir {result.draft.kind === "motif" ? "l'atelier (Animations)" : "les cartes de pouvoir"} · {result.draft.id}
        </button>
      )}
      {result?.proposal && <ProposalCard proposal={result.proposal} busy={busy} onResolve={(outcome) => onResolve(result.proposal!.id, outcome)} />}
    </div>
  );
}

export function AssistantMessages({ messages, providerLabels, busy, technical = true, onResolve, onOpenSection, onOpenDraft }: {
  messages: AiViewMessage[];
  providerLabels: Record<string, string>;
  busy: boolean;
  /** Coupé : ni réflexion, ni données des outils, ni consommation (admin non développeur). */
  technical?: boolean;
  onResolve(proposalId: string, outcome: "confirmed" | "dismissed"): void;
  onOpenSection?(section: ChangelogAdminSection): void;
  /** Ouvre le brouillon écrit dans la page (panneau) ; à défaut, la section concernée. */
  onOpenDraft?(draft: DraftRef): void;
}) {
  const results = new Map<string, AiToolResult>();
  for (const message of messages) if (message.role === "tool") for (const result of message.results) results.set(result.id, result);
  return (
    <div style={{ display: "grid", gap: 10 }} data-testid="ai-messages">
      {messages.map((message, index) => {
        if (message.role === "tool") return null;
        if (message.role === "user") {
          if (message.note) return <div key={index} className={styles.hint} style={{ textAlign: "center", fontStyle: "italic" }}>{message.text.replace(/^\[Action de l'admin\]\s*/, "")}</div>;
          return (
            <div key={index} style={{ justifySelf: "end", maxWidth: "85%", background: "#2a1d12", border: "1px solid #f2bb4555", borderRadius: "14px 14px 4px 14px", padding: "8px 12px", whiteSpace: "pre-wrap" }}>
              {message.text}
              {message.attachment && <div className={styles.hint} style={{ fontSize: 11, marginTop: 4 }} title={message.attachment}>📎 avec tes modifications non enregistrées</div>}
            </div>
          );
        }
        return (
          <div key={index} style={{ maxWidth: "92%", background: "var(--panel-2, #21180f)", border: "1px solid var(--line)", borderRadius: "14px 14px 14px 4px", padding: "8px 12px" }}>
            <div className={styles.hint} style={{ fontSize: 11 }}>
              {providerLabels[message.provider] ?? message.provider}{technical ? ` · ${message.model}` : ""}{technical && message.usage && message.usage.inputTokens + message.usage.outputTokens > 0 ? ` · ${message.usage.inputTokens.toLocaleString("fr-FR")} → ${message.usage.outputTokens.toLocaleString("fr-FR")} jetons` : ""}
            </div>
            {technical && message.reasoning && (
              <details style={{ margin: "4px 0" }}>
                <summary className={styles.hint} style={{ cursor: "pointer" }}>Réflexion</summary>
                <div className={styles.hint} style={{ whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto", marginTop: 4 }}>{message.reasoning}</div>
              </details>
            )}
            {message.text && <Markdown text={message.text} />}
            {message.toolCalls.map((call) => (
              <ToolResultLine key={call.id} name={call.name} input={call.input} result={results.get(call.id)} busy={busy} technical={technical} onResolve={onResolve} onOpenSection={onOpenSection} onOpenDraft={onOpenDraft} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
