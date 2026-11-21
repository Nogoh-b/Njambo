/* ═══════════════ Assistant IA : fournisseur de simulation ═══════════════
   Réservé au développement : réponses scriptées, sans clé ni coût, pour
   éprouver toute la chaîne (outils, brouillons, propositions, historique)
   avant d'avoir les clés. Scénario, selon le dernier message de l'admin :
   - « carte » / « pouvoir » : lit le catalogue des cartes de pouvoir ;
   - sinon : lit la bibliothèque des modèles d'animation ;
   - avec « brouillon » : enregistre un modèle d'essai, puis propose de le
     publier ; enfin, résume ce qu'il a fait. */

import { DEFAULT_MOTIFS_BY_ID } from "../../../engine/anim/defaults";
import type { AiMessage, AiToolCall, ProviderAdapter, ProviderTurn } from "./types";

export const SIMULATION_MOTIF_ID = "simulation_essai";

function turnSoFar(messages: AiMessage[]) {
  const lastUser = messages.map((message) => message.role === "user" && !message.note).lastIndexOf(true);
  const user = lastUser >= 0 ? (messages[lastUser] as Extract<AiMessage, { role: "user" }>).text.toLowerCase() : "";
  const after = messages.slice(lastUser + 1);
  const steps = after.filter((message) => message.role === "assistant").length;
  const toolNames = after.flatMap((message) => (message.role === "tool" ? message.results.map((result) => `${result.name}${result.ok ? "" : " (erreur)"}`) : []));
  return { user, steps, toolNames };
}

export function createSimulationAdapter(): ProviderAdapter {
  return {
    id: "simulation",
    async complete(request) {
      const { user, steps, toolNames } = turnSoFar(request.messages);
      const call = (name: string, input: Record<string, unknown>): AiToolCall => ({ id: `sim_${steps}_${name}`, name, input });
      const turn = (text: string, toolCalls: AiToolCall[]): ProviderTurn => ({
        text, toolCalls, reasoning: `Raisonnement simulé (étape ${steps + 1}).`, raw: undefined,
        stop: toolCalls.length ? "tool_calls" : "stop", usage: { inputTokens: 0, outputTokens: 0 }, model: "simulation",
      });
      const wantsDraft = /brouillon/.test(user);
      if (steps === 0) {
        return /carte|pouvoir/.test(user)
          ? turn("Je consulte le catalogue des cartes de pouvoir.", [call("list_power_cards", {})])
          : turn("Je consulte la bibliothèque des modèles d'animation.", [call("list_animation_models", {})]);
      }
      if (wantsDraft && steps === 1) {
        const model = { ...JSON.parse(JSON.stringify(DEFAULT_MOTIFS_BY_ID.play_classic)), id: SIMULATION_MOTIF_ID, name: "Essai de simulation", group: "custom", trail: "sparks", description: "Modèle d'essai écrit par le fournisseur de simulation." };
        return turn("J'enregistre un brouillon d'essai à partir du vol actuel.", [call("save_animation_model_draft", { model })]);
      }
      if (wantsDraft && steps === 2) {
        return turn("Je te propose de le publier : rien n'arrive aux joueurs sans ta confirmation.", [call("propose_publish_animation_model", { id: SIMULATION_MOTIF_ID, reason: "Essai de la chaîne de l'assistant." })]);
      }
      return turn(`Simulation terminée. Outils utilisés : ${toolNames.join(", ") || "aucun"}.`, []);
    },
    async listModels() {
      return ["simulation"];
    },
  };
}
