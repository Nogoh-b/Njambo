import { describe, expect, it } from "vitest";
import { stabilizeGameState } from "../sync/stateIdentity";
import type { Card, GameState, Player } from "../types/game";

const card = (id: string, value = 5): Card => ({
  id,
  rank: String(value),
  value,
  suit: "♠",
  color: "#1e1e1e",
});

const player = (name: string, hand: Card[], deposit: Card[] = []): Player => ({
  name,
  emoji: "🙂",
  isYou: name === "Moi",
  balance: 1_000,
  hand,
  deposit,
  equippedPowers: ["oeil_sorcier"],
  powerActivations: [],
});

const state = (): GameState => ({
  phase: "turns",
  trickNo: 1,
  trickPlays: [],
  leaderIdx: 0,
  turnIdx: 0,
  pot: 400,
  dominantIdx: null,
  banner: "",
  players: [player("Moi", [card("a")]), player("Bot", [card("b")])],
  activePowerEffects: [],
});

function cloneSnapshot(value: GameState): GameState {
  return structuredClone(value);
}

describe("stabilizeGameState", () => {
  it("retourne l'ancien état quand le snapshot est identique", () => {
    const prev = state();
    expect(stabilizeGameState(prev, cloneSnapshot(prev))).toBe(prev);
  });

  it("réutilise les joueurs et collections qui n'ont pas changé", () => {
    const prev = state();
    const next = cloneSnapshot(prev);
    next.pot = 500;

    const stabilized = stabilizeGameState(prev, next);
    expect(stabilized).not.toBe(prev);
    expect(stabilized.players).toBe(prev.players);
    expect(stabilized.trickPlays).toBe(prev.trickPlays);
  });

  it("ne réutilise que le joueur dont la main a changé", () => {
    const prev = state();
    const next = cloneSnapshot(prev);
    next.players[0].hand = [...next.players[0].hand, card("c", 7)];

    const stabilized = stabilizeGameState(prev, next);
    expect(stabilized.players).not.toBe(prev.players);
    expect(stabilized.players[0]).not.toBe(prev.players[0]);
    expect(stabilized.players[1]).toBe(prev.players[1]);
    expect(stabilized.players[1].hand).toBe(prev.players[1].hand);
    expect(stabilized.players[1].deposit).toBe(prev.players[1].deposit);
  });

  it("détecte les modifications effectives d'une carte déposée", () => {
    const prev = state();
    prev.players[0].deposit = [{ ...card("placed"), effectiveValue: 8, dx: 2, dy: -1, dropRot: 3 }];
    const next = cloneSnapshot(prev);
    next.players[0].deposit[0].effectiveValue = 10;

    const stabilized = stabilizeGameState(prev, next);
    expect(stabilized).not.toBe(prev);
    expect(stabilized.players[0].deposit).toBe(next.players[0].deposit);
  });

  it("détecte les changements de métadonnées de position d'un dépôt", () => {
    const prev = state();
    prev.players[0].deposit = [{ ...card("placed"), dx: 2, dy: -1, dropRot: 3 }];
    const next = cloneSnapshot(prev);
    next.players[0].deposit[0].dropRot = -4;

    expect(stabilizeGameState(prev, next)).not.toBe(prev);
  });
});
