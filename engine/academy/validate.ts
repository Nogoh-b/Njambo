/* ═══════════════ Académie : validation d'une scène ═══════════════
   Contrôles d'écriture (cartes uniques, mains complètes, aucune victoire à la
   donne, pouvoirs équipés, répliques existantes), puis la scène est JOUÉE avec
   sa solution par le vrai moteur : coups dans l'ordre de la table, coups des
   bots légaux, solution gagnante, défi avec au moins un piège. PUR. */

import { GAME_CONFIG } from "../../config/gameConfig";
import { POWER_CARDS_BY_ID } from "../../config/powerCards";
import { buildDeck } from "../deck";
import { checkInstantWin } from "../rules";
import type { GameConfig, Player } from "../../types/game";
import { playScene, solutionMove, type MovePolicy, type SceneRun } from "./run";
import { AcademySceneError } from "./table";
import type { AcademyScene, CardCode, CoachKey } from "./types";

export interface SceneIssue {
  path: string;
  message: string;
}

const WRONG_SPECIAL_KEYS = new Set(["default", "power", "target", "choice"]);

/** Toutes les répliques citées par la scène. */
export function sceneCoachKeys(scene: AcademyScene): CoachKey[] {
  const keys = [...(scene.coach?.intro ?? []), scene.coach?.success, scene.coach?.failure, scene.coach?.done];
  for (const action of scene.actions) {
    const coach = action.coach;
    if (!coach) continue;
    keys.push(...(coach.before ?? []), coach.after, coach.hint, ...Object.values(coach.wrong ?? {}));
  }
  return [...new Set(keys.filter((key): key is CoachKey => Boolean(key)))];
}

