/* ═══════════════ Catalogue audio global du jeu (Régie du Ter → Sons & Audio) ═══════════════
   Source unique partagée par l'application joueur, la console admin et le serveur
   (document `runtime_config/audio_catalog`).

   Recense TOUS les moments sonores du jeu par catégorie (musiques, interface,
   boutique/tirages, chargement, table/cartes, résultats).
   Pour les cartes pouvoir : seul le son commun de lancement (`power_play`) vit
   ici ; les effets propres multi-sons se configurent carte par carte dans
   l'onglet « Cartes de pouvoir » (son d'activation + pistes son de chorégraphie). */

export const AUDIO_CATALOG_DOC = "audio_catalog";

export type AudioCategoryId =
  | "music"
  | "ui"
  | "shop"
  | "loading"
  | "table"
  | "powers"
  | "results";

export type AudioSlotKind = "music" | "sfx";

export interface GameSoundSlot {
  id: GameSoundId;
  category: AudioCategoryId;
  kind: AudioSlotKind;
  label: string;
  description: string;
  /** URL du fichier par défaut (null = silencieux tant que l'admin n'en assigne pas). */
  defaultUrl: string | null;
  /** Variantes par défaut (rotation anti-répétition tant qu'aucun fichier perso n'est choisi). */
  defaultPool?: readonly string[];
  defaultVolume: number;
  pitchJitter?: number;
  minGapMs?: number;
  maxPolyphony?: number;
  duckMusicMs?: number;
  duckDepth?: number;
  crossfadeMs?: number;
}

export const AUDIO_CATEGORIES: ReadonlyArray<{ id: AudioCategoryId; label: string; description: string }> = [
  { id: "music", label: "Musiques & ambiances", description: "Boucles musicales diffusées en fond (salon/menus et table de jeu)." },
  { id: "ui", label: "Interface & navigation", description: "Boutons, onglets, interrupteurs, ouverture et fermeture des fenêtres/modales, erreurs." },
  { id: "shop", label: "Boutique, packs & tirages", description: "Clic sur un article, achats, ouverture de packs/livres, révélation de cartes et roue." },
  { id: "loading", label: "Chargement de partie", description: "Entrée sur l'écran de chargement et ouverture des portes vers la table." },
  { id: "table", label: "Table de jeu & cartes", description: "Mélange, distribution, sortie du deck, sélection, dépôt, tour, chrono et plis." },
  { id: "powers", label: "Cartes pouvoir (commun)", description: "Uniquement le son commun au moment où une carte pouvoir est jouée. Les effets multi-sons vivent dans « Cartes de pouvoir »." },
  { id: "results", label: "Gains, résultats & mini-jeux", description: "Pièces Nkap, couronnes, victoires, défaites, événements et mini-jeux." },
];

const B = "/assets/njambo/audio";

