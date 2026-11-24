/* ═══════════════ Bibliothèque d'assets intégrés (Dos de cartes & Arches) ═══════════════
   Panachage entre styles lumineux (éclat Salon Royal & fierté camerounaise)
   et styles sobres & soft (velours, acajou, saphir, cacao, jade).
   Utilisables directement comme visuel par défaut de la table OU importables
   en 1 clic dans le catalogue admin (cosmetics/{id}) pour être attribués aux joueurs. */

import type { CosmeticRarity } from "@/domain";
import { DEFAULT_CARD_BACK_ASSET, DEFAULT_HAND_ARC_ASSET } from "@/lib/assets/manifests";

export type CosmeticMood = "lumineux" | "sobre";

export interface BuiltinTableCosmeticAsset {
  /** Identifiant prêt pour le catalogue cosmétique (a-z, 0-9, _). */
  id: string;
  type: "card_back" | "hand_arc";
  name: string;
  description: string;
  rarity: CosmeticRarity;
  mood: CosmeticMood;
  imageUrl: string;
  /** Asset de repli intégré quand aucune valeur par défaut admin n'est définie. */
  isCoreDefault?: boolean;
}

export const BUILTIN_CARD_BACKS: readonly BuiltinTableCosmeticAsset[] = [
  {
    id: "dos_cauri_soleil",
    type: "card_back",
    name: "Cauri Soleil",
    description: "Velours cobalt tissé ndop, cadre en laiton serti de cabochons, bandeaux cérémoniels et médaillon solaire au cauri.",
    rarity: "commun",
    mood: "lumineux",
    imageUrl: DEFAULT_CARD_BACK_ASSET,
    isCoreDefault: true,
  },
  {
    id: "dos_astrolabe_royal",
    type: "card_back",
    name: "Astrolabe Royal (1B)",
    description: "Ébène doré gravé d'anneaux d'astrolabe, 4 médaillons d'enseignes et boussole solaire.",
    rarity: "commun",
    mood: "lumineux",
    imageUrl: "/assets/njambo/table/card-back-default.svg",
  },
  {
    id: "dos_soleil_or_pur",
    type: "card_back",
    name: "Soleil d'Or Pur",
    description: "Cœur ambre-or flamboyant à 20 rayons fins, losanges dorés et grande rose solaire nacrée.",
    rarity: "legendaire",
    mood: "lumineux",
    imageUrl: "/assets/njambo/table/card-backs/soleil-or-pur.svg",
  },
  {
    id: "dos_emeraude_imperiale",
    type: "card_back",
    name: "Or & Émeraude Impériale",
    description: "Velours émeraude lumineux, treillis doré, 4 enseignes aux angles et gemme turquoise-or.",
    rarity: "epique",
    mood: "lumineux",
    imageUrl: "/assets/njambo/table/card-backs/emeraude-imperiale.svg",
  },
  {
    id: "dos_ndop_lumineux",
    type: "card_back",
    name: "Ndop Royal Lumineux",
    description: "Indigo Ndop éclatant brodé de motifs géométriques ivoire & or pur avec blason central.",
    rarity: "legendaire",
    mood: "lumineux",
    imageUrl: "/assets/njambo/table/card-backs/ndop-lumineux.svg",
  },
  {
    id: "dos_ivoire_solaire",
    type: "card_back",
    name: "Ivoire Solaire & Or Blanc",
    description: "Dos clair nacré très lumineux sur le tapis vert, dentelle dorée et joyau émeraude-or.",
    rarity: "epique",
    mood: "lumineux",
    imageUrl: "/assets/njambo/table/card-backs/ivoire-solaire.svg",
  },
  {
    id: "dos_aurore_rubis",
    type: "card_back",
    name: "Aurore Rubis & Or Ngata",
    description: "Rubis profond illuminé d'une aurore dorée, fermoirs losanges et couronne Ngata.",
    rarity: "legendaire",
    mood: "lumineux",
    imageUrl: "/assets/njambo/table/card-backs/aurore-rubis.svg",
  },
  {
    id: "dos_velours_foret",
    type: "card_back",
    name: "Velours Forêt & Laiton",
    description: "Feutre sapin doux et mat, fin filet laiton vieilli et rosace sobre.",
    rarity: "commun",
    mood: "sobre",
    imageUrl: "/assets/njambo/table/card-backs/velours-foret.svg",
  },
  {
    id: "dos_acajou_salon",
    type: "card_back",
    name: "Acajou du Salon",
    description: "Teinte bois d'acajou satinée, fines lignes art-déco et sceau ovale or ancien.",
    rarity: "commun",
    mood: "sobre",
    imageUrl: "/assets/njambo/table/card-backs/acajou-salon.svg",
  },
  {
    id: "dos_nuit_saphir",
    type: "card_back",
    name: "Nuit Saphir & Lune",
    description: "Bleu nuit feutré, fine constellation et croissant doré tout en douceur.",
    rarity: "rare",
    mood: "sobre",
    imageUrl: "/assets/njambo/table/card-backs/nuit-saphir.svg",
  },
  {
    id: "dos_terre_cacao",
    type: "card_back",
    name: "Terre de Cacao & Cuivre",
    description: "Cacao chaleureux tissé en losanges raffia, liséré et médaillon cuivre brossé.",
    rarity: "rare",
    mood: "sobre",
    imageUrl: "/assets/njambo/table/card-backs/terre-cacao.svg",
  },
  {
    id: "dos_perle_jade",
    type: "card_back",
    name: "Perle de Jade Douce",
    description: "Jade sauge apaisant, cadre champagne perlé et fleur de lotus géométrique.",
    rarity: "rare",
    mood: "sobre",
    imageUrl: "/assets/njambo/table/card-backs/perle-jade.svg",
  },
];

