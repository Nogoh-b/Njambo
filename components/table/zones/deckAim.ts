/* ═══════════════ Orientation directionnelle naturelle de la pioche ═══════════════
   Fonctions pures pour orienter la pioche centrale comme un vrai donneur :
   - rotation continue dans le sens horaire autour de la table (3–4 joueurs) ;
   - va-et-vient naturel du poignet en face-à-face (2 joueurs, pas de toupie) ;
   - micro-variation organique (±2,4°) et léger geste d'avancée vers la main ;
   - retour au repos par le chemin le plus court. */

export interface Point2D {
  x: number;
  y: number;
}

/** Normalise un angle en degrés dans [0, 360). */
export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Angle CSS (degrés, sens horaire, 0° = vers le bas / main du joueur local)
 *  pour que la face avant (+Y local) de la pioche regarde depuis `from` vers `to`. */
export function angleFromDeckToHand(from: Point2D, to: Point2D, fallbackDeg = 0): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.hypot(dx, dy) < 1) return normalizeAngle(fallbackDeg);
  const deg = (Math.atan2(-dx, dy) * 180) / Math.PI;
  return normalizeAngle(deg);
}

/** Prochain angle cumulé dans le sens horaire (évite un retour brutal 270° → 0°). */
export function nextClockwiseAngle(currentDeg: number, targetDeg: number): number {
  const normTarget = normalizeAngle(targetDeg);
  const normCurrent = normalizeAngle(currentDeg);
  let delta = (normTarget - normCurrent + 360) % 360;
  if (delta < 0.5 || delta > 359.5) delta = 0;
  return currentDeg + delta;
}

/** Micro-variation naturelle du poignet (±2,4°, déterministe par carte) :
 *  évite l'alignement mécanique identique au degré près. */
export function humanHandJitter(stepIndex: number): number {
  return Math.round(Math.sin(stepIndex * 2.17 + 0.6) * 2.4 * 10) / 10;
}

/** Calcule l'angle humain suivant et le sens du mouvement (+1 horaire, -1 anti-horaire).
 *  - `alternate: true` (duel à 2 joueurs) : va-et-vient souple du poignet (0° ↔ 180°)
 *    au lieu de tourner sans fin sur soi-même.
 *  - `alternate: false` (3–4 joueurs) : balayage naturel dans le sens horaire. */
export function naturalAimAngle(
  currentDeg: number,
  targetDeg: number,
  opts: { alternate?: boolean; jitterDeg?: number } = {},
): { angle: number; dir: 1 | -1 } {
  const jitter = opts.jitterDeg ?? 0;
  if (opts.alternate) {
    const normTarget = normalizeAngle(targetDeg);
    const goal = normTarget > 90 && normTarget < 270 ? normTarget + jitter : jitter;
    const dir: 1 | -1 = goal >= currentDeg ? 1 : -1;
    return { angle: goal, dir };
  }
  const base = nextClockwiseAngle(currentDeg, targetDeg);
  const angle = base + jitter;
  const dir: 1 | -1 = angle >= currentDeg ? 1 : -1;
  return { angle, dir };
}

/** Légère avancée du poignet (px) vers la main visée : la pioche ne tourne pas
 *  comme une boussole clouée sur un axe, elle accompagne le geste vers le joueur. */
export function wristReachOffset(angleDeg: number, distancePx = 6): Point2D {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.round(-Math.sin(rad) * distancePx * 10) / 10,
    y: Math.round(Math.cos(rad) * distancePx * 10) / 10,
  };
}

/** Angle de repos le plus proche (congru à `restDeg` modulo 360°) pour éviter
 *  de dérouler plusieurs tours en arrière à la fin de la distribution. */
export function nearestRestAngle(currentDeg: number, restDeg = 0): number {
  const diff = ((((restDeg - currentDeg) % 360) + 540) % 360) - 180;
  return currentDeg + diff;
}

/* ═══════════════ Donne à deux bords : pas de rotation vers la main d'en face ═══════════════
   La pioche a deux bords utilisables : l'avant (+Y) et l'arrière (−Y). Pour chaque carte,
   on garde l'orientation (bord avant ou arrière tourné vers la main) qui demande le moins
   de rotation. Main d'en face : aucune rotation, la carte sort par l'autre bord, et la
   carte suivante part plus tôt (pas de temps de rotation à attendre). */

export type DeckEdge = "front" | "back";

export interface DealAimStep {
  /** Rang de la carte dans la donne (0 = première). */
  k: number;
  /** Joueur servi (index UI) et tour de donne. */
  ui: number;
  round: number;
  /** Angle cumulé de la pioche pour cette carte (sans micro-variation). */
  angle: number;
  /** Bord de la pioche par lequel sort la carte. */
  edge: DeckEdge;
  /** Vrai si la pioche doit tourner avant cette carte. */
  turned: boolean;
  dir: 1 | -1;
  /** Départ de la carte, en ms après le début de la distribution (fin du mélange). */
  launchMs: number;
}

/** Écart signé le plus court de `from` vers `to` (degrés, dans (−180, 180]). */
export function shortestAngleDelta(from: number, to: number): number {
  const d = normalizeAngle(to - from);
  return d > 180 ? d - 360 : d;
}

/** Choisit le bord qui vise `targetDeg` avec le moins de rotation depuis `currentDeg`. */
export function twoEdgeAim(currentDeg: number, targetDeg: number): { angle: number; edge: DeckEdge; delta: number } {
  const front = shortestAngleDelta(currentDeg, targetDeg);
  const back = shortestAngleDelta(currentDeg, targetDeg + 180);
  // À égalité (main à 90°), le bord avant reste la référence.
  const useBack = Math.abs(back) < Math.abs(front) - 0.5;
  const delta = useBack ? back : front;
  return { angle: currentDeg + delta, edge: useBack ? "back" : "front", delta };
}

/** Calendrier complet de la donne (une carte par joueur, tour après tour). */
export function planDealAim(
  seatAngles: number[],
  perPlayer: number,
  timing: { perCardMs: number; rotateMs: number; quickGapMs?: number },
): DealAimStep[] {
  const count = seatAngles.length;
  const quickGap = Math.min(timing.rotateMs, timing.quickGapMs ?? 90);
  const steps: DealAimStep[] = [];
  let current = 0;
  let launch = 0;
  for (let k = 0; k < count * perPlayer; k++) {
    const ui = k % count;
    const { angle, edge, delta } = twoEdgeAim(current, seatAngles[ui]);
    const turned = Math.abs(delta) > 0.5;
    if (k > 0) launch += timing.perCardMs + (turned ? timing.rotateMs : quickGap);
    steps.push({ k, ui, round: Math.floor(k / count), angle, edge, turned, dir: delta < 0 ? -1 : 1, launchMs: launch });
    current = angle;
  }
  return steps;
}

/** Départs (ms après la fin du mélange) des cartes d'un joueur, tour par tour. */
export function dealLaunchesFor(plan: DealAimStep[], ui: number): number[] {
  return plan.filter((step) => step.ui === ui).map((step) => step.launchMs);
}
