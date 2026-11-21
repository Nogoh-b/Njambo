/* ═══════════════ Moments du jeu (atelier d'animations, phase G4) ═══════════════
   Un MOMENT est un mouvement de base de la partie (carte jouée, distribution,
   pli…) que l'admin peut confier à un modèle de l'atelier. Sans modèle
   attribué, le jeu garde son animation actuelle : la bascule se fait moment
   par moment, sans risque pour les parties en cours.

   Chaque moment impose son départ (et parfois son arrivée), car ce sont les
   vraies cartes du jeu qui bougent ; et une durée maximale, pour ne jamais
   retarder la partie (le vol d'une carte jouée décale l'affichage du coup
   suivant ; le pli doit être fini avant que le pli suivant ne commence). */

import { GAME_CONFIG } from "../../config/gameConfig";
import { motifTotalMs, sameAnchor, type AnimMotif, type MotifAnchor, type MotifIssue } from "./motif";

export interface GameMomentDef {
  label: string;
  description: string;
  /** Départ imposé (rôles : self = le joueur qui agit, winner = le gagnant du pli). */
  from: MotifAnchor;
  /** Arrivée imposée, si le moment en a une. */
  to?: MotifAnchor;
  /** motif : la durée du modèle compte ; game : le rythme reste celui du jeu (synchronisé avec le serveur). */
  timing: "motif" | "game";
  /** Plafond de la durée qui compte (vol d'une carte, ou animation entière). */
  maxMs?: number;
  /** Ce que mesure `maxMs`. */
  measure?: "flight" | "total";
}

const self = (zone: "hand" | "deposit" | "avatar"): MotifAnchor => ({ zone, player: "self" });

export const GAME_MOMENTS = {
  play: {
    label: "Carte jouée",
    description: "La carte quitte la main du joueur et se pose sur son dépôt (tous les joueurs).",
    from: self("hand"), to: self("deposit"), timing: "motif", maxMs: 900, measure: "flight",
  },
  deal: {
    label: "Distribution",
    description: "La pioche distribue les cartes à chaque joueur. Le rythme reste celui du jeu (le serveur l'attend) : le modèle en règle le style.",
    from: { zone: "deck" }, to: { zone: "hand", player: "all" }, timing: "game",
  },
  trickWin: {
    label: "Pli gagné",
    description: "Sur place, la carte gagnante, sur le dépôt du gagnant, quand le pli se termine.",
    from: { zone: "deposit", player: "winner" }, to: { zone: "deposit", player: "winner" }, timing: "motif", maxMs: GAME_CONFIG.anim.trickPause, measure: "total",
  },
  // Clé historique « trickCollect » : les règles ne ramassent pas le pli (chaque dépôt garde ses cartes jusqu'à la donne suivante).
  trickCollect: {
    label: "Fin de pli",
    description: "Sur place, la carte du dessus de chaque dépôt, après « Pli gagné ». Les cartes restent sur leur pile : les règles ne ramassent pas le pli.",
    from: { zone: "deposit", player: "all" }, to: { zone: "deposit", player: "all" }, timing: "motif", maxMs: GAME_CONFIG.anim.trickPause, measure: "total",
  },
  powerLaunch: {
    label: "Pouvoir lancé",
    description: "Une carte décorative part de l'avatar du joueur qui active un pouvoir, pendant la présentation de la carte.",
    from: self("avatar"), timing: "motif", maxMs: 1500, measure: "total",
  },
} as const satisfies Record<string, GameMomentDef>;

export type GameMoment = keyof typeof GAME_MOMENTS;
export const GAME_MOMENT_KEYS = Object.keys(GAME_MOMENTS) as GameMoment[];
/** Modèle attribué à chaque moment (absent = animation actuelle du jeu). */
export type MomentMap = Partial<Record<GameMoment, string>>;

/** Nombre de cartes qu'un moment anime au plus (table pleine). */
const momentFlights = (moment: GameMoment, motif: AnimMotif) => (moment === "trickCollect" ? 4 : moment === "play" || moment === "trickWin" ? 1 : motif.count);

/** Durée qui compte pour un moment (vol d'une carte, ou animation entière). */
export function momentDurationMs(moment: GameMoment, motif: AnimMotif): number {
  const def: GameMomentDef = GAME_MOMENTS[moment];
  return def.measure === "flight" ? motif.durationMs : motifTotalMs(motif, momentFlights(moment, motif));
}

