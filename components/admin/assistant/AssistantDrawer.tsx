"use client";

/* Panneau de l'assistant dans les pages Animations et Cartes de pouvoir :
   il sait ce que l'admin a ouvert (un modèle, une carte, la liste), reprend
   la dernière conversation sur cet élément, propose des questions toutes
   prêtes et joint les modifications pas encore enregistrées. Quand
   l'assistant écrit un brouillon, la page se recharge (onChanged). */

import { useEffect, useRef, useState } from "react";
import type { ChangelogAdminSection } from "@/domain";
import { adminApi, type AiContext, type AiContextKind, type AiModule } from "../adminApi";
import { AssistantChat, type AssistantExample } from "./AssistantChat";
import { FOCUS_KEY, useAssistant, type AssistantChange } from "./useAssistant";
import styles from "../AdminConsole.module.css";

const OPEN_KEY = "njambo.assistant.drawer";
const MODULE_OF: Record<AiContextKind, AiModule> = { animation_model: "all", animation_library: "animations", power_card: "powers", power_catalog: "powers" };

export const QUICK_ACTIONS: Record<AiContextKind, AssistantExample[]> = {
  animation_model: [
    { label: "Explique-le", text: "Explique-moi ce modèle d'animation : ce qu'il montre, son trajet, ses temps et ses effets, et ce que voient les joueurs." },
    { label: "Où sert-il en jeu ?", text: "Où ce modèle est-il utilisé en jeu (moments du jeu, chorégraphies des cartes de pouvoir) ? Que changerait une modification pour les joueurs ?" },
    { label: "Vérifie-le", text: "Vérifie ce modèle : explique chaque erreur ou contrainte dépassée (durée, moments qui l'utilisent) et propose une correction en brouillon si besoin." },
    { label: "Une variante", text: "Crée en brouillon une variante de ce modèle, plus vive et un peu plus courte, sous un nouvel identifiant, sans toucher à l'original." },
  ],
  animation_library: [
    { label: "État des lieux", text: "Fais un état des lieux de la bibliothèque : modèles en brouillon, avec des erreurs, archivés, et lesquels animent les moments du jeu." },
    { label: "Moments du jeu", text: "Explique les moments du jeu : ce que chacun anime, ses contraintes, et quel modèle l'anime aujourd'hui." },
    { label: "Nouveau modèle", text: "Je veux un nouveau modèle d'animation. Pose-moi les questions utiles (trajet, durée, effet voulu) avant de créer le brouillon." },
  ],
  power_card: [
    { label: "Explique-la", text: "Explique pas à pas ce que fait cette carte en partie : cible, conditions, effet de chaque étape, animation, et ce que voient les joueurs." },
    { label: "Interactions", text: "Quelles interactions cette carte a-t-elle avec les autres cartes de pouvoir (protections, contres, combinaisons) et avec les règles du jeu ?" },
    { label: "Équilibrage", text: "Cette carte est-elle bien équilibrée (prix, rareté, puissance) par rapport aux autres cartes du catalogue ? Que me conseilles-tu ?" },
    { label: "Vérifie-la", text: "Vérifie cette carte : explique chaque erreur et corrige-la en brouillon si besoin." },
  ],
  power_catalog: [
    { label: "État des lieux", text: "Fais un état des lieux du catalogue : cartes en brouillon, avec des erreurs, archivées ou coupées." },
    { label: "Résumé", text: "Résume les cartes de pouvoir par catégorie : ce que fait chacune en une phrase." },
    { label: "Nouvelle carte", text: "Je veux une nouvelle carte de pouvoir. Pose-moi les questions utiles (effet, cible, rareté, prix) avant de créer le brouillon." },
  ],
};

export function contextLabel(context: AiContext): string {
  switch (context.kind) {
    case "animation_model": return `Modèle · ${context.label ?? context.id}`;
    case "power_card": return `Carte · ${context.label ?? context.id}`;
    case "animation_library": return "Bibliothèque des animations";
    case "power_catalog": return "Catalogue des cartes";
  }
}

/** Élément ouvert depuis un lien de la conversation : le panneau (même remonté, liste → éditeur) garde cette conversation. */
let carried: { key: string; conversationId: string } | null = null;

const sameContext = (a: AiContext | null | undefined, b: AiContext) => Boolean(a && a.kind === b.kind && (a.id ?? null) === (b.id ?? null));

/** Panneau ouvert ou fermé, gardé d'une page à l'autre. */
export function useAssistantDrawer() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { if (window.localStorage.getItem(OPEN_KEY) === "1") setOpen(true); } catch { /* stockage indisponible */ }
  }, []);
  const change = (value: boolean) => {
    setOpen(value);
    try { window.localStorage.setItem(OPEN_KEY, value ? "1" : "0"); } catch { /* stockage indisponible */ }
  };
  return [open, change] as const;
}

