import { describe, expect, it } from "vitest";
import { findBlockingEffect } from "../engine/power/blocking";
import { bluffHand, isBluff } from "../engine/power/bluff";
import { CODE_POWER_MODULES } from "../config/powers";
import type { ActivePowerEffect, Card, GameState } from "../types/game";

/* Masque du Bluffeur : une révélation de la main (Œil du Sorcier) montre une fausse main. */
const card = (value: number, suit: string): Card => ({ id: `${value}${suit}`, rank: String(value), value, suit, color: "#1e1e1e" }) as Card;
const mask: ActivePowerEffect = { cardId: "masque_bluffeur", activatedBy: 1, scopeTrickNo: 1, blocks: ["reveal"] } as ActivePowerEffect;
const shield: ActivePowerEffect = { cardId: "bouclier_village", activatedBy: 1, scopeTrickNo: 1, blocks: ["targeted"], shield: true } as ActivePowerEffect;
const eye = CODE_POWER_MODULES.oeil_sorcier.script;
const seal = CODE_POWER_MODULES.sceau_entrave.script;

const state = {
  players: [
    { hand: [card(3, "♠"), card(4, "♠")], deposit: [card(5, "♠")] },
    { hand: [card(6, "♥"), card(7, "♥"), card(8, "♥")], deposit: [card(9, "♥")] },
  ],
  trickPlays: [{ playerIdx: 0, card: card(10, "♠") }],
} as unknown as GameState;

describe("Masque du Bluffeur", () => {
  it("passe avant le Bouclier contre une révélation (le bouclier n'est pas usé)", () => {
    expect(findBlockingEffect(eye, 1, [shield, mask])).toBe(mask);
    expect(isBluff(mask, eye)).toBe(true);
  });
  it("ne protège pas d'une attaque qui ne révèle rien : le bouclier s'en charge", () => {
    expect(findBlockingEffect(seal, 1, [mask, shield])).toBe(shield);
    expect(findBlockingEffect(seal, 1, [mask])).toBeUndefined();
    expect(isBluff(shield, eye)).toBe(false);
  });
  it("fausse main : même taille, aucune carte vraie, aucune carte que l'attaquant voit déjà", () => {
    const fake = bluffHand(state, 0, 1);
    expect(fake).toHaveLength(3);
    const forbidden = ["3♠", "4♠", "5♠", "6♥", "7♥", "8♥", "9♥", "10♠"];
    expect(fake.every((entry) => !forbidden.includes(entry.id))).toBe(true);
    expect(new Set(fake.map((entry) => entry.id)).size).toBe(3);
  });
});
