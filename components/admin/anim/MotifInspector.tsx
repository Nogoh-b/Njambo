"use client";

/* Inspecteur de l'atelier : tous les réglages d'un modèle, en formulaires et
   en éditeurs visuels. Les erreurs de validation s'affichent sous chaque
   champ (chemins `motif.…` de validateMotif). */

import type { ReactNode } from "react";
import {
  LANE_SPECS, MOTIF_EASINGS, MOTIF_GROUPS, MOTIF_LIMITS, MOTIF_PLAYERS, MOTIF_PLAYER_ZONES, MOTIF_REACTIONS, MOTIF_TABLE_ZONES, MOTIF_TRAILS, OFFSCREEN_SIDES,
  type AnimMotif, type Bezier, type LaneKey, type LanePoint, type MotifAnchor, type MotifGroup, type MotifReaction, type MotifReactionType, type MotifWaypoint,
} from "@/engine/anim/motif";
import { laneValue } from "@/engine/anim/sample";
import { useClockTime, type MotifClock } from "./clock";
import { EASING_LABELS, EaseEditor, LaneEditor, type LaneSpec } from "./curves";
import { REACTION_COLORS } from "./MotifTimeline";
import styles from "../AdminConsole.module.css";

type ErrorFor = (path: string) => string | undefined;

const ZONE_LABELS: Record<MotifAnchor["zone"], string> = { hand: "Main", deposit: "Dépôt", avatar: "Avatar", timer: "Minuteur", deck: "Pioche", pot: "Pot", center: "Espace central", reveal: "Révélation", offscreen: "Hors de l'écran" };
const PLAYER_LABELS: Record<(typeof MOTIF_PLAYERS)[number], string> = { self: "du lanceur", target: "de la cible", winner: "du gagnant", all: "de chacun", all_opponents: "de chaque adversaire" };
const SIDE_LABELS: Record<(typeof OFFSCREEN_SIDES)[number], string> = { top: "haut", bottom: "bas", left: "gauche", right: "droite" };
const TRAIL_LABELS: Record<(typeof MOTIF_TRAILS)[number], string> = { none: "Aucune", light: "Traînée lumineuse", sparks: "Étincelles", blur: "Flou de vitesse" };
const LANES: Array<{ key: LaneKey; label: string; ticks: number[]; step: number; snaps?: number[]; fmt(value: number): string }> = [
  { key: "scale", label: "Échelle", ticks: [1], step: 0.01, fmt: (v) => `×${v.toFixed(2).replace(".", ",")}` },
  { key: "flip", label: "Retournement (0° face · 180° dos)", ticks: [90], step: 1, snaps: [0, 90, 180], fmt: (v) => (v <= 30 ? "face visible" : v >= 150 ? "dos" : "sur la tranche") },
  { key: "rotate", label: "Rotation (°)", ticks: [0], step: 1, fmt: (v) => `${Math.round(v)}°` },
  { key: "opacity", label: "Opacité", ticks: [], step: 0.01, fmt: (v) => `${Math.round(v * 100)} %` },
  { key: "glow", label: "Lueur dorée", ticks: [], step: 0.01, fmt: (v) => `${Math.round(v * 100)} %` },
  { key: "lift", label: "Élévation (ombre portée)", ticks: [], step: 0.01, fmt: (v) => `${Math.round(v * 100)} %` },
];
const ADVANCED_LANES: Array<{ key: "sizeBlend" | "turnBlend"; label: string }> = [
  { key: "sizeBlend", label: "Passage à la taille d'arrivée" },
  { key: "turnBlend", label: "Passage à la rotation d'arrivée" },
];
// Rotation : l'éditeur montre −90° à 90° (la validation accepte ±720°).
const laneSpec = (key: LaneKey, step: number, ticks: number[], snaps?: number[]): LaneSpec => key === "rotate"
  ? { min: -90, max: 90, step, ticks, snaps }
  : { min: LANE_SPECS[key].min, max: key === "scale" ? 2 : LANE_SPECS[key].max, step, ticks, snaps };

