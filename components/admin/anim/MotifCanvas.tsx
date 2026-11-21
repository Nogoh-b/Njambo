"use client";

/* Canevas de l'atelier : table schématique où le modèle est rejoué à
   l'instant de l'horloge (vraies cartes PlayCard, retournement 3D), avec le
   schéma éditable par-dessus :
   - poignées A (départ) et B (arrivée), aimantées sur les zones ;
   - ◆ : bombé de la trajectoire (ou chaque point de passage) ;
   - points de vitesse (intervalles de temps égaux) et ↻ du retournement. */

import { memo, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PlayCard } from "@/components/cards/PlayCard";
import { isMultiAnchor, type AnimMotif, type MotifAnchor, type MotifWaypoint } from "@/engine/anim/motif";
import { arcControl, waypointPosition } from "@/engine/anim/sample";
import type { Card } from "@/types/game";
import { useClockTime, type MotifClock } from "./clock";
import { CARD_H, CARD_W, SCENE_H, SCENE_W, SEAT_LABELS, ZONE_POINTS, anchorZones, buildScenePlan, flightSamples, sceneFrame, zoneAnchor, zoneDisplay, type ScenePlan, type SceneZone, type Seat } from "./motifScene";

const RANK_VALUES: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11 };
const toCard = (id: string): Card => {
  const suit = id.slice(-1), rank = id.slice(0, -1);
  return { id: `atelier_${id}`, rank, value: RANK_VALUES[rank] ?? (Number(rank) || 0), suit, color: suit === "♥" || suit === "♦" ? "#c0392b" : "#1e1e1e" };
};

const CardFaces = memo(function CardFaces({ id }: { id: string }) {
  return (
    <>
      <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden" }}><PlayCard card={toCard(id)} w={CARD_W} /></div>
      <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}><PlayCard hidden w={CARD_W} /></div>
    </>
  );
});

const SEATS: Array<{ seat: Seat; zone: SceneZone; color: string }> = [
  { seat: "top", zone: "avatar:top", color: "#3154d4" },
  { seat: "left", zone: "avatar:left", color: "#d83c68" },
  { seat: "right", zone: "avatar:right", color: "#10b7a6" },
  { seat: "me", zone: "avatar:me", color: "#c75b3a" },
];

type DragTarget = { kind: "A" } | { kind: "B" } | { kind: "arc" } | { kind: "via"; index: number };

export interface MotifCanvasProps {
  motif: AnimMotif;
  clock: MotifClock;
  width: number;
  showSchema: boolean;
  onChange(next: AnimMotif): void;
}

export function MotifCanvas({ motif, clock, width, showSchema, onChange }: MotifCanvasProps) {
  const plan = useMemo(() => buildScenePlan(motif), [motif]);
  const t = useClockTime(clock);
  const scale = width / SCENE_W;
  const { items, effects } = sceneFrame(plan, t);
  const shake = effects.find((effect) => effect.type === "shake");
  const shakeX = shake ? Math.sin(shake.q * Math.PI * 9) * (1 - shake.q) * 6 : 0;
  return (
    <div style={{ position: "relative", width, height: SCENE_H * scale, borderRadius: 26 * scale, overflow: "hidden", boxShadow: "0 0 0 6px #050404, 0 20px 50px rgba(0,0,0,.55)", background: "#0d0a08", flex: "0 0 auto" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: SCENE_W, height: SCENE_H, transform: `scale(${scale}) translateX(${shakeX}px)`, transformOrigin: "0 0" }}>
        <TableBackground effects={effects} />
        <div style={{ position: "absolute", inset: 0 }}>
          {items.sort((a, b) => a.z - b.z).map((item) => {
            const f = item.frame;
            const lift = f.lift * CARD_W * 0.22;
            const glow = Math.max(0, Math.min(1, f.glow));
            return (
              <div key={item.key} style={{
                position: "absolute", left: 0, top: 0, width: CARD_W, height: CARD_H, perspective: 600,
                transform: `translate(${f.x - CARD_W / 2}px, ${f.y - CARD_H / 2 - lift}px) rotate(${f.rotate}deg) scale(${f.scale * f.scaleX}, ${f.scale * f.scaleY})`,
                opacity: Math.max(0, Math.min(1, f.opacity)),
                filter: [`drop-shadow(0 ${2 + f.lift * 12}px ${4 + f.lift * 16}px rgba(0,0,0,${0.3 + f.lift * 0.25}))`, glow > 0.01 ? `drop-shadow(0 0 ${glow * 20}px #f2bb45)` : "", item.dim ? `brightness(${1 - 0.55 * item.dim})` : ""].join(" "),
              }}>
                <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `rotateY(${f.flip}deg)` }}>
                  <CardFaces id={item.card.id} />
                </div>
              </div>
            );
          })}
        </div>
        <EffectsLayer effects={effects} />
        {showSchema && <Schema plan={plan} motif={motif} onChange={onChange} />}
      </div>
    </div>
  );
}