export const GAME_SOUND_SLOTS = [
  /* ── 1. MUSIQUES & AMBIANCES ── */
  {
    id: "music_salon",
    category: "music",
    kind: "music",
    label: "Musique du Salon & Menus",
    description: "Boucle jouée sur l'accueil, la boutique, la collection, les événements et le profil.",
    defaultUrl: `${B}/music/salon-royal.mp3`,
    defaultVolume: 0.82,
    crossfadeMs: 1300,
  },
  {
    id: "music_table",
    category: "music",
    kind: "music",
    label: "Musique de la Table de jeu",
    description: "Boucle jouée pendant les parties (fondu enchaîné automatique avec le Salon).",
    defaultUrl: `${B}/music/table-mboa.mp3`,
    defaultVolume: 0.72,
    crossfadeMs: 1300,
  },

  /* ── 2. INTERFACE & NAVIGATION ── */
  {
    id: "ui_button",
    category: "ui",
    kind: "sfx",
    label: "Appui sur un bouton",
    description: "Clic sur un bouton standard de l'interface.",
    defaultUrl: `${B}/sfx/ui-click.mp3`,
    defaultVolume: 0.6,
    pitchJitter: 0.04,
    minGapMs: 45,
    maxPolyphony: 3,
  },
  {
    id: "ui_tab",
    category: "ui",
    kind: "sfx",
    label: "Changement d'onglet / navigation",
    description: "Clic sur un onglet ou un élément de barre de navigation.",
    defaultUrl: `${B}/sfx/ui-click.mp3`,
    defaultVolume: 0.52,
    pitchJitter: 0.03,
    minGapMs: 45,
    maxPolyphony: 3,
  },
  {
    id: "ui_toggle",
    category: "ui",
    kind: "sfx",
    label: "Interrupteur (Options)",
    description: "Bascule d'un interrupteur ON/OFF dans les réglages.",
    defaultUrl: `${B}/sfx/ui-click.mp3`,
    defaultVolume: 0.65,
    pitchJitter: 0.03,
    minGapMs: 40,
    maxPolyphony: 2,
  },
  {
    id: "ui_modal_open",
    category: "ui",
    kind: "sfx",
    label: "Ouverture d'une modale / fenêtre",
    description: "Apparition d'une fenêtre modale (détails, règles, récompense, confirmation).",
    defaultUrl: `${B}/sfx/card-play-2.mp3`,
    defaultVolume: 0.55,
    pitchJitter: 0.02,
    minGapMs: 80,
    maxPolyphony: 2,
  },
  {
    id: "ui_modal_close",
    category: "ui",
    kind: "sfx",
    label: "Fermeture d'une modale / fenêtre",
    description: "Fermeture d'une fenêtre modale (bouton ✕, retour ou clic à l'extérieur).",
    defaultUrl: `${B}/sfx/wheel-tick.mp3`,
    defaultVolume: 0.48,
    minGapMs: 80,
    maxPolyphony: 2,
  },
  {
    id: "ui_error",
    category: "ui",
    kind: "sfx",
    label: "Erreur / action impossible",
    description: "Fonds insuffisants, carte non jouable ou échec d'une action.",
    defaultUrl: `${B}/sfx/timer-tick.mp3`,
    defaultVolume: 0.75,
    minGapMs: 120,
    maxPolyphony: 2,
  },

  /* ── 3. BOUTIQUE, PACKS & TIRAGES ── */
  {
    id: "shop_item_click",
    category: "shop",
    kind: "sfx",
    label: "Clic sur un élément de la boutique",
    description: "Clic sur une offre, un livre ou une carte en boutique qui ouvre sa fiche détaillée.",
    defaultUrl: `${B}/sfx/ui-click.mp3`,
    defaultVolume: 0.72,
    pitchJitter: 0.03,
    minGapMs: 60,
    maxPolyphony: 2,
  },
  {
    id: "shop_purchase",
    category: "shop",
    kind: "sfx",
    label: "Achat confirmé (boutique)",
    description: "Validation d'un achat d'offre, de livre ou de carte en boutique.",
    defaultUrl: `${B}/sfx/coin.mp3`,
    defaultVolume: 0.95,
    duckMusicMs: 700,
    duckDepth: 0.5,
  },
  {
    id: "pack_open",
    category: "shop",
    kind: "sfx",
    label: "Ouverture d'un pack / coffre",
    description: "Ouverture d'un pack scellé dans Ma collection et révélation des lots.",
    defaultUrl: `${B}/sfx/wheel-win.mp3`,
    defaultVolume: 0.92,
    duckMusicMs: 1500,
    duckDepth: 0.35,
  },
  {
    id: "booster_open",
    category: "shop",
    kind: "sfx",
    label: "Ouverture d'un livre de cartes",
    description: "Ouverture d'un livre de cartes pouvoir (apparition de la grille de tirage 3×3).",
    defaultUrl: `${B}/sfx/deal-sweep.mp3`,
    defaultVolume: 0.9,
    duckMusicMs: 800,
    duckDepth: 0.45,
  },
  {
    id: "card_reveal",
    category: "shop",
    kind: "sfx",
    label: "Tirage & affichage d'une carte",
    description: "Révélation et affichage d'une carte tirée dans un livre ou la grille quotidienne.",
    defaultUrl: `${B}/sfx/dominance.mp3`,
    defaultVolume: 0.95,
    duckMusicMs: 1100,
    duckDepth: 0.38,
  },
  {
    id: "energy_use",
    category: "shop",
    kind: "sfx",
    label: "Activation d'un pass Énergie",
    description: "Activation d'une fiole / pass d'énergie illimitée depuis Ma collection.",
    defaultUrl: `${B}/sfx/turn-start.mp3`,
    defaultVolume: 0.9,
  },
  {
    id: "wheel_spin",
    category: "shop",
    kind: "sfx",
    label: "Lancement de la roue",
    description: "Départ de la roue des retrouvailles quand le joueur lance un tour.",
    defaultUrl: `${B}/sfx/deal-sweep.mp3`,
    defaultVolume: 0.8,
  },
  {
    id: "wheel_tick",
    category: "shop",
    kind: "sfx",
    label: "Cliquet de la roue",
    description: "Chaque passage de l'aiguille sur une cheville pendant la rotation.",
    defaultUrl: `${B}/sfx/wheel-tick.mp3`,
    defaultVolume: 0.8,
    pitchJitter: 0.04,
    minGapMs: 45,
    maxPolyphony: 3,
  },
  {
    id: "wheel_win",
    category: "shop",
    kind: "sfx",
    label: "Lot gagné à la roue",
    description: "Arrêt de la roue sur la récompense remportée.",
    defaultUrl: `${B}/sfx/wheel-win.mp3`,
    defaultVolume: 1.0,
    duckMusicMs: 2100,
    duckDepth: 0.28,
  },

  /* ── 4. CHARGEMENT DE PARTIE ── */
  {
    id: "match_loading",
    category: "loading",
    kind: "sfx",
    label: "Début du chargement de partie",
    description: "Apparition de l'écran de préparation avant d'entrer à la table.",
    defaultUrl: `${B}/sfx/round-start.mp3`,
    defaultVolume: 0.72,
    minGapMs: 500,
  },
  {
    id: "match_ready",
    category: "loading",
    kind: "sfx",
    label: "Ouverture des portes (table prête)",
    description: "Fin du chargement : les portes s'ouvrent sur la table de jeu.",
    defaultUrl: `${B}/sfx/dominance.mp3`,
    defaultVolume: 0.85,
    duckMusicMs: 900,
    duckDepth: 0.45,
  },

  /* ── 5. TABLE DE JEU & CARTES ── */
  {
    id: "round_start",
    category: "table",
    kind: "sfx",
    label: "Début de manche / mélange",
    description: "Annonce « À la table ! » et mélange du paquet en début de manche.",
    defaultUrl: `${B}/sfx/round-start.mp3`,
    defaultVolume: 0.95,
    duckMusicMs: 1100,
    duckDepth: 0.42,
  },
  {
    id: "deal_sweep",
    category: "table",
    kind: "sfx",
    label: "Distribution globale des cartes",
    description: "Balayage sonore au lancement de la distribution de la donne.",
    defaultUrl: `${B}/sfx/deal-sweep.mp3`,
    defaultVolume: 0.9,
    pitchJitter: 0.03,
    minGapMs: 180,
  },
  {
    id: "card_draw",
    category: "table",
    kind: "sfx",
    label: "Sortie d'une carte du deck",
    description: "Chaque carte qui quitte la pioche (distribution carte par carte ou pioche en partie).",
    defaultUrl: `${B}/sfx/card-play-2.mp3`,
    defaultVolume: 0.75,
    pitchJitter: 0.06,
    minGapMs: 55,
    maxPolyphony: 4,
  },
  {
    id: "card_select",
    category: "table",
    kind: "sfx",
    label: "Sélection d'une carte en main",
    description: "Instant où tu cliques sur une carte dans ta main.",
    defaultUrl: `${B}/sfx/card-play-3.mp3`,
    defaultVolume: 0.62,
    pitchJitter: 0.04,
    minGapMs: 40,
    maxPolyphony: 3,
  },
  {
    id: "card_play",
    category: "table",
    kind: "sfx",
    label: "Dépôt d'une carte sur le tapis",
    description: "Pose d'une carte sur la zone de dépôt pendant un pli.",
    defaultUrl: `${B}/sfx/card-play.mp3`,
    defaultPool: [
      `${B}/sfx/card-play.mp3`,
      `${B}/sfx/card-play-2.mp3`,
      `${B}/sfx/card-play-3.mp3`,
    ],
    defaultVolume: 0.95,
    pitchJitter: 0.035,
    minGapMs: 35,
    maxPolyphony: 4,
  },
  {
    id: "turn_start",
    category: "table",
    kind: "sfx",
    label: "« À toi de jouer ! »",
    description: "Signal sonore au début de ton tour.",
    defaultUrl: `${B}/sfx/turn-start.mp3`,
    defaultVolume: 0.85,
    minGapMs: 250,
  },
  {
    id: "timer_tick",
    category: "table",
    kind: "sfx",
    label: "Chrono (5 dernières secondes)",
    description: "Tic-tac joué pendant les 5 dernières secondes de ton tour.",
    defaultUrl: `${B}/sfx/timer-tick.mp3`,
    defaultVolume: 0.85,
    pitchJitter: 0.02,
    minGapMs: 120,
    maxPolyphony: 2,
  },
  {
    id: "dominance",
    category: "table",
    kind: "sfx",
    label: "Prise de dominance sur le pli",
    description: "Annonce du joueur qui remporte le pli en cours.",
    defaultUrl: `${B}/sfx/dominance.mp3`,
    defaultVolume: 0.95,
    duckMusicMs: 700,
    duckDepth: 0.48,
  },
  {
    id: "trick_collect",
    category: "table",
    kind: "sfx",
    label: "Fin de pli / ramassage",
    description: "Transition de fin de pli avant la main suivante.",
    defaultUrl: `${B}/sfx/card-play-2.mp3`,
    defaultVolume: 0.65,
    pitchJitter: 0.04,
    minGapMs: 150,
  },

  /* ── 6. POUVOIRS (SON COMMUN UNIQUEMENT) ── */
  {
    id: "power_play",
    category: "powers",
    kind: "sfx",
    label: "Lancement d'une carte pouvoir (commun)",
    description: "Son commun quand un joueur pose une carte pouvoir (utilisé par défaut si la carte n'a pas de son d'activation propre ; les effets multi-sons se configurent dans Cartes de pouvoir).",
    defaultUrl: `${B}/powers/pouvoir.mp3`,
    defaultVolume: 0.95,
    duckMusicMs: 1350,
    duckDepth: 0.35,
  },

  /* ── 7. GAINS, RÉSULTATS & MINI-JEUX ── */
  {
    id: "settlement_coin",
    category: "results",
    kind: "sfx",
    label: "Pièces Nkap (pot & règlement)",
    description: "Atterrissage des pièces Nkap lors du règlement du pot.",
    defaultUrl: `${B}/sfx/coin.mp3`,
    defaultPool: [
      `${B}/sfx/coin.mp3`,
      `${B}/sfx/coin-single.mp3`,
    ],
    defaultVolume: 0.9,
    pitchJitter: 0.04,
    minGapMs: 45,
    maxPolyphony: 5,
  },
  {
    id: "settlement_crown",
    category: "results",
    kind: "sfx",
    label: "Couronne gagnée / perdue",
    description: "Éclat de couronne lors du règlement de manche.",
    defaultUrl: `${B}/sfx/crown.mp3`,
    defaultVolume: 0.95,
    pitchJitter: 0.02,
    duckMusicMs: 900,
    duckDepth: 0.45,
  },
  {
    id: "round_win",
    category: "results",
    kind: "sfx",
    label: "Manche / partie gagnée",
    description: "Fanfare jouée sur l'écran de victoire.",
    defaultUrl: `${B}/sfx/win.mp3`,
    defaultVolume: 1.0,
    duckMusicMs: 2600,
    duckDepth: 0.25,
  },
  {
    id: "round_lose",
    category: "results",
    kind: "sfx",
    label: "Manche / partie perdue",
    description: "Cadence jouée sur l'écran de défaite.",
    defaultUrl: `${B}/sfx/lose.mp3`,
    defaultVolume: 0.92,
    duckMusicMs: 1900,
    duckDepth: 0.3,
  },
  {
    id: "event_advance",
    category: "results",
    kind: "sfx",
    label: "Étape d'événement réussie",
    description: "Retour sur le parcours d'événement après une victoire d'étape.",
    defaultUrl: `${B}/sfx/win.mp3`,
    defaultVolume: 0.95,
    duckMusicMs: 2200,
    duckDepth: 0.3,
  },
  {
    id: "event_fail",
    category: "results",
    kind: "sfx",
    label: "Vie perdue / élimination (événement)",
    description: "Retour sur le parcours d'événement après une défaite.",
    defaultUrl: `${B}/sfx/lose.mp3`,
    defaultVolume: 0.9,
    duckMusicMs: 1800,
    duckDepth: 0.32,
  },
  {
    id: "minigame_action",
    category: "results",
    kind: "sfx",
    label: "Action dans un mini-jeu",
    description: "Retournement de carte, choix de coffre ou lancer dans le coin des mini-jeux.",
    defaultUrl: `${B}/sfx/card-play-3.mp3`,
    defaultVolume: 0.78,
    pitchJitter: 0.05,
    minGapMs: 50,
    maxPolyphony: 4,
  },
  {
    id: "minigame_win",
    category: "results",
    kind: "sfx",
    label: "Récompense gagnée (mini-jeu)",
    description: "Affichage du lot remporté à l'issue d'un mini-jeu.",
    defaultUrl: `${B}/sfx/wheel-win.mp3`,
    defaultVolume: 0.95,
    duckMusicMs: 1900,
    duckDepth: 0.3,
  },
] as const;

