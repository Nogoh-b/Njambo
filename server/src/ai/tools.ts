/* ═══════════════ Assistant IA : outils ═══════════════
   Ce que l'assistant peut faire, et rien de plus :
   - LIRE : référence, bibliothèque des modèles, moments, cartes de pouvoir ;
   - VALIDER à blanc un modèle ou une carte ;
   - ÉCRIRE DES BROUILLONS (modèle, carte) : mêmes commandes que l'admin, au
     nom de l'admin connecté (audit), sans effet sur les joueurs ;
   - PROPOSER une publication ou une attribution de moments : l'admin la
     confirme d'un clic (resolveProposal), jamais l'assistant.
   Chaque outil renvoie au modèle un JSON compact, et à l'admin un résumé. */

import { randomUUID } from "node:crypto";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { listAdminAnimMotifsHandler, publishAnimMotifHandler, saveAnimMotifDraftHandler, setGameMomentsHandler, type AdminMotifRow } from "../../../functions/src/animMotifAdminCommands";
import { ensureMotifCatalogFresh } from "../../../functions/src/animCatalog";
import { db } from "../../../functions/src/core";
import { getAdminPowerCardHandler, listAdminPowerCardsHandler, publishPowerCardHandler, savePowerCardDraftHandler } from "../../../functions/src/powerCardAdminCommands";
import { GAME_CONFIG } from "../../../config/gameConfig";
import { GAME_MOMENTS, GAME_MOMENT_KEYS, MOMENT_STYLE_OWNER, momentDurationMs, momentIssuesForMotif, motifFitsMoment, validateMoments, type MomentMap } from "../../../engine/anim/moments";
import { motifTotalMs, normalizeMotif, validateMotif, type AnimMotif, type MotifAnchor } from "../../../engine/anim/motif";
import { getMotif, listMotifs, momentMap } from "../../../engine/anim/registry";
import { validatePowerCard } from "../../../engine/power/validate";
import type { PowerModule } from "../../../engine/power/types";
import { REFERENCE_TOPICS, referenceText, type ReferenceTopic } from "./reference";
import type { AiModule, AiProposal, AiToolCall, AiToolResult, ToolSpec } from "./types";

export interface ToolContext {
  adminUid: string;
  conversationId: string;
}

type ToolOutcome = Omit<AiToolResult, "id" | "name">;
type Json = Record<string, unknown>;

const MAX_CONTENT = 60_000;
const ANY_OBJECT = { type: "object", additionalProperties: true } as const;
const idParam = (description: string) => ({ type: "object", properties: { id: { type: "string", description } }, required: ["id"], additionalProperties: false });
const reasonParam = { type: "string", description: "Pourquoi tu proposes cette action (montré à l'admin)." };

/* ─────────────── Définitions ─────────────── */

