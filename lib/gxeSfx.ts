/**
 * Sons de jeu migrés vers GXE — vocabulaire de NJAMBO, pas du moteur.
 * `@gxe/driver-audio` ne connaît que des tons/carillons anonymes ; c'est ici,
 * côté app, qu'un son prend un sens ("carte posée", "dernières secondes").
 *
 * Migration progressive de `lib/sound.ts` (voir ce fichier pour l'original) :
 * seuls les sons déjà rebranchés apparaissent ci-dessous. Fréquence, durée et
 * gain reproduisent l'original ; l'enveloppe diffère légèrement (attaque de
 * quelques ms au lieu d'un démarrage instantané, chute linéaire au lieu
 * d'exponentielle — la même discipline anti-clic que le reste du moteur,
 * assumée comme une nuance de timbre acceptable, pas un défaut à corriger).
 *
 * Ces constantes ne portent PAS d'annotation de type explicite : `sfx.play()`
 * (typé `ToneSpec | TonePresetName`) les accepte par correspondance
 * structurelle — Njambo n'a donc besoin de dépendre que de `@gxe/react`,
 * jamais de `@gxe/driver-audio` directement.
 */

/** `lib/sound.ts` → `card: () => tone(180, 0.1, "triangle", 0.1)` */
export const CARD_SOUND = {
  frequencyHz: 180,
  durationMs: 100,
  type: "triangle",
  gain: 0.1,
} as const;

/** `lib/sound.ts` → `tick: () => tone(880, 0.05, "sine", 0.05)` */
export const TICK_SOUND = {
  frequencyHz: 880,
  durationMs: 50,
  type: "sine",
  gain: 0.05,
} as const;

/** `lib/sound.ts` → `roundStart` (annonce de manche, 3 notes montantes) */
export const ROUND_START_SOUND = {
  notes: [
    { frequencyHz: 196, durationMs: 180, type: "triangle", gain: 0.055, delayMs: 0 },
    { frequencyHz: 261.6, durationMs: 200, type: "sine", gain: 0.055, delayMs: 90 },
    { frequencyHz: 392, durationMs: 280, type: "triangle", gain: 0.065, delayMs: 210 },
  ],
} as const;

/** `lib/sound.ts` → `dealSweep` (distribution des cartes, 3 clics montants) */
export const DEAL_SWEEP_SOUND = {
  notes: [
    { frequencyHz: 330, durationMs: 60, type: "square", gain: 0.03, delayMs: 0 },
    { frequencyHz: 392, durationMs: 60, type: "square", gain: 0.03, delayMs: 70 },
    { frequencyHz: 523.2, durationMs: 80, type: "triangle", gain: 0.04, delayMs: 140 },
  ],
} as const;

/** `lib/sound.ts` → `turnStart` (à toi de jouer, 2 notes) */
export const TURN_START_SOUND = {
  notes: [
    { frequencyHz: 659, durationMs: 60, type: "sine", gain: 0.035, delayMs: 0 },
    { frequencyHz: 880, durationMs: 80, type: "triangle", gain: 0.035, delayMs: 80 },
  ],
} as const;

/** `lib/sound.ts` → `dominance` (un joueur domine le tour, 3 notes) */
export const DOMINANCE_SOUND = {
  notes: [
    { frequencyHz: 220, durationMs: 100, type: "triangle", gain: 0.045, delayMs: 0 },
    { frequencyHz: 440, durationMs: 140, type: "triangle", gain: 0.055, delayMs: 95 },
    { frequencyHz: 660, durationMs: 160, type: "sine", gain: 0.045, delayMs: 180 },
  ],
} as const;

/** `lib/sound.ts` → `win` : `[523,659,784,1046].forEach(…, i*110)` */
export const WIN_SOUND = {
  notes: [
    { frequencyHz: 523, durationMs: 220, type: "triangle", gain: 0.09, delayMs: 0 },
    { frequencyHz: 659, durationMs: 220, type: "triangle", gain: 0.09, delayMs: 110 },
    { frequencyHz: 784, durationMs: 220, type: "triangle", gain: 0.09, delayMs: 220 },
    { frequencyHz: 1046, durationMs: 220, type: "triangle", gain: 0.09, delayMs: 330 },
  ],
} as const;

/** `lib/sound.ts` → `lose` : `[300,240,180].forEach(…, i*140)`, descendant */
export const LOSE_SOUND = {
  notes: [
    { frequencyHz: 300, durationMs: 250, type: "sawtooth", gain: 0.05, delayMs: 0 },
    { frequencyHz: 240, durationMs: 250, type: "sawtooth", gain: 0.05, delayMs: 140 },
    { frequencyHz: 180, durationMs: 250, type: "sawtooth", gain: 0.05, delayMs: 280 },
  ],
} as const;

/** `lib/sound.ts` → `coin` (tintement de pièce, atterrissage des jetons) */
export const COIN_SOUND = {
  notes: [
    { frequencyHz: 1318, durationMs: 50, type: "triangle", gain: 0.045, delayMs: 0 },
    { frequencyHz: 1976, durationMs: 70, type: "sine", gain: 0.03, delayMs: 32 },
  ],
} as const;

/** `lib/sound.ts` → `crown` (couronne gagnée/perdue, plus grave que la pièce) */
export const CROWN_SOUND = {
  notes: [
    { frequencyHz: 784, durationMs: 100, type: "triangle", gain: 0.05, delayMs: 0 },
    { frequencyHz: 1174, durationMs: 160, type: "sine", gain: 0.04, delayMs: 85 },
  ],
} as const;

/**
 * `lib/sound.ts` → `startMusic`/`stopMusic` : gamme pentatonique, une note
 * tirée au hasard toutes les 700ms. `durationMs`/`type`/`gain` omis à
 * dessein — les défauts d'`AmbientLoop` (600ms, sine, 0.025) reproduisent
 * exactement l'original, ce sont les mêmes valeurs.
 */
export const AMBIENT_PENTA = {
  notes: [261.6, 293.7, 329.6, 392.0, 440.0, 523.2],
  intervalMs: 700,
} as const;