export const BUILTIN_HAND_ARCS: readonly BuiltinTableCosmeticAsset[] = [
  {
    id: "arche_soleil_chefferie",
    type: "hand_arc",
    name: "Soleil de Chefferie (2A)",
    description: "Écrin ébène chaud aux rayons solaires gravés, 8 perles d'or et médaillon étoile.",
    rarity: "commun",
    mood: "lumineux",
    imageUrl: DEFAULT_HAND_ARC_ASSET,
    isCoreDefault: true,
  },
  {
    id: "arche_palais_laiton",
    type: "hand_arc",
    name: "Palais d'Ébène & Laiton",
    description: "Coussin ébène mat ultra-lisible serti d'une lunette laiton biseautée à 6 rivets.",
    rarity: "epique",
    mood: "sobre",
    imageUrl: "/assets/njambo/table/hand-arcs/palais-laiton.svg",
  },
  {
    id: "arche_eclipse_emeraude",
    type: "hand_arc",
    name: "Éclipse d'Or & Émeraude",
    description: "Dôme ébène fumé, halo émeraude-or, 4 enseignes gravées et blason ailé royal.",
    rarity: "legendaire",
    mood: "lumineux",
    imageUrl: "/assets/njambo/table/hand-arcs/eclipse-emeraude.svg",
  },
  {
    id: "arche_ndop_chefferie",
    type: "hand_arc",
    name: "Trône Ndop & Or",
    description: "Arche circulaire indigo Ndop brodée d'ivoire et d'or pur avec losange royal.",
    rarity: "legendaire",
    mood: "lumineux",
    imageUrl: "/assets/njambo/table/hand-arcs/ndop-chefferie.svg",
  },
  {
    id: "arche_velours_emeraude",
    type: "hand_arc",
    name: "Velours Émeraude Royal",
    description: "Dôme feutre émeraude satiné en harmonie douce avec la table et filet champagne.",
    rarity: "commun",
    mood: "sobre",
    imageUrl: "/assets/njambo/table/hand-arcs/velours-emeraude.svg",
  },
  {
    id: "arche_ivoire_champagne",
    type: "hand_arc",
    name: "Arche Ivoire & Or Blanc",
    description: "Dôme champagne nacré très lumineux, fins rayons clairs et joyau émeraude-or.",
    rarity: "epique",
    mood: "lumineux",
    imageUrl: "/assets/njambo/table/hand-arcs/ivoire-champagne.svg",
  },
  {
    id: "arche_rubis_ngata",
    type: "hand_arc",
    name: "Couronne Rubis Ngata",
    description: "Rubis royal traversé d'une lueur dorée, losanges sertis et couronne Ngata au sommet.",
    rarity: "legendaire",
    mood: "lumineux",
    imageUrl: "/assets/njambo/table/hand-arcs/rubis-ngata.svg",
  },
  {
    id: "arche_acajou_classique",
    type: "hand_arc",
    name: "Acajou Sculpté",
    description: "Bois d'acajou sombre et sobre, double filet or ancien et médaillon ovale discret.",
    rarity: "commun",
    mood: "sobre",
    imageUrl: "/assets/njambo/table/hand-arcs/acajou-classique.svg",
  },
  {
    id: "arche_nuit_stellaire",
    type: "hand_arc",
    name: "Nuit Saphir & Étoiles",
    description: "Bleu saphir velouté, fins points d'étoiles et croissant lunaire doré au sommet.",
    rarity: "rare",
    mood: "sobre",
    imageUrl: "/assets/njambo/table/hand-arcs/nuit-stellaire.svg",
  },
  {
    id: "arche_cacao_cuivre",
    type: "hand_arc",
    name: "Raffia Cacao & Cuivre",
    description: "Dôme cacao doux à trame raffia, bordure cuivre brossé et fermoir losange sobre.",
    rarity: "rare",
    mood: "sobre",
    imageUrl: "/assets/njambo/table/hand-arcs/cacao-cuivre.svg",
  },
  {
    id: "arche_jade_perle",
    type: "hand_arc",
    name: "Écrin Jade & Perle",
    description: "Jade céladon doux et lumineux, 8 perles nacrées et blason lotus serein.",
    rarity: "rare",
    mood: "lumineux",
    imageUrl: "/assets/njambo/table/hand-arcs/jade-perle.svg",
  },
];

export const BUILTIN_TABLE_COSMETICS: readonly BuiltinTableCosmeticAsset[] = [
  ...BUILTIN_CARD_BACKS,
  ...BUILTIN_HAND_ARCS,
];
