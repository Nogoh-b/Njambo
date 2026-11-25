/**
 * Catalogue sonore studio de NJAMBO — Neo-Soul / Afro-Lounge Royal (96 BPM, Cmaj9 / Am9).
 *
 * Basé en priorité sur les 14 fichiers studio de référence, complétés par les
 * emplacements manquants (musique de table, chrono, couronne, jackpot roue et
 * 11 sons de cartes pouvoir) dans `public/assets/njambo/audio/`
 * (script : `scripts/build-njambo-audio-pack.py`).
 *
 * Les champs `frequencyHz`/`notes` hérités ne sont conservés que pour la
 * compatibilité de type : en exécution normale, le moteur WebAudio
 * (`lib/audio/AudioEngine.ts`) joue systématiquement les fichiers réels avec
 * rotation de variantes (`samplePool`), variation de pitch, anti-spam,
 * compression master et ducking musical.
 */

export const AUDIO_BASE = "/assets/njambo/audio";

/** Carte posée sur la table — rotation naturelle sur 3 vrais claquements de carte. */
export const CARD_SOUND = {
  soundId: "card_play",
  sampleUrl: `${AUDIO_BASE}/sfx/card-play.mp3`,
  samplePool: [
    `${AUDIO_BASE}/sfx/card-play.mp3`,
    `${AUDIO_BASE}/sfx/card-play-2.mp3`,
    `${AUDIO_BASE}/sfx/card-play-3.mp3`,
  ],
  volume: 0.95,
  pitchJitter: 0.035,
  minGapMs: 35,
  maxPolyphony: 4,
  frequencyHz: 180,
  durationMs: 100,
  type: "triangle",
  gain: 0.08,
} as const;

/** Compte à rebours des 5 dernières secondes (clave en bois sec). */
export const TICK_SOUND = {
  soundId: "timer_tick",
  sampleUrl: `${AUDIO_BASE}/sfx/timer-tick.mp3`,
  volume: 0.85,
  pitchJitter: 0.02,
  minGapMs: 120,
  maxPolyphony: 2,
  frequencyHz: 880,
  durationMs: 50,
  type: "sine",
  gain: 0.05,
} as const;

/** Annonce de début de manche (« À la table » — djembé + kora). */
export const ROUND_START_SOUND = {
  soundId: "round_start",
  sampleUrl: `${AUDIO_BASE}/sfx/round-start.mp3`,
  volume: 0.95,
  duckMusicMs: 1100,
  duckDepth: 0.42,
  notes: [],
} as const;

/** Distribution rapide des cartes sur le tapis. */
export const DEAL_SWEEP_SOUND = {
  soundId: "deal_sweep",
  sampleUrl: `${AUDIO_BASE}/sfx/deal-sweep.mp3`,
  volume: 0.9,
  pitchJitter: 0.03,
  minGapMs: 180,
  notes: [],
} as const;

/** Notification chaleureuse « À toi de jouer » (balafon 2 notes). */
export const TURN_START_SOUND = {
  soundId: "turn_start",
  sampleUrl: `${AUDIO_BASE}/sfx/turn-start.mp3`,
  volume: 0.85,
  minGapMs: 250,
  notes: [],
} as const;

/** Prise de dominance sur le pli (djembé + accord balafon). */
export const DOMINANCE_SOUND = {
  soundId: "dominance",
  sampleUrl: `${AUDIO_BASE}/sfx/dominance.mp3`,
  volume: 0.95,
  duckMusicMs: 700,
  duckDepth: 0.48,
  notes: [],
} as const;

/** Fanfare de victoire Afro-Royale (baisse la musique pendant la célébration). */
export const WIN_SOUND = {
  soundId: "round_win",
  sampleUrl: `${AUDIO_BASE}/sfx/win.mp3`,
  volume: 1.0,
  duckMusicMs: 2600,
  duckDepth: 0.25,
  notes: [],
} as const;

/** Courte cadence acoustique de manche perdue (chaleureuse, jamais agressive). */
export const LOSE_SOUND = {
  soundId: "round_lose",
  sampleUrl: `${AUDIO_BASE}/sfx/lose.mp3`,
  volume: 0.92,
  duckMusicMs: 1900,
  duckDepth: 0.3,
  notes: [],
} as const;