const SPECS: Record<string, ToolSpec & { modules: AiModule[] }> = {
  get_reference: {
    name: "get_reference", modules: ["animations", "powers", "all"],
    description: `Lit une référence : ${Object.entries(REFERENCE_TOPICS).map(([key, text]) => `« ${key} » : ${text}`).join(" ")}`,
    parameters: { type: "object", properties: { topic: { type: "string", enum: Object.keys(REFERENCE_TOPICS) } }, required: ["topic"], additionalProperties: false },
  },
  list_animation_models: {
    name: "list_animation_models", modules: ["animations", "powers", "all"],
    description: "Liste les modèles d'animation (bibliothèque de l'atelier) : identifiant, nom, famille, départ → arrivée, durée, statut (modèle du jeu, publié, brouillon, archivé), erreurs, moments qui l'utilisent.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  get_animation_model: {
    name: "get_animation_model", modules: ["animations", "powers", "all"],
    description: "Lit un modèle d'animation complet (version en cours d'édition : brouillon s'il existe), avec son statut, ses erreurs, sa durée totale et les moments auxquels il convient.",
    parameters: idParam("Identifiant du modèle (ex. play_classic)."),
  },
  validate_animation_model: {
    name: "validate_animation_model", modules: ["animations", "all"],
    description: "Valide à blanc un modèle d'animation (sans rien enregistrer) : erreurs par chemin, durée totale, moments auxquels il convient et leurs plafonds.",
    parameters: { type: "object", properties: { model: { ...ANY_OBJECT, description: "Modèle complet (format : get_reference « modeles »)." } }, required: ["model"], additionalProperties: false },
  },
  save_animation_model_draft: {
    name: "save_animation_model_draft", modules: ["animations", "all"],
    description: "Enregistre un modèle d'animation en BROUILLON (nouveau ou existant, même identifiant). Aucun effet sur les joueurs tant qu'il n'est pas publié. Renvoie les erreurs restantes.",
    parameters: { type: "object", properties: { model: { ...ANY_OBJECT, description: "Modèle complet. Pour en modifier un, reprends-le avec get_animation_model." } }, required: ["model"], additionalProperties: false },
  },
  propose_publish_animation_model: {
    name: "propose_publish_animation_model", modules: ["animations", "all"],
    description: "Propose à l'admin de PUBLIER le brouillon d'un modèle (tous les joueurs le reçoivent). Tu ne publies pas : l'admin confirme. Refusé si le brouillon a des erreurs ou ne convient plus à un moment qui l'utilise.",
    parameters: { type: "object", properties: { id: { type: "string" }, reason: reasonParam }, required: ["id", "reason"], additionalProperties: false },
  },
  get_game_moments: {
    name: "get_game_moments", modules: ["animations", "all"],
    description: "Lit les moments du jeu (carte jouée, distribution, pli gagné, fin de pli, pouvoir lancé) : contraintes, plafonds, modèle attribué, modèles compatibles avec leur durée.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  propose_game_moments: {
    name: "propose_game_moments", modules: ["animations", "all"],
    description: "Propose une attribution COMPLÈTE des moments (moment → identifiant de modèle ; un moment absent garde l'animation actuelle). Validée comme par le serveur ; l'admin confirme.",
    parameters: { type: "object", properties: { moments: { type: "object", additionalProperties: { type: "string" }, description: `Clés possibles : ${GAME_MOMENT_KEYS.join(", ")}.` }, reason: reasonParam }, required: ["moments", "reason"], additionalProperties: false },
  },
  list_power_cards: {
    name: "list_power_cards", modules: ["powers", "all"],
    description: "Liste les cartes de pouvoir : identifiant, nom, catégorie, rareté, statut (publiée, brouillon, archivée, coupée), erreurs.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  get_power_card: {
    name: "get_power_card", modules: ["powers", "all"],
    description: "Lit une carte de pouvoir complète (définition + script + chorégraphie ; brouillon s'il existe), avec ses erreurs.",
    parameters: idParam("Identifiant de la carte (ex. vent_nord)."),
  },
  validate_power_card: {
    name: "validate_power_card", modules: ["powers", "all"],
    description: "Valide à blanc une carte de pouvoir { def, script } sans rien enregistrer : erreurs par chemin.",
    parameters: { type: "object", properties: { card: { ...ANY_OBJECT, description: "Carte { def, script } (format : get_reference « cartes » et « choregraphies »)." } }, required: ["card"], additionalProperties: false },
  },
  save_power_card_draft: {
    name: "save_power_card_draft", modules: ["powers", "all"],
    description: "Enregistre une carte de pouvoir en BROUILLON (nouvelle ou existante, identifiant = def.id). Aucun effet sur les joueurs tant qu'elle n'est pas publiée. Renvoie les erreurs restantes.",
    parameters: { type: "object", properties: { card: { ...ANY_OBJECT, description: "Carte complète { def, script }. Pour en modifier une, reprends-la avec get_power_card." } }, required: ["card"], additionalProperties: false },
  },
  propose_publish_power_card: {
    name: "propose_publish_power_card", modules: ["powers", "all"],
    description: "Propose à l'admin de PUBLIER le brouillon d'une carte de pouvoir. Tu ne publies pas : l'admin confirme. Refusé si le brouillon a des erreurs.",
    parameters: { type: "object", properties: { id: { type: "string" }, reason: reasonParam }, required: ["id", "reason"], additionalProperties: false },
  },
};

export const TOOL_NAMES = Object.keys(SPECS);

export function toolSpecs(module: AiModule): ToolSpec[] {
  return Object.values(SPECS).filter((spec) => spec.modules.includes(module)).map(({ name, description, parameters }) => ({ name, description, parameters }));
}

/* ─────────────── Exécution ─────────────── */

function adminRequest(ctx: ToolContext, data: Json): CallableRequest<unknown> {
  return { auth: { uid: ctx.adminUid, token: { admin: true } }, data: { idempotencyKey: `assistant_${randomUUID()}`, ...data } } as unknown as CallableRequest<unknown>;
}