export type GameSoundId = (typeof GAME_SOUND_SLOTS)[number]["id"];

export const GAME_SOUND_BY_ID: Record<GameSoundId, GameSoundSlot> = Object.fromEntries(
  GAME_SOUND_SLOTS.map((slot) => [slot.id, slot]),
) as Record<GameSoundId, GameSoundSlot>;

export const GAME_SOUND_IDS: readonly GameSoundId[] = GAME_SOUND_SLOTS.map((slot) => slot.id);

export function isGameSoundId(value: unknown): value is GameSoundId {
  return typeof value === "string" && value in GAME_SOUND_BY_ID;
}

export interface AudioSlotOverride {
  /** Fichier audio personnalisé (URL `/uploads/...`, `/assets/...` ou `https://...`). */
  url?: string;
  /** Volume relatif (0..1.5 ; omis = volume par défaut du slot). */
  volume?: number;
  /** `false` désactive cet emplacement sonore sans toucher aux autres. */
  enabled?: boolean;
}

export interface AudioCatalogConfig {
  slots: Partial<Record<GameSoundId, AudioSlotOverride>>;
  updatedAt?: number;
  updatedBy?: string;
}

export const EMPTY_AUDIO_CATALOG_CONFIG: AudioCatalogConfig = { slots: {} };