export function validateScene(scene: AcademyScene, cfg: GameConfig = GAME_CONFIG, texts?: Record<CoachKey, string>): SceneIssue[] {
  const issues: SceneIssue[] = [];
  const push = (path: string, message: string) => issues.push({ path, message });
  const seats = scene.seats.length;

  /* ── Écriture ── */
  if (seats < 2 || seats > 4) push("seats", "Une scène se joue à 2, 3 ou 4.");
  if (scene.deal.length !== seats) push("deal", `${scene.deal.length} mains pour ${seats} joueurs.`);
  scene.deal.forEach((hand, seat) => {
    if (hand.length !== cfg.cardsPerPlayer) push(`deal.${seat}`, `${hand.length} cartes au lieu de ${cfg.cardsPerPlayer}.`);
  });
  const byCode = new Map(buildDeck(cfg).map((card) => [card.id, card]));
  const seen = new Set<CardCode>();
  for (const code of [...scene.deal.flat(), ...(scene.deckTop ?? [])]) {
    if (!byCode.has(code)) push("deal", `Carte inconnue : ${code} (valeurs ${cfg.ranks.min} à ${cfg.ranks.max}).`);
    if (seen.has(code)) push("deal", `Carte en double : ${code}.`);
    seen.add(code);
  }
  if (!Number.isInteger(scene.firstLeader) || scene.firstLeader < 0 || scene.firstLeader >= seats) push("firstLeader", "Meneur hors de la table.");
  if (scene.actions.length === 0) push("actions", "La scène n'a aucun coup.");

  for (const [seat, cards] of Object.entries(scene.equipped ?? {})) {
    for (const cardId of cards ?? []) if (!POWER_CARDS_BY_ID[cardId]) push(`equipped.${seat}`, `Carte Pouvoir inconnue : ${cardId}.`);
  }
  const yourPowers = scene.equipped?.[0] ?? [];
  if (yourPowers.length > cfg.maxEquippedPowers) {
    push("equipped.0", `${yourPowers.length} cartes Pouvoir équipées, la limite est ${cfg.maxEquippedPowers}.`);
  }
  scene.actions.forEach((action, index) => {
    if ("power" in action && !(scene.equipped?.[action.seat] ?? []).includes(action.power)) {
      push(`actions.${index}`, `${action.power} n'est pas équipée par le siège ${action.seat}.`);
    }
    if ("free" in action && scene.goal === "watch") push(`actions.${index}`, "Un rejeu à regarder n'a pas de coup libre.");
    if ("rule" in action && action.seat === 0 && scene.goal !== "watch") push(`actions.${index}`, "Une règle de bot ne s'applique pas au joueur.");
  });
  if (texts) {
    for (const key of sceneCoachKeys(scene)) if (!(key in texts)) push("coach", `Réplique introuvable : ${key}.`);
  }
  if (issues.length > 0) return issues;

  const dealt = scene.deal.map((codes) => ({ hand: codes.map((code) => byCode.get(code)!) })) as Player[];
  const instant = checkInstantWin(dealt, cfg);
  if (instant) push("deal", `${scene.seats[instant.winnerIdx].name} gagne dès la donne (${instant.reason}).`);

  /* ── Jeu de la solution par le moteur ── */
  const freeSteps: { actionIndex: number; trickNo: number; legal: CardCode[]; solution: CardCode }[] = [];
  const checking: MovePolicy = (expect, table) => {
    if (expect.kind === "card") {
      const legal = table.legalForYou();
      for (const code of Object.keys(expect.coach?.wrong ?? {})) {
        if (WRONG_SPECIAL_KEYS.has(code)) continue;
        if (code === expect.card || !legal.includes(code)) push(`actions.${table.actionIndex}`, `Réplique d'erreur pour ${code} : cette carte n'est pas jouable ici.`);
      }
    }
    if (expect.kind === "free") {
      freeSteps.push({ actionIndex: table.actionIndex, trickNo: table.state().trickNo, legal: table.legalForYou(), solution: expect.solution });
    }
    return solutionMove(expect, table);
  };

  let run: SceneRun;
  try {
    run = playScene(scene, cfg, checking);
  } catch (error) {
    if (!(error instanceof AcademySceneError)) throw error;
    push("actions", error.message);
    return issues;
  }
  if (run.refusal) {
    const { actionIndex, reason, message } = run.refusal;
    push(`actions.${actionIndex}`, `La solution est refusée (${reason}${message ? ` : ${message}` : ""}).`);
    return issues;
  }
  for (const { actionIndex, event } of run.events) {
    const action = scene.actions[actionIndex];
    if (event.type === "play" && "card" in action && action.card !== event.play.card.id) {
      push(`actions.${actionIndex}`, `${action.card} est remplacée par ${event.play.card.id} (pouvoir en cours) : écrire la carte jouée.`);
    }
  }
  if (scene.goal !== "watch" && run.outcome !== "success") push("goal", "La solution ne gagne pas la scène.");
  if (scene.goal === "winRound" && run.table.roundEnd === null) push("goal", "La scène ne va pas jusqu'au dernier pli.");

  /* ── Défis : un vrai choix, au moins un piège, et rien après ── */
  for (const free of freeSteps) {
    // Après un défi, la suite dépendrait de la carte choisie : il ferme la scène.
    if (free.trickNo !== run.lastTrickNo) {
      push(`actions.${free.actionIndex}`, "Un défi doit être le dernier pli de la scène.");
      continue;
    }
    const alternatives = free.legal.filter((code) => code !== free.solution);
    if (alternatives.length === 0) {
      push(`actions.${free.actionIndex}`, "Défi sans choix : une seule carte est jouable.");
      continue;
    }
    const trapped = alternatives.some((code) => {
      const policy: MovePolicy = (expect, table) => (table.actionIndex === free.actionIndex ? { card: code } : solutionMove(expect, table));
      return playScene(scene, cfg, policy).outcome === "failure";
    });
    if (!trapped) push(`actions.${free.actionIndex}`, "Défi sans piège : toutes les cartes gagnent.");
  }
  return issues;
}
