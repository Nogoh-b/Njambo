/* ═══════════════ Bordures & particules des cartes Pouvoir ═══════════════
   11 styles sélectionnables (la bordure Ndop classique actuelle + 10 itérations
   ornementées dotées chacune de leur propre moteur de particules animées).
   Le réglage global vit dans `runtime_config/asset_pack` sous la clé
   `powerBorder` (lu en direct avec les packs d'assets) et peut être surchargé
   carte par carte via `PowerCardDef.border` / `PowerCardDef.borderParticles`. */

export const POWER_BORDERS = [
  {
    id: "classique",
    name: "Ndop Classique",
    badge: "Actuel",
    description: "Motif Ndop plein-cadre d'origine, blason au sommet selon rareté, sans particules.",
    particleSummary: "Aucune particule (reflet diagonal + rayons sur Légendaire).",
    hasParticles: false,
    hasOrbitBeam: false,
  },
  {
    id: "orfevre",
    name: "Orfèvre Royal",
    badge: "Prestige",
    description: "Double cadre biseauté en métal ciselé, 4 cabochons taillés aux angles et arche couronnée.",
    particleSummary: "Poussière d'or et étoiles scintillantes (✦) qui s'élèvent le long des arêtes.",
    hasParticles: true,
    hasOrbitBeam: false,
  },
  {
    id: "braise",
    name: "Braise du Mont Cameroun",
    badge: "Puissance",
    description: "Armature obsidienne fendue de veines incandescentes pulsantes et griffes d'angle.",
    particleSummary: "Braises et flammèches incandescentes qui jaillissent des fissures en montant.",
    hasParticles: true,
    hasOrbitBeam: false,
  },
  {
    id: "prisme",
    name: "Prisme Cristal & Aurore",
    badge: "Joaillerie",
    description: "Facettes taillées en diamant, verre lumineux et lueur orbitale continue sur tout le cadre.",
    particleSummary: "Éclats prismatiques (losanges facettés) en lévitation lente autour du périmètre.",
    hasParticles: true,
    hasOrbitBeam: true,
  },
  {
    id: "ndop_energy",
    name: "Talisman Ndop Énergisé",
    badge: "Identité NJAMBO",
    description: "Frise géométrique Ndop fermée parcourue d'une onde lumineuse et 4 médaillons cauris.",
    particleSummary: "Lucioles mystiques et points rituels qui glissent en orbite autour des motifs Ndop.",
    hasParticles: true,
    hasOrbitBeam: false,
  },
  {
    id: "relique",
    name: "Relique Bronze & Émeraude",
    badge: "Organique",
    description: "Cadre bronze martelé serti de rivets perlés, feuilles sculptées et cabochon émeraude.",
    particleSummary: "Spores et perles bokeh émeraude-or qui tourbillonnent délicatement autour de la carte.",
    hasParticles: true,
    hasOrbitBeam: false,
  },
  {
    id: "foudre",
    name: "Foudre & Flux Astral",
    badge: "Haute énergie",
    description: "Double rail plasma, 4 nœuds conducteurs aux angles et faisceau d'énergie rapide.",
    particleSummary: "Micro-arcs électriques brisés et étincelles vives qui crépitent sur les coins.",
    hasParticles: true,
    hasOrbitBeam: true,
  },
  {
    id: "monolithe",
    name: "Armure Royale Massive",
    badge: "Bordure pleine",
    description: "Large bordure pleine et épaisse biseautée en relief métallique, incrustation colorée, plaques d'angle rivetées et cimier plein.",
    particleSummary: "Paillettes d'or glissant sur le biseau plein et éclats brillants (✦) aux 4 coins blindés.",
    hasParticles: true,
    hasOrbitBeam: false,
  },
  {
    id: "solaire",
    name: "Aurore Solaire Impériale",
    badge: "Mythique",
    description: "Cadre plein satiné à double anneau lumineux, soleil impérial gravé au sommet et rayonnement orbital continu.",
    particleSummary: "Comètes miniatures à traînée lumineuse en orbite autour de la carte et poussière stellaire.",
    hasParticles: true,
    hasOrbitBeam: true,
  },
  {
    id: "kente",
    name: "Kente Royal Tissé",
    badge: "Bordure pleine · Héritage",
    description: "Large bordure pleine tissée de motifs géométriques royaux or, ébène et couleur du pouvoir, avec losanges d'angle et couronne en escalier.",
    particleSummary: "Losanges dorés facettés et fils de lumière tissés qui flottent doucement autour du cadre.",
    hasParticles: true,
    hasOrbitBeam: false,
  },
  {
    id: "eclipse",
    name: "Éclipse d'Obsidienne",
    badge: "Bordure pleine · Luxe",
    description: "Épais cadre plein noir obsidienne laqué, double liseré fin lumineux façon haute joaillerie, croissant d'éclipse au sommet et balayage discret.",
    particleSummary: "Couronne de fines étincelles d'éclipse et brume dorée gravitant lentement sur l'arête.",
    hasParticles: true,
    hasOrbitBeam: true,
  },
] as const;

export type PowerBorderDefinition = (typeof POWER_BORDERS)[number];
export type PowerBorderId = PowerBorderDefinition["id"];

export const POWER_BORDER_IDS = POWER_BORDERS.map((item) => item.id) as readonly PowerBorderId[];

export const POWER_BORDER_PARTICLE_MODES = ["off", "subtle", "normal", "intense"] as const;
export type PowerBorderParticlesMode = (typeof POWER_BORDER_PARTICLE_MODES)[number];