function out(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > MAX_CONTENT ? `${text.slice(0, MAX_CONTENT)}… (tronqué)` : text;
}

const ok = (value: unknown, summary: string, extra: Partial<ToolOutcome> = {}): ToolOutcome => ({ ok: true, content: out(value), summary, ...extra });
const fail = (message: string, details?: unknown): ToolOutcome => ({ ok: false, content: out({ error: message, ...(details !== undefined ? { details } : {}) }), summary: message });

const anchorText = (anchor: MotifAnchor) => ("player" in anchor ? `${anchor.zone}:${anchor.player}` : anchor.zone === "offscreen" ? `offscreen:${anchor.side}` : anchor.zone);
const motifStatus = (row: AdminMotifRow) => (row.archived ? "archivé" : row.hasDraft ? (row.published ? `brouillon (publié rév. ${row.revision})` : "brouillon") : row.published ? `publié rév. ${row.revision}` : "modèle du jeu");

function momentChecks(motif: AnimMotif) {
  return GAME_MOMENT_KEYS.filter((moment) => motifFitsMoment(moment, motif)).map((moment) => {
    const def = GAME_MOMENTS[moment] as { label: string; maxMs?: number; measure?: string };
    const durationMs = momentDurationMs(moment, motif);
    return { moment, label: def.label, durationMs, maxMs: def.maxMs ?? null, measure: def.measure ?? "rythme du jeu", fits: !def.maxMs || durationMs <= def.maxMs };
  });
}

async function motifRows(ctx: ToolContext) {
  return (await listAdminAnimMotifsHandler(adminRequest(ctx, {}))) as { motifs: AdminMotifRow[]; moments: MomentMap };
}

async function logWrite(ctx: ToolContext, tool: string, target: string) {
  await db.collection("admin_audit").doc().set({ uid: ctx.adminUid, action: "assistant_tool_write", tool, target, conversationId: ctx.conversationId, createdAt: Date.now() });
}

function proposal(kind: AiProposal["kind"], label: string, payload: Json): AiProposal {
  return { id: randomUUID(), kind, label, payload, status: "pending" };
}