function TableBackground({ effects }: { effects: ReturnType<typeof sceneFrame>["effects"] }) {
  const pulse = (zone: SceneZone) => {
    const hit = effects.find((effect) => effect.type === "avatarPulse" && Math.hypot(effect.x - ZONE_POINTS[zone].x, effect.y - ZONE_POINTS[zone].y) < 4);
    return hit ? Math.sin(hit.q * Math.PI) : 0;
  };
  const deckShake = effects.find((effect) => effect.type === "deckShake");
  const deckX = deckShake ? Math.sin(deckShake.q * Math.PI * 8) * (1 - deckShake.q) * 5 : 0;
  const nkap = effects.find((effect) => effect.type === "nkap");
  const glowAt = (zone: SceneZone) => {
    const hit = effects.find((effect) => effect.type === "glow" && Math.hypot(effect.x - zoneDisplay(zone).x, effect.y - zoneDisplay(zone).y) < 30);
    return hit ? Math.sin(hit.q * Math.PI) : 0;
  };
  const at = (zone: SceneZone) => ({ left: ZONE_POINTS[zone].x, top: ZONE_POINTS[zone].y });
  return (
    <>
      <div style={{ position: "absolute", left: -4, top: 44, width: 398, height: 604, background: "url(/assets/njambo/table-portrait.webp) center/100% 100% no-repeat, radial-gradient(ellipse 46% 48% at 50% 50%, #0e6a60 0 85%, #7a3b22 86% 93%, transparent 94%)" }} />
      {SEATS.map(({ seat, zone, color }) => (
        <div key={seat} style={{ position: "absolute", ...at(zone), transform: `translate(-50%, -50%) scale(${1 + 0.16 * pulse(zone)})`, width: 46, height: 46, borderRadius: "50%", display: "grid", placeItems: "center", background: `radial-gradient(circle at 35% 30%, ${color}, #1a0d0d 95%)`, boxShadow: `0 0 0 3px #f2bb45, 0 0 ${pulse(zone) * 26}px rgba(242,187,69,.9)`, color: "#fff4df", font: "800 11px var(--font-bricolage, system-ui)", textAlign: "center", lineHeight: 1 }}>
          {seat === "me" ? "Toi" : seat === "top" ? "Cible" : seat === "right" ? "Gagn." : "Adv."}
        </div>
      ))}
      {(["deposit:top", "deposit:left", "deposit:right", "deposit:me"] as SceneZone[]).map((zone) => (
        <div key={zone} style={{ position: "absolute", ...at(zone), transform: "translate(-50%, -50%)", width: 52, height: 72, borderRadius: 9, border: `1.5px dashed rgba(${glowAt(zone) ? "126,231,220" : "255,240,208"},${0.28 + glowAt(zone) * 0.7})`, boxShadow: glowAt(zone) ? `0 0 ${10 + 24 * glowAt(zone)}px rgba(16,183,166,.8)` : undefined }} />
      ))}
      <div style={{ position: "absolute", ...at("deck"), transform: `translate(-50%, -50%) translateX(${deckX}px)`, width: CARD_W * 0.74, height: CARD_H * 0.74 }}>
        <div style={{ position: "absolute", inset: 0, transform: "translate(3px,3px) rotate(-1deg)" }}><PlayCard hidden w={CARD_W * 0.74} /></div>
        <div style={{ position: "absolute", inset: 0, transform: "rotate(-4deg)" }}><PlayCard hidden w={CARD_W * 0.74} /></div>
      </div>
      <div style={{ position: "absolute", ...at("pot"), transform: "translate(-50%, -50%)", padding: "6px 12px", borderRadius: 999, background: "rgba(10,8,6,.82)", border: "1px solid rgba(242,187,69,.45)", color: "#fff4df", font: "800 12px var(--font-bricolage, system-ui)", whiteSpace: "nowrap" }}>Pot <b style={{ color: "#f2bb45" }}>600</b></div>
      <div style={{ position: "absolute", left: 66, top: 652, padding: "4px 10px", borderRadius: 12, background: "rgba(10,8,6,.84)", border: "1px solid rgba(242,187,69,.32)", color: nkap ? "#ffe08a" : "#d7a957", font: "700 11px var(--font-manrope, system-ui)", textShadow: nkap ? "0 0 10px rgba(242,187,69,.9)" : undefined }}>
        {(1_000_000 + (nkap ? Math.round(500 * nkap.q) : 0)).toLocaleString("fr-FR")} Nkap
      </div>
    </>
  );
}

