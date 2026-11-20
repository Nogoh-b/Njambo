import { describe, expect, it } from "vitest";
import { eventCountdown, formatDuration } from "../lib/eventCountdown";

const MIN = 60_000;
const NOW = Date.UTC(2026, 10, 20, 12);

describe("formatDuration", () => {
  it("formate jours, heures et minutes", () => {
    expect(formatDuration(30 * 1000)).toBe("moins d’1 min");
    expect(formatDuration(12 * MIN)).toBe("12 min");
    expect(formatDuration(65 * MIN)).toBe("1 h 05");
    expect(formatDuration(120 * MIN)).toBe("2 h");
    expect(formatDuration((2 * 1440 + 4 * 60 + 10) * MIN)).toBe("2 j 4 h");
  });
});

describe("eventCountdown", () => {
  it("à venir, en cours, bientôt fini, terminé", () => {
    expect(eventCountdown({ startsAt: NOW + 35 * MIN, endsAt: NOW + 1440 * MIN }, NOW)?.label).toBe("Ouvre dans 35 min");
    expect(eventCountdown({ startsAt: 0, endsAt: NOW + 3 * 1440 * MIN }, NOW)).toMatchObject({ phase: "live", label: "Fin dans 3 j", endingSoon: false });
    expect(eventCountdown({ startsAt: 0, endsAt: NOW + 90 * MIN }, NOW)).toMatchObject({ endingSoon: true, label: "Fin dans 1 h 30" });
    expect(eventCountdown({ startsAt: 0, endsAt: NOW }, NOW)?.phase).toBe("ended");
  });
  it("pas de compte à rebours pour un événement permanent", () => {
    expect(eventCountdown({ startsAt: 0, endsAt: NOW + 400 * 1440 * MIN }, NOW)).toBeNull();
  });
});
