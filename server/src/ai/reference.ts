/* ═══════════════ Assistant IA : référence et prompt système ═══════════════
   La référence technique est lue dans le code source lui-même (types et
   bornes des modèles d'animation, des moments, des styles, des cartes de
   pouvoir et des chorégraphies) : elle est toujours à jour. Les règles du
   jeu sont résumées à partir de GAME_CONFIG. */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { GAME_CONFIG } from "../../../config/gameConfig";
import { GAME_MOMENTS, GAME_MOMENT_KEYS, MOMENT_STYLE_FALLBACK, MOMENT_STYLE_OWNER } from "../../../engine/anim/moments";
import type { AiContext, AiModule } from "./types";

export const REFERENCE_TOPICS = {
  jeu: "Règles de Njambo et déroulement d'une partie (tours, plis, dépôts, pot, pouvoirs).",
  admin: "Fonctionnement de la console admin : brouillons, publication, moments, banc d'essai.",
  modeles: "Modèle d'animation (AnimMotif) : champs, zones, rôles, pistes, réactions, bornes (code source).",
  moments: "Moments du jeu : départ/arrivée imposés, plafonds de durée, styles des joueurs (code source).",
  styles: "Styles d'animation des joueurs (cosmétique « Style d'animation ») : liste blanche (code source).",
  cartes: "Carte de pouvoir (PowerModule) : définition, cible, conditions, effets, étapes (code source).",
  choregraphies: "Chorégraphie d'une carte de pouvoir : pistes de la ligne de temps, dont la piste « modèle » (code source).",
} as const;
export type ReferenceTopic = keyof typeof REFERENCE_TOPICS;