export const anchorLabel = (anchor: MotifAnchor) => "player" in anchor ? `${ZONE_LABELS[anchor.zone]} ${PLAYER_LABELS[anchor.player]}` : anchor.zone === "offscreen" ? `Hors de l'écran (${SIDE_LABELS[anchor.side]})` : ZONE_LABELS[anchor.zone];

function AnchorSelect({ value, onChange }: { value: MotifAnchor; onChange(next: MotifAnchor): void }) {
  const options: MotifAnchor[] = [
    ...MOTIF_PLAYER_ZONES.flatMap((zone) => MOTIF_PLAYERS.map((player) => ({ zone, player }) as MotifAnchor)),
    ...MOTIF_TABLE_ZONES.map((zone) => ({ zone }) as MotifAnchor),
    ...OFFSCREEN_SIDES.map((side) => ({ zone: "offscreen", side }) as MotifAnchor),
  ];
  const current = JSON.stringify(value);
  return (
    <select value={current} onChange={(event) => onChange(JSON.parse(event.target.value) as MotifAnchor)}>
      <optgroup label="Joueurs">{options.filter((option) => "player" in option).map((option) => <option key={JSON.stringify(option)} value={JSON.stringify(option)}>{anchorLabel(option)}</option>)}</optgroup>
      <optgroup label="Table">{options.filter((option) => !("player" in option) && option.zone !== "offscreen").map((option) => <option key={JSON.stringify(option)} value={JSON.stringify(option)}>{anchorLabel(option)}</option>)}</optgroup>
      <optgroup label="Hors de l'écran">{options.filter((option) => option.zone === "offscreen").map((option) => <option key={JSON.stringify(option)} value={JSON.stringify(option)}>{anchorLabel(option)}</option>)}</optgroup>
    </select>
  );
}

function F({ label, error, children, full }: { label: string; error?: string; children: ReactNode; full?: boolean }) {
  return <label className={`${styles.field} ${error ? styles.invalid : ""} ${full ? styles.full : ""}`}><span>{label}</span>{children}{error && <span className={styles.fieldError}>{error}</span>}</label>;
}
function Range({ label, value, min, max, step, format, onChange, error }: { label: string; value: number; min: number; max: number; step: number; format(value: number): string; onChange(value: number): void; error?: string }) {
  return (
    <label className={`${styles.field} ${error ? styles.invalid : ""}`}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>{label}<b style={{ color: "var(--ink)" }}>{format(value)}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ padding: 0, accentColor: "var(--gold)" }} />
      {error && <span className={styles.fieldError}>{error}</span>}
    </label>
  );
}
const sec = (ms: number) => `${(ms / 1000).toFixed(2).replace(".", ",")} s`;
const sameCurve = (a: readonly number[], b: readonly number[]) => a.every((value, i) => Math.abs(value - b[i]) < 1e-3);

/** Avancée (0–1) du vol de la première carte, pour les têtes de lecture des éditeurs. */
function useFlightProgress(clock: MotifClock, durationMs: number) {
  const t = useClockTime(clock);
  return Math.max(0, Math.min(1, t / durationMs));
}

function Lane({ motif, laneKey, label, spec, format, clock, onChange, disabled }: { motif: AnimMotif; laneKey: LaneKey; label: string; spec: LaneSpec; format(v: number): string; clock: MotifClock; onChange(points: LanePoint[]): void; disabled?: boolean }) {
  const progress = useFlightProgress(clock, motif.durationMs);
  const points = motif.lanes[laneKey] ?? [];
  return (
    <div style={{ marginBottom: 10 }}>
      <div className={styles.row} style={{ fontSize: 12, marginBottom: 3 }}>
        <b style={{ flex: 1 }}>{label}{disabled ? " · automatique" : ""}</b>
        <span style={{ color: "var(--gold)", fontWeight: 700 }}>{points.length ? format(laneValue(points, progress)) : ""}</span>
      </div>
      <LaneEditor points={points} spec={spec} onChange={onChange} progress={progress} disabled={disabled} />
    </div>
  );
}