const AUDIO_URL_RE = /^(\/[\w\-./%]+|https?:\/\/[\w\-.]+(:\d+)?\/[\w\-./%]*)\.(mp3|ogg|m4a|wav)$/i;

export function isValidAudioUrl(value: unknown): value is string {
  return typeof value === "string" && value.length <= 512 && AUDIO_URL_RE.test(value);
}

export function validateAudioCatalogConfig(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const slots = candidate.slots;
  if (!slots || typeof slots !== "object" || Array.isArray(slots)) return false;
  for (const [key, raw] of Object.entries(slots as Record<string, unknown>)) {
    if (!isGameSoundId(key)) return false;
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "object" || Array.isArray(raw)) return false;
    const entry = raw as Record<string, unknown>;
    if (entry.url !== undefined && entry.url !== null && entry.url !== "" && !isValidAudioUrl(entry.url)) {
      return false;
    }
    if (entry.volume !== undefined && (typeof entry.volume !== "number" || !Number.isFinite(entry.volume) || entry.volume < 0 || entry.volume > 1.5)) {
      return false;
    }
    if (entry.enabled !== undefined && typeof entry.enabled !== "boolean") {
      return false;
    }
  }
  return true;
}

export function normalizeAudioCatalogConfig(value: unknown): AudioCatalogConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { slots: {} };
  const candidate = value as Record<string, unknown>;
  const rawSlots = candidate.slots && typeof candidate.slots === "object" && !Array.isArray(candidate.slots)
    ? (candidate.slots as Record<string, unknown>)
    : {};
  const slots: Partial<Record<GameSoundId, AudioSlotOverride>> = {};

  for (const [key, raw] of Object.entries(rawSlots)) {
    if (!isGameSoundId(key) || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const clean: AudioSlotOverride = {};
    if (isValidAudioUrl(entry.url)) clean.url = entry.url;
    if (typeof entry.volume === "number" && Number.isFinite(entry.volume)) {
      const clamped = Math.round(Math.max(0, Math.min(1.5, entry.volume)) * 100) / 100;
      const defVol = GAME_SOUND_BY_ID[key].defaultVolume;
      if (Math.abs(clamped - defVol) > 0.005) clean.volume = clamped;
    }
    if (entry.enabled === false) clean.enabled = false;
    if (Object.keys(clean).length > 0) slots[key] = clean;
  }

  return {
    slots,
    ...(typeof candidate.updatedAt === "number" ? { updatedAt: candidate.updatedAt } : {}),
    ...(typeof candidate.updatedBy === "string" ? { updatedBy: candidate.updatedBy } : {}),
  };
}