/** Racine du dépôt (le serveur tourne depuis server/dist, les tests depuis les sources). */
function repoRoot(): string | null {
  for (const start of [__dirname, process.cwd()]) {
    let dir = start;
    for (let depth = 0; depth < 8; depth += 1) {
      if (existsSync(join(dir, "engine", "anim", "motif.ts"))) return dir;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

/** Partie déclarative d'un fichier source : jusqu'à la première fonction exportée. */
function sourceSection(relativePath: string, wholeFile = false): string {
  const root = repoRoot();
  if (!root) return `(Source ${relativePath} introuvable sur ce serveur.)`;
  try {
    const text = readFileSync(join(root, relativePath), "utf8");
    const stop = wholeFile ? -1 : text.search(/^export (async )?function /m);
    return `// ${relativePath}\n${(stop > 0 ? text.slice(0, stop) : text).slice(0, 40_000)}`;
  } catch {
    return `(Source ${relativePath} illisible.)`;
  }
}

function gameRules(): string {
  const cfg = GAME_CONFIG;
  const suits = cfg.suits.map((suit) => suit.s).join(" ");
  return [
    "# Njambo : règles et déroulement",
    `- Jeu de ${(cfg.ranks.max - cfg.ranks.min + 1) * cfg.suits.length} cartes : valeurs ${cfg.ranks.min} à ${cfg.ranks.max}, couleurs ${suits} (ni figures ni As). 2 à 4 joueurs, ${cfg.cardsPerPlayer} cartes chacun, mise au départ dans le pot.`,
    `- Une manche = ${cfg.cardsPerPlayer} tours (plis). Le premier joueur d'un pli fixe la « tendance » (sa couleur). Les autres doivent la suivre s'ils peuvent, sinon ils se défaussent : une défausse ne gagne jamais le pli. La plus forte carte de la tendance gagne le pli et entame le suivant.`,
    "- Seul le gagnant du dernier pli remporte le pot. Gagner le dernier pli avec un 3 double les gains (Ngata ×2), si la règle est active ; un 3 boosté par un pouvoir (Éclair du Mfoundi) ne double pas.",
    `- Victoires immédiates à la donne : somme des cartes < ${cfg.instantWin.sumBelow} ; somme = 21 (gains doublés) ; 5 cartes de la même couleur.`,
    `- Chaque tour a un minuteur (${cfg.turnSeconds} s par défaut, réglable dans « Règles des parties »). Une partie peut compter plusieurs manches (séries) : le pot est réglé une fois pour le gagnant de la série.`,
    "- Les cartes jouées s'empilent sur le dépôt de chaque joueur jusqu'à la donne suivante : le pli n'est jamais « ramassé ».",
    `- Cartes de pouvoir : chaque joueur en équipe jusqu'à ${cfg.maxEquippedPowers} (réglable). Il les active pendant son tour, une fois par partie. Une carte a une définition (nom, catégorie, rareté, cible…) et un script (conditions, étapes d'effet) exécuté par le moteur, côté serveur en ligne. Sa mise en scène est une chorégraphie (ligne de temps de 8 s au plus) qui peut réutiliser les modèles de l'atelier.`,
    "- Animations : les mouvements de base (carte jouée, distribution, pli gagné, fin de pli, pouvoir lancé) sont des « moments » auxquels l'admin peut attribuer un modèle de l'atelier ; sans modèle, l'animation actuelle du jeu reste. Un joueur peut équiper un style d'animation (cosmétique) qui colore ses propres mouvements sans changer leur durée.",
    `- Rythme : vol d'une carte jouée ${cfg.anim.dropFlight} ms, pause de fin de pli ${cfg.anim.trickPause} ms, distribution ${cfg.anim.dealPerCard} ms entre les cartes (vol ${cfg.anim.dealFlight} ms). Ces valeurs sont synchronisées avec le serveur : un modèle ne peut pas ralentir la partie (plafonds des moments).`,
  ].join("\n");
}

function adminGuide(): string {
  return [
    "# Console admin : animations et cartes de pouvoir",
    "- Section Animations (atelier) : bibliothèque des modèles (modèles du jeu, publiés, brouillons, archivés). Un modèle se règle visuellement (poignées A/B, courbes, pistes, réactions), s'enregistre en brouillon puis se publie (révision versionnée) : tous les joueurs reçoivent le catalogue en temps réel. Un modèle du jeu se modifie en publiant une fiche du même identifiant. On archive au lieu de supprimer.",
    "- « ⚑ Moments du jeu » : attribue un modèle à chaque moment, dans les limites du moment (départ/arrivée imposés, plafond de durée). Une publication qui ne conviendrait plus à son moment est refusée.",
    "- Section Cartes de pouvoir : fiche (identité, cible, effet, animation, économie, bac à sable). Brouillon puis publication versionnée ; archiver (hors boutique) ou couper en urgence. L'onglet Animation compose la chorégraphie ; une piste « Modèle » réutilise un modèle de l'atelier avec des surcharges pour cette carte.",
    "- Section Cosmétiques : type « Style d'animation » (liste blanche : traînée, densité, teinte, lueur, impact). Section Joueurs : « Offrir un cosmétique » pour tester.",
    "- Banc d'essai sans compte : /admin/modeles (atelier, moments et styles en aperçu local). « Essayer dans une partie » ouvre le jeu avec un réglage valable pour cet onglet seulement.",
    "- L'assistant n'écrit que des brouillons ; publier ou attribuer un moment passe par une proposition que l'admin confirme.",
  ].join("\n");
}

function momentsSummary(): string {
  const rows = GAME_MOMENT_KEYS.map((key) => {
    const def = GAME_MOMENTS[key] as (typeof GAME_MOMENTS)[keyof typeof GAME_MOMENTS] & { to?: unknown; maxMs?: number; measure?: string };
    return {
      key, label: def.label, description: def.description, from: def.from, to: def.to ?? "libre", timing: def.timing,
      maxMs: def.maxMs ?? null, measure: def.measure ?? null, styleOwner: MOMENT_STYLE_OWNER[key] ?? null, styleFallback: MOMENT_STYLE_FALLBACK[key] ?? null,
    };
  });
  return `# Moments du jeu (données)\n${JSON.stringify(rows, null, 1)}\nPli gagné + Fin de pli doivent tenir ensemble dans ${GAME_CONFIG.anim.trickPause} ms.`;
}

export function referenceText(topic: ReferenceTopic): string {
  switch (topic) {
    case "jeu": return gameRules();
    case "admin": return adminGuide();
    case "modeles": return sourceSection("engine/anim/motif.ts");
    case "moments": return `${momentsSummary()}\n\n${sourceSection("engine/anim/moments.ts")}`;
    case "styles": return sourceSection("engine/anim/style.ts");
    case "cartes": return sourceSection("engine/power/types.ts");
    case "choregraphies": return sourceSection("engine/power/choreography.ts");
  }
}

const MODULE_FOCUS: Record<AiModule, string> = {
  animations: "Cette conversation porte sur les ANIMATIONS : modèles de l'atelier, moments du jeu, styles des joueurs.",
  powers: "Cette conversation porte sur les CARTES DE POUVOIR : définitions, scripts d'effet, chorégraphies (qui peuvent utiliser les modèles d'animation).",
  all: "Cette conversation couvre les animations et les cartes de pouvoir.",
};

/** Page d'où l'admin écrit : « ce modèle », « cette carte » désignent l'élément ouvert. */
function contextFocus(context: AiContext | undefined): string[] {
  if (!context) return [];
  const named = context.label ? ` (« ${context.label} »)` : "";
  const attachment = "Si un message est suivi d'une copie de travail jointe, c'est la version que l'admin a à l'écran, pas encore enregistrée : pars d'elle, et ne l'écrase pas sans le dire.";
  switch (context.kind) {
    case "animation_model": return [
      `L'admin t'écrit depuis la page du modèle d'animation \`${context.id}\`${named} dans l'atelier. « Ce modèle », « l'animation », « ça » désignent \`${context.id}\` : lis-le (get_animation_model) avant d'en parler, et cherche où il sert en jeu (find_animation_usage) dès qu'une modification peut toucher les joueurs.`,
      attachment,
      "Si tu enregistres le brouillon de ce modèle, dis-le : la page le recharge pour que l'admin le voie et le rejoue.",
    ];
    case "power_card": return [
      `L'admin t'écrit depuis la page de la carte de pouvoir \`${context.id}\`${named}. « Cette carte », « ça » désignent \`${context.id}\` : lis-la (get_power_card) avant d'en parler.`,
      attachment,
      "Si tu enregistres le brouillon de cette carte, dis-le : la page le recharge pour que l'admin le voie et l'essaie dans le bac à sable.",
    ];
    case "animation_library": return ["L'admin t'écrit depuis la bibliothèque de l'atelier d'animations (la liste des modèles)."];
    case "power_catalog": return ["L'admin t'écrit depuis le catalogue des cartes de pouvoir (la liste des cartes)."];
  }
}

/** Ton des réponses : réglage « Explications techniques » de la console (coupé par défaut). */
function explainStyle(technical: boolean): string[] {
  if (technical) {
    return [
      "Mode d'explication : TECHNIQUE (l'admin connaît le format des données).",
      "- Cite les identifiants entre accents graves (`play_classic`), les champs, les chemins et les valeurs exactes ; un court extrait JSON est permis quand il éclaire.",
    ];
  }
  return [
    "Mode d'explication : SIMPLE. L'admin n'est pas développeur : il ne connaît ni le code ni le format des données, il veut régler le jeu.",
    "- Parle comme à quelqu'un qui découvre : phrases courtes, mots de tous les jours, et toujours ce que voient et vivent les joueurs.",
    "- N'affiche jamais de JSON, de code, de noms de champs, de chemins (script.steps.0…), de noms d'outils ni d'identifiants techniques : désigne un modèle ou une carte par son nom affiché (« Piocher », « Vent du Nord »).",
    "- Donne les durées en secondes (0,7 s) et les tailles en mots (« un peu plus grand »), pas en millisecondes ni en pixels.",
    "- Avant de modifier, reformule la demande en mots simples ; si elle est floue, propose 2 ou 3 choix concrets (« plus rapide », « plus visible », « plus discret ») et attends la réponse.",
    "- Après une modification, résume en « avant / après » ce que les joueurs verront, dis comment l'essayer (bouton ▶ ou table de démonstration pour une animation, bac à sable pour une carte) et rappelle que rien ne change pour les joueurs tant qu'il ne publie pas.",
    "- Si la validation trouve des erreurs, corrige-les toi-même dans le brouillon ; n'en parle que par leurs conséquences (« l'animation serait trop longue pour ce moment du jeu »).",
  ];
}

export function systemPrompt(module: AiModule, context?: AiContext, technical = false): string {
  return [
    "Tu es l'assistant de la console admin de Njambo, un jeu de cartes camerounais en ligne (2 à 4 joueurs, mises en Nkap, cartes de pouvoir).",
    "Tu aides l'admin à comprendre, interroger, créer et mettre à jour les modèles d'animation et les cartes de pouvoir, et à prévoir leurs effets et leurs interactions en jeu.",
    MODULE_FOCUS[module],
    ...contextFocus(context),
    "",
    ...explainStyle(technical),
    "",
    "Règles de travail :",
    "- Réponds en français, clairement et sans jargon inutile.",
    "- Ne devine pas : lis les données avec les outils (list_…, get_…) avant d'en parler, et la référence (get_reference) pour le format exact d'un objet ou une règle du jeu.",
    "- Tu peux écrire des BROUILLONS (save_…_draft) : ils ne touchent aucun joueur. Valide d'abord (validate_…) et corrige toutes les erreurs signalées, chemin par chemin.",
    "- Tu ne publies jamais et tu n'attribues jamais un moment toi-même : utilise les outils propose_…, l'admin confirme d'un clic. Dis-lui qu'une proposition l'attend.",
    "- Quand tu crées ou modifies quelque chose, explique ce qui changera en jeu : qui le voit, à quel moment, combien de temps, et les contraintes (plafonds des moments, liste blanche des styles, 8 s au plus pour une chorégraphie, cartes de pouvoir validées par le serveur).",
    "- Ne modifie que ce que l'admin a demandé. Si la demande est ambiguë ou risquée, pose une question courte avant d'écrire.",
    "- Pour un nouveau modèle ou une nouvelle carte, pars d'un existant proche (get_…) plutôt que de tout inventer.",
    "",
    gameRules(),
  ].join("\n");
}
