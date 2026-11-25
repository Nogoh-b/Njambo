/* ═══════════════ Sons des cartes pouvoir ═══════════════
   Référence de son : « preset:<nom> » (fichiers audio studio dans
   `public/assets/njambo/audio/powers/<nom>.mp3`, harmonisés sur le pack
   NJAMBO 96 BPM Cmaj9/Am9) ou URL d'un fichier uploadé depuis l'admin
   (MP3 sur le VPS). Partagé par l'orchestrateur (son d'activation), les
   chorégraphies (pistes son), l'admin (écoute) et le chargeur d'assets. */

import { playAudioSample, preloadAudioSample, type ChimeSpec } from "./gxe/react";

export interface PowerSoundPreset {
  label: string;
  sampleUrl: string;
  duckMusicMs: number;
  /** Conservé pour rétrocompatibilité de type avec les anciens consommateurs. */
  spec: ChimeSpec;
}

const POWER_AUDIO_BASE = "/assets/njambo/audio/powers";

function preset(key: string, label: string, duckMusicMs = 1350): PowerSoundPreset {
  const sampleUrl = `${POWER_AUDIO_BASE}/${key}.mp3`;
  return {
    label,
    sampleUrl,
    duckMusicMs,
    spec: { sampleUrl, volume: 1, duckMusicMs, duckDepth: 0.35, notes: [] },
  };
}

/** Les 11 préréglages validés (`engine/power/validate.ts` → `SOUND_PRESET_NAMES`). */
export const POWER_SOUND_PRESETS: Record<string, PowerSoundPreset> = {
  pouvoir: preset("pouvoir", "Pouvoir royal (défaut)", 1350),
  tambour: preset("tambour", "Tambour djembé", 1450),
  eclair: preset("eclair", "Éclair & tonnerre", 1500),
  vent: preset("vent", "Vent & cartes", 1450),
  givre: preset("givre", "Éclat cristallin", 1350),
  gong: preset("gong", "Gong de bronze", 1700),
  pieces: preset("pieces", "Pluie de pièces & cauris", 1350),
  magie: preset("magie", "Sortilège mystique", 1450),
  alarme: preset("alarme", "Corne d'alerte", 1400),
  sceau: preset("sceau", "Sceau & verrou", 1250),
  souffle: preset("souffle", "Sablier du temps", 1450),
};

/** Attribution sonore par défaut pour chacune des 21 cartes pouvoir du jeu.
 *  Si une carte a un son personnalisé défini dans l'admin (`def.sound`), celui-ci
 *  a toujours priorité. */
export const DEFAULT_CARD_POWER_SOUNDS: Record<string, string> = {
  tambour_appel: "preset:tambour",
  cri_chef: "preset:alarme",
  eclair_mfoundi: "preset:eclair",
  coupe_circuit: "preset:eclair",
  vent_nord: "preset:vent",
  pagne_changeant: "preset:vent",
  troc_cible: "preset:vent",
  pluie_etoiles: "preset:givre",
  main_griot: "preset:magie",
  bouclier_village: "preset:gong",
  totem_ancetres: "preset:gong",
  cauris_chanceux: "preset:pieces",
  benediction_chef: "preset:pieces",
  feu_camp: "preset:pouvoir",
  oeil_sorcier: "preset:magie",
  marche_nuit: "preset:magie",
  masque_bluffeur: "preset:magie",
  pacte_mains: "preset:magie",
  filet_pecheur: "preset:alarme",
  sceau_entrave: "preset:sceau",
  sable_temps: "preset:souffle",
};

export const isPresetSound = (ref: string) => ref.startsWith("preset:");

/** Retourne le préréglage sonore par défaut adapté à l'identifiant d'une carte pouvoir. */
export function defaultPowerSoundRef(cardId: string): string {
  return DEFAULT_CARD_POWER_SOUNDS[cardId] ?? "preset:pouvoir";
}

/** Résout une référence (`preset:<nom>` ou URL directe) en URL audio réelle. */
export function resolvePowerSoundUrl(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (isPresetSound(ref)) {
    return POWER_SOUND_PRESETS[ref.slice("preset:".length)]?.sampleUrl ?? null;
  }
  return ref;
}

export function playPowerSound(ref: string | null | undefined, volume = 1) {
  if (!ref) return;
  if (isPresetSound(ref)) {
    const entry = POWER_SOUND_PRESETS[ref.slice("preset:".length)];
    if (!entry) return;
    playAudioSample(entry.sampleUrl, volume, {
      duckMusicMs: entry.duckMusicMs,
      duckDepth: 0.35,
      maxPolyphony: 3,
    });
    return;
  }
  playAudioSample(ref, volume, {
    duckMusicMs: 1400,
    duckDepth: 0.35,
    maxPolyphony: 3,
  });
}

/** Préchargement (chargeur d'assets) : décode aussi les préréglages IA pour 0 ms de latence. */
export function preloadPowerSound(ref: string | null | undefined): Promise<boolean> {
  const url = resolvePowerSoundUrl(ref);
  if (!url) return Promise.resolve(true);
  return preloadAudioSample(url);
}