function EaseSection({ motif, clock, onChange }: { motif: AnimMotif; clock: MotifClock; onChange(next: AnimMotif): void }) {
  const progress = useFlightProgress(clock, motif.durationMs);
  const setEasing = (easing: Bezier) => onChange({ ...motif, path: { ...motif.path, easing } });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
      <EaseEditor value={motif.path.easing} onChange={setEasing} progress={motif.path.via.length ? undefined : progress} />
      <div style={{ flex: 1, minWidth: 160 }}>
        <div className={styles.filters}>
          {(Object.keys(MOTIF_EASINGS) as Array<keyof typeof MOTIF_EASINGS>).map((name) => (
            <button key={name} type="button" className={styles.chip} aria-pressed={sameCurve(MOTIF_EASINGS[name], motif.path.easing)} onClick={() => setEasing([...MOTIF_EASINGS[name]])}>{EASING_LABELS[name]}</button>
          ))}
        </div>
        <code className={styles.hint}>cubic-bezier({motif.path.easing.join(", ")})</code>
      </div>
    </div>
  );
}

export function MotifInspector({ motif, isNew, errorFor, clock, onChange }: { motif: AnimMotif; isNew: boolean; errorFor: ErrorFor; clock: MotifClock; onChange(next: AnimMotif): void }) {
  const e = (path: string) => errorFor(`motif.${path}`);
  const set = (patch: Partial<AnimMotif>) => onChange({ ...motif, ...patch });
  const setPath = (patch: Partial<AnimMotif["path"]>) => onChange({ ...motif, path: { ...motif.path, ...patch } });
  const setLane = (key: LaneKey, points: LanePoint[] | undefined) => {
    const lanes = { ...motif.lanes } as Record<string, LanePoint[]>;
    if (points) lanes[key] = points; else delete lanes[key];
    onChange({ ...motif, lanes: lanes as AnimMotif["lanes"] });
  };
  const setVia = (index: number, point: MotifWaypoint | null) => {
    const via = point ? motif.path.via.map((item, i) => (i === index ? point : item)) : motif.path.via.filter((_, i) => i !== index);
    setPath({ via });
  };
  const setReaction = (index: number, reaction: MotifReaction | null) => {
    set({ reactions: reaction ? motif.reactions.map((item, i) => (i === index ? reaction : item)) : motif.reactions.filter((_, i) => i !== index) });
  };
  const multi = ("player" in motif.to && (motif.to.player === "all" || motif.to.player === "all_opponents")) || ("player" in motif.from && (motif.from.player === "all" || motif.from.player === "all_opponents"));
  const auto = motif.face.mode === "auto";
  return (
    <div>
      <section className={styles.panel}>
        <h2>Identité</h2>
        <div className={styles.grid2}>
          <F label="Identifiant" error={e("id")}><input value={motif.id} disabled={!isNew} maxLength={48} onChange={(event) => set({ id: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} /></F>
          <F label="Famille" error={e("group")}><select value={motif.group} onChange={(event) => set({ group: event.target.value as MotifGroup })}>{(Object.entries(MOTIF_GROUPS) as Array<[MotifGroup, string]>).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></F>
          <F label="Nom" error={e("name")} full><input value={motif.name} maxLength={MOTIF_LIMITS.name} onChange={(event) => set({ name: event.target.value })} /></F>
          <F label="Description" error={e("description")} full><textarea rows={2} maxLength={MOTIF_LIMITS.description} value={motif.description ?? ""} onChange={(event) => set({ description: event.target.value || undefined })} /></F>
        </div>
      </section>

      <section className={styles.panel}>
        <h2>Trajet <span className={styles.hint}>ou tire A, B et ◆ sur le schéma</span></h2>
        <div className={styles.grid2}>
          <F label="Départ (A)" error={e("from")}><AnchorSelect value={motif.from} onChange={(from) => set({ from })} /></F>
          <F label="Arrivée (B)" error={e("to")}><AnchorSelect value={motif.to} onChange={(to) => set({ to })} /></F>
          <Range label={multi ? "Cartes par joueur" : "Cartes (aperçu, cartes décoratives)"} value={motif.count} min={1} max={MOTIF_LIMITS.count} step={1} format={String} onChange={(count) => set({ count })} error={e("count")} />
          <Range label="Décalage entre cartes" value={motif.staggerMs} min={0} max={400} step={10} format={(v) => `${v} ms`} onChange={(staggerMs) => set({ staggerMs })} error={e("staggerMs")} />
          <Range label="Durée du vol d'une carte" value={motif.durationMs} min={MOTIF_LIMITS.durationMs.min} max={2000} step={10} format={sec} onChange={(durationMs) => set({ durationMs })} error={e("durationMs")} />
          <F label="Rythme" error={e("path.timing")}>
            <select value={motif.path.timing} onChange={(event) => setPath({ timing: event.target.value as "whole" | "perSegment" })}>
              <option value="whole">Une courbe sur tout le vol</option><option value="perSegment">La courbe se rejoue à chaque segment</option>
            </select>
          </F>
          {motif.path.via.length === 0 ? (
            <>
              <Range label="Bombé de la courbe" value={Math.round(motif.path.arc.perp * 100)} min={-100} max={100} step={1} format={(v) => `${v > 0 ? "+" : ""}${v} %`} onChange={(v) => setPath({ arc: { ...motif.path.arc, perp: v / 100 } })} error={e("path.arc.perp")} />
              <Range label="Position du sommet" value={Math.round(motif.path.arc.along * 100)} min={5} max={95} step={1} format={(v) => `${v} %`} onChange={(v) => setPath({ arc: { ...motif.path.arc, along: v / 100 } })} error={e("path.arc.along")} />
            </>
          ) : (
            <label className={styles.check}><input type="checkbox" checked={motif.path.smooth} onChange={(event) => setPath({ smooth: event.target.checked })} /> Trajet lissé entre les points</label>
          )}
        </div>
        <h3>Points de passage {e("path.via") && <span className={styles.fieldError}>{e("path.via")}</span>}</h3>
        {motif.path.via.map((point, index) => (
          <div key={index} className={styles.rewardRow} style={{ display: "block", marginBottom: 6 }}>
            <div className={styles.row}><b>Point {index + 1}</b>{point.frame === "screen" && <span className={styles.hint}>repère écran (vol historique) : passe en repère trajet dès qu&apos;on le déplace</span>}<span className={styles.spacer} /><button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} onClick={() => setVia(index, null)}>✕</button></div>
            <div className={styles.grid3}>
              <Range label="Instant" value={Math.round(point.t * 100)} min={1} max={99} step={1} format={(v) => `${v} %`} onChange={(v) => setVia(index, { ...point, t: v / 100 })} error={e(`path.via.${index}.t`)} />
              {point.frame !== "screen" && <Range label="Le long du trajet" value={Math.round(point.along * 100)} min={-50} max={150} step={1} format={(v) => `${v} %`} onChange={(v) => setVia(index, { ...point, along: v / 100 })} error={e(`path.via.${index}.along`)} />}
              {point.frame !== "screen" && <Range label="Écart" value={Math.round((point.perp ?? 0) * 100)} min={-100} max={100} step={1} format={(v) => `${v} %`} onChange={(v) => setVia(index, { ...point, perp: v / 100 || undefined })} error={e(`path.via.${index}.perp`)} />}
              <Range label="Soulèvement" value={Math.round((point.rise ?? 0) * 100)} min={-100} max={100} step={1} format={(v) => `${v} %`} onChange={(v) => setVia(index, { ...point, rise: v / 100 || undefined })} error={e(`path.via.${index}.rise`)} />
            </div>
          </div>
        ))}
        <button type="button" className={`${styles.btn} ${styles.small}`} disabled={motif.path.via.length >= MOTIF_LIMITS.via} onClick={() => {
          const last = motif.path.via[motif.path.via.length - 1];
          setPath({ via: [...motif.path.via, { t: Math.min(0.95, (last?.t ?? 0) + 0.3), along: 0.5, perp: 0.2 }] });
        }}>+ Point de passage</button>
      </section>

      <section className={styles.panel}>
        <h2>Courbe de vitesse <span className={styles.hint}>tire les deux poignées</span></h2>
        <EaseSection motif={motif} clock={clock} onChange={onChange} />
        {e("path.easing") && <span className={styles.fieldError}>{e("path.easing")}</span>}
      </section>

      <section className={styles.panel}>
        <h2>Face de la carte</h2>
        <div className={styles.grid2}>
          <F label="Mode" error={e("face.mode")}>
            <select value={motif.face.mode} onChange={(event) => set({ face: event.target.value === "auto" ? { mode: "auto", window: [0.25, 0.8], easing: [0.45, 0, 0.55, 1] } : { mode: "lane" } })}>
              <option value="auto">Automatique : la face de la destination</option><option value="lane">Piste « Retournement » ci-dessous</option>
            </select>
          </F>
          {motif.face.mode === "auto" && (() => {
            const face = motif.face;
            return (
              <>
                <Range label="Début du retournement" value={Math.round(face.window[0] * 100)} min={0} max={95} step={1} format={(v) => `${v} %`} onChange={(v) => set({ face: { ...face, window: [v / 100, Math.max(v / 100 + 0.05, face.window[1])] } })} error={e("face.window")} />
                <Range label="Fin du retournement" value={Math.round(face.window[1] * 100)} min={5} max={100} step={1} format={(v) => `${v} %`} onChange={(v) => set({ face: { ...face, window: [Math.min(face.window[0], v / 100 - 0.05), v / 100] } })} />
              </>
            );
          })()}
        </div>
      </section>

      <section className={styles.panel}>
        <h2>Propriétés dans le temps <span className={styles.hint}>double-clic : ajouter un point · clic droit : retirer</span></h2>
        {LANES.map((lane) => (
          <Lane key={lane.key} motif={motif} laneKey={lane.key} label={lane.label} spec={laneSpec(lane.key, lane.step, lane.ticks, lane.snaps)} format={lane.fmt} clock={clock}
            disabled={lane.key === "flip" && auto} onChange={(points) => setLane(lane.key, points)} />
        ))}
        {e("lanes") && <span className={styles.fieldError}>{e("lanes")}</span>}
        <h3>Avancé</h3>
        {ADVANCED_LANES.map((lane) => motif.lanes[lane.key] ? (
          <div key={lane.key}>
            <Lane motif={motif} laneKey={lane.key} label={lane.label} spec={{ min: 0, max: 1, step: 0.01, ticks: [] }} format={(v) => `${Math.round(v * 100)} %`} clock={clock} onChange={(points) => setLane(lane.key, points)} />
            <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => setLane(lane.key, undefined)}>Retirer (suivre la trajectoire)</button>
          </div>
        ) : (
          <button key={lane.key} type="button" className={`${styles.btn} ${styles.small}`} style={{ marginRight: 6 }} onClick={() => setLane(lane.key, [[0, 0], [1, 1]])}>+ {lane.label}</button>
        ))}
      </section>

      <section className={styles.panel}>
        <h2>Effets pendant le vol</h2>
        <div className={styles.filters}>
          {MOTIF_TRAILS.map((trail) => <button key={trail} type="button" className={styles.chip} aria-pressed={motif.trail === trail} onClick={() => set({ trail })}>{TRAIL_LABELS[trail]}</button>)}
        </div>
        {motif.trail !== "none" && motif.trail !== "blur" && (
          <div className={styles.grid2}><Range label="Intensité de la traînée" value={motif.trailIntensity ?? 2} min={1} max={3} step={1} format={(v) => ["", "Discrète", "Normale", "Forte"][v]} onChange={(v) => set({ trailIntensity: v as 1 | 2 | 3 })} /></div>
        )}
        <label className={styles.check} style={{ marginTop: 10 }}><input type="checkbox" checked={motif.squash} onChange={(event) => set({ squash: event.target.checked })} /> Atterrissage écrasé (la carte s&apos;aplatit puis rebondit)</label>
      </section>

      <section className={styles.panel}>
        <h2>Réactions de la table <span className={styles.hint}>losanges de la ligne de temps</span></h2>
        {motif.reactions.length === 0 && <p className={styles.hint}>Aucune réaction : seule la carte bouge.</p>}
        {motif.reactions.map((reaction, index) => {
          const def = MOTIF_REACTIONS[reaction.type];
          const p = `reactions.${index}`;
          return (
            <div key={index} className={styles.rewardRow} style={{ display: "block", marginBottom: 8 }}>
              <div className={styles.row}><i style={{ width: 9, height: 9, transform: "rotate(45deg)", background: REACTION_COLORS[reaction.type], display: "inline-block" }} /><b>{def.label}</b><span className={styles.spacer} /><button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} onClick={() => setReaction(index, null)}>✕</button></div>
              <div className={styles.grid3}>
                <F label="Moment" error={e(`${p}.anchor`)}><select value={reaction.anchor} onChange={(event) => setReaction(index, { ...reaction, anchor: event.target.value as "start" | "arrival" })}><option value="start">au départ</option><option value="arrival">à l&apos;arrivée</option></select></F>
                <Range label="Décalage" value={reaction.offsetMs} min={-800} max={1500} step={10} format={(v) => `${v > 0 ? "+" : ""}${v} ms`} onChange={(offsetMs) => setReaction(index, { ...reaction, offsetMs })} error={e(`${p}.offsetMs`)} />
                <Range label="Durée" value={reaction.durationMs ?? def.durationMs} min={100} max={2000} step={10} format={sec} onChange={(durationMs) => setReaction(index, { ...reaction, durationMs })} error={e(`${p}.durationMs`)} />
                {def.placed && (
                  <F label="Où" error={e(`${p}.at`)}>
                    <select value={typeof reaction.at === "object" ? JSON.stringify(reaction.at) : reaction.at ?? "to"} onChange={(event) => setReaction(index, { ...reaction, at: event.target.value === "to" || event.target.value === "from" ? event.target.value : JSON.parse(event.target.value) as MotifAnchor })}>
                      <option value="to">À l&apos;arrivée (B)</option><option value="from">Au départ (A)</option>
                      {MOTIF_PLAYER_ZONES.flatMap((zone) => MOTIF_PLAYERS.map((player) => ({ zone, player }) as MotifAnchor)).concat(MOTIF_TABLE_ZONES.map((zone) => ({ zone }) as MotifAnchor)).map((anchor) => <option key={JSON.stringify(anchor)} value={JSON.stringify(anchor)}>{anchorLabel(anchor)}</option>)}
                    </select>
                  </F>
                )}
              </div>
              {(motif.count > 1 || multi) && <label className={styles.check}><input type="checkbox" checked={reaction.each === true} onChange={(event) => setReaction(index, { ...reaction, each: event.target.checked || undefined })} /> Pour chaque carte</label>}
            </div>
          );
        })}
        <select value="" onChange={(event) => {
          const type = event.target.value as MotifReactionType;
          if (!type) return;
          set({ reactions: [...motif.reactions, { type, anchor: "arrival", offsetMs: 0, ...(type === "avatarPulse" ? { at: { zone: "avatar", player: "self" } as MotifAnchor } : {}) }] });
        }} disabled={motif.reactions.length >= MOTIF_LIMITS.reactions} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line)", background: "#0c0906", color: "var(--ink)" }}>
          <option value="">+ Ajouter une réaction…</option>
          {(Object.entries(MOTIF_REACTIONS) as Array<[MotifReactionType, { label: string }]>).map(([type, def]) => <option key={type} value={type}>{def.label}</option>)}
        </select>
      </section>

      <section className={styles.panel}>
        <h2>Aperçu <span className={styles.hint}>données de la table de démonstration, sans effet en partie</span></h2>
        <div className={styles.grid2}>
          <F label="Carte de départ dans la main (index)" error={e("preview.pick")}><input type="number" min={0} max={11} value={motif.preview?.pick ?? ""} onChange={(event) => set({ preview: { ...motif.preview, pick: event.target.value === "" ? undefined : Number(event.target.value) } })} /></F>
          <F label="Cartes créées (ex. A♥, 7♦)" error={e("preview.cards")}><input value={(motif.preview?.cards ?? []).join(", ")} onChange={(event) => { const cards = event.target.value.split(/[,\s]+/).filter(Boolean); set({ preview: { ...motif.preview, cards: cards.length ? cards : undefined } }); }} /></F>
        </div>
      </section>
    </div>
  );
}
