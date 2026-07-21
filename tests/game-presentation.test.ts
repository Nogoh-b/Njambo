import { describe, expect, it } from "vitest";
import {
  formatGameAnnouncement,
  getNextRoundPresentation,
  getResultReasonLabels,
  getSyncStatusPresentation,
} from "../lib/gamePresentation";
import type { Card, Player, Result } from "../types/game";

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

    expect(bot).toEqual({ label: "Manche suivante", status: null });
    expect(event).toEqual(bot);
  });

  it.each(["online", "friends"])("explicite le consensus en mode %s", () => {
    expect(getNextRoundPresentation(true, true, false)).toEqual({
      label: "Demander une revanche",
      status: "La prochaine manche démarrera lorsque la table aura validé la revanche.",
    });
    expect(getNextRoundPresentation(true, true, true)).toEqual({
      label: "Revanche demandée",
      status: "Demande envoyée. En attente de la validation des autres joueurs.",
    });
  });

  it("annonce un blocage de solde sans changer le callback métier", () => {
    expect(getNextRoundPresentation(false, false, false)).toEqual({
      label: "Manche indisponible",
      status: "Solde insuffisant pour rejoindre la prochaine manche.",
    });
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
