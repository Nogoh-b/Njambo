import { describe, expect, it } from "vitest";
import {
  CHANGELOG_ENTRIES,
  DEFAULT_ECONOMY,
  DEFAULT_OFFERS,
  applyRewardToInventory,
  countStoredCollectionItems,
  formatEnergyDuration,
  isStoredPackOffer,
  splitChangelogBySide,
  type OfferDefinition,
  type PlayerEconomy,
} from "../domain";

const baseEconomy = (): PlayerEconomy => ({
  ...DEFAULT_ECONOMY,
  energy: { ...DEFAULT_ECONOMY.energy, anchorAt: 1_000_000, unlimitedUntil: 0 },
  daily: { ...DEFAULT_ECONOMY.daily },
  pity: {},
});

describe("stored collection items", () => {
  it("identifies element packs to keep sealed vs direct currencies or single-book offers", () => {
    const byId = (id: string) => DEFAULT_OFFERS.find((o) => o.id === id) as OfferDefinition;
    expect(isStoredPackOffer(byId("pack_quartier"))).toBe(true);
    expect(isStoredPackOffer(byId("pack_mboa"))).toBe(true);
    expect(isStoredPackOffer(byId("pack_chefferie"))).toBe(true);

    expect(isStoredPackOffer(byId("booster_normal_xaf"))).toBe(false);
    expect(isStoredPackOffer(byId("booster_rare_xaf"))).toBe(false);
    expect(isStoredPackOffer(byId("booster_exceptionnel_xaf"))).toBe(false);
    expect(isStoredPackOffer(byId("daily_grid_slot_xaf"))).toBe(false);
    expect(isStoredPackOffer(byId("cauris_110"))).toBe(false);
    expect(isStoredPackOffer(byId("nkap_3000"))).toBe(false);
    expect(isStoredPackOffer(byId("energy_60"))).toBe(false);
    expect(isStoredPackOffer(byId("ticket_bronze"))).toBe(false);
  });

  it("formats energy pass durations cleanly", () => {
    expect(formatEnergyDuration(30)).toBe("30 min");
    expect(formatEnergyDuration(60)).toBe("1 h");
    expect(formatEnergyDuration(90)).toBe("1 h 30");
    expect(formatEnergyDuration(120)).toBe("2 h");
    expect(formatEnergyDuration(1440)).toBe("24 h");
  });

  it("counts packs, booster books, energy passes, and tickets accurately", () => {
    expect(countStoredCollectionItems(null)).toEqual({
      packs: 0,
      books: 0,
      energy: 0,
      tickets: 0,
      total: 0,
    });

    expect(
      countStoredCollectionItems({
        packs: [
          { packInstanceId: "p1", offerId: "pack_mboa", title: "Pack Mboa", acquiredAt: 100 },
          { packInstanceId: "p2", offerId: "pack_quartier", title: "Pack Quartier", acquiredAt: 200 },
        ],
        boosterBooks: { normal: 2, exceptionnel: 1, rare: 0 },
        energyPasses: { "60": 3, "1440": 1 },
        tickets: { bronze: 2, argent: 0, or: 1 },
      }),
    ).toEqual({
      packs: 2,
      books: 3,
      energy: 4,
      tickets: 3,
      total: 12,
    });
  });

  it("stores energy_pass in inventory instead of activating unlimited energy immediately", () => {
    const economy = baseEconomy();
    const first = applyRewardToInventory(economy, {}, { type: "energy_pass", durationMinutes: 60 }, 2_000_000);
    expect(first.economy.energy.unlimitedUntil).toBe(0);
    expect(first.inventory.energyPasses).toEqual({ "60": 1 });

    const second = applyRewardToInventory(first.economy, first.inventory, { type: "energy_pass", durationMinutes: 60 }, 2_001_000);
    expect(second.economy.energy.unlimitedUntil).toBe(0);
    expect(second.inventory.energyPasses).toEqual({ "60": 2 });

    const third = applyRewardToInventory(second.economy, second.inventory, { type: "energy_pass", durationMinutes: 1440 }, 2_002_000);
    expect(third.inventory.energyPasses).toEqual({ "60": 2, "1440": 1 });
  });

  it("stores tickets and booster books in inventory while crediting currencies to wallet", () => {
    const economy = baseEconomy();
    const afterTicket = applyRewardToInventory(economy, {}, { type: "ticket", tier: "argent", amount: 2 }, 3_000_000);
    expect(afterTicket.inventory.tickets.argent).toBe(2);

    const afterBook = applyRewardToInventory(
      afterTicket.economy,
      afterTicket.inventory,
      { type: "booster_book", boosterId: "rare", amount: 1 },
      3_000_000,
    );
    expect(afterBook.inventory.boosterBooks.rare).toBe(1);

    const afterNkap = applyRewardToInventory(
      afterBook.economy,
      afterBook.inventory,
      { type: "nkap", amount: 1_500 },
      3_000_000,
    );
    expect(afterNkap.economy.nkap).toBe(economy.nkap + 1_500);

    const afterCauris = applyRewardToInventory(
      afterNkap.economy,
      afterNkap.inventory,
      { type: "cauris", amount: 25 },
      3_000_000,
    );
    expect(afterCauris.economy.cauris).toBe(economy.cauris + 25);
  });
});

describe("admin / app split changelog", () => {
  it("contains distinct entries for both admin and app sides with unique ids", () => {
    const split = splitChangelogBySide(CHANGELOG_ENTRIES);
    expect(split.admin.length).toBeGreaterThan(0);
    expect(split.app.length).toBeGreaterThan(0);
    expect(split.admin.length + split.app.length).toBe(CHANGELOG_ENTRIES.length);

    const ids = new Set(CHANGELOG_ENTRIES.map((entry) => entry.id));
    expect(ids.size).toBe(CHANGELOG_ENTRIES.length);
    for (const entry of CHANGELOG_ENTRIES) {
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.summary.trim().length).toBeGreaterThan(0);
      expect(entry.highlights.length).toBeGreaterThan(0);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