function EffectsLayer({ effects }: { effects: ReturnType<typeof sceneFrame>["effects"] }) {
  return (
    <svg width={SCENE_W} height={SCENE_H} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
      <defs>
        <radialGradient id="atelier-flash"><stop offset="0" stopColor="#fffae8" /><stop offset=".35" stopColor="#f2bb45" stopOpacity=".6" /><stop offset="1" stopColor="#f2bb45" stopOpacity="0" /></radialGradient>
      </defs>
      {effects.map((effect, index) => {
        const { x, y, q } = effect;
        switch (effect.type) {
          case "flash": return <circle key={index} cx={x} cy={y} r={40 + 50 * q} fill="url(#atelier-flash)" opacity={(1 - q) * (1 - q)} />;
          case "ring": return <ellipse key={index} cx={x} cy={y} rx={14 + q * 80} ry={10 + q * 52} fill="none" stroke="#f2bb45" strokeWidth={5 * (1 - q) + 0.5} opacity={1 - q} />;
          case "burst": return (
            <g key={index} opacity={1 - q}>
              {Array.from({ length: 18 }, (_, i) => { const angle = (i / 18) * Math.PI * 2, distance = (24 + (i % 5) * 10) * (1 - (1 - q) * (1 - q)); return <circle key={i} cx={x + Math.cos(angle) * distance} cy={y + Math.sin(angle) * distance} r={2.6 * (1 - q) + 0.5} fill={i % 3 ? "#ffd678" : "#10b7a6"} />; })}
            </g>
          );
          case "avatarPulse": return <circle key={index} cx={x} cy={y} r={26 + q * 34} fill="none" stroke="#f2bb45" strokeWidth={3 * (1 - q) + 0.5} opacity={1 - q} />;
          case "crown": return <text key={index} x={x} y={y} textAnchor="middle" fontSize={28 * (q < 0.6 ? 0.2 + q * 1.75 : 1.25 - (q - 0.6) * 0.6)} fill="#f2bb45" opacity={Math.min(1, q * 3)} style={{ filter: "drop-shadow(0 0 8px rgba(242,187,69,.9))" }}>♛</text>;
          case "glow": return null;
          default: return null;
        }
      })}
    </svg>
  );
}

/* ─────────────── Schéma éditable ─────────────── */

const ALL_ZONES = Object.keys(ZONE_POINTS) as SceneZone[];
const SHORT: Record<string, string> = { hand: "Main", deposit: "Dépôt", avatar: "Avatar", deck: "Pioche", pot: "Pot", center: "Centre", reveal: "Révélation", off: "Hors-écran" };
const zoneLabel = (zone: SceneZone) => {
  const [kind, seat] = zone.split(":");
  if (kind === "off") return `Hors-écran ${({ top: "↑", bottom: "↓", left: "←", right: "→" } as Record<string, string>)[seat]}`;
  return seat ? `${SHORT[kind]} · ${SEAT_LABELS[seat as Seat]}` : SHORT[kind];
};