/** Bouton d'ouverture du panneau, à placer dans l'en-tête d'une page. */
export function AssistantButton({ onClick, label = "✦ Assistant IA", small = false, title }: { onClick(): void; label?: string; small?: boolean; title?: string }) {
  return <button type="button" className={`${styles.btn} ${small ? styles.small : ""}`} data-testid="open-assistant" title={title ?? "Demander à l'assistant IA"} onClick={onClick}>{label}</button>;
}

export function AssistantDrawer({ context, working, onChanged, onOpenDraft, onOpenSection, onClose }: {
  context: AiContext;
  /** Copie de travail non enregistrée (null : rien à joindre). */
  working?: unknown;
  onChanged?(changes: AssistantChange[]): void;
  onOpenDraft?(draft: { kind: "motif" | "power_card"; id: string }): void;
  onOpenSection?(section: ChangelogAdminSection): void;
  onClose(): void;
}) {
  const assistant = useAssistant({ onChanged });
  const key = `${context.kind}:${context.id ?? ""}`;
  const loaded = useRef<string | null>(null);
  const request = useRef(0);
  const [resuming, setResuming] = useState(false);

  // Reprend la dernière conversation sur cet élément (pas pendant que l'assistant travaille).
  useEffect(() => {
    if (assistant.busy || loaded.current === key) return;
    loaded.current = key;
    const kept = carried?.key === key ? carried.conversationId : null;
    carried = null;
    if (kept) { assistant.open(kept); return; }
    const current = ++request.current;
    setResuming(true);
    adminApi.aiConversations().then((result) => {
      if (request.current !== current) return;
      const last = result.conversations.find((item) => sameContext(item.context, context));
      if (last) assistant.open(last.id); else assistant.reset();
    }, () => { if (request.current === current) assistant.reset(); }).finally(() => { if (request.current === current) setResuming(false); });
  }, [key, assistant.busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const conversationContext = assistant.conversation?.context;
  const elsewhere = assistant.conversation && !sameContext(conversationContext, context);
  const attach = working !== undefined && working !== null && !elsewhere;
  const send = (text: string) => assistant.send(text, { module: MODULE_OF[context.kind], context, ...(attach ? { working } : {}) });

  const openLarge = () => {
    try { if (assistant.conversation) window.sessionStorage.setItem(FOCUS_KEY, assistant.conversation.id); } catch { /* stockage indisponible */ }
    onOpenSection?.("assistant");
  };

  return (
    <aside className={styles.assistantDrawer} data-testid="assistant-drawer" aria-label="Assistant IA">
      <div className={styles.row} style={{ gap: 6, alignItems: "start", flexWrap: "nowrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ color: "var(--gold)" }}>✦ Assistant IA</b>
          <div className={styles.hint} style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} data-testid="assistant-context">
            {elsewhere && conversationContext ? `Conversation : ${contextLabel(conversationContext)}` : contextLabel(context)}
          </div>
        </div>
        <button type="button" className={`${styles.btn} ${styles.small}`} disabled={assistant.busy || !assistant.conversation} title="Nouvelle conversation sur cet élément" onClick={assistant.reset}>+ Nouvelle</button>
        {onOpenSection && <button type="button" className={`${styles.btn} ${styles.small}`} title="Ouvrir dans la section Assistant IA" onClick={openLarge}>⤢</button>}
        <button type="button" className={`${styles.btn} ${styles.small}`} title="Fermer le panneau" data-testid="close-assistant" onClick={onClose}>✕</button>
      </div>
      <AssistantChat
        assistant={assistant}
        compact
        sendExamples
        examples={elsewhere ? [] : QUICK_ACTIONS[context.kind]}
        intro={!assistant.conversation && !resuming ? (
          <p className={styles.hint} style={{ margin: 0 }}>
            Pose ta question sur {!context.id ? "cette liste" : assistant.settings?.technical ? <>cet élément (<code>{context.id}</code>)</> : `« ${context.label ?? "cet élément"} »`}, ou choisis :
          </p>
        ) : resuming ? <p className={styles.hint} style={{ margin: 0 }}>Chargement…</p> : null}
        notice={attach && !assistant.busy ? "Tes modifications non enregistrées seront jointes à ton message." : elsewhere && !assistant.busy ? "Conversation commencée sur un autre élément : « + Nouvelle » pour en ouvrir une sur celui-ci." : null}
        onSend={send}
        onOpenSection={onOpenSection}
        onOpenDraft={onOpenDraft && ((draft) => {
          carried = assistant.conversation ? { key: `${draft.kind === "motif" ? "animation_model" : "power_card"}:${draft.id}`, conversationId: assistant.conversation.id } : null;
          onOpenDraft(draft);
        })}
      />
    </aside>
  );
}
