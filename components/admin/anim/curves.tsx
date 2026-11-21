"use client";

/* Éditeurs visuels de l'atelier :
   - courbe de vitesse (Bézier, deux poignées) ;
   - piste de propriété (points [temps, valeur] : glisser, double-clic pour
     ajouter, clic droit pour retirer) avec la tête de lecture. */

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { MOTIF_EASINGS, type Bezier, type LanePoint } from "@/engine/anim/motif";
import { cubicBezier, laneValue } from "@/engine/anim/sample";

const toSvg = (svg: SVGSVGElement, event: ReactPointerEvent | React.MouseEvent) => {
  const point = svg.createSVGPoint();
  point.x = event.clientX; point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM()!.inverse());
};
const round = (value: number, step: number) => +(Math.round(value / step) * step).toFixed(3);

export const EASING_LABELS: Record<keyof typeof MOTIF_EASINGS, string> = {
  linear: "Linéaire", smooth: "Douce", accelerate: "Accélère", decelerate: "Freine", lightBounce: "Rebond léger",
  spring: "Ressort", suck: "Aspiré", flash: "Éclair", classic: "Vol actuel",
};

/* ─────────────── Courbe de vitesse ─────────────── */

const EX = (x: number) => 20 + x * 120;
const EY = (y: number) => 170 - y * 120;

