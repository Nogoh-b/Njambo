import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../config/gameConfig";
import { consumeNextCardModifiers } from "../engine/power/rewards";
import { lastCardDoubles, trickWinner } from "../engine/rules";
import type { ActivePowerEffect, Card } from "../types/game";

const card = (value: number, suit: string): Card => ({ id: `${value}${suit}`, rank: String(value), value, suit, color: "#1e1e1e" });
/* Effet posé par l'Éclair du Mfoundi (config/powers/eclair_mfoundi.ts : +2 sur la prochaine carte). */
const eclair: ActivePowerEffect = { cardId: "eclair_mfoundi", activatedBy: 0, scopeTrickNo: GAME_CONFIG.cardsPerPlayer, valueBonus: 2 };

/* Le ×2 du dernier tour récompense un vrai 3 : moteur local (LocalGameSync) et
   serveur (functions/src/matchCommands.ts) lisent tous deux lastCardDoubles. */
describe("mise double du dernier tour", () => {
  it("double avec un 3 qui gagne le dernier pli", () => {
    expect(lastCardDoubles(card(3, "♠"))).toBe(true);
  });

  it("ne double pas avec une autre carte", () => {
    expect(lastCardDoubles(card(4, "♠"))).toBe(false);
    expect(lastCardDoubles(card(10, "♠"))).toBe(false);
  });

  it("ne double pas un 3 boosté par l'Éclair, même s'il gagne le pli", () => {
    const boosted = consumeNextCardModifiers([eclair], 0, card(3, "♥"), "♥", GAME_CONFIG.ranks.max).card;
    const plays = [{ playerIdx: 1, card: card(4, "♥") }, { playerIdx: 0, card: boosted }];

    expect(boosted.effectiveValue).toBe(5);
    expect(trickWinner(plays, "♥")).toBe(0);
    expect(lastCardDoubles(boosted)).toBe(false);
  });

  it("garde le ×2 d'un 3 dont seule la couleur change", () => {
    expect(lastCardDoubles({ ...card(3, "♣"), effectiveSuit: "♥" })).toBe(true);
  });

  it("suit la règle du jeu quand le ×2 est coupé", () => {
    expect(lastCardDoubles(card(3, "♠"), { ...GAME_CONFIG, lastCardThreeDoubles: false })).toBe(false);
  });
});
