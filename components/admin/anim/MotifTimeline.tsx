"use client";

/* Ligne de temps de l'atelier : une barre par carte (vol + écrasement),
   les réactions en losanges (glisser = décaler), la tête de lecture
   (cliquer / glisser = se placer à un instant). */

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { MOTIF_REACTIONS, SQUASH_MS, sameAnchor, type AnimMotif } from "@/engine/anim/motif";
import { motifReactionInstances, motifSchedule } from "@/engine/anim/sample";
import { useClockTime, type MotifClock } from "./clock";

export const REACTION_COLORS: Record<keyof typeof MOTIF_REACTIONS, string> = {
  flash: "#fff0d0", ring: "#f2bb45", burst: "#ffcf6b", glow: "#10b7a6", crown: "#e0a526",
  avatarPulse: "#d83c68", nkap: "#6ee59c", deckShake: "#c75b3a", dim: "#8a7f9e", shake: "#ff7182",
};
const LABEL_W = 112;
const fmt = (ms: number) => `${(ms / 1000).toFixed(2).replace(".", ",")} s`;

export function MotifTimeline({ motif, flights, totalMs, clock, onChange }: { motif: AnimMotif; flights: number; totalMs: number; clock: MotifClock; onChange(next: AnimMotif): void }) {
  const t = useClockTime(clock);
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ kind: "seek" } | { kind: "rx"; index: number; base: number } | null>(null);
  const span = totalMs + 250;
  const pct = (ms: number) => `${(Math.max(0, ms) / span) * 100}%`;
  const schedule = motifSchedule(motif, flights);
  const reactions = motifReactionInstances(motif, flights);
  const squash = motif.squash && !sameAnchor(motif.from, motif.to);
  const msAt = (event: ReactPointerEvent) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * span;
  };
  const move = (event: ReactPointerEvent) => {
    if (!drag) return;
    const ms = msAt(event);
    if (drag.kind === "seek") { clock.seek(ms); return; }
    const offsetMs = Math.max(-2000, Math.min(3000, Math.round((ms - drag.base) / 10) * 10));
    onChange({ ...motif, reactions: motif.reactions.map((reaction, i) => (i === drag.index ? { ...reaction, offsetMs } : reaction)) });
  };
  const ticks: number[] = [];
  for (let ms = 0; ms <= span; ms += span > 3000 ? 250 : 100) ticks.push(ms);
  const row = (label: string, content: React.ReactNode, key: string) => (
    <div key={key} style={{ display: "grid", gridTemplateColumns: `${LABEL_W}px 1fr`, alignItems: "center", minHeight: 16 }}>
      <span style={{ fontSize: 11, color: "#a99b8b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 8 }}>{label}</span>
      <div style={{ position: "relative", height: 14, background: "#17110d", borderRadius: 5 }}>{content}</div>
    </div>
  );
  return (
    <div style={{ position: "relative", display: "grid", gap: 3, background: "#100c09", border: "1px solid #2e231b", borderRadius: 12, padding: "8px 10px 10px", userSelect: "none", touchAction: "none" }}
      onPointerMove={move} onPointerUp={() => setDrag(null)}>
      <div style={{ display: "grid", gridTemplateColumns: `${LABEL_W}px 1fr` }}>
        <span style={{ fontSize: 11, color: "#a99b8b" }}>{fmt(t)} / {fmt(totalMs)}</span>
        <div ref={trackRef} style={{ position: "relative", height: 18, cursor: "crosshair" }}
          onPointerDown={(event) => { (event.target as Element).setPointerCapture(event.pointerId); setDrag({ kind: "seek" }); clock.seek(msAt(event)); }}>
          {ticks.map((ms) => <i key={ms} style={{ position: "absolute", left: pct(ms), top: ms % 500 === 0 ? 4 : 10, width: 1, height: ms % 500 === 0 ? 12 : 6, background: ms % 500 === 0 ? "#6a5442" : "#45352a" }}>{ms % 500 === 0 && <em style={{ position: "absolute", left: 4, top: -4, fontStyle: "normal", fontSize: 10, color: "#a99b8b", whiteSpace: "nowrap" }}>{fmt(ms)}</em>}</i>)}
        </div>
      </div>
      {schedule.slice(0, 6).map((flight) => row(`Carte ${flight.index + 1}`, (
        <>
          <div style={{ position: "absolute", top: 2, bottom: 2, left: pct(flight.startMs), width: pct(motif.durationMs), borderRadius: 4, background: "linear-gradient(90deg,#f2bb45,#e69a3a)" }} />
          {squash && <div style={{ position: "absolute", top: 2, bottom: 2, left: pct(flight.endMs), width: pct(SQUASH_MS), borderRadius: 4, background: "repeating-linear-gradient(90deg, rgba(242,187,69,.5) 0 3px, transparent 3px 6px)" }} />}
        </>
      ), `f${flight.index}`))}
      {schedule.length > 6 && <div style={{ fontSize: 11, color: "#a99b8b", paddingLeft: LABEL_W }}>+ {schedule.length - 6} autres cartes, même rythme</div>}
      {row("Réactions", reactions.map((instance, i) => (
        <span key={i}>
          <div style={{ position: "absolute", top: 5, height: 4, borderRadius: 2, opacity: 0.55, left: pct(instance.atMs), width: pct(instance.durationMs), background: REACTION_COLORS[instance.reaction.type] }} />
          <div title={`${MOTIF_REACTIONS[instance.reaction.type].label} · glisser pour décaler`}
            onPointerDown={(event) => { event.stopPropagation(); (event.target as Element).setPointerCapture(event.pointerId); setDrag({ kind: "rx", index: instance.reactionIndex, base: instance.atMs - instance.reaction.offsetMs }); }}
            style={{ position: "absolute", top: 1, left: pct(instance.atMs), width: 12, height: 12, marginLeft: -6, transform: "rotate(45deg)", background: REACTION_COLORS[instance.reaction.type], border: "2px solid #100c09", borderRadius: 2, cursor: "ew-resize", zIndex: 2 }} />
        </span>
      )), "rx")}
      <div style={{ position: "absolute", top: 6, bottom: 6, left: LABEL_W + 10, right: 10, pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(t), width: 2, marginLeft: -1, background: "#fff4df", boxShadow: "0 0 8px rgba(255,244,223,.7)" }} />
      </div>
    </div>
  );
}
