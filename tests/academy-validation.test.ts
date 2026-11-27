import { afterEach, describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../config/gameConfig";
import { POWER_CARDS_BY_ID } from "../config/powerCards";
import { listPowerModules } from "../config/powers";
import { ACADEMY_TEXTS_FR } from "../data/academy/fr";
import { CH1_FOLLOW, CH2_LEAD, CH4_DIRECT, CH4_TARGETED } from "../data/academy/scenes";
import { gestureOf, resolveScenePowers } from "../engine/academy/powers";
import type { RefusalReason } from "../engine/academy/table";
import { validateScene } from "../engine/academy/validate";
import type { AcademyScene } from "../engine/academy/types";

const messages = (scene: AcademyScene) => validateScene(scene, GAME_CONFIG, ACADEMY_TEXTS_FR).map((issue) => issue.message).join(" | ");

/* La validation est le filet des scènes écrites à la main : chaque erreur
   d'écriture doit être relevée, avec un message lisible. */
describe("validation d'une scène", () => {
  it("relève une carte en double, une main incomplète, une carte hors paquet", () => {
    expect(messages({ ...CH1_FOLLOW, deal: [CH1_FOLLOW.deal[0], ["9♥", "7♠", "10♦", "3♦", "9♣"], CH1_FOLLOW.deal[2]] })).toContain("Carte en double : 9♥");
    expect(messages({ ...CH1_FOLLOW, deal: [CH1_FOLLOW.deal[0].slice(1), ...CH1_FOLLOW.deal.slice(1)] })).toContain("4 cartes au lieu de 5");
    expect(messages({ ...CH1_FOLLOW, deal: [["2♥", ...CH1_FOLLOW.deal[0].slice(1)], ...CH1_FOLLOW.deal.slice(1)] })).toContain("Carte inconnue : 2♥");
  });

  it("refuse une donne qui gagne avant le premier pli", () => {
    const under21 = ["3♠", "3♥", "4♦", "4♣", "5♠"];
    const deal = [under21, ["8♠", "7♠", "10♦", "9♦", "9♣"], ["10♠", "5♥", "6♥", "10♥", "8♣"]];
    expect(messages({ ...CH1_FOLLOW, deal, actions: [{ seat: 1, card: "8♠" }] })).toContain("gagne dès la donne");
  });

  it("refuse un historique qui ne suit pas la couleur", () => {
    // Ya a encore du Pique (10♠, 5♠) : elle ne peut pas poser son 6♥.
    expect(messages({ ...CH2_LEAD, history: [["8♠", "6♥", "4♥"], ["6♥", "9♥", "3♦"]] })).toContain("Ya Pauline ne peut pas jouer 6♥");
  });

  it("refuse un coup joué hors de son tour ou une carte impossible", () => {
    expect(messages({ ...CH1_FOLLOW, actions: [{ seat: 2, card: "10♠" }, ...CH1_FOLLOW.actions] })).toContain("c'est à Mado Biyem de jouer");
    expect(messages({ ...CH1_FOLLOW, actions: [{ seat: 1, card: "8♠" }, { seat: 2, card: "6♥" }, ...CH1_FOLLOW.actions.slice(2)] })).toContain("il faut suivre ♠");
    expect(messages({ ...CH1_FOLLOW, actions: CH1_FOLLOW.actions.slice(0, 4) })).toContain("au milieu d'un pli");
  });

  it("refuse une solution qui ne gagne pas", () => {
    const losing = CH1_FOLLOW.actions.slice(0, 3);
    expect(messages({ ...CH1_FOLLOW, actions: losing })).toContain("La solution ne gagne pas la scène.");
  });

  it("refuse un défi sans piège ou qui n'est pas le dernier pli", () => {
    // Pli 3 où toute carte gagne : Mado et Ya n'ont plus que des cartes plus faibles d'une autre couleur.
    const easy: AcademyScene = {
      ...CH2_LEAD,
      deal: [["9♥", "5♥", "4♥", "10♦", "10♣"], ["8♠", "7♠", "3♦", "6♠", "5♠"], ["10♠", "9♠", "6♥", "3♥", "4♠"]],
      actions: [{ seat: 0, free: true, solution: "5♥" }, { seat: 1, rule: "smart" }, { seat: 2, rule: "smart" }],
    };
    expect(messages(easy)).toContain("Défi sans piège");
    const notLast: AcademyScene = { ...CH2_LEAD, actions: [...CH2_LEAD.actions, { seat: 0, card: "7♦" }, { seat: 1, rule: "smart" }, { seat: 2, rule: "smart" }] };
    expect(messages(notLast)).toContain("Un défi doit être le dernier pli");
  });

  it("relève une réplique absente, une erreur impossible, un pouvoir non équipé ou au-delà de la limite", () => {
    expect(messages({ ...CH1_FOLLOW, coach: { success: "ch1.inconnue" } })).toContain("Réplique introuvable : ch1.inconnue");
    const actions = CH1_FOLLOW.actions.map((action, index) => (index === 4 ? { seat: 0, card: "9♥", coach: { wrong: { "7♦": "ch1.pli2.wrong5" } } } : action));
    expect(messages({ ...CH1_FOLLOW, actions })).toContain("Réplique d'erreur pour 7♦");
    expect(messages({ ...CH4_DIRECT, equipped: {} })).toContain("eclair_mfoundi n'est pas équipée");
    expect(validateScene(CH4_DIRECT, { ...GAME_CONFIG, maxEquippedPowers: 0 })[0]?.message).toContain("la limite est 0");
  });

  it("a une réplique générique pour chaque refus du moteur", () => {
    const reasons: RefusalReason[] = ["notNow", "illegal", "locked", "wrongCard", "powerFirst", "unexpectedPower", "wrongPower", "wrongTarget", "wrongChoice", "powerRefused"];
    for (const reason of reasons) expect(ACADEMY_TEXTS_FR).toHaveProperty(`refus.${reason}`);
  });
});

describe("repli des cartes Pouvoir", () => {
  const saved = new Map<string, { disabled?: boolean; archived?: boolean }>();
  const switchOff = (cardId: string, field: "disabled" | "archived") => {
    const def = POWER_CARDS_BY_ID[cardId];
    saved.set(cardId, { disabled: def.disabled, archived: def.archived });
    def[field] = true;
  };
  afterEach(() => {
    for (const [cardId, flags] of saved) Object.assign(POWER_CARDS_BY_ID[cardId], flags);
    saved.clear();
  });

  it("classe chaque carte du catalogue dans un des 4 gestes", () => {
    for (const card of listPowerModules()) expect(gestureOf(card.def.id)).not.toBeNull();
    expect(gestureOf("eclair_mfoundi")).toBe("direct");
    expect(gestureOf("coupe_circuit")).toBe("targeted");
    expect(gestureOf("troc_cible")).toBe("choice");
    expect(gestureOf("bouclier_village")).toBe("defense");
  });

  it("garde la scène telle quelle quand ses cartes sont actives", () => {
    expect(resolveScenePowers(CH4_TARGETED, GAME_CONFIG, ACADEMY_TEXTS_FR)).toBe(CH4_TARGETED);
  });

  it("remplace une carte désactivée par une carte du même geste qui garde la scène gagnante", () => {
    switchOff("eclair_mfoundi", "disabled");
    // L'Éclair seulement équipé, jamais joué : n'importe quelle carte « effet direct » convient.
    const replaced = resolveScenePowers({ ...CH1_FOLLOW, equipped: { 0: ["eclair_mfoundi"] } }, GAME_CONFIG, ACADEMY_TEXTS_FR);
    const substitute = replaced?.equipped?.[0]?.[0];
    expect(substitute).toBeDefined();
    expect(substitute).not.toBe("eclair_mfoundi");
    expect(gestureOf(substitute!)).toBe("direct");
  });

  it("masque la scène quand aucune carte du même geste ne la fait gagner (carte archivée)", () => {
    switchOff("eclair_mfoundi", "archived");
    expect(resolveScenePowers(CH4_DIRECT, GAME_CONFIG, ACADEMY_TEXTS_FR)).toBeNull();
  });
});
