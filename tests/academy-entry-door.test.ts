import { describe, expect, it } from "vitest";
import { isFirstLaunch, markEntryDoor, shouldOpenEntryDoor, type EntryDoorBoot } from "../lib/academy/entryDoor";

const newcomer: EntryDoorBoot = { firstLaunch: true, answered: false, search: "", hash: "" };

/* La porte d'entrée ne doit jamais bloquer : une fois, au tout premier lancement,
   et seulement si l'on arrive sur l'accueil. */
describe("porte d'entrée de l'Académie", () => {
  it("s'ouvre au tout premier lancement, sur l'accueil", () => {
    expect(shouldOpenEntryDoor(newcomer)).toBe(true);
    expect(shouldOpenEntryDoor({ ...newcomer, hash: "#/" })).toBe(true);
    expect(shouldOpenEntryDoor({ ...newcomer, hash: "#/menu" })).toBe(true);
  });

  it("ne revient jamais une fois répondue, ni pour un joueur déjà venu", () => {
    expect(shouldOpenEntryDoor({ ...newcomer, answered: true })).toBe(false);
    expect(shouldOpenEntryDoor({ ...newcomer, firstLaunch: false })).toBe(false);
  });

  it("est sautée quand on arrive par un lien : salle d'un ami, événement, Académie, autre écran", () => {
    expect(shouldOpenEntryDoor({ ...newcomer, hash: "#/lobby?room=ABC123" })).toBe(false);
    expect(shouldOpenEntryDoor({ ...newcomer, search: "?event=fete-mboa" })).toBe(false);
    expect(shouldOpenEntryDoor({ ...newcomer, search: "?academie=bases" })).toBe(false);
    expect(shouldOpenEntryDoor({ ...newcomer, hash: "#/table" })).toBe(false);
  });

  it("reconnaît un joueur déjà venu à n'importe quelle trace « njambo » sur l'appareil", () => {
    expect(isFirstLaunch([])).toBe(true);
    expect(isFirstLaunch(["autre-site"])).toBe(true);
    // Compte connecté sans profil local : les clés écrites à chaque visite suffisent.
    expect(isFirstLaunch(["njambo-asset-pack", "njambo-audio-catalog"])).toBe(false);
  });

  it("enregistre la réponse sans planter quand le stockage manque", () => {
    expect(() => markEntryDoor("skipped")).not.toThrow();
  });
});