async function run(call: AiToolCall, ctx: ToolContext): Promise<ToolOutcome> {
  const input = call.input;
  const str = (key: string) => (typeof input[key] === "string" ? (input[key] as string).trim() : "");
  switch (call.name) {
    case "get_reference": {
      const topic = str("topic") as ReferenceTopic;
      if (!(topic in REFERENCE_TOPICS)) return fail(`Référence inconnue : ${topic || "(vide)"}.`);
      return ok({ topic, text: referenceText(topic) }, `A lu la référence « ${topic} ».`);
    }
    case "list_animation_models": {
      const { motifs, moments } = await motifRows(ctx);
      const rows = motifs.map((row) => ({
        id: row.id, name: row.motif.name, group: row.motif.group, from: anchorText(row.motif.from), to: anchorText(row.motif.to),
        count: row.motif.count, durationMs: row.motif.durationMs, totalMs: motifTotalMs(row.motif), status: motifStatus(row), issues: row.issues.length,
        usedByMoments: GAME_MOMENT_KEYS.filter((moment) => moments[moment] === row.id),
      }));
      return ok({ models: rows }, `A lu la bibliothèque : ${rows.length} modèles.`);
    }
    case "get_animation_model": {
      const id = str("id");
      const { motifs, moments } = await motifRows(ctx);
      const row = motifs.find((item) => item.id === id);
      if (!row) return fail(`Modèle « ${id} » introuvable.`);
      return ok({
        id, status: motifStatus(row), published: row.published, revision: row.revision, hasDraft: row.hasDraft, isDefault: row.isDefault, archived: row.archived,
        model: row.motif, issues: row.issues, totalMs: motifTotalMs(row.motif), usedByMoments: GAME_MOMENT_KEYS.filter((moment) => moments[moment] === id), moments: momentChecks(row.motif),
      }, `A lu le modèle « ${row.motif.name} » (${id}).`);
    }
    case "validate_animation_model": {
      try {
        const motif = normalizeMotif(input.model as AnimMotif);
        const issues = validateMotif(motif);
        return ok({ valid: issues.length === 0, issues, totalMs: issues.length ? null : motifTotalMs(motif), moments: issues.length ? [] : momentChecks(motif) },
          issues.length ? `Validation : ${issues.length} erreur(s).` : "Validation : modèle valide.");
      } catch (error) {
        return fail("Modèle illisible.", error instanceof Error ? error.message : String(error));
      }
    }
    case "save_animation_model_draft": {
      const result = await saveAnimMotifDraftHandler(adminRequest(ctx, { motif: input.model })) as { motifId: string; issues: unknown[] };
      await logWrite(ctx, call.name, result.motifId);
      return ok(result, result.issues.length ? `Brouillon « ${result.motifId} » enregistré, ${result.issues.length} erreur(s) à corriger.` : `Brouillon « ${result.motifId} » enregistré, valide.`, { draft: { kind: "motif", id: result.motifId } });
    }
    case "propose_publish_animation_model": {
      const id = str("id");
      const { motifs } = await motifRows(ctx);
      const row = motifs.find((item) => item.id === id);
      if (!row) return fail(`Modèle « ${id} » introuvable.`);
      if (!row.hasDraft) return fail(`Le modèle « ${id} » n'a pas de brouillon à publier.`);
      if (row.issues.length) return fail(`Le brouillon de « ${id} » a ${row.issues.length} erreur(s) : corrige-les d'abord.`, row.issues);
      await ensureMotifCatalogFresh(true);
      const conflicts = momentIssuesForMotif(momentMap(), row.motif, getMotif);
      if (conflicts.length) return fail("Cette version ne conviendrait plus à un moment qui utilise ce modèle.", conflicts);
      const item = proposal("publish_motif", `Publier le modèle « ${row.motif.name} » (${id})`, { motifId: id, reason: str("reason") });
      return ok({ proposalId: item.id, status: "en attente de l'admin" }, `Propose de publier « ${row.motif.name} ».`, { proposal: item });
    }
    case "get_game_moments": {
      await ensureMotifCatalogFresh(true);
      const assigned = momentMap();
      const motifs = listMotifs();
      const rows = GAME_MOMENT_KEYS.map((moment) => {
        const def = GAME_MOMENTS[moment] as { label: string; description: string; from: MotifAnchor; to?: MotifAnchor; timing: string; maxMs?: number; measure?: string };
        return {
          moment, label: def.label, description: def.description, from: anchorText(def.from), to: def.to ? anchorText(def.to) : "libre", timing: def.timing,
          maxMs: def.maxMs ?? null, measure: def.measure ?? "rythme du jeu", styleOwner: MOMENT_STYLE_OWNER[moment] ?? null, assigned: assigned[moment] ?? null,
          compatible: motifs.filter((motif) => motifFitsMoment(moment, motif)).map((motif) => ({ id: motif.id, name: motif.name, durationMs: momentDurationMs(moment, motif) })),
        };
      });
      return ok({ moments: rows, trickPauseMs: GAME_CONFIG.anim.trickPause }, "A lu les moments du jeu.");
    }
    case "propose_game_moments": {
      const raw = input.moments;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("Attribution attendue : { moment: identifiant de modèle }.");
      await ensureMotifCatalogFresh(true);
      const issues = validateMoments(raw, getMotif);
      if (issues.length) return fail("Attribution refusée par les règles des moments.", issues);
      const moments = raw as Record<string, string>;
      const label = GAME_MOMENT_KEYS.filter((moment) => moments[moment]).map((moment) => `${(GAME_MOMENTS[moment] as { label: string }).label} → ${moments[moment]}`).join(", ") || "animation actuelle partout";
      const item = proposal("set_moments", `Attribuer les moments : ${label}`, { moments, reason: str("reason") });
      return ok({ proposalId: item.id, status: "en attente de l'admin" }, "Propose une attribution des moments.", { proposal: item });
    }
    case "list_power_cards": {
      const { cards } = await listAdminPowerCardsHandler(adminRequest(ctx, {})) as { cards: Array<Json & { def?: Json; issues: unknown[] }> };
      const rows = cards.map((card) => ({
        id: card.id, name: card.def?.name ?? null, category: card.def?.category ?? null, rarity: card.def?.rarity ?? null,
        published: card.published, revision: card.revision, hasDraft: card.hasDraft, archived: card.def?.archived === true, disabled: card.def?.disabled === true, issues: card.issues.length,
      }));
      return ok({ cards: rows }, `A lu le catalogue : ${rows.length} cartes.`);
    }
    case "get_power_card": {
      const id = str("id");
      const card = await getAdminPowerCardHandler(adminRequest(ctx, { cardId: id })) as Json & { working?: { def?: { name?: string } } };
      return ok(card, `A lu la carte « ${card.working?.def?.name ?? id} » (${id}).`);
    }
    case "validate_power_card": {
      const card = input.card as Partial<PowerModule> | undefined;
      if (!card || typeof card !== "object") return fail("Carte attendue : { def, script }.");
      try {
        const issues = validatePowerCard({ def: card.def as PowerModule["def"], script: card.script as PowerModule["script"] });
        return ok({ valid: issues.length === 0, issues }, issues.length ? `Validation : ${issues.length} erreur(s).` : "Validation : carte valide.");
      } catch (error) {
        return fail("Carte illisible.", error instanceof Error ? error.message : String(error));
      }
    }
    case "save_power_card_draft": {
      const result = await savePowerCardDraftHandler(adminRequest(ctx, { card: input.card })) as { cardId: string; issues: unknown[] };
      await logWrite(ctx, call.name, result.cardId);
      return ok(result, result.issues.length ? `Brouillon de la carte « ${result.cardId} » enregistré, ${result.issues.length} erreur(s) à corriger.` : `Brouillon de la carte « ${result.cardId} » enregistré, valide.`, { draft: { kind: "power_card", id: result.cardId } });
    }
    case "propose_publish_power_card": {
      const id = str("id");
      const card = await getAdminPowerCardHandler(adminRequest(ctx, { cardId: id })) as { draft: PowerModule | null; issues: unknown[] };
      if (!card.draft) return fail(`La carte « ${id} » n'a pas de brouillon à publier.`);
      if (card.issues.length) return fail(`Le brouillon de « ${id} » a ${card.issues.length} erreur(s) : corrige-les d'abord.`, card.issues);
      const item = proposal("publish_power_card", `Publier la carte « ${card.draft.def?.name ?? id} » (${id})`, { cardId: id, reason: str("reason") });
      return ok({ proposalId: item.id, status: "en attente de l'admin" }, `Propose de publier la carte « ${card.draft.def?.name ?? id} ».`, { proposal: item });
    }
    default:
      return fail(`Outil inconnu : ${call.name}.`);
  }
}

