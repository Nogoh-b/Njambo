"use client";

/* Section « Assistant IA » : poser des questions sur les animations et les
   cartes de pouvoir, en créer ou en modifier (brouillons), comprendre leurs
   effets en jeu. Choix de l'IA (DeepSeek, Claude, OpenAI, Gemini, service
   compatible OpenAI), du modèle, de la réflexion et de la température.
   L'assistant n'écrit que des brouillons : publier ou attribuer un moment
   passe par une proposition que l'admin confirme. Les clés restent sur le
   serveur. Le même assistant s'ouvre en panneau dans les pages Animations
   et Cartes de pouvoir, sur l'élément ouvert ; toutes les conversations se
   retrouvent ici. */

import { useCallback, useEffect, useState } from "react";
import type { ChangelogAdminSection } from "@/domain";
import { adminApi, type AiConversationSummary, type AiModule } from "./adminApi";
import { AssistantChat, type AssistantExample } from "./assistant/AssistantChat";
import { contextLabel } from "./assistant/AssistantDrawer";
import { FOCUS_KEY, useAssistant } from "./assistant/useAssistant";
import styles from "./AdminConsole.module.css";

const MODULE_LABELS: Record<AiModule, string> = { animations: "Animations", powers: "Cartes de pouvoir", all: "Animations + cartes" };
const EXAMPLES: Record<AiModule, AssistantExample[]> = {
  animations: [
    { text: "Explique-moi le moment « Pli gagné » : qui le voit, combien de temps, quelles contraintes ?" },
    { text: "Crée en brouillon une variante de « Jouer une carte · vol actuel » avec un petit rebond à l'arrivée." },
    { text: "Quels modèles conviennent à la carte jouée, et lequel me conseilles-tu ?" },
  ],
  powers: [
    { text: "Quelles cartes de pouvoir ciblent un adversaire, et que font-elles exactement ?" },
    { text: "Explique-moi pas à pas ce que fait la carte vent_nord en partie." },
    { text: "Propose une nouvelle carte de défense, en brouillon, inspirée de bouclier_village." },
  ],
  all: [
    { text: "Comment une carte de pouvoir peut-elle réutiliser un modèle de l'atelier dans sa chorégraphie ?" },
    { text: "Fais-moi un état des lieux : modèles en brouillon, cartes avec des erreurs." },
  ],
};

export function AssistantAdmin({ onOpenSection }: { onOpenSection(section: ChangelogAdminSection): void }) {
  const [list, setList] = useState<AiConversationSummary[] | null>(null);
  const [module, setModule] = useState<AiModule>("animations");

  const loadList = useCallback(async () => {
    const result = await adminApi.aiConversations();
    setList(result.conversations);
  }, []);
  const assistant = useAssistant({ onActivity: () => void loadList().catch(() => undefined) });
  const { config, conversation, busy } = assistant;

  useEffect(() => { void loadList().catch(() => undefined); }, [loadList]);

  // Conversation ouverte depuis le panneau d'une page (« Ouvrir en grand »).
  useEffect(() => {
    if (!config) return;
    let focus: string | null = null;
    try { focus = window.sessionStorage.getItem(FOCUS_KEY); window.sessionStorage.removeItem(FOCUS_KEY); } catch { /* stockage indisponible */ }
    if (focus) assistant.open(focus);
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = (item: AiConversationSummary) => {
    if (window.confirm(`Supprimer la conversation « ${item.title} » ? Elle ne pourra pas être récupérée.`)) assistant.remove(item.id);
  };

  const currentModule = conversation?.module ?? module;
  return (
    <div>
      <div className={styles.pageHead}>
        <div>
          <h1>Assistant IA</h1>
          <p>Pose tes questions sur les animations et les cartes de pouvoir, fais-en créer ou modifier (en brouillon), comprends leurs effets en jeu. Rien n&apos;arrive aux joueurs sans ta confirmation. Il s&apos;ouvre aussi en panneau (✦) dans les pages Animations et Cartes de pouvoir, sur l&apos;élément que tu regardes.</p>
        </div>
      </div>
      {/* Deux colonnes qui se replient (liste au-dessus) quand la place manque. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start" }}>
        <aside className={styles.panel} style={{ flex: "1 1 220px", maxWidth: 320, padding: 10, maxHeight: "calc(100svh - 40px)", overflow: "auto" }}>
          <label className={styles.field}><span>Nouvelle conversation</span>
            <select value={module} onChange={(event) => setModule(event.target.value as AiModule)}>
              {(config?.modules ?? ["animations", "powers", "all"]).map((item) => <option key={item} value={item}>{MODULE_LABELS[item]}</option>)}
            </select>
          </label>
          <button type="button" className={`${styles.btn} ${styles.primary}`} style={{ width: "100%", marginTop: 8 }} disabled={busy} onClick={assistant.reset}>+ Nouvelle</button>
          <div style={{ marginTop: 12, display: "grid", gap: 4 }}>
            {list === null ? <p className={styles.hint}>Chargement…</p> : list.length === 0 ? <p className={styles.hint}>Aucune conversation.</p> : list.map((item) => (
              <div key={item.id} style={{ display: "flex", gap: 4, alignItems: "start" }}>
                <button type="button" onClick={() => assistant.open(item.id)} disabled={busy}
                  style={{ flex: 1, minWidth: 0, textAlign: "left", padding: "6px 8px", borderRadius: 9, border: `1px solid ${conversation?.id === item.id ? "var(--gold)" : "transparent"}`, background: conversation?.id === item.id ? "#2a1d12" : "none", color: "var(--ink)", cursor: "pointer" }}>
                  <b style={{ display: "block", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</b>
                  <small className={styles.hint}>{item.context ? contextLabel(item.context) : MODULE_LABELS[item.module]} · {new Date(item.updatedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</small>
                </button>
                <button type="button" className={`${styles.btn} ${styles.small}`} title="Supprimer" disabled={busy} onClick={() => remove(item)}>✕</button>
              </div>
            ))}
          </div>
        </aside>

        <AssistantChat
          assistant={assistant}
          examples={EXAMPLES[module]}
          intro={conversation
            ? <p className={styles.hint} style={{ margin: "0 0 8px" }}>{conversation.context ? `Ouverte depuis : ${contextLabel(conversation.context)}` : `Module : ${MODULE_LABELS[currentModule]}`}</p>
            : <p className={styles.hint} style={{ margin: "0 0 8px" }}>Nouvelle conversation · {MODULE_LABELS[module]}. Exemples :</p>}
          onSend={(text) => assistant.send(text, { module })}
          onOpenSection={onOpenSection}
        />
      </div>
    </div>
  );
}
