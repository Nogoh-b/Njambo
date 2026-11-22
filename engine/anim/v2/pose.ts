/* ═══════════════ Animation V2 — poses des zones (étape V2-1) ═══════════════
   En V2, c'est la ZONE qui dit où se pose une carte (centre, rotation, taille,
   face, ordre d'empilement) ; l'animation ne règle que le mouvement entre deux
   poses. Ce module est pur (aucun DOM) : les zones de la table le nourrissent
   avec leurs mesures, les tests le vérifient seul.

   `poseOf(index, count)` répond aussi pour une disposition qui n'existe pas
   encore : `count` = nombre de cartes APRÈS le mouvement. La pose d'arrivée
   d'une carte qui entre dans une main est donc celle que la main affichera
   au prochain état du jeu, pas une place provisoire. */

export interface Point { x: number; y: number }

/** Pose d'une carte à l'écran (px, degrés). */
export interface ZonePose extends Point {
  /** Rotation totale à l'écran (siège compris). */
  rotate: number;
  /** Largeur de la carte à l'écran (échelle des ancêtres comprise). */
  width: number;
  /** 0 = face visible, 180 = de dos. */
  face: 0 | 180;
  /** Ordre d'empilement dans la zone (plus grand = au-dessus). */
  z: number;
  /** La zone « avale » la carte (avatar, pot, minuteur) : elle disparaît à l'arrivée. */
  sink?: boolean;
}

/** Rapport hauteur / largeur des cartes du jeu (PlayCard). */
export const CARD_RATIO = 1.45;

const DEG = Math.PI / 180;

/** Vecteur local (x, y) tourné de `angle` degrés (sens de CSS `rotate`, y vers le bas). */
export function rotateVector(x: number, y: number, angle: number): Point {
  const cos = Math.cos(angle * DEG), sin = Math.sin(angle * DEG);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/** Échelle d'un élément de taille `layoutWidth × layoutHeight`, tourné de `angle`, dont la boîte
 *  à l'écran (non tournée) mesure `boxWidth` de large. Exacte pour tout angle, y compris 90°. */
export function scaleFromBox(boxWidth: number, layoutWidth: number, layoutHeight: number, angle: number): number {
  const cos = Math.abs(Math.cos(angle * DEG)), sin = Math.abs(Math.sin(angle * DEG));
  const span = layoutWidth * cos + layoutHeight * sin;
  return span > 0 ? boxWidth / span : 1;
}

/* ─────────────── Main : éventail ─────────────── */

export interface FanLayout {
  /** Centre de l'éventail à l'écran (il reste centré quand le nombre de cartes change). */
  center: Point;
  /** Rotation du siège. */
  axis: number;
  /** Largeur d'une carte à l'écran. */
  cardWidth: number;
  /** Écart entre deux centres de cartes à l'écran, le long de l'axe. */
  step: number;
  /** Rotation ajoutée par carte, depuis le centre. */
  rotStep: number;
  face: 0 | 180;
  /** Décalage de la carte le long de son axe vertical (px écran, négatif = soulevée). */
  lift?: (index: number, count: number) => number;
}

/** Soulèvement au repos de `Fan` (cartes non jouables), en px de mise en page. */
export const fanRestLift = (index: number, count: number) => Math.pow(Math.abs(index - (count - 1) / 2), 1.5) * 4;

export function fanPose(layout: FanLayout, index: number, count: number): ZonePose {
  const n = Math.max(1, count);
  const offset = index - (n - 1) / 2;
  const along = rotateVector(offset * layout.step, 0, layout.axis);
  const rotate = layout.axis + offset * layout.rotStep;
  const lift = layout.lift?.(index, n) ?? 0;
  const shift = rotateVector(0, lift, rotate);
  return {
    x: layout.center.x + along.x + shift.x,
    y: layout.center.y + along.y + shift.y,
    rotate,
    width: layout.cardWidth,
    face: layout.face,
    z: index,
  };
}

/* ─────────────── Dépôt : pile jetée ─────────────── */

export interface PileLayout {
  center: Point;
  cardWidth: number;
  /** Échelle des ancêtres (les décalages du « jeté » sont en px de mise en page). */
  scale: number;
}

/** Pose d'un « jeté » décidé par le jeu (`DepositedCard.dx / dy / dropRot`). */
export interface DropOffset { dx?: number; dy?: number; dropRot?: number }

/** Carte `index` d'une pile. Une carte qui n'est pas encore posée (pas de `drop`) vise le centre,
 *  à plat : son jeté (au plus ±9°, ±6 px) n'est tiré qu'au moment où le jeu la pose. */
export function pilePose(layout: PileLayout, index: number, drop?: DropOffset | null): ZonePose {
  return {
    x: layout.center.x + (drop?.dx ?? 0) * layout.scale,
    y: layout.center.y + (drop?.dy ?? 0) * layout.scale,
    rotate: drop?.dropRot ?? 0,
    width: layout.cardWidth,
    face: 0,
    z: index,
  };
}

/* ─────────────── Pioche : paquet de dos ─────────────── */

export interface StackLayout {
  /** Centre de la carte du dessus. */
  center: Point;
  rotate: number;
  cardWidth: number;
  /** Décalage d'une épaisseur à l'écran (vers le bas du paquet). */
  depth: Point;
  /** Épaisseurs visibles : au-delà, les cartes se confondent. */
  layers: number;
}

/** Carte `index` sur `count` (la dernière est sur le dessus, comme une pile). */
export function stackPose(layout: StackLayout, index: number, count: number): ZonePose {
  const below = Math.min(Math.max(0, count - 1 - index), Math.max(0, layout.layers - 1));
  return {
    x: layout.center.x + layout.depth.x * below,
    y: layout.center.y + layout.depth.y * below,
    rotate: layout.rotate,
    width: layout.cardWidth,
    face: 180,
    z: index,
  };
}

/* ─────────────── Repli : une zone qui ne connaît que son rectangle ─────────────── */

export interface RectLike { left: number; top: number; width: number; height: number }

/** Largeur d'une carte qui tient dans un rectangle. */
export const cardWidthIn = (rect: RectLike) => Math.min(rect.width, rect.height / CARD_RATIO);

/** Pose au centre du rectangle, à plat. `sink` : la carte y disparaît (avatar, pot, minuteur). */
export function rectPose(rect: RectLike, { face = 0, sink = false, index = 0 }: { face?: 0 | 180; sink?: boolean; index?: number } = {}): ZonePose {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    rotate: 0,
    width: cardWidthIn(rect),
    face,
    z: index,
    ...(sink ? { sink: true } : {}),
  };
}