/** Exécute un appel d'outil ; une erreur devient un résultat en erreur que le modèle peut lire et corriger. */
export async function executeTool(call: AiToolCall, ctx: ToolContext, module: AiModule): Promise<AiToolResult> {
  const base = { id: call.id, name: call.name };
  if (call.invalidInput !== undefined) return { ...base, ...fail("Arguments illisibles (JSON invalide) : renvoie l'appel corrigé.", call.invalidInput) };
  const spec = SPECS[call.name];
  if (!spec || !spec.modules.includes(module)) return { ...base, ...fail(`Outil « ${call.name} » indisponible dans ce module.`) };
  try {
    return { ...base, ...(await run(call, ctx)) };
  } catch (error) {
    if (error instanceof HttpsError) return { ...base, ...fail(`Refusé par le serveur : ${error.message}.`, (error.details as Json | undefined)?.issues ?? error.details) };
    return { ...base, ...fail(`Erreur : ${error instanceof Error ? error.message : String(error)}.`) };
  }
}

/** Exécute une proposition confirmée par l'admin (jamais par l'assistant). */
export async function executeProposal(item: AiProposal, ctx: ToolContext): Promise<string> {
  if (item.kind === "publish_motif") {
    const result = await publishAnimMotifHandler(adminRequest(ctx, { motifId: item.payload.motifId })) as { revision: number };
    return `Modèle « ${String(item.payload.motifId)} » publié (révision ${result.revision}).`;
  }
  if (item.kind === "publish_power_card") {
    const result = await publishPowerCardHandler(adminRequest(ctx, { cardId: item.payload.cardId })) as { revision: number };
    return `Carte « ${String(item.payload.cardId)} » publiée (révision ${result.revision}).`;
  }
  await setGameMomentsHandler(adminRequest(ctx, { moments: item.payload.moments }));
  const count = Object.keys((item.payload.moments ?? {}) as Json).length;
  return count ? `Moments attribués (${count} moment(s) avec un modèle).` : "Moments remis à l'animation actuelle du jeu.";
}
