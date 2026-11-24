import { describe, expect, it } from "vitest";
import { canActivatePower } from "../engine/power/canActivate";
import { CODE_POWER_MODULES } from "../config/powers";
import type { PowerRunContext } from "../engine/power/types";
import type { Card, GameState } from "../types/game";

/* Cauris Chanceux : remboursement de la moitié de la mise en cas de défaite.
   Activable seulement avant le dernier pli, quand l'issue de la manche est encore inconnue. */
const card = (value: number): Card => ({ id: `${value}♠`, rank: String(value), value, suit: "♠", color: "#1e1e1e" }) as Card;
const ctxWithHand = (size: number): PowerRunContext => ({
  state: {
    phase: "turns",
    turnIdx: 0,
    leaderIdx: 0,
    trickPlays: [],
    players: [{ hand: Array.from({ length: size }, (_, index) => card(index + 3)), powerActivations: [] }, { hand: [card(9)], powerActivations: [] }],
  } as unknown as GameState,
  activatedBy: 0,
  targets: [],
  deck: [],
  maxValue: 10,
});

describe("Cauris Chanceux : assurance avant le dernier pli", () => {
  const script = CODE_POWER_MODULES.cauris_chanceux.script;
  it("s'active tant qu'il reste au moins 2 plis", () => {
    expect(canActivatePower(script, ctxWithHand(2))).toBeNull();
    expect(canActivatePower(script, ctxWithHand(5))).toBeNull();
  });
  it("est refusée au dernier pli (défaite déjà connue)", () => {
    expect(canActivatePower(script, ctxWithHand(1))).toMatch(/dernier pli/);
  });
});