export function EaseEditor({ value, onChange, progress }: { value: Bezier; onChange(next: Bezier): void; progress?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<1 | 2 | null>(null);
  const ease = cubicBezier(value);
  const path = Array.from({ length: 49 }, (_, i) => { const x = i / 48; return `${i ? "L" : "M"}${EX(x).toFixed(1)} ${EY(ease(x)).toFixed(1)}`; }).join("");
  const [x1, y1, x2, y2] = value;
  const move = (event: ReactPointerEvent) => {
    if (!drag || !ref.current) return;
    const p = toSvg(ref.current, event);
    const x = round(Math.max(0, Math.min(1, (p.x - 20) / 120)), 0.01), y = round(Math.max(-0.4, Math.min(1.4, (170 - p.y) / 120)), 0.01);
    onChange(drag === 1 ? [x, y, x2, y2] : [x1, y1, x, y]);
  };
  const handle = (which: 1 | 2, x: number, y: number, color: string) => (
    <circle cx={EX(x)} cy={EY(y)} r={7} fill={color} stroke="#1b1010" strokeWidth={2} style={{ cursor: "grab" }}
      onPointerDown={(event) => { event.preventDefault(); (event.target as Element).setPointerCapture(event.pointerId); setDrag(which); }} />
  );
  return (
    <svg ref={ref} viewBox="0 0 160 220" width={150} style={{ touchAction: "none", flex: "0 0 auto" }} onPointerMove={move} onPointerUp={() => setDrag(null)}>
      <rect x={20} y={50} width={120} height={120} fill="#120e0b" stroke="#45352a" rx={4} />
      <line x1={20} y1={170} x2={140} y2={50} stroke="#45352a" strokeDasharray="3 3" />
      <text x={20} y={190} fill="#a99b8b" fontSize={9}>temps →</text>
      <text x={12} y={44} fill="#a99b8b" fontSize={9}>avancée</text>
      <line x1={EX(0)} y1={EY(0)} x2={EX(x1)} y2={EY(y1)} stroke="#10b7a6" strokeWidth={1.5} />
      <line x1={EX(1)} y1={EY(1)} x2={EX(x2)} y2={EY(y2)} stroke="#d83c68" strokeWidth={1.5} />
      <path d={path} fill="none" stroke="#f2bb45" strokeWidth={2.5} />
      {progress !== undefined && <circle cx={EX(progress)} cy={EY(ease(progress))} r={4.5} fill="#fff4df" />}
      {handle(1, x1, y1, "#10b7a6")}
      {handle(2, x2, y2, "#d83c68")}
    </svg>
  );
}

/* ─────────────── Piste de propriété ─────────────── */

const LW = 300, LH = 64, LP = 8;
const LX = (x: number) => LP + x * (LW - 2 * LP);

export interface LaneSpec { min: number; max: number; step: number; ticks: number[]; snaps?: number[] }

export function LaneEditor({ points, spec, onChange, progress, disabled }: { points: LanePoint[]; spec: LaneSpec; onChange(next: LanePoint[]): void; progress?: number; disabled?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const LY = (value: number) => LH - LP - ((value - spec.min) / (spec.max - spec.min)) * (LH - 2 * LP);
  const valueAt = (event: ReactPointerEvent | React.MouseEvent) => {
    const p = toSvg(ref.current!, event);
    let value = spec.min + ((LH - LP - p.y) / (LH - 2 * LP)) * (spec.max - spec.min);
    value = Math.max(spec.min, Math.min(spec.max, round(value, spec.step)));
    for (const snap of spec.snaps ?? []) if (Math.abs(value - snap) < (spec.max - spec.min) * 0.04) value = snap;
    return { x: Math.max(0, Math.min(1, (p.x - LP) / (LW - 2 * LP))), value };
  };
  const move = (event: ReactPointerEvent) => {
    if (drag === null) return;
    const { x, value } = valueAt(event);
    const last = points.length - 1;
    const t = drag === 0 ? 0 : drag === last ? 1 : round(Math.max(points[drag - 1][0] + 0.01, Math.min(points[drag + 1][0] - 0.01, x)), 0.005);
    onChange(points.map((point, i) => (i === drag ? (point.length === 3 ? [t, value, point[2]] : [t, value]) as LanePoint : point)));
  };
  const line = points.map(([x, v]) => `${LX(x).toFixed(1)},${LY(v).toFixed(1)}`).join(" ");
  // Courbe réelle (avec les courbes par point) échantillonnée pour l'affichage.
  const curve = Array.from({ length: 61 }, (_, i) => { const x = i / 60; return `${LX(x).toFixed(1)},${LY(laneValue(points, x)).toFixed(1)}`; }).join(" ");
  return (
    <svg ref={ref} viewBox={`0 0 ${LW} ${LH}`} style={{ width: "100%", display: "block", touchAction: "none", cursor: "copy", opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? "none" : undefined }}
      onPointerMove={move} onPointerUp={() => setDrag(null)}
      onDoubleClick={(event) => {
        if ((event.target as Element).tagName === "circle") return;
        const { x, value } = valueAt(event);
        if (x <= 0.01 || x >= 0.99) return;
        onChange([...points, [round(x, 0.005), value] as LanePoint].sort((a, b) => a[0] - b[0]));
      }}>
      <rect width={LW} height={LH} rx={8} fill="#120e0b" stroke="#2e231b" />
      {spec.ticks.map((tick) => <line key={tick} x1={LP} x2={LW - LP} y1={LY(tick)} y2={LY(tick)} stroke="#45352a" strokeDasharray="3 3" />)}
      <polyline points={line} fill="none" stroke="rgba(242,187,69,.25)" strokeWidth={1} />
      <polyline points={curve} fill="none" stroke="#f2bb45" strokeWidth={2} />
      {progress !== undefined && <line x1={LX(progress)} x2={LX(progress)} y1={3} y2={LH - 3} stroke="#fff4df" strokeWidth={1.2} opacity={0.7} />}
      {points.map(([x, v], i) => (
        <circle key={i} cx={LX(x)} cy={LY(v)} r={5.5} fill={i === 0 || i === points.length - 1 ? "#d7a957" : "#f2bb45"} stroke="#1b1010" strokeWidth={2} style={{ cursor: "grab" }}
          onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); (event.target as Element).setPointerCapture(event.pointerId); setDrag(i); }}
          onContextMenu={(event) => { event.preventDefault(); if (i > 0 && i < points.length - 1) onChange(points.filter((_, j) => j !== i)); }} />
      ))}
    </svg>
  );
}
