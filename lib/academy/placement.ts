/* Placement de la bulle du coach : dans l'écran, jamais sur une zone éclairée
   (carte à toucher, dépôt à regarder). Portrait d'abord : au-dessus ou
   au-dessous de la cible, puis en haut ou en bas de l'écran. PUR. */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const GAP = 14;

const overlap = (a: Box, b: Box) => {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
};

/**
 * @param view taille de l'écran
 * @param size taille de la bulle
 * @param avoid zones à ne pas couvrir, la principale d'abord
 * @param margin marge au bord de l'écran ; `topReserve` garde le haut libre (bouton « Passer »)
 */
export function placeBubble(
  view: { width: number; height: number },
  size: { width: number; height: number },
  avoid: Box[],
  margin = 12,
  topReserve = 52,
): Box {
  const clampLeft = (left: number) => Math.max(margin, Math.min(view.width - margin - size.width, left));
  const box = (left: number, top: number): Box => ({ left: clampLeft(left), top, width: size.width, height: size.height });
  const focus = avoid[0];
  const center = focus ? focus.left + focus.width / 2 - size.width / 2 : (view.width - size.width) / 2;
  const candidates: Box[] = [];
  // Au-dessus puis au-dessous de chaque zone (la cible d'abord, puis par exemple toute la main).
  for (const zone of avoid) {
    candidates.push(box(center, zone.top - GAP - size.height));
    candidates.push(box(center, zone.top + zone.height + GAP));
  }
  candidates.push(box(center, topReserve + margin));
  candidates.push(box(center, view.height - margin - size.height));
  candidates.push(box(center, (view.height - size.height) / 2));

  const inside = (b: Box) => b.top >= topReserve && b.top + b.height <= view.height - margin;
  const padded = avoid.map((zone) => ({ left: zone.left - 6, top: zone.top - 6, width: zone.width + 12, height: zone.height + 12 }));
  const covered = (b: Box) => padded.reduce((sum, zone) => sum + overlap(b, zone), 0);
  const fitting = candidates.filter(inside);
  const free = fitting.find((b) => covered(b) === 0);
  if (free) return free;
  // Écran trop petit : la position qui cache le moins.
  const pool = fitting.length > 0 ? fitting : candidates;
  return pool.reduce((best, b) => (covered(b) < covered(best) ? b : best), pool[0]);
}
