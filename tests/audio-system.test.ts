import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CODE_POWER_MODULES } from "../config/powers";
import { audioEngine } from "../lib/audio/AudioEngine";
import {
  DEFAULT_AUDIO_SETTINGS,
  normalizeAudioSettings,
} from "../lib/audio/audioSettings";
import {
  AMBIENT_PENTA,
  AMBIENT_SALON,
  AMBIENT_TABLE,
  CARD_SOUND,
  COIN_SOUND,
  CROWN_SOUND,
  DEAL_SWEEP_SOUND,
  DOMINANCE_SOUND,
  LOSE_SOUND,
  MENU_SFX_URLS,
  ROUND_START_SOUND,
  TABLE_SFX_URLS,
  TICK_SOUND,
  TURN_START_SOUND,
  UI_CLICK_SOUND,
  WHEEL_TICK_SOUND,
  WHEEL_WIN_SOUND,
  WIN_SOUND,
} from "../lib/gxeSfx";
import {
  DEFAULT_CARD_POWER_SOUNDS,
  POWER_SOUND_PRESETS,
  defaultPowerSoundRef,
  playPowerSound,
  resolvePowerSoundUrl,
} from "../lib/powerSounds";
import { isSoundRef } from "../engine/power/validate";
import {
  AUDIO_CATEGORIES,
  GAME_SOUND_SLOTS,
  normalizeAudioCatalogConfig,
  validateAudioCatalogConfig,
} from "../domain/audioCatalog";
import { resolveGameSound, resolveMusicTrack } from "../lib/audio/audioCatalogStore";

