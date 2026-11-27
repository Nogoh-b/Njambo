/* ═══════════════ Académie : rejouer une scène d'un trait ═══════════════
   Joue une scène jusqu'au bout avec une stratégie pour les coups du joueur
   (par défaut : la solution). Sert à la validation et aux tests. PUR. */

import { GAME_CONFIG } from "../../config/gameConfig";
import type { GameConfig, PowerCardId } from "../../types/game";
import type { PowerChoices } from "../power/types";
import { AcademySceneError, AcademyTable, type AcademyEvent, type Refusal } from "./table";
import type { AcademyScene, CardCode, SceneOutcome, YourExpectation } from "./types";

export type YourMove =
  | { card: CardCode }
  | { power: PowerCardId; target?: number; choose?: Record<string, CardCode[]> };

export type MovePolicy = (expect: YourExpectation, table: AcademyTable) => YourMove;

/** Le coup que la scène attend. */
export const solutionMove: MovePolicy = (expect) => {
  if (expect.kind === "card") return { card: expect.card };
  if (expect.kind === "free") return { card: expect.solution };
  return { power: expect.power, target: expect.target, choose: expect.choose };
};

export interface SceneRun {
  table: AcademyTable;
  /** null si un refus a arrêté la partie. */
  outcome: SceneOutcome | null;
  /** Coups joués, avec l'index du coup de la scène. */
  events: { actionIndex: number; event: AcademyEvent }[];
  /** Numéro du dernier pli fermé. */
  lastTrickNo: number;
  /** Premier refus rencontré : la partie s'arrête là. */
  refusal: (Refusal & { actionIndex: number; move: YourMove }) | null;
}

function choicesOf(choose: Record<string, CardCode[]> | undefined, table: AcademyTable): PowerChoices | undefined {
  if (!choose) return undefined;
  return Object.fromEntries(Object.entries(choose).map(([choiceId, codes]) => [
    choiceId,
    codes.map((code) => ({ cardId: code, cardIdx: table.indexOf(0, code) })),
  ]));
}

/** Lève une AcademySceneError si la scène est mal écrite. */
export function playScene(
  scene: AcademyScene,
  cfg: GameConfig = GAME_CONFIG,
  policy: MovePolicy = solutionMove,
  maxSteps = 200,
): SceneRun {
  const table = new AcademyTable(scene, cfg);
  const events: SceneRun["events"] = [];
  let lastTrickNo = 0;
  for (let count = 0; count < maxSteps; count += 1) {
    const step = table.next();
    const actionIndex = table.actionIndex;
    if (step.kind === "end") return { table, outcome: step.outcome, events, lastTrickNo, refusal: null };
    if (step.kind === "closeTrick") {
      lastTrickNo = table.state().trickNo;
      table.closeTrick();
      continue;
    }
    if (step.kind === "auto") {
      events.push({ actionIndex, event: table.stepAuto() });
      continue;
    }
    const move = policy(step.expect, table);
    const result = "card" in move
      ? table.playYou(table.indexOf(0, move.card))
      : table.useYourPower(move.power, move.target, choicesOf(move.choose, table));
    if (!result.ok) return { table, outcome: null, events, lastTrickNo, refusal: { ...result, actionIndex, move } };
    events.push({ actionIndex, event: result.event });
  }
  throw new AcademySceneError("La scène ne finit pas.");
}
