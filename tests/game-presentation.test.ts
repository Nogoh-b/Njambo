import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../config/gameConfig";
import { checkInstantWin } from "../engine/rules";
import {
  formatGameAnnouncement,
  getInstantWinRules,
  getNextRoundPresentation,
  getResultReasonLabels,
  getSyncStatusPresentation,
} from "../lib/gamePresentation";
import type { Card, InstantReason, Player, Result } from "../types/game";

const lastCard: Card = { id: "three-hearts", rank: "3", value: 3, suit: "♥", color: "#c1292e" };
const winner: Player = {
  name: "Amina",
  emoji: "👩🏿",
  balance: 1_000,
  hand: [],
  deposit: [],
  isYou: true,
};

describe("présentation de fin de manche", () => {
  it("garde une action directe en bot et événement", () => {
    const bot = getNextRoundPresentation(true, false, false);
    const event = getNextRoundPresentation(true, false, false);

    expect(bot).toEqual({ label: "Manche suivante", short: "Rejouer", status: null });
    expect(event).toEqual(bot);
  });

  it.each(["online", "friends"])("explicite le consensus en mode %s", () => {
    expect(getNextRoundPresentation(true, true, false)).toEqual({
      label: "Demander une revanche",
      short: "Revanche",
      status: "La prochaine manche démarrera lorsque la table aura validé la revanche.",
    });
    expect(getNextRoundPresentation(true, true, true)).toEqual({
      label: "Revanche demandée",
      short: "Envoyée",
      status: "Demande envoyée. En attente de la validation des autres joueurs.",
    });
  });

  it("annonce un blocage de solde sans changer le callback métier", () => {
    expect(getNextRoundPresentation(false, false, false)).toEqual({
      label: "Manche indisponible",
      short: "Indispo.",
      status: "Solde insuffisant pour rejoindre la prochaine manche.",
    });
  });

  /* Le bouton doit tenir sur une ligne à 320 px : on verrouille la brièveté
     plutôt que le libellé exact, pour ne pas figer la formulation. */
  it("garde des libellés de bouton assez courts pour une seule ligne", () => {
    const cases = [
      getNextRoundPresentation(true, false, false),
      getNextRoundPresentation(true, true, false),
      getNextRoundPresentation(true, true, true),
      getNextRoundPresentation(false, false, false),
    ];
    for (const presentation of cases) {
      expect(presentation.short.length).toBeLessThanOrEqual(12);
    }
  });

  it("normalise les conditions de victoire", () => {
    const result: Result = {
      type: "lastTrick",
      winnerIdx: 0,
      doubles: true,
      lastCard,
      winner,
      gain: 750,
      playersCount: 3,
    };

    expect(getResultReasonLabels(result)).toEqual([
      "Dernier tour dominé",
      "Dernière carte 3 · gain x2",
    ]);
  });
});

/* Les écrans de règles affichent ces lignes : elles doivent dire la même chose
   que le moteur, en particulier sur le doublement des gains. */
describe("règles des victoires immédiates", () => {
  const card = (value: number, suit: string): Card => ({ id: `${value}${suit}`, rank: String(value), value, suit, color: "#1e1e1e" });
  const hands: Record<InstantReason, Card[]> = {
    under21: [card(3, "♠"), card(3, "♥"), card(4, "♦"), card(4, "♣"), card(5, "♠")],
    exact21: [card(3, "♠"), card(4, "♥"), card(4, "♦"), card(5, "♣"), card(5, "♠")],
    flush: [card(6, "♥"), card(7, "♥"), card(8, "♥"), card(9, "♥"), card(10, "♥")],
  };
  const noWin = [card(10, "♠"), card(10, "♦"), card(9, "♦"), card(9, "♣"), card(8, "♠")];

  it.each([false, true])("annonce le même doublement que le moteur (Couleur doublée : %s)", (flushDoubles) => {
    const cfg = { ...GAME_CONFIG, instantWin: { ...GAME_CONFIG.instantWin, flushDoubles } };
    const rules = getInstantWinRules(cfg);

    expect(rules.map((rule) => rule.reason)).toEqual(["under21", "exact21", "flush"]);
    for (const rule of rules) {
      const players = [{ ...winner, hand: hands[rule.reason] }, { ...winner, isYou: false, hand: noWin }];
      expect(checkInstantWin(players, cfg)).toMatchObject({ winnerIdx: 0, reason: rule.reason, doubles: rule.doubles });
    }
  });

  it("ne double pas la Couleur avec les règles du jeu", () => {
    expect(getInstantWinRules(GAME_CONFIG).find((rule) => rule.reason === "flush")?.doubles).toBe(false);
  });

  it("suit la config : Couleur retirée, victoires coupées", () => {
    const noFlush = { ...GAME_CONFIG, instantWin: { ...GAME_CONFIG.instantWin, flushWins: false } };
    const disabled = { ...GAME_CONFIG, instantWin: { ...GAME_CONFIG.instantWin, enabled: false } };

    expect(getInstantWinRules(noFlush).map((rule) => rule.reason)).toEqual(["under21", "exact21"]);
    expect(getInstantWinRules(disabled)).toEqual([]);
  });
});

describe("présentation des états de table", () => {
  it("reste silencieuse quand la synchronisation est en direct", () => {
    expect(getSyncStatusPresentation({ state: "live" })).toBeNull();
  });

  it("rend les coupures urgentes et conserve le message serveur", () => {
    expect(getSyncStatusPresentation({ state: "offline", message: "Connexion perdue" })).toEqual({
      label: "Connexion perdue",
      urgent: true,
    });
  });

  it("compose une annonce courte et atomique", () => {
    expect(formatGameAnnouncement("NJAMBO !", "Tu domines le tour")).toBe("NJAMBO ! Tu domines le tour");
  });
});