describe("préférences audio persistées", () => {
  it("retourne les défauts cohérents pour un objet vide ou corrompu", () => {
    expect(normalizeAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(normalizeAudioSettings("invalid")).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(normalizeAudioSettings({})).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it("borne les volumes entre 0 et 1 et conserve les interrupteurs", () => {
    expect(
      normalizeAudioSettings({
        musicOn: false,
        sfxOn: true,
        musicVolume: 1.8,
        sfxVolume: -0.4,
      }),
    ).toEqual({
      musicOn: false,
      sfxOn: true,
      musicVolume: 1,
      sfxVolume: 0,
    });
  });
});

describe("catalogue sonore pro NJAMBO", () => {
  it("tous les sons cœur et musiques pointent vers des fichiers MP3 locaux (zéro MIDI)", () => {
    const sfxSpecs = [
      CARD_SOUND,
      TICK_SOUND,
      ROUND_START_SOUND,
      DEAL_SWEEP_SOUND,
      TURN_START_SOUND,
      DOMINANCE_SOUND,
      WIN_SOUND,
      LOSE_SOUND,
      COIN_SOUND,
      CROWN_SOUND,
      WHEEL_TICK_SOUND,
      WHEEL_WIN_SOUND,
      UI_CLICK_SOUND,
    ];
    for (const spec of sfxSpecs) {
      expect(spec.sampleUrl).toMatch(/^\/assets\/njambo\/audio\/sfx\/[\w-]+\.mp3$/);
    }
    expect(AMBIENT_SALON.trackUrl).toBe("/assets/njambo/audio/music/salon-royal.mp3");
    expect(AMBIENT_TABLE.trackUrl).toBe("/assets/njambo/audio/music/table-mboa.mp3");
    expect(AMBIENT_PENTA).toBe(AMBIENT_SALON);
    expect(MENU_SFX_URLS).toContain(AMBIENT_SALON.trackUrl);
    expect(TABLE_SFX_URLS).toContain(CARD_SOUND.sampleUrl);
    expect(TABLE_SFX_URLS).toContain(WIN_SOUND.sampleUrl);
  });

  it("les 11 préréglages de pouvoirs résolvent tous vers un fichier MP3 pro", () => {
    for (const [key, entry] of Object.entries(POWER_SOUND_PRESETS)) {
      expect(entry.sampleUrl).toBe(`/assets/njambo/audio/powers/${key}.mp3`);
      expect(resolvePowerSoundUrl(`preset:${key}`)).toBe(entry.sampleUrl);
    }
    expect(resolvePowerSoundUrl("https://cdn.example/custom.mp3")).toBe("https://cdn.example/custom.mp3");
    expect(resolvePowerSoundUrl(undefined)).toBeNull();
  });

  it("chacune des 21 cartes pouvoir du code possède un son IA valide par défaut", () => {
    for (const card of Object.values(CODE_POWER_MODULES)) {
      const ref = defaultPowerSoundRef(card.def.id);
      expect(DEFAULT_CARD_POWER_SOUNDS[card.def.id], card.def.id).toBeDefined();
      expect(isSoundRef(ref), `${card.def.id} -> ${ref}`).toBe(true);
      expect(resolvePowerSoundUrl(ref)).toMatch(/^\/assets\/njambo\/audio\/powers\/[\w-]+\.mp3$/);
    }
  });

  it("tous les fichiers MP3 déclarés (musiques, SFX et pouvoirs) existent dans public/", () => {
    const publicRoot = path.resolve(process.cwd(), "public");
    const urls = new Set<string>([
      AMBIENT_SALON.trackUrl,
      AMBIENT_TABLE.trackUrl,
      ...CARD_SOUND.samplePool,
      TICK_SOUND.sampleUrl,
      ROUND_START_SOUND.sampleUrl,
      DEAL_SWEEP_SOUND.sampleUrl,
      TURN_START_SOUND.sampleUrl,
      DOMINANCE_SOUND.sampleUrl,
      WIN_SOUND.sampleUrl,
      LOSE_SOUND.sampleUrl,
      ...COIN_SOUND.samplePool,
      CROWN_SOUND.sampleUrl,
      WHEEL_TICK_SOUND.sampleUrl,
      WHEEL_WIN_SOUND.sampleUrl,
      UI_CLICK_SOUND.sampleUrl,
      ...Object.values(POWER_SOUND_PRESETS).map((p) => p.sampleUrl),
    ]);
    expect(urls.size).toBe(29);
    for (const url of urls) {
      const fullPath = path.join(publicRoot, url.replace(/^\//, ""));
      expect(existsSync(fullPath), `fichier manquant : ${url}`).toBe(true);
      expect(statSync(fullPath).size, `fichier vide : ${url}`).toBeGreaterThan(1024);
    }
  });
});

describe("catalogue audio administrable (Admin → Sons & Audio)", () => {
  it("couvre toutes les catégories et pointe uniquement vers des fichiers existants", () => {
    const publicRoot = path.resolve(process.cwd(), "public");
    const usedCategories = new Set(GAME_SOUND_SLOTS.map((slot) => slot.category));
    for (const cat of AUDIO_CATEGORIES) {
      expect(usedCategories.has(cat.id), `catégorie vide : ${cat.id}`).toBe(true);
    }
    for (const slot of GAME_SOUND_SLOTS) {
      if (slot.defaultUrl) {
        const fullPath = path.join(publicRoot, slot.defaultUrl.replace(/^\//, ""));
        expect(existsSync(fullPath), `${slot.id} → ${slot.defaultUrl}`).toBe(true);
      }
    }
  });

  it("valide et normalise les surcharges admin (URL, volume, coupure)", () => {
    expect(validateAudioCatalogConfig({
      slots: {
        ui_button: { url: "https://api.njambo.app/uploads/audio/btn.mp3", volume: 1.1 },
        music_salon: { enabled: false },
      },
    })).toBe(true);

    // Refuse identifiant inconnu, URL dangereuse ou volume hors bornes
    expect(validateAudioCatalogConfig({ slots: { inconnu: { enabled: false } } })).toBe(false);
    expect(validateAudioCatalogConfig({ slots: { ui_button: { url: "javascript:alert(1)" } } })).toBe(false);
    expect(validateAudioCatalogConfig({ slots: { ui_button: { volume: 3 } } })).toBe(false);

    const normalized = normalizeAudioCatalogConfig({
      slots: {
        shop_item_click: { url: "/uploads/audio/modal.mp3", volume: 1.25 },
        ui_modal_close: { enabled: false },
        card_play: { volume: 0.95 }, // égal au défaut → nettoyé
      },
    });
    expect(normalized.slots.shop_item_click).toEqual({ url: "/uploads/audio/modal.mp3", volume: 1.25 });
    expect(normalized.slots.ui_modal_close).toEqual({ enabled: false });
    expect(normalized.slots.card_play).toBeUndefined();
  });

  it("résout un slot avec surcharge admin (fichier perso remplace le pool, coupure respectée)", () => {
    const customConfig = normalizeAudioCatalogConfig({
      slots: {
        card_play: { url: "https://cdn.example/mon-depot.mp3", volume: 1.2 },
        music_salon: { enabled: false },
      },
    });
    const card = resolveGameSound("card_play", customConfig);
    expect(card.url).toBe("https://cdn.example/mon-depot.mp3");
    expect(card.pool).toBeUndefined();
    expect(card.volume).toBe(1.2);
    expect(card.customized).toBe(true);

    const salon = resolveMusicTrack("music_salon", customConfig);
    expect(salon.enabled).toBe(false);
    expect(salon.trackUrl).toBeNull();
  });

  it("playPowerSound tolère le chargement d'un fichier custom (≥ 3 s) et retourne le résultat de lecture", async () => {
    const spy = vi.spyOn(audioEngine, "playSfx").mockResolvedValue(true);
    try {
      const okCustom = await playPowerSound("http://localhost:8081/uploads/audio/oeil.wav", 0.85);
      expect(okCustom).toBe(true);
      expect(spy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          url: "http://localhost:8081/uploads/audio/oeil.wav",
          volume: 0.85,
          maxLoadDelayMs: 3000,
        }),
      );

      const okPreset = await playPowerSound("preset:magie", 1);
      expect(okPreset).toBe(true);
      expect(spy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          url: "/assets/njambo/audio/powers/magie.mp3",
          volume: 1,
          maxLoadDelayMs: 3000,
        }),
      );

      expect(await playPowerSound("preset:inconnu")).toBe(false);
      expect(await playPowerSound(null)).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
