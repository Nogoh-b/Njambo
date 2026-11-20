import { describe, expect, it } from "vitest";
import { blankEventVersion, planEventCampaigns, type EventVersion } from "../domain";

const H = 3_600_000;
const NOW = Date.UTC(2026, 10, 20, 8);
const event = (notifications: EventVersion["notifications"]): EventVersion => ({
  ...blankEventVersion("fete", NOW), startsAt: NOW + 2 * H, endsAt: NOW + 50 * H, notifications,
});

describe("planEventCampaigns", () => {
  it("ouverture, avant la fin et date fixe", () => {
    const plan = planEventCampaigns(event([
      { id: "a", trigger: "before_end", offsetMinutes: 120, title: "Dernières heures", body: "Vite", audience: "active_run" },
      { id: "b", trigger: "opening", title: "C'est parti", body: "Viens", audience: "all" },
      { id: "c", trigger: "at", at: NOW + 10 * H, title: "Rappel", body: "Toujours là", audience: "not_joined" },
    ]), NOW);
    expect(plan.map((p) => [p.notificationId, p.sendAt])).toEqual([["b", NOW + 2 * H], ["c", NOW + 10 * H], ["a", NOW + 48 * H]]);
    expect(plan[0].campaignId).toBe("ev_fete_b");
  });

  it("l'ouverture part tout de suite si l'événement est déjà ouvert", () => {
    const live = { ...event([{ id: "o", trigger: "opening", title: "Go", body: "Go", audience: "all" }]), startsAt: NOW - H };
    expect(planEventCampaigns(live, NOW)[0].sendAt).toBe(NOW);
  });

  it("ignore ce qui est déjà passé ou après la fin", () => {
    const plan = planEventCampaigns(event([
      { id: "past", trigger: "at", at: NOW - 1, title: "x", body: "x", audience: "all" },
      { id: "late", trigger: "before_end", offsetMinutes: 0, title: "x", body: "x", audience: "all" },
    ]), NOW);
    expect(plan).toEqual([]);
  });
});