export const POWER_BORDER_PARTICLE_LABELS: Record<PowerBorderParticlesMode, string> = {
  off: "Désactivées",
  subtle: "Discrètes",
  normal: "Normales",
  intense: "Intenses",
};

export const POWER_CARD_TEXT_LAYOUTS = [
  {
    id: "classique",
    name: "Actuel (Ombrage bas)",
    badge: "Actuel",
    coverage: "~44 % masqué",
    description: "Rendu d'origine : image masquée sur le bas avec grand fondu sombre et 3 étages empilés (orbe, catégorie, titre).",
  },
  {
    id: "plaque",
    name: "Plaque Bijou 1 Ligne",
    badge: "Compact · 0 ombrage",
    coverage: "~12 % couvert",
    description: "Illustration plein cadre 100 % et mini cartouche verre fumé 1 ligne tout en bas (icône + titre).",
  },
  {
    id: "externe",
    name: "Titre Sous la Carte",
    badge: "Galerie · Art pur",
    coverage: "0 % sur l'art",
    description: "Zéro texte et zéro ombrage sur l'illustration : sceau d'icône en coin haut gauche, titre placé proprement sous la carte.",
  },
  {
    id: "ruban",
    name: "Ruban TCG Incrusté",
    badge: "Style carte physique",
    coverage: "~11 % · soudé au cadre",
    description: "Fin bandeau métallique biseauté soudé au bas de la bordure et sceau losange en coin haut gauche.",
  },
  {
    id: "comic",
    name: "Lettrage Comic (Contour Net)",
    badge: "Zéro fond noir",
    coverage: "~8 % · contour pur",
    description: "Aucun ombrage ni boîte : titre blanc à contour sombre net au ras du bas + micro-pastille catégorie en haut gauche.",
  },
  {
    id: "haut",
    name: "En-tête Fin en Haut",
    badge: "Bas 100 % libre",
    coverage: "0 % sur le bas",
    description: "Fine barrette translucide en haut (icône + titre + catégorie), laissant les 88 % inférieurs totalement intacts.",
  },
  {
    id: "survol",
    name: "Pur Art + Tiroir au Survol",
    badge: "Minimaliste",
    coverage: "0 % au repos",
    description: "Illustration 100 % dégagée au repos (seul le sceau coin haut gauche) ; le tiroir de titre remonte au survol ou à la sélection.",
  },
] as const;

export type PowerCardTextLayoutDefinition = (typeof POWER_CARD_TEXT_LAYOUTS)[number];
export type PowerCardTextLayout = PowerCardTextLayoutDefinition["id"];

export const POWER_CARD_TEXT_LAYOUT_IDS = POWER_CARD_TEXT_LAYOUTS.map(
  (item) => item.id,
) as readonly PowerCardTextLayout[];

export const DEFAULT_POWER_CARD_TEXT_LAYOUT: PowerCardTextLayout = "classique";

export interface PowerBorderConfig {
  border: PowerBorderId;
  particles: PowerBorderParticlesMode;
  /** Affiche aussi la bordure + particules sur les packs Portrait. */
  onPortrait: boolean;
  /** Mise en page du titre et de l'ombrage sur les cartes Pouvoir. */
  textLayout: PowerCardTextLayout;
}

export const DEFAULT_POWER_BORDER_ID: PowerBorderId = "classique";

export const DEFAULT_POWER_BORDER_CONFIG: PowerBorderConfig = {
  border: DEFAULT_POWER_BORDER_ID,
  particles: "normal",
  onPortrait: true,
  textLayout: DEFAULT_POWER_CARD_TEXT_LAYOUT,
};

export function isPowerBorderId(value: unknown): value is PowerBorderId {
  return typeof value === "string" && (POWER_BORDER_IDS as readonly string[]).includes(value);
}

export function isPowerBorderParticlesMode(value: unknown): value is PowerBorderParticlesMode {
  return typeof value === "string" && (POWER_BORDER_PARTICLE_MODES as readonly string[]).includes(value);
}

export function isPowerCardTextLayout(value: unknown): value is PowerCardTextLayout {
  return typeof value === "string" && (POWER_CARD_TEXT_LAYOUT_IDS as readonly string[]).includes(value);
}

export function powerBorderDefinition(id: PowerBorderId): PowerBorderDefinition {
  return POWER_BORDERS.find((item) => item.id === id) ?? POWER_BORDERS[0];
}

export function powerCardTextLayoutDefinition(id: PowerCardTextLayout): PowerCardTextLayoutDefinition {
  return POWER_CARD_TEXT_LAYOUTS.find((item) => item.id === id) ?? POWER_CARD_TEXT_LAYOUTS[0];
}

/** Lit `powerBorder` depuis `runtime_config/asset_pack` (valeurs inconnues → défauts sûrs). */
export function readPowerBorderConfig(data: unknown): PowerBorderConfig {
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const raw = root.powerBorder && typeof root.powerBorder === "object"
    ? (root.powerBorder as Record<string, unknown>)
    : root;
  const border = isPowerBorderId(raw.border) ? raw.border : DEFAULT_POWER_BORDER_CONFIG.border;
  const particles = isPowerBorderParticlesMode(raw.particles) ? raw.particles : DEFAULT_POWER_BORDER_CONFIG.particles;
  const onPortrait = typeof raw.onPortrait === "boolean" ? raw.onPortrait : DEFAULT_POWER_BORDER_CONFIG.onPortrait;
  const textLayout = isPowerCardTextLayout(raw.textLayout) ? raw.textLayout : DEFAULT_POWER_BORDER_CONFIG.textLayout;
  return { border, particles, onPortrait, textLayout };
}
