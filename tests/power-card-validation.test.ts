import { afterEach, describe, expect, it } from "vitest";
import { CODE_POWER_MODULES } from "../config/powers";
import { getPowerModule, listPowerModules, powerCatalogSource, resetPowerCatalog, setPowerCatalog } from "../config/powers/registry";
import { POWER_CARDS, POWER_CARDS_BY_ID } from "../config/powerCards";
import { validatePowerCard } from "../engine/power/validate";
import type { PowerModule } from "../engine/power/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const paths = (card: Pick<PowerModule, "def" | "script">) => validatePowerCard(card).map((issue) => issue.path);
const oeil = () => clone({ def: CODE_POWER_MODULES.oeil_sorcier.def, script: CODE_POWER_MODULES.oeil_sorcier.script });

afterEach(() => resetPowerCatalog());

describe("validatePowerCard", () => {
  it("accepte les 21 cartes du code", () => {
    for (const card of Object.values(CODE_POWER_MODULES)) {
      expect(validatePowerCard(card), card.def.id).toEqual([]);
    }
  });

  it("animation V2 : identifiant de modèle facultatif, format vérifié (l'existence l'est à la publication)", () => {
    const card = oeil();
    expect(paths({ ...card, def: { ...card.def, animV2: "v2_fluide" } })).toEqual([]);
    expect(paths({ ...card, def: { ...card.def, animV2: "pas encore publié" } })).toEqual(["def.animV2"]);
    // Un modèle inconnu de ce client n'invalide pas la carte : les vols habituels s'appliquent.
    expect(paths({ ...card, def: { ...card.def, animV2: "v2_inconnu_ici" } })).toEqual([]);
  });

  it("refuse les valeurs abusives (bornes de sécurité)", () => {
    const card = oeil();
    card.script.steps[0].ops = [
      { op: "revealHand", player: "target", durationMs: 60_000 },
      { op: "potMultiplier", factor: 50, when: "winTrick" },
      { op: "timerDelta", player: "target", seconds: -90 },
    ];
    expect(paths(card)).toEqual(["script.steps.0.ops.0.durationMs", "script.steps.0.ops.1.factor", "script.steps.0.ops.2.seconds"]);
  });

  it("refuse une brique ou une animation inconnue et un choix jamais demandé", () => {
    const card = oeil();
    card.script.steps[0].ops = [
      { op: "teleport" } as never,
      { op: "moveCards", from: { zone: "hand", player: "target" }, select: { kind: "chosen", choiceId: "nope" }, to: { zone: "hand", player: "self" } },
    ];
    card.script.steps[0].anim = [{ cue: "explode" } as never];
    expect(paths(card)).toEqual(["script.steps.0.ops.0", "script.steps.0.ops.1.select.choiceId", "script.steps.0.anim.0"]);
  });

  it("exige des textes, un visuel et un script cohérent", () => {
    const card = oeil();
    card.def.name = "x";
    card.def.art = "javascript:alert(1)";
    card.script.id = "autre";
    card.script.steps = [{ anim: [{ cue: "deckPulse" }] }];
    expect(paths(card)).toEqual(expect.arrayContaining(["def.name", "def.art", "script.id", "script.steps"]));
  });
});

describe("registre dynamique", () => {
  it("démarre avec les cartes du code puis bascule sur le catalogue publié", () => {
    expect(powerCatalogSource()).toBe("code");
    expect(listPowerModules()).toHaveLength(21);
    const nouvelle = oeil();
    nouvelle.def = { ...nouvelle.def, id: "regard_du_baobab", name: "Regard du Baobab" };
    nouvelle.script.id = "regard_du_baobab";
    const archivee = clone(CODE_POWER_MODULES.vent_nord);
    archivee.def.archived = true;
    expect(setPowerCatalog([nouvelle, archivee], 7)).toBe(true);
    expect(powerCatalogSource()).toBe("catalog");
    expect(getPowerModule("regard_du_baobab")?.def.name).toBe("Regard du Baobab");
    expect(getPowerModule("oeil_sorcier")).toBeUndefined();
    // Vue boutique : l'archivée n'est plus proposée mais reste connue (jouable).
    expect(POWER_CARDS.map((def) => def.id)).toEqual(["regard_du_baobab"]);
    expect(POWER_CARDS_BY_ID.vent_nord?.archived).toBe(true);
  });

  it("ignore un catalogue vide (repli sur le code)", () => {
    expect(setPowerCatalog([], 3)).toBe(false);
    expect(listPowerModules()).toHaveLength(21);
  });
});