/** Tintement réaliste de pièces Nkap / cauris sur la table (2 variantes). */
export const COIN_SOUND = {
  soundId: "settlement_coin",
  sampleUrl: `${AUDIO_BASE}/sfx/coin.mp3`,
  samplePool: [
    `${AUDIO_BASE}/sfx/coin.mp3`,
    `${AUDIO_BASE}/sfx/coin-single.mp3`,
  ],
  volume: 0.9,
  pitchJitter: 0.04,
  minGapMs: 45,
  maxPolyphony: 5,
  notes: [],
} as const;

/** Cloche royale en laiton + éclat doré (couronne gagnée). */
export const CROWN_SOUND = {
  soundId: "settlement_crown",
  sampleUrl: `${AUDIO_BASE}/sfx/crown.mp3`,
  volume: 0.95,
  pitchJitter: 0.02,
  duckMusicMs: 900,
  duckDepth: 0.45,
  notes: [],
} as const;

/** Roue des retrouvailles : cliquet de cheville en bois. */
export const WHEEL_TICK_SOUND = {
  soundId: "wheel_tick",
  sampleUrl: `${AUDIO_BASE}/sfx/wheel-tick.mp3`,
  volume: 0.8,
  pitchJitter: 0.04,
  minGapMs: 45,
  maxPolyphony: 3,
  frequencyHz: 1250,
  durationMs: 22,
  type: "square",
  gain: 0.018,
} as const;

/** Roue des retrouvailles : jackpot / lot remporté. */
export const WHEEL_WIN_SOUND = {
  soundId: "wheel_win",
  sampleUrl: `${AUDIO_BASE}/sfx/wheel-win.mp3`,
  volume: 1.0,
  duckMusicMs: 2100,
  duckDepth: 0.28,
  notes: [],
} as const;

/** Tap tactile discret pour boutons / réglages d'interface. */
export const UI_CLICK_SOUND = {
  soundId: "ui_button",
  sampleUrl: `${AUDIO_BASE}/sfx/ui-click.mp3`,
  volume: 0.6,
  pitchJitter: 0.04,
  minGapMs: 40,
  maxPolyphony: 3,
  frequencyHz: 620,
  durationMs: 30,
  type: "triangle",
  gain: 0.02,
} as const;

/** Musique d'ambiance — Salon Royal / Accueil / Boutique / Événements (boucle stéréo sans couture). */
export const AMBIENT_SALON = {
  trackUrl: `${AUDIO_BASE}/music/salon-royal.mp3`,
  volume: 0.82,
  crossfadeMs: 1300,
} as const;

/** Musique d'ambiance — Table de jeu active (groove Afro-Lounge posé, boucle sans couture). */
export const AMBIENT_TABLE = {
  trackUrl: `${AUDIO_BASE}/music/table-mboa.mp3`,
  volume: 0.72,
  crossfadeMs: 1300,
} as const;

/** Alias rétrocompatible pointant désormais vers la vraie boucle Afro-Lounge Royal. */
export const AMBIENT_PENTA = AMBIENT_SALON;

/** Sons critiques à précharger dès le salon (menu, roue, boutons). */
export const MENU_SFX_URLS = [
  UI_CLICK_SOUND.sampleUrl,
  ...COIN_SOUND.samplePool,
  WHEEL_TICK_SOUND.sampleUrl,
  WHEEL_WIN_SOUND.sampleUrl,
  AMBIENT_SALON.trackUrl,
] as const;

/** Tous les bruitages de partie à précharger avant l'entrée à la table (latence 0 ms). */
export const TABLE_SFX_URLS = [
  ...CARD_SOUND.samplePool,
  DEAL_SWEEP_SOUND.sampleUrl,
  TURN_START_SOUND.sampleUrl,
  ROUND_START_SOUND.sampleUrl,
  DOMINANCE_SOUND.sampleUrl,
  TICK_SOUND.sampleUrl,
  ...COIN_SOUND.samplePool,
  CROWN_SOUND.sampleUrl,
  WIN_SOUND.sampleUrl,
  LOSE_SOUND.sampleUrl,
  AMBIENT_TABLE.trackUrl,
] as const;
