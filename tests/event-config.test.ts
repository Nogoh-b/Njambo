import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVENTS,
  blankEventVersion,
  eventLifecycle,
  normalizeEventVersion,
  validateEventVersion,
  type EventVersion,
} from "../domain";

const NOW = Date.UTC(2026, 10, 20);
const paths = (event: EventVersion) => validateEventVersion(event).map((issue) => issue.path);

describe("normalizeEventVersion", () => {
  it("complète une fiche v1 avec les blocs v2 désactivés", () => {
    const legacy = {
      eventId: "ancien_event", revision: 2, title: "Ancien", description: "", mode: "pve",
      startsAt: 0, endsAt: 10, ticketTier: "or", allowedLosses: 2, rankingRewardsEnabled: true, published: true,
      stages: [{ id: "b", order: 2, title: "B", difficulty: "elite", playerCount: 4, stakeNkap: 0, powersAllowed: true, crownsEnabled: false, reward: [], rewardRepeatable: false },
        { id: "a", order: 1, title: "A", difficulty: "facile", playerCount: 4, stakeNkap: 0, powersAllowed: true, crownsEnabled: false, reward: [], rewardRepeatable: false }],
      finalReward: [],
    };
    const event = normalizeEventVersion(legacy);
    expect(event.stages.map((stage) => stage.id)).toEqual(["a", "b"]);
    expect(event.stages[0]).toMatchObject({ modifiers: [], seasonPoints: 0 });
    expect(event.revive.enabled).toBe(false);
    expect(event.leaderboard).toMatchObject({ enabled: true, pointsPerStage: 100, pointsPerLifeLeft: 30, perfectBonus: 50 });
    expect(event.notifications).toEqual([]);
    expect(event.friendChallenges.enabled).toBe(false);
    expect(event.theme.accent).toMatch(/^#/);
  });

  it("est idempotente", () => {
    const once = normalizeEventVersion(DEFAULT_EVENTS[0]);
    expect(normalizeEventVersion(once)).toEqual(once);
  });
});

describe("validateEventVersion", () => {
  it("accepte les événements par défaut et une fiche vierge", () => {
    for (const event of DEFAULT_EVENTS) expect(validateEventVersion(event)).toEqual([]);
    expect(validateEventVersion(blankEventVersion("nouvel_event", NOW))).toEqual([]);
  });

  it("refuse des dates incohérentes, aucune table et zéro vie", () => {
    const event = { ...blankEventVersion("event_a", NOW), endsAt: NOW, startsAt: NOW + 1, stages: [], allowedLosses: 0 };
    expect(paths(event)).toEqual(expect.arrayContaining(["endsAt", "stages", "allowedLosses"]));
  });

  it("refuse une récompense invalide en indiquant le chemin exact", () => {
    const base = blankEventVersion("event_b", NOW);
    const event = { ...base, stages: [{ ...base.stages[0], reward: [{ type: "nkap", amount: -5 } as never] }] };
    expect(paths(event)).toEqual(["stages.0.reward.0.amount"]);
  });

  it("refuse des tranches de classement qui se chevauchent", () => {
    const base = blankEventVersion("event_c", NOW);
    const event: EventVersion = {
      ...base,
      leaderboard: {
        ...base.leaderboard, enabled: true,
        rankRewards: [
          { fromRank: 1, toRank: 3, reward: [{ type: "cauris", amount: 50 }] },
          { fromRank: 3, toRank: 10, reward: [{ type: "cauris", amount: 10 }] },
        ],
      },
    };
    expect(paths(event)).toEqual(["leaderboard.rankRewards.1"]);
  });

  it("exige un minuteur quand le modificateur turn_timer est actif", () => {
    const base = blankEventVersion("event_d", NOW);
    const event = { ...base, stages: [{ ...base.stages[0], modifiers: ["turn_timer" as const] }] };
    expect(paths(event)).toEqual(["stages.0.turnTimerSeconds"]);
  });

  it("refuse une notification programmée hors de l'événement", () => {
    const base = blankEventVersion("event_e", NOW);
    const event: EventVersion = { ...base, notifications: [{ id: "n1", trigger: "at", at: base.endsAt + 1, title: "Hey", body: "Viens jouer", audience: "all" }] };
    expect(paths(event)).toEqual(["notifications.0.at"]);
  });

  it("vérifie le rachat de vie seulement s'il est activé", () => {
    const base = blankEventVersion("event_f", NOW);
    expect(paths({ ...base, revive: { ...base.revive, pricesCauris: [] } })).toEqual([]);
    expect(paths({ ...base, revive: { ...base.revive, enabled: true, pricesCauris: [] } })).toEqual(["revive.pricesCauris"]);
  });
});

describe("eventLifecycle", () => {
  const base = { published: true, startsAt: NOW, endsAt: NOW + 1_000 };
  it("dérive le statut affiché dans l'admin", () => {
    expect(eventLifecycle({ ...base, published: false }, NOW)).toBe("draft");
    expect(eventLifecycle(base, NOW - 1)).toBe("scheduled");
    expect(eventLifecycle(base, NOW + 10)).toBe("live");
    expect(eventLifecycle(base, NOW + 1_000)).toBe("ended");
    expect(eventLifecycle({ ...base, archived: true }, NOW + 10)).toBe("archived");
  });
});