/** Le modèle part-il (et arrive-t-il) là où le moment l'impose ? */
export function motifFitsMoment(moment: GameMoment, motif: AnimMotif): boolean {
  const def: GameMomentDef = GAME_MOMENTS[moment];
  return sameAnchor(motif.from, def.from) && (!def.to || sameAnchor(motif.to, def.to));
}

/** Rythme effectif d'un moment : pour la distribution, celui du jeu (le serveur l'attend). */
export function momentMotif(moment: GameMoment, motif: AnimMotif): AnimMotif {
  if (GAME_MOMENTS[moment].timing !== "game") return motif;
  return { ...motif, staggerMs: GAME_CONFIG.anim.dealPerCard, durationMs: GAME_CONFIG.anim.dealFlight };
}

/** Paramètre d'URL de « Essayer dans une partie » : `?apercuMoments=play:play,deal:deal` (vide = animation actuelle partout). */
export const MOMENT_PREVIEW_PARAM = "apercuMoments";

export function encodeMomentPreview(map: MomentMap): string {
  return GAME_MOMENT_KEYS.filter((moment) => map[moment]).map((moment) => `${moment}:${map[moment]}`).join(",");
}

/** Lecture tolérante : les moments inconnus et les identifiants mal formés sont ignorés. */
export function parseMomentPreview(text: string): MomentMap {
  const map: MomentMap = {};
  for (const pair of text.split(",")) {
    const [moment, id] = pair.split(":");
    if (moment in GAME_MOMENTS && /^[a-z0-9_]{3,48}$/.test(id ?? "")) map[moment as GameMoment] = id;
  }
  return map;
}

/** Erreurs d'une attribution des moments (chemins `moments.<moment>`). */
export function validateMoments(value: unknown, lookup: (id: string) => AnimMotif | null): MotifIssue[] {
  const issues: MotifIssue[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [{ path: "moments", message: "Attribution des moments invalide." }];
  const map = value as Record<string, unknown>;
  for (const [key, motifId] of Object.entries(map)) {
    const path = `moments.${key}`;
    if (!(key in GAME_MOMENTS)) { issues.push({ path, message: "Moment inconnu." }); continue; }
    const moment = key as GameMoment;
    if (typeof motifId !== "string") { issues.push({ path, message: "Identifiant de modèle attendu." }); continue; }
    const motif = lookup(motifId);
    if (!motif) { issues.push({ path, message: "Modèle inconnu ou non publié." }); continue; }
    if (!motifFitsMoment(moment, motif)) { issues.push({ path, message: "Ce modèle ne part pas (ou n'arrive pas) là où ce moment l'impose." }); continue; }
    const def: GameMomentDef = GAME_MOMENTS[moment];
    if (def.maxMs && momentDurationMs(moment, motif) > def.maxMs) {
      issues.push({ path, message: `Trop long pour ce moment : ${def.maxMs} ms au plus (${def.measure === "flight" ? "vol d'une carte" : "animation entière"}).` });
    }
  }
  // « Pli gagné » puis « Fin de pli » s'enchaînent dans la même pause de fin de pli.
  const win = typeof map.trickWin === "string" ? lookup(map.trickWin) : null;
  const collect = typeof map.trickCollect === "string" ? lookup(map.trickCollect) : null;
  if (win && collect && momentDurationMs("trickWin", win) + momentDurationMs("trickCollect", collect) > GAME_CONFIG.anim.trickPause) {
    issues.push({ path: "moments.trickCollect", message: `« Pli gagné » puis « Fin de pli » doivent tenir ensemble dans la pause de fin de pli (${GAME_CONFIG.anim.trickPause} ms).` });
  }
  return issues;
}

/** Erreurs qu'une nouvelle version d'un modèle causerait aux moments qui l'utilisent
 *  (départ déplacé, vol trop long…) : sa publication doit alors être refusée. */
export function momentIssuesForMotif(map: MomentMap, motif: AnimMotif, lookup: (id: string) => AnimMotif | null): MotifIssue[] {
  const used = GAME_MOMENT_KEYS.filter((moment) => map[moment] === motif.id);
  if (used.length === 0) return [];
  const touched = new Set(used.map((moment) => `moments.${moment}`));
  if (used.includes("trickWin") || used.includes("trickCollect")) touched.add("moments.trickCollect");
  return validateMoments(map, (id) => (id === motif.id ? motif : lookup(id)))
    .filter((issue) => touched.has(issue.path))
    .map((issue) => ({ ...issue, message: `Moment « ${GAME_MOMENTS[issue.path.split(".")[1] as GameMoment].label} » : ${issue.message}` }));
}
