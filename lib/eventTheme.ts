import type { GameHubTone } from "@/components/ui/GameHubLayout";

/**
 * Thème visuel d'un événement, inféré depuis son `eventId`. Purement
 * déclaratif côté UI — aucune incidence sur le domaine ni le backend.
 * On déduit l'ambiance (libellé du thème, ton du hub, accent CSS) d'après
 * des préfixes connus, avec un fallback générique « rose Ter ».
 */
export interface EventTheme {
  /** Ton du hub (clé GameHubLayout) — pilote le dégradé d'arrière-plan. */
  tone: GameHubTone;
  /** Couleur d'accent (variable CSS / hex) pour les nœuds du parcours. */
  accent: string;
  /** Couleur d'accent secondaire (connecteurs, halos). */
  accentSoft: string;
  /** Court libellé du thème, affiché en kicker. */
  label: string;
}

const DEFAULT_THEME: EventTheme = {
  tone: "events",
  accent: "var(--nj-pink, #e5407a)",
  accentSoft: "var(--nj-pink-soft, #ffd6e5)",
  label: "Le Ter",
};

/**
 * Mapping direct eventId → thème, pour les événements bundle/default.
 * Les nouveaux événements produits tombent sur l'inférence par préfixe
 * ci-dessous, puis sur le fallback générique.
 */
const KNOWN_THEMES: Record<string, EventTheme> = {
  defi_du_mboa: {
    tone: "gold",
    accent: "var(--nj-gold, #f5b314)",
    accentSoft: "var(--nj-gold-soft, #ffe7a8)",
    label: "Le Quartier du Mboa",
  },
  tournoi_du_ter: {
    tone: "teal",
    accent: "var(--nj-teal, #1aa6a0)",
    accentSoft: "var(--nj-teal-soft, #b9efec)",
    label: "Le Cercle du Ter",
  },
};

/** Règles d'inférence par préfixe d'eventId (ordre = priorité). */
const PREFIX_RULES: Array<{ test: RegExp; theme: EventTheme }> = [
  { test: /^defi/i, theme: KNOWN_THEMES.defi_du_mboa },
  { test: /^tournoi/i, theme: KNOWN_THEMES.tournoi_du_ter },
  { test: /mboa|quartier|carrefour|marche/i, theme: KNOWN_THEMES.defi_du_mboa },
  { test: /ter|tambour|cercle|duel|arena/i, theme: KNOWN_THEMES.tournoi_du_ter },
];

const HUB_TONES: GameHubTone[] = ["gold", "teal", "pink", "cobalt", "home", "play", "events", "shop", "wallet", "social"];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Accent adouci (≈ 30 % de la couleur sur blanc) pour halos et connecteurs. */
function softenHex(hex: string): string {
  const value = parseInt(hex.slice(1), 16);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * 0.7);
  const r = mix((value >> 16) & 255), g = mix((value >> 8) & 255), b = mix(value & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

type ThemeSource = string | null | undefined | {
  eventId: string;
  theme?: { accent?: string; label?: string; tone?: string } | null;
};

/**
 * Thème d'un événement : celui de la fiche admin (`event.theme`) s'il est
 * renseigné, sinon l'inférence historique par eventId.
 */
export function resolveEventTheme(source: ThemeSource): EventTheme {
  const eventId = typeof source === "string" ? source : source?.eventId;
  const configured = typeof source === "object" && source ? source.theme : null;
  let base = DEFAULT_THEME;
  if (eventId) {
    base = KNOWN_THEMES[eventId] ?? PREFIX_RULES.find((entry) => entry.test.test(eventId))?.theme ?? DEFAULT_THEME;
  }
  if (!configured) return base;
  const accent = configured.accent && HEX.test(configured.accent) ? configured.accent : null;
  return {
    tone: HUB_TONES.includes(configured.tone as GameHubTone) ? configured.tone as GameHubTone : base.tone,
    accent: accent ?? base.accent,
    accentSoft: accent ? softenHex(accent) : base.accentSoft,
    label: configured.label?.trim() || base.label,
  };
}
