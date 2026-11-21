/* ═══════════════ Assistant IA : page d'origine d'une conversation ═══════════════
   Le panneau de l'assistant dans les pages Animations et Cartes de pouvoir
   envoie ce que l'admin a ouvert (un modèle, une carte, la liste) et, s'il y
   a des modifications non enregistrées, sa copie de travail : elle est
   jointe au message pour le modèle, jamais enregistrée ailleurs. */

import { HttpsError } from "firebase-functions/v2/https";
import { AI_CONTEXT_KINDS, type AiContext, type AiContextKind, type AiModule } from "./types";

const ITEM_ID = /^[a-z0-9_]{3,48}$/;
/** Copie de travail jointe (modèle ou carte non enregistré) : au plus 40 000 caractères en JSON. */
const MAX_WORKING = 40_000;

/** Module d'une conversation ouverte depuis une page : un modèle peut servir dans les chorégraphies des cartes. */
export const CONTEXT_MODULE: Record<AiContextKind, AiModule> = { animation_model: "all", animation_library: "animations", power_card: "powers", power_catalog: "powers" };

export function readContext(raw: unknown): AiContext | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new HttpsError("invalid-argument", "INVALID_CONTEXT");
  const source = raw as Record<string, unknown>;
  const kind = source.kind as AiContextKind;
  if (!AI_CONTEXT_KINDS.includes(kind)) throw new HttpsError("invalid-argument", "INVALID_CONTEXT");
  const withId = kind === "animation_model" || kind === "power_card";
  const id = typeof source.id === "string" ? source.id : "";
  if (withId && !ITEM_ID.test(id)) throw new HttpsError("invalid-argument", "INVALID_CONTEXT");
  const label = typeof source.label === "string" ? source.label.replace(/[\p{Cc}«»`]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80) : "";
  return { kind, ...(withId ? { id } : {}), ...(label ? { label } : {}) };
}

/** Copie de travail de l'élément ouvert, jointe au message de l'admin pour le modèle. */
export function workingAttachment(context: AiContext | undefined, raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!context?.id || typeof raw !== "object" || Array.isArray(raw)) throw new HttpsError("invalid-argument", "INVALID_WORKING_COPY");
  const json = JSON.stringify(raw);
  if (json.length > MAX_WORKING) throw new HttpsError("invalid-argument", "WORKING_COPY_TOO_LARGE");
  const what = context.kind === "animation_model" ? `du modèle \`${context.id}\`` : `de la carte \`${context.id}\``;
  return `[Copie de travail ${what} jointe par la page : modifications de l'admin PAS ENCORE ENREGISTRÉES, c'est ce qu'il voit à l'écran]\n\`\`\`json\n${json}\n\`\`\``;
}