function Schema({ plan, motif, onChange }: { plan: ScenePlan; motif: AnimMotif; onChange(next: AnimMotif): void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ target: DragTarget; x: number; y: number; hover: SceneZone | null } | null>(null);
  const first = plan.flights[0];
  const used = new Set([...anchorZones(motif.from), ...anchorZones(motif.to)]);
  const toPoint = (event: ReactPointerEvent) => {
    const svg = svgRef.current!;
    const point = svg.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const nearest = (x: number, y: number) => {
    let best: SceneZone | null = null, distance = 40;
    for (const zone of ALL_ZONES) { const d = zoneDisplay(zone), gap = Math.hypot(d.x - x, d.y - y); if (gap < distance) { distance = gap; best = zone; } }
    return best;
  };
  const startDrag = (target: DragTarget) => (event: ReactPointerEvent) => {
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    const p = toPoint(event);
    setDrag({ target, x: p.x, y: p.y, hover: null });
  };
  const move = (event: ReactPointerEvent) => {
    if (!drag || !first) return;
    const p = toPoint(event);
    const target = drag.target;
    if (target.kind === "A" || target.kind === "B") { setDrag({ ...drag, x: p.x, y: p.y, hover: nearest(p.x, p.y) }); return; }
    const from = first.from, to = first.to, dx = to.x - from.x, dy = to.y - from.y, d2 = dx * dx + dy * dy;
    if (d2 < 1) return;
    const along = +Math.max(0.05, Math.min(0.95, ((p.x - from.x) * dx + (p.y - from.y) * dy) / d2)).toFixed(2);
    const perp = +Math.max(-1, Math.min(1, ((p.x - from.x) * -dy + (p.y - from.y) * dx) / d2)).toFixed(2);
    if (target.kind === "arc") onChange({ ...motif, path: { ...motif.path, arc: { along, perp } } });
    else {
      const index = target.index;
      const via = motif.path.via.map((point, i): MotifWaypoint => (i === index ? { t: point.t, along: Math.max(-0.5, Math.min(1.5, along)), perp } : point));
      onChange({ ...motif, path: { ...motif.path, via } });
    }
    setDrag({ ...drag, x: p.x, y: p.y });
  };
  const end = () => {
    if (drag && (drag.target.kind === "A" || drag.target.kind === "B") && drag.hover) {
      const anchor: MotifAnchor = zoneAnchor(drag.hover);
      onChange(drag.target.kind === "A" ? { ...motif, from: anchor } : { ...motif, to: anchor });
    }
    setDrag(null);
  };

  const samples = first ? flightSamples(plan, first) : [];
  const flipIndex = samples.findIndex((sample, i) => i > 0 && (samples[i - 1].flip - 90) * (sample.flip - 90) <= 0 && samples[i - 1].flip !== sample.flip);
  const inPlace = plan.inPlace;
  const a = first ? { x: first.from.x, y: first.from.y } : zoneDisplay(anchorZones(motif.from)[0]);
  const bRaw = first && !inPlace ? { x: first.to.x, y: first.to.y } : { x: a.x + 34, y: a.y - 34 };
  const b = { x: Math.max(14, Math.min(SCENE_W - 14, bRaw.x)), y: Math.max(14, Math.min(SCENE_H - 14, bRaw.y)) };
  const handleA = drag?.target.kind === "A" ? drag : a;
  const handleB = drag?.target.kind === "B" ? drag : b;
  const control = first && motif.path.via.length === 0 ? arcControl(first.from, first.to, motif.path.arc) : null;
  const waypoints = first ? motif.path.via.map((point) => waypointPosition(point, first.from, first.to)) : [];
  const label = (zone: SceneZone, highlight = false) => {
    const d = zoneDisplay(zone);
    const anchor = d.x < 70 ? "start" : d.x > SCENE_W - 70 ? "end" : "middle";
    return <text key={`l-${zone}`} x={d.x + (anchor === "start" ? -6 : anchor === "end" ? 6 : 0)} y={d.y - 14} textAnchor={anchor} style={{ font: "700 10px var(--font-manrope, system-ui)", fill: highlight ? "#7ee7dc" : "#fff4df", stroke: "rgba(0,0,0,.85)", strokeWidth: 3, paintOrder: "stroke" }}>{zoneLabel(zone)}</text>;
  };
  return (
    <svg ref={svgRef} width={SCENE_W} height={SCENE_H} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} style={{ position: "absolute", inset: 0, overflow: "visible" }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {ALL_ZONES.map((zone) => {
        const d = zoneDisplay(zone), on = used.has(zone), hover = drag?.hover === zone;
        return <circle key={zone} cx={d.x} cy={d.y} r={hover ? 9 : on ? 5.5 : 4} fill={hover ? "rgba(16,183,166,.55)" : on ? "#f2bb45" : "rgba(255,240,208,.16)"} stroke={hover ? "#10b7a6" : on ? "#1b1010" : "rgba(255,240,208,.5)"} strokeWidth={hover ? 2 : 1} />;
      })}
      {[...used].map((zone) => label(zone))}
      {drag?.hover && !used.has(drag.hover) && label(drag.hover, true)}
      {!inPlace && plan.flights.slice(0, 12).map((flight, index) => {
        const points = flightSamples(plan, flight, 24);
        return <polyline key={flight.k} points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#f2bb45" strokeWidth={index ? 1.2 : 2} strokeDasharray="6 5" opacity={index ? 0.35 : 1} />;
      })}
      {inPlace && first && <circle cx={first.from.x} cy={first.from.y} r={40} fill="none" stroke="rgba(255,240,208,.5)" strokeDasharray="3 3" />}
      {!inPlace && samples.slice(1, -1).map((sample, i) => <circle key={i} cx={sample.x} cy={sample.y} r={2} fill="#fff0d0" opacity={0.85} />)}
      {flipIndex > 0 && <g transform={`translate(${samples[flipIndex].x + 14},${samples[flipIndex].y - 12})`}><circle r={8} fill="#1b1010" stroke="#f2bb45" strokeWidth={1.5} /><text textAnchor="middle" dominantBaseline="central" style={{ font: "800 11px system-ui", fill: "#f2bb45" }}>↻</text></g>}
      {control && first && (
        <>
          <path d={`M${first.from.x} ${first.from.y} L${control.x} ${control.y} L${first.to.x} ${first.to.y}`} fill="none" stroke="rgba(255,240,208,.5)" strokeDasharray="3 3" />
          <g transform={`translate(${control.x},${control.y}) rotate(45)`} style={{ cursor: "grab" }} onPointerDown={startDrag({ kind: "arc" })}><rect x={-7} y={-7} width={14} height={14} rx={2} fill="#f2bb45" stroke="#1b1010" strokeWidth={2} /></g>
        </>
      )}
      {waypoints.map((point, index) => (
        <g key={index} transform={`translate(${point.x},${point.y}) rotate(45)`} style={{ cursor: "grab" }} onPointerDown={startDrag({ kind: "via", index })}><rect x={-7} y={-7} width={14} height={14} rx={2} fill="#ffd678" stroke="#1b1010" strokeWidth={2} /></g>
      ))}
      {inPlace && <text x={b.x + 14} y={b.y - 4} style={{ font: "600 10px var(--font-manrope, system-ui)", fill: "#7ee7dc", stroke: "rgba(0,0,0,.85)", strokeWidth: 3, paintOrder: "stroke" }}>tire B pour en faire un trajet</text>}
      <g transform={`translate(${handleA.x},${handleA.y})`} style={{ cursor: "grab" }} onPointerDown={startDrag({ kind: "A" })}><circle r={10} fill="#10b7a6" stroke="#1b1010" strokeWidth={2} /><text textAnchor="middle" dominantBaseline="central" style={{ font: "800 10px system-ui", fill: "#fff", pointerEvents: "none" }}>A</text></g>
      <g transform={`translate(${handleB.x},${handleB.y})`} style={{ cursor: "grab" }} onPointerDown={startDrag({ kind: "B" })}><circle r={10} fill="#d83c68" stroke="#1b1010" strokeWidth={2} /><text textAnchor="middle" dominantBaseline="central" style={{ font: "800 10px system-ui", fill: "#fff", pointerEvents: "none" }}>B</text></g>
      {isMultiAnchor(motif.to) || isMultiAnchor(motif.from) ? <text x={SCENE_W / 2} y={SCENE_H - 8} textAnchor="middle" style={{ font: "600 10px var(--font-manrope, system-ui)", fill: "#a99b8b" }}>« chacun » : une carte par joueur, à tour de rôle</text> : null}
    </svg>
  );
}
