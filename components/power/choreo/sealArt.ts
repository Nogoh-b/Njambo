/* ═══════════════ Dessins du Sceau d'Entrave (canvas 2D) ═══════════════
   Chaînes, cadenas et sceau runique, partagés par l'animation d'activation
   (playChoreography, effet « stamp ») et par la carte scellée qui reste
   affichée jusqu'au tour de la cible (PowerChargeLayer). Validés sur
   l'« Atelier Sceau et Filet » (version C2). Coordonnées locales à la carte :
   origine au centre, axes tournés comme elle. */

export const SEAL_PINK = "#ff5b82";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

export const sineInOut = (p: number) => -(Math.cos(Math.PI * clamp01(p)) - 1) / 2;
export const easeOut = (p: number) => 1 - Math.pow(1 - clamp01(p), 3);
export const backOut = (p: number) => { const c = 1.7, q = clamp01(p) - 1; return 1 + (c + 1) * q * q * q + c * q * q; };
/** Ressort amorti : part de 0, dépasse légèrement 1, se pose à 1. */
export const spring = (p: number, k = 7, f = 11) => (p <= 0 ? 0 : 1 - Math.exp(-k * Math.min(p, 1)) * Math.cos(f * Math.min(p, 1)));
/** Avancement entre a et b (0 → 1). */
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
/** Secousse amortie déclenchée à `at` (px). */
export const jolt = (t: number, at: number, amp = 2.5, ms = 260) => (t < at || t > at + ms ? 0 : Math.sin((t - at) / 18) * amp * Math.exp(-(t - at) / (ms / 3)));

/** Chaîne de maillons alternés (de face / de profil) jusqu'à `progress` ; le dernier maillon apparaît en fondu. */
export function drawChain(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, progress: number, link = 8.5) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(2, Math.floor(len / (link * 0.78)));
  const shown = n * clamp01(progress);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  for (let i = 0; i < Math.ceil(shown); i++) {
    const alpha = clamp01(shown - i);
    if (alpha <= 0) continue;
    const t = (i + 0.5) / n;
    const face = i % 2 === 0;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(lerp(x1, x2, t), lerp(y1, y2, t));
    ctx.rotate(angle);
    const steel = ctx.createLinearGradient(0, -link, 0, link);
    steel.addColorStop(0, "#f4f1ea"); steel.addColorStop(0.5, "#9aa3a8"); steel.addColorStop(1, "#4d555b");
    for (const [width, stroke] of [[face ? 3.6 : 3.2, "#1b1f22"], [face ? 2.2 : 1.9, steel]] as const) {
      ctx.strokeStyle = stroke; ctx.lineWidth = width;
      ctx.beginPath(); ctx.ellipse(0, 0, link * 0.55, face ? link * 0.32 : link * 0.1, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

/** Cadenas : corps doré, trou de serrure, anse ouverte (0) → fermée (1). */
export function drawPadlock(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, closed: number, glow = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  if (glow > 0) { ctx.shadowColor = SEAL_PINK; ctx.shadowBlur = 18 * glow; }
  const lift = (1 - closed) * 6;
  ctx.lineCap = "round";
  for (const [width, stroke] of [[5, "#1b1f22"], [3, "#c9ced3"]] as const) {
    ctx.strokeStyle = stroke; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(-5.5, -2); ctx.lineTo(-5.5, -7 - lift); ctx.arc(0, -7 - lift, 5.5, Math.PI, 0); ctx.lineTo(5.5, -2 - lift * 1.2); ctx.stroke();
  }
  const body = ctx.createLinearGradient(0, -3, 0, 10);
  body.addColorStop(0, "#ffd77a"); body.addColorStop(1, "#b9782a");
  ctx.fillStyle = body; ctx.strokeStyle = "#3a2410"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.roundRect(-8, -3, 16, 13, 3); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#2a1a08"; ctx.beginPath(); ctx.arc(0, 2.5, 1.8, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-0.8, 2.5, 1.6, 4);
  ctx.restore();
}

/** Sceau runique (disque, anneau, graduations, rune). */
export function drawRune(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, alpha: number, rotation = 0) {
  if (alpha <= 0 || scale <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(scale, scale);
  ctx.fillStyle = "#2a0c16"; ctx.strokeStyle = SEAL_PINK; ctx.lineWidth = 2; ctx.shadowColor = SEAL_PINK; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 9.5, Math.sin(a) * 9.5); ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12); ctx.stroke();
  }
  ctx.fillStyle = SEAL_PINK; ctx.font = "800 10px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("ᛟ", 0, 0.5);
  ctx.restore();
}

export function drawRing(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number, color = SEAL_PINK, width = 3) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.shadowColor = color; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}

/** Coins de la carte où s'ancrent les chaînes (repère d'une carte de 58 × 84, mis à l'échelle). */
export function sealCorners(width: number, height: number): [number, number][] {
  const cx = width * 0.53, cy = height * 0.52;
  return [[-cx, -cy], [cx, -cy], [-cx, cy], [cx, cy]];
}

/** État final : chaînes tendues vers les quatre coins et cadenas fermé (carte scellée au repos). */
export function drawSealedRest(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const link = Math.max(5, width * 0.15);
  for (const [cx, cy] of sealCorners(width, height)) drawChain(ctx, 0, 0, cx, cy, 1, link);
  drawPadlock(ctx, 0, 2, width / 36, 1);
}
