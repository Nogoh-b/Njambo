import { describe, expect, it } from "vitest";
import {
  GAME_MODE_CATALOG,
  isGameModeLocked,
  resolveGameModeDestination,
} from "../lib/gameModeCatalog";

describe("catalogue partagé des modes de jeu", () => {
  it("conserve les trois destinations historiques dans leur ordre éditorial", () => {
    expect(GAME_MODE_CATALOG.map((mode) => mode.scene)).toEqual([
      "online_setup",
      "bot_setup",
      "friends_invite",
    ]);
    expect(new Set(GAME_MODE_CATALOG.map((mode) => mode.scene)).size).toBe(GAME_MODE_CATALOG.length);
  });

  it("redirige uniquement les modes verrouillés de l'invité vers le profil", () => {
    const [online, bot, friends] = GAME_MODE_CATALOG;

    expect(isGameModeLocked(online, true)).toBe(true);
    expect(resolveGameModeDestination(online, true)).toBe("profile");
    expect(isGameModeLocked(bot, true)).toBe(false);
    expect(resolveGameModeDestination(bot, true)).toBe("bot_setup");
    expect(isGameModeLocked(friends, true)).toBe(true);
    expect(resolveGameModeDestination(friends, true)).toBe("profile");
  });

  it("ne modifie aucune destination pour un joueur connecté", () => {
    for (const mode of GAME_MODE_CATALOG) {
      expect(resolveGameModeDestination(mode, false)).toBe(mode.scene);
    }
  });
});
