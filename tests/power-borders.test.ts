import { afterEach, describe, expect, it } from "vitest";
import { CODE_POWER_MODULES } from "@/config/powers";
import { readAssetPacks } from "@/domain/assetPacks";
import {
  DEFAULT_POWER_BORDER_CONFIG,
  POWER_BORDERS,
  POWER_BORDER_IDS,
  POWER_BORDER_PARTICLE_MODES,
  POWER_CARD_TEXT_LAYOUTS,
  POWER_CARD_TEXT_LAYOUT_IDS,
  isPowerBorderId,
  isPowerBorderParticlesMode,
  isPowerCardTextLayout,
  powerBorderDefinition,
  powerCardTextLayoutDefinition,
  readPowerBorderConfig,
} from "@/domain/powerBorders";
import { validatePowerCard } from "@/engine/power/validate";
import {
  applyPowerBorderDoc,
  getPlayerCardParticlesEnabled,
  getPowerBorderConfig,
  setPlayerCardParticlesEnabled,
  setPowerBorderConfig,
} from "@/lib/powerBorderStore";

afterEach(() => {
  setPowerBorderConfig(DEFAULT_POWER_BORDER_CONFIG, false);
  setPlayerCardParticlesEnabled(true, false);
});

describe("bordures & particules des cartes Pouvoir", () => {
  it("propose le style classique plus 10 itérations avec particules", () => {
    expect(POWER_BORDERS).toHaveLength(11);
    expect(POWER_BORDER_IDS).toEqual([
      "classique",
      "orfevre",
      "braise",
      "prisme",
      "ndop_energy",
      "relique",
      "foudre",
      "monolithe",
      "solaire",
      "kente",
      "eclipse",
    ]);
    const customBorders = POWER_BORDERS.filter((item) => item.id !== "classique");
    expect(customBorders).toHaveLength(10);
    for (const item of customBorders) {
      expect(item.hasParticles, item.id).toBe(true);
      expect(isPowerBorderId(item.id)).toBe(true);
      expect(powerBorderDefinition(item.id).id).toBe(item.id);
    }
    expect(isPowerBorderId("inconnu")).toBe(false);
    expect(POWER_BORDER_PARTICLE_MODES.every((m) => isPowerBorderParticlesMode(m))).toBe(true);
    expect(isPowerBorderParticlesMode("turbo")).toBe(false);
  });

  it("lit powerBorder depuis runtime_config/asset_pack sans perturber readAssetPacks", () => {
    const doc = {
      pack: "wax",
      uiPack: "cristal",
      powerPack: "jade-astral",
      powerBorder: { border: "foudre", particles: "intense", onPortrait: false, textLayout: "plaque" },
    };
    expect(readAssetPacks(doc)).toEqual({
      system: "wax",
      interface: "cristal",
      powers: "jade-astral",
    });
    expect(readPowerBorderConfig(doc)).toEqual({
      border: "foudre",
      particles: "intense",
      onPortrait: false,
      textLayout: "plaque",
    });
    expect(readPowerBorderConfig({ powerBorder: { border: "invalide", particles: "max", textLayout: "bizarre" } })).toEqual(
      DEFAULT_POWER_BORDER_CONFIG,
    );
    expect(readPowerBorderConfig(undefined)).toEqual(DEFAULT_POWER_BORDER_CONFIG);
  });

  it("expose le rendu classique + 6 itérations de mise en page du texte", () => {
    expect(POWER_CARD_TEXT_LAYOUTS).toHaveLength(7);
    expect(POWER_CARD_TEXT_LAYOUT_IDS).toEqual([
      "classique",
      "plaque",
      "externe",
      "ruban",
      "comic",
      "haut",
      "survol",
    ]);
    for (const id of POWER_CARD_TEXT_LAYOUT_IDS) {
      expect(isPowerCardTextLayout(id)).toBe(true);
      expect(powerCardTextLayoutDefinition(id).id).toBe(id);
    }
    expect(isPowerCardTextLayout("inconnu")).toBe(false);
  });

  it("met à jour le store client à réception du document runtime_config/asset_pack", () => {
    applyPowerBorderDoc({ powerBorder: { border: "prisme", particles: "subtle", onPortrait: true, textLayout: "ruban" } });
    expect(getPowerBorderConfig()).toEqual({
      border: "prisme",
      particles: "subtle",
      onPortrait: true,
      textLayout: "ruban",
    });
    setPowerBorderConfig({ border: "orfevre", textLayout: "comic" }, false);
    expect(getPowerBorderConfig()).toEqual({
      border: "orfevre",
      particles: "subtle",
      onPortrait: true,
      textLayout: "comic",
    });
  });

  it("valide def.border et def.borderParticles et gère le toggle joueur", () => {
    const sample = CODE_POWER_MODULES.oeil_sorcier;
    for (const border of POWER_BORDER_IDS) {
      const issues = validatePowerCard({
        def: { ...sample.def, border, borderParticles: "off" },
        script: sample.script,
      });
      expect(issues, border).toEqual([]);
    }
    const invalidIssues = validatePowerCard({
      def: { ...sample.def, border: "bordure_inexistante" as never, borderParticles: "hyper" as never },
      script: sample.script,
    });
    expect(invalidIssues.some((issue) => issue.path === "def.border")).toBe(true);
    expect(invalidIssues.some((issue) => issue.path === "def.borderParticles")).toBe(true);

    expect(getPlayerCardParticlesEnabled()).toBe(true);
    setPlayerCardParticlesEnabled(false, false);
    expect(getPlayerCardParticlesEnabled()).toBe(false);
  });
});
