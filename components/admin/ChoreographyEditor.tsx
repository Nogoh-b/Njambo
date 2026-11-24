"use client";

/* Éditeur de chorégraphie d'une étape : ligne de temps (barres déplaçables
   et étirables), formulaire de chaque piste, choix des repères sur un schéma
   de table cliquable, aperçu sur la table de démonstration (même lecteur que
   le jeu). */

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChoreoDemoStage, type ChoreoDemoHandle } from "@/components/power/choreo/ChoreoDemoStage";
import {
  CHOREO_LIMITS, DEFAULT_V2_MODEL, EASINGS, ELEMENT_EFFECTS, SCREEN_ANCHORS, choreographyDuration,
  type Anchor, type ChoreoTrack, type Choreography, type ElementKind, type V2ZoneAnchor, type Waypoint,
} from "@/engine/power/choreography";
import { getAnimV2, listAnimsV2 } from "@/engine/anim/v2/registry";
import type { PlayerRef, PowerFxTone } from "@/engine/power/types";
import { MOTIF_GROUPS, MOTIF_PLAYERS, MOTIF_PLAYER_ZONES, MOTIF_TABLE_ZONES, OFFSCREEN_SIDES, type MotifAnchor, type MotifGroup } from "@/engine/anim/motif";
import { anchorLabel as motifAnchorLabel } from "./anim/MotifInspector";
import { getMotif, listMotifs } from "@/engine/anim/registry";
import { FX_PRESETS, PLAYER_REFS, POWER_TONES } from "@/engine/power/validate";
import { FX_PRESET_LABELS, PLAYER_LABELS, TONE_LABELS } from "./powerLabels";
import { SoundField } from "./SoundField";
import styles from "./AdminConsole.module.css";

type ErrorFor = (path: string) => string | undefined;

const KIND_LABELS: Record<ChoreoTrack["kind"], { label: string; color: string }> = {
  cardPath: { label: "Trajectoire", color: "#f2bb45" },
  v2: { label: "Modèle V2", color: "#ffa45c" },
  motif: { label: "Modèle", color: "#7ee08a" },
  element: { label: "Élément", color: "#1de4be" },
  screen: { label: "Écran", color: "#ff5b82" },
  text: { label: "Texte", color: "#c18cff" },
  sound: { label: "Son", color: "#7ab8ff" },
};
const MOTIF_ANCHOR_OPTIONS: MotifAnchor[] = [
  ...MOTIF_PLAYER_ZONES.flatMap((zone) => MOTIF_PLAYERS.map((player) => ({ zone, player }) as MotifAnchor)),
  ...MOTIF_TABLE_ZONES.map((zone) => ({ zone }) as MotifAnchor),
  ...OFFSCREEN_SIDES.map((side) => ({ zone: "offscreen", side }) as MotifAnchor),
];
const ELEMENT_LABELS: Record<ElementKind, string> ={ card: "Carte en vol", hand: "Main", deposit: "Dépôt", deck: "Pioche", timer: "Minuteur", avatar: "Avatar", pot: "Pot" };
const EFFECT_LABELS: Record<string, string> = {
  lift: "Se soulever", pulse: "Pulser", glow: "Briller", shake: "Trembler", flip: "Se retourner", crack: "Se fendre", dissolve: "Se dissoudre",
  burn: "S'enflammer", freeze: "Geler", shrink: "Rétrécir", grow: "Grandir", fanOpen: "S'ouvrir en éventail", tighten: "Se resserrer",
  veil: "Se voiler", ripple: "Vague lumineuse", suck: "Aspirer", eject: "Éjecter", seal: "Se sceller", shuffle: "Se mélanger",
  spit: "Cracher une carte", speedUp: "Accélérer", rewind: "Reculer", blink: "Clignoter", tint: "Changer de couleur",
  delta: "± secondes", auraShield: "Aura bouclier", auraMask: "Aura masque", auraTotem: "Aura totem", auraLucky: "Aura chance",
  halo: "Halo", bounce: "Rebondir", flash: "Éclat", coinRain: "Pluie de pièces", label: "Afficher un montant",
};
const SCREEN_LABELS: Record<string, string> = {
  center: "Centre de l'écran", tableCenter: "Centre de la table", top: "Haut", bottom: "Bas", left: "Gauche", right: "Droite",
  offTop: "Hors-écran (haut)", offBottom: "Hors-écran (bas)", offLeft: "Hors-écran (gauche)", offRight: "Hors-écran (droite)",
};
const EASING_LABELS: Record<string, string> = { linear: "Linéaire", smooth: "Douce", accelerate: "Accélère", decelerate: "Ralentit", bounce: "Rebond", elastic: "Élastique", back: "Dépassement" };

export function anchorLabel(anchor: Anchor): string {
  const offset = anchor.dx || anchor.dy ? ` (${anchor.dx ?? 0} %, ${anchor.dy ?? 0} %)` : "";
  if (anchor.kind === "card") return `Position de la carte${offset}`;
  if (anchor.kind === "screen") return `${SCREEN_LABELS[anchor.at]}${offset}`;
  const zone = { hand: "Main", deposit: "Dépôt", timer: "Minuteur", deck: "Pioche", pot: "Pot", reveal: "Révélation" }[anchor.zone];
  return `${zone}${"player" in anchor ? ` · ${PLAYER_LABELS[anchor.player]}` : ""}${offset}`;
}

/* ─────────────── Schéma de table cliquable ─────────────── */

type Spot = { anchor: Anchor; x: number; y: number; label: string };
const SPOTS: Spot[] = [
  { anchor: { kind: "zone", zone: "hand", player: "self" }, x: 50, y: 88, label: "Ma main" },
  { anchor: { kind: "zone", zone: "deposit", player: "self" }, x: 50, y: 74, label: "Mon dépôt" },
  { anchor: { kind: "zone", zone: "timer", player: "self" }, x: 50, y: 97, label: "Mon minuteur" },
  { anchor: { kind: "zone", zone: "hand", player: "target" }, x: 50, y: 14, label: "Main de la cible" },
  { anchor: { kind: "zone", zone: "deposit", player: "target" }, x: 50, y: 25, label: "Dépôt de la cible" },
  { anchor: { kind: "zone", zone: "timer", player: "target" }, x: 50, y: 5, label: "Minuteur de la cible" },
  { anchor: { kind: "zone", zone: "hand", player: "all_opponents" }, x: 12, y: 44, label: "Mains des adversaires" },
  { anchor: { kind: "zone", zone: "deck" }, x: 40, y: 46, label: "Pioche" },
  { anchor: { kind: "zone", zone: "pot" }, x: 62, y: 46, label: "Pot" },
  { anchor: { kind: "screen", at: "center" }, x: 50, y: 52, label: "Centre de l'écran" },
  { anchor: { kind: "screen", at: "top" }, x: 80, y: 12, label: "Haut de l'écran" },
  { anchor: { kind: "screen", at: "offTop" }, x: 50, y: -4, label: "Hors-écran (haut)" },
  { anchor: { kind: "screen", at: "offBottom" }, x: 50, y: 104, label: "Hors-écran (bas)" },
  { anchor: { kind: "screen", at: "offLeft" }, x: -5, y: 50, label: "Hors-écran (gauche)" },
  { anchor: { kind: "screen", at: "offRight" }, x: 105, y: 50, label: "Hors-écran (droite)" },
];
const sameAnchor = (a: Anchor, b: Anchor) => a.kind === b.kind && JSON.stringify({ ...a, dx: 0, dy: 0 }) === JSON.stringify({ ...b, dx: 0, dy: 0 });

function TableSchema({ value, onPick }: { value: Anchor; onPick: (anchor: Anchor) => void }) {
  return (
    <div style={{ position: "relative", width: 120, height: 200, margin: "8px 14px", borderRadius: 16, background: "radial-gradient(ellipse at 50% 46%, #1f6b4f, #0c2a20 70%)", border: "2px solid #3a2b1b", flex: "none" }}>
      {SPOTS.map((spot) => {
        const active = sameAnchor(spot.anchor, value);
        return (
          <button key={spot.label} type="button" title={spot.label} aria-label={spot.label} aria-pressed={active}
            onClick={() => onPick({ ...spot.anchor, ...(value.dx ? { dx: value.dx } : {}), ...(value.dy ? { dy: value.dy } : {}) })}
            style={{ position: "absolute", left: `${spot.x}%`, top: `${spot.y}%`, transform: "translate(-50%, -50%)", width: active ? 16 : 11, height: active ? 16 : 11, borderRadius: "50%", padding: 0, cursor: "pointer",
              border: "2px solid #fff6df", background: active ? "#f2bb45" : spot.anchor.kind === "screen" ? "#ff5b82" : "#1de4be", boxShadow: active ? "0 0 10px #f2bb45" : "none" }} />
        );
      })}
    </div>
  );
}

function AnchorField({ label, value, onChange, errorFor, path, allowCard = false }: { label: string; value: Anchor; onChange: (anchor: Anchor) => void; errorFor: ErrorFor; path: string; allowCard?: boolean }) {
  const [open, setOpen] = useState(false);
  const error = errorFor(path) ?? errorFor(`${path}.at`) ?? errorFor(`${path}.player`) ?? errorFor(`${path}.dx`) ?? errorFor(`${path}.dy`);
  const zoneWithPlayer = value.kind === "zone" && "player" in value;
  return (
    <div className={`${styles.field} ${error ? styles.invalid : ""}`}>
      <span>{label}</span>
      <div className={styles.row} style={{ alignItems: "center" }}>
        <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => setOpen((o) => !o)}>📍 {anchorLabel(value)}</button>
      </div>
      {open && (
        <div className={styles.row} style={{ alignItems: "flex-start", padding: 8, background: "#0c0906", borderRadius: 10 }}>
          <TableSchema value={value} onPick={onChange} />
          <div style={{ display: "grid", gap: 8, flex: "1 1 200px" }}>
            <select value={value.kind === "zone" ? `zone:${value.zone}` : value.kind === "screen" ? `screen:${value.at}` : "card"} onChange={(e) => {
              const [kind, rest] = e.target.value.split(":");
              const keep = { ...(value.dx ? { dx: value.dx } : {}), ...(value.dy ? { dy: value.dy } : {}) };
              if (kind === "card") onChange({ kind: "card", ...keep });
              else if (kind === "screen") onChange({ kind: "screen", at: rest as never, ...keep });
              else if (["hand", "deposit", "timer"].includes(rest)) onChange({ kind: "zone", zone: rest as "hand", player: zoneWithPlayer ? (value as { player: PlayerRef }).player : "self", ...keep });
              else onChange({ kind: "zone", zone: rest as "deck", ...keep });
            }}>
              <optgroup label="Zones de la table">
                <option value="zone:hand">Main</option><option value="zone:deposit">Dépôt</option><option value="zone:timer">Minuteur / avatar</option>
                <option value="zone:deck">Pioche</option><option value="zone:pot">Pot</option><option value="zone:reveal">Fenêtre de révélation</option>
              </optgroup>
              <optgroup label="Écran">{SCREEN_ANCHORS.map((at) => <option key={at} value={`screen:${at}`}>{SCREEN_LABELS[at]}</option>)}</optgroup>
              {allowCard && <option value="card">Rester où est la carte</option>}
            </select>
            {zoneWithPlayer && (
              <select value={(value as { player: PlayerRef }).player} onChange={(e) => onChange({ ...value, player: e.target.value as PlayerRef } as Anchor)}>
                {PLAYER_REFS.map((ref) => <option key={ref} value={ref}>{PLAYER_LABELS[ref]}</option>)}
              </select>
            )}
            <label className={styles.hint}>Décalage horizontal : {value.dx ?? 0} %<input type="range" min={-50} max={50} value={value.dx ?? 0} onChange={(e) => onChange({ ...value, dx: Number(e.target.value) || undefined })} /></label>
            <label className={styles.hint}>Décalage vertical : {value.dy ?? 0} %<input type="range" min={-50} max={50} value={value.dy ?? 0} onChange={(e) => onChange({ ...value, dy: Number(e.target.value) || undefined })} /></label>
          </div>
        </div>
      )}
      {error && <span className={styles.fieldError}>{error}</span>}
    </div>
  );
}

function F({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <label className={`${styles.field} ${error ? styles.invalid : ""}`}><span>{label}</span>{children}{error && <span className={styles.fieldError}>{error}</span>}</label>;
}
const seconds = (ms: number | undefined) => ((ms ?? 0) / 1000).toString();
const ms = (value: string) => Math.max(0, Math.round(Number(value) * 1000) || 0);

function ToneSelect({ value, onChange }: { value: PowerFxTone | undefined; onChange: (tone: PowerFxTone | undefined) => void }) {
  return <select value={value ?? ""} onChange={(e) => onChange((e.target.value || undefined) as PowerFxTone | undefined)}><option value="">Teinte de la carte</option>{POWER_TONES.map((tone) => <option key={tone} value={tone}>{TONE_LABELS[tone]}</option>)}</select>;
}

/* ─────────────── Formulaire d'une piste ─────────────── */

function TrackForm({ track, tracks, onChange, errorFor, path }: { track: ChoreoTrack; tracks: ChoreoTrack[]; onChange: (track: ChoreoTrack) => void; errorFor: ErrorFor; path: string }) {
  const e = (key: string) => errorFor(`${path}.${key}`);
  const timing = (
    <>
      <F label="Départ (s)" error={e("startMs")}><input type="number" min={0} max={8} step={0.05} value={seconds(track.startMs)} onChange={(ev) => onChange({ ...track, startMs: ms(ev.target.value) })} /></F>
      <F label="Durée (s)" error={e("durationMs")}><input type="number" min={0} max={8} step={0.05} value={seconds(track.durationMs)} onChange={(ev) => onChange({ ...track, durationMs: ms(ev.target.value) })} /></F>
    </>
  );
  switch (track.kind) {
    case "cardPath": {
      const setPoint = (index: number, point: Waypoint) => onChange({ ...track, waypoints: track.waypoints.map((item, i) => (i === index ? point : item)) });
      return (
        <div>
          <div className={styles.grid3}>
            {timing}
            <F label="Cartes" error={e("cards")}>
              <select value={track.cards} onChange={(ev) => onChange({ ...track, cards: ev.target.value as typeof track.cards, ...(ev.target.value === "ghost" ? { mode: "display" as const } : {}) })}>
                <option value="resolved:outgoing">Cartes qui partent</option><option value="resolved:incoming">Cartes qui arrivent</option>
                <option value="resolved:highlight">Carte mise en valeur</option><option value="ghost">Carte fantôme (décor)</option>
              </select>
            </F>
            <F label="Nature" error={e("mode")}><select value={track.mode} disabled={track.cards === "ghost"} onChange={(ev) => onChange({ ...track, mode: ev.target.value as "move" | "display" })}><option value="move">Accompagne un vrai déplacement</option><option value="display">Purement visuelle</option></select></F>
            <F label="Courbe" error={e("easing")}><select value={track.easing} onChange={(ev) => onChange({ ...track, easing: ev.target.value as typeof track.easing })}>{EASINGS.map((easing) => <option key={easing} value={easing}>{EASING_LABELS[easing]}</option>)}</select></F>
            <F label={`Bombé : ${track.arc ?? 0}`} error={e("arc")}><input type="range" min={-100} max={100} value={track.arc ?? 0} onChange={(ev) => onChange({ ...track, arc: Number(ev.target.value) || undefined })} /></F>
            <F label="Traînée" error={e("trail")}><select value={track.trail ?? ""} onChange={(ev) => onChange({ ...track, trail: (ev.target.value || undefined) as never })}><option value="">Aucune</option>{FX_PRESETS.map((preset) => <option key={preset} value={preset}>{FX_PRESET_LABELS[preset]}</option>)}</select></F>
            <F label="Décalage entre cartes (s)" error={e("staggerMs")}><input type="number" min={0} max={1} step={0.05} value={seconds(track.staggerMs)} onChange={(ev) => onChange({ ...track, staggerMs: ms(ev.target.value) || undefined })} /></F>
          </div>
          <h3>Points de passage {e("waypoints") && <span className={styles.fieldError}>{e("waypoints")}</span>}</h3>
          {track.waypoints.map((point, index) => (
            <div key={index} className={styles.rewardRow} style={{ display: "block" }}>
              <div className={styles.row} style={{ alignItems: "flex-start" }}>
                <strong style={{ minWidth: 70 }}>{index === 0 ? "Départ" : index === track.waypoints.length - 1 ? "Arrivée" : `Étape ${index}`}</strong>
                <div style={{ flex: 1, minWidth: 0 }}><AnchorField label="Repère" value={point.at} errorFor={errorFor} path={`${path}.waypoints.${index}.at`} allowCard={index > 0} onChange={(at) => setPoint(index, { ...point, at })} /></div>
                <button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} disabled={track.waypoints.length <= 2} onClick={() => onChange({ ...track, waypoints: track.waypoints.filter((_, i) => i !== index) })}>✕</button>
              </div>
              <div className={styles.grid3} style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginTop: 6 }}>
                <F label="Pause (s)" error={e(`waypoints.${index}.holdMs`)}><input type="number" min={0} max={3} step={0.1} value={seconds(point.holdMs)} onChange={(ev) => setPoint(index, { ...point, holdMs: ms(ev.target.value) || undefined })} /></F>
                <F label="Échelle" error={e(`waypoints.${index}.scale`)}><input type="number" min={0.3} max={3} step={0.1} value={point.scale ?? 1} onChange={(ev) => setPoint(index, { ...point, scale: Number(ev.target.value) === 1 ? undefined : Number(ev.target.value) })} /></F>
                <F label="Rotation (°)" error={e(`waypoints.${index}.rotate`)}><input type="number" min={-720} max={720} step={15} value={point.rotate ?? 0} onChange={(ev) => setPoint(index, { ...point, rotate: Number(ev.target.value) || undefined })} /></F>
                <F label="Face"><select value={point.face ?? ""} onChange={(ev) => setPoint(index, { ...point, face: (ev.target.value || undefined) as Waypoint["face"] })}><option value="">Inchangée</option><option value="up">Visible</option><option value="down">Cachée</option></select></F>
              </div>
            </div>
          ))}
          <button type="button" className={`${styles.btn} ${styles.small}`} disabled={track.waypoints.length >= CHOREO_LIMITS.waypoints} onClick={() => {
            const waypoints = [...track.waypoints];
            waypoints.splice(waypoints.length - 1, 0, { at: { kind: "screen", at: "center" }, holdMs: 300 });
            onChange({ ...track, waypoints });
          }}>+ Point de passage</button>
        </div>
      );
    }
    case "v2": {
      const zoneValue = (zone: V2ZoneAnchor) => ("player" in zone ? `${zone.zone}:${zone.player}` : zone.zone);
      const zoneOf = (value: string): V2ZoneAnchor => {
        const [zone, player] = value.split(":");
        return player ? { zone: zone as "hand", player: player as PlayerRef } : { zone: zone as "deck" };
      };
      const zoneSelect = (key: "from" | "to", label: string) => (
        <F label={label} error={e(`${key}.zone`) ?? e(`${key}.player`)}>
          <select value={zoneValue(track[key])} onChange={(ev) => onChange({ ...track, [key]: zoneOf(ev.target.value) })}>
            {(["hand", "deposit"] as const).flatMap((zone) => PLAYER_REFS.map((ref) => <option key={`${zone}:${ref}`} value={`${zone}:${ref}`}>{zone === "hand" ? "Main" : "Dépôt"} · {PLAYER_LABELS[ref]}</option>))}
            <option value="deck">Pioche</option><option value="pot">Pot</option>
          </select>
        </F>
      );
      const present = track.present;
      const setPresent = (patch: Partial<NonNullable<typeof present>>) => onChange({ ...track, present: { holdMs: 600, dy: -14, scale: 1.4, ...present, ...patch } });
      return (
        <div className={styles.grid3}>
          <F label="Modèle V2" error={e("model")}>
            <select value={track.model ?? ""} onChange={(ev) => onChange({ ...track, model: ev.target.value || undefined, durationMs: getAnimV2(ev.target.value || DEFAULT_V2_MODEL)?.motion.durationMs ?? track.durationMs })}>
              <option value="">Celui de la carte (onglet Animation)</option>
              {listAnimsV2().map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
          </F>
          {timing}
          <F label="Cartes" error={e("cards")}>
            <select value={track.cards} onChange={(ev) => onChange({ ...track, cards: ev.target.value as typeof track.cards })}>
              <option value="resolved:outgoing">Cartes qui partent</option><option value="resolved:incoming">Cartes qui arrivent</option>
            </select>
          </F>
          {zoneSelect("from", "Départ")}
          {zoneSelect("to", "Arrivée")}
          <F label="Réorganiser les mains" error={e("reflow")}>
            <select value={track.reflow === false ? "no" : "yes"} onChange={(ev) => onChange({ ...track, reflow: ev.target.value === "no" ? false : undefined })}>
              <option value="yes">Oui</option><option value="no">Non (échange : la carte reprend la place vide)</option>
            </select>
          </F>
          <F label="Présentation au départ">
            <select value={present ? "yes" : "no"} onChange={(ev) => onChange({ ...track, present: ev.target.value === "yes" ? { holdMs: 600, dy: -14, scale: 1.4 } : undefined })}>
              <option value="no">Non : vol direct</option><option value="yes">Oui : se lève, se retourne, attend</option>
            </select>
          </F>
          {present && <F label="Pause (s)" error={e("present.holdMs")}><input type="number" min={0} max={3} step={0.1} value={seconds(present.holdMs)} onChange={(ev) => setPresent({ holdMs: ms(ev.target.value) })} /></F>}
          {present && <F label="Hauteur (% de l'écran)" error={e("present.dy")}><input type="number" min={-50} max={50} step={1} value={present.dy ?? 0} onChange={(ev) => setPresent({ dy: Number(ev.target.value) || undefined })} /></F>}
          {present && <F label="Taille" error={e("present.scale")}><input type="number" min={0.5} max={3} step={0.1} value={present.scale ?? 1} onChange={(ev) => setPresent({ scale: Number(ev.target.value) || undefined })} /></F>}
          <p className={`${styles.hint} ${styles.full}`}>Vrai déplacement animé par un modèle V2 : les zones donnent la place exacte (taille, inclinaison), le modèle le mouvement. La durée affichée est celle du modèle.</p>
        </div>
      );
    }
    case "motif": {
      const motif = getMotif(track.motifId);
      const groups = Object.entries(MOTIF_GROUPS) as Array<[MotifGroup, string]>;
      const overrides = track.overrides ?? {};
      // Surcharges : ce que la carte change au modèle (le reste suit l'atelier, y compris ses futures publications).
      const setOverride = (patch: Partial<NonNullable<typeof track.overrides>>) => {
        const next = { ...overrides, ...patch } as Record<string, unknown>;
        for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
        onChange({ ...track, overrides: Object.keys(next).length ? next as typeof track.overrides : undefined });
      };
      const anchorField = (key: "from" | "to", label: string) => (
        <F label={label} error={e(`overrides.${key}`)}>
          <select value={overrides[key] ? JSON.stringify(overrides[key]) : ""} onChange={(ev) => setOverride({ [key]: ev.target.value ? JSON.parse(ev.target.value) as MotifAnchor : undefined })}>
            <option value="">Celui du modèle{motif ? ` (${motifAnchorLabel(motif[key])})` : ""}</option>
            {MOTIF_ANCHOR_OPTIONS.map((anchor) => <option key={JSON.stringify(anchor)} value={JSON.stringify(anchor)}>{motifAnchorLabel(anchor)}</option>)}
          </select>
        </F>
      );
      return (
        <div className={styles.grid3}>
          <F label="Modèle d'animation" error={e("motifId")}>
            <select value={track.motifId} onChange={(ev) => onChange({ ...track, motifId: ev.target.value, durationMs: getMotif(ev.target.value)?.durationMs ?? track.durationMs })}>
              {groups.map(([group, label]) => {
                const items = listMotifs().filter((item) => item.group === group || item.id === track.motifId);
                return items.length ? <optgroup key={group} label={label}>{items.filter((item) => item.group === group).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup> : null;
              })}
            </select>
          </F>
          {timing}
          <F label="Cartes" error={e("cards")}>
            <select value={track.cards} onChange={(ev) => onChange({ ...track, cards: ev.target.value as typeof track.cards, ...(ev.target.value === "ghost" ? { mode: "display" as const } : {}) })}>
              <option value="resolved:outgoing">Cartes qui partent</option><option value="resolved:incoming">Cartes qui arrivent</option>
              <option value="resolved:highlight">Carte mise en valeur</option><option value="ghost">Cartes décoratives</option>
            </select>
          </F>
          <F label="Nature" error={e("mode")}><select value={track.mode} disabled={track.cards === "ghost"} onChange={(ev) => onChange({ ...track, mode: ev.target.value as "move" | "display" })}><option value="move">Accompagne un vrai déplacement</option><option value="display">Purement visuelle</option></select></F>
          {motif && <p className={`${styles.hint} ${styles.full}`}>{motif.description} La durée ci-dessus est celle du vol d&apos;une carte. Le reste du modèle se règle dans la section Animations : ses publications s&apos;appliquent aussi à cette carte.</p>}
          <h3 className={styles.full} style={{ margin: "6px 0 0" }}>Surcharges pour cette carte</h3>
          {anchorField("from", "Départ")}
          {anchorField("to", "Arrivée")}
          <F label="Décalage entre cartes (s)" error={e("overrides.staggerMs")}><input type="number" min={0} max={1} step={0.05} value={overrides.staggerMs === undefined ? "" : seconds(overrides.staggerMs)} placeholder={motif ? seconds(motif.staggerMs) : ""} onChange={(ev) => setOverride({ staggerMs: ev.target.value === "" ? undefined : ms(ev.target.value) })} /></F>
          <F label="Traînée" error={e("overrides.trail")}>
            <select value={overrides.trail ?? ""} onChange={(ev) => setOverride({ trail: (ev.target.value || undefined) as never })}>
              <option value="">Celle du modèle</option><option value="none">Aucune</option><option value="light">Traînée lumineuse</option><option value="sparks">Étincelles</option><option value="blur">Flou de vitesse</option>
            </select>
          </F>
          <F label="Atterrissage écrasé" error={e("overrides.squash")}>
            <select value={overrides.squash === undefined ? "" : String(overrides.squash)} onChange={(ev) => setOverride({ squash: ev.target.value === "" ? undefined : ev.target.value === "true" })}>
              <option value="">Comme le modèle</option><option value="true">Oui</option><option value="false">Non</option>
            </select>
          </F>
          {track.overrides && <div className={styles.full}><button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => onChange({ ...track, overrides: undefined })}>Retirer toutes les surcharges</button></div>}
          {e("overrides") && <span className={`${styles.fieldError} ${styles.full}`}>{e("overrides")}</span>}
        </div>
      );
    }
    case "element": {
      const element = track.target.element as ElementKind;
      const paths = tracks.filter((item) => item.kind === "cardPath" || item.kind === "motif");
      return (
        <div className={styles.grid3}>
          {timing}
          <F label="Élément" error={e("target")}>
            <select value={element} onChange={(ev) => {
              const next = ev.target.value as ElementKind;
              const target = next === "card" ? { element: "card" as const, trackId: paths[0]?.id ?? "" } : next === "deck" || next === "pot" ? { element: next } : { element: next, player: ("player" in track.target ? track.target.player : "target") as PlayerRef };
              onChange({ ...track, target, effect: ELEMENT_EFFECTS[next][0] } as ChoreoTrack);
            }}>
              {(Object.keys(ELEMENT_EFFECTS) as ElementKind[]).map((kind) => <option key={kind} value={kind}>{ELEMENT_LABELS[kind]}</option>)}
            </select>
          </F>
          {"player" in track.target && (
            <F label="De quel joueur" error={e("target.player")}><select value={track.target.player} onChange={(ev) => onChange({ ...track, target: { ...track.target, player: ev.target.value as PlayerRef } } as ChoreoTrack)}>{PLAYER_REFS.map((ref) => <option key={ref} value={ref}>{PLAYER_LABELS[ref]}</option>)}</select></F>
          )}
          {track.target.element === "card" && (
            <F label="Carte de la trajectoire" error={e("target.trackId")}><select value={track.target.trackId} onChange={(ev) => onChange({ ...track, target: { element: "card", trackId: ev.target.value } })}><option value="">—</option>{paths.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select></F>
          )}
          <F label="Animation" error={e("effect")}><select value={track.effect} onChange={(ev) => onChange({ ...track, effect: ev.target.value as never })}>{ELEMENT_EFFECTS[element].map((effect) => <option key={effect} value={effect}>{EFFECT_LABELS[effect] ?? effect}</option>)}</select></F>
          <F label="Intensité"><select value={track.intensity ?? 2} onChange={(ev) => onChange({ ...track, intensity: Number(ev.target.value) as 1 | 2 | 3 })}><option value={1}>Discrète</option><option value={2}>Normale</option><option value={3}>Spectaculaire</option></select></F>
          <F label="Teinte"><ToneSelect value={track.tone} onChange={(tone) => onChange({ ...track, tone })} /></F>
          {(track.effect === "delta" || track.effect === "label" || track.effect === "flash") && <F label="Texte (ex. −3 s, ×2)" error={e("label")}><input value={track.label ?? ""} maxLength={12} onChange={(ev) => onChange({ ...track, label: ev.target.value || undefined })} /></F>}
        </div>
      );
    }
    case "screen":
      return (
        <div className={styles.grid3}>
          {timing}
          <F label="Effet" error={e("effect")}><select value={track.effect} onChange={(ev) => onChange({ ...track, effect: ev.target.value as typeof track.effect })}><option value="flash">Flash</option><option value="shake">Tremblement</option><option value="darken">Assombrir</option><option value="particles">Particules</option></select></F>
          <F label="Intensité"><select value={track.intensity ?? 2} onChange={(ev) => onChange({ ...track, intensity: Number(ev.target.value) as 1 | 2 | 3 })}><option value={1}>Discrète</option><option value={2}>Normale</option><option value={3}>Spectaculaire</option></select></F>
          <F label="Teinte"><ToneSelect value={track.tone} onChange={(tone) => onChange({ ...track, tone })} /></F>
          {track.effect === "particles" && <F label="Particules"><select value={track.preset ?? "mystic"} onChange={(ev) => onChange({ ...track, preset: ev.target.value as never })}>{FX_PRESETS.map((preset) => <option key={preset} value={preset}>{FX_PRESET_LABELS[preset]}</option>)}</select></F>}
          {track.effect === "particles" && <div className={styles.full}><AnchorField label="Où" value={track.at ?? { kind: "screen", at: "center" }} errorFor={errorFor} path={`${path}.at`} onChange={(at) => onChange({ ...track, at })} /></div>}
        </div>
      );
    case "text":
      return (
        <div className={styles.grid3}>
          {timing}
          <F label="Texte ({activator}, {target})" error={e("text")}><input value={track.text} maxLength={60} onChange={(ev) => onChange({ ...track, text: ev.target.value })} /></F>
          <F label="Taille"><select value={track.size ?? "m"} onChange={(ev) => onChange({ ...track, size: ev.target.value as "s" | "m" | "l" })}><option value="s">Petit</option><option value="m">Moyen</option><option value="l">Grand</option></select></F>
          <F label="Teinte"><ToneSelect value={track.tone} onChange={(tone) => onChange({ ...track, tone })} /></F>
          <div className={styles.full}><AnchorField label="Position" value={track.at} errorFor={errorFor} path={`${path}.at`} onChange={(at) => onChange({ ...track, at })} /></div>
        </div>
      );
    case "sound":
      return (
        <div className={styles.grid3}>
          <F label="Départ (s)" error={e("startMs")}><input type="number" min={0} max={8} step={0.05} value={seconds(track.startMs)} onChange={(ev) => onChange({ ...track, startMs: ms(ev.target.value) })} /></F>
          <div className={styles.full}>
            <SoundField label="Son" value={track.sound || undefined} volume={track.volume ?? 1} allowNone={false} error={e("sound") ?? e("volume")}
              onChange={(sound) => onChange({ ...track, sound: sound ?? "preset:pouvoir" })} onVolume={(volume) => onChange({ ...track, volume })} />
          </div>
        </div>
      );
  }
}

/* ─────────────── Ligne de temps ─────────────── */

function newTrack(kind: ChoreoTrack["kind"], tracks: ChoreoTrack[], at: number): ChoreoTrack {
  let n = tracks.length + 1;
  while (tracks.some((track) => track.id === `t${n}`)) n += 1;
  const id = `t${n}`;
  switch (kind) {
    case "cardPath": return { id, kind, startMs: at, durationMs: 800, cards: "resolved:outgoing", mode: "display", easing: "smooth", arc: 25, waypoints: [{ at: { kind: "zone", zone: "hand", player: "target" } }, { at: { kind: "zone", zone: "hand", player: "self" } }] };
    case "v2": return { id, kind, startMs: at, durationMs: getAnimV2(DEFAULT_V2_MODEL)?.motion.durationMs ?? 700, cards: "resolved:outgoing", from: { zone: "hand", player: "self" }, to: { zone: "deck" } };
    case "element": return { id, kind, startMs: at, durationMs: 700, target: { element: "timer", player: "target" }, effect: "shake", intensity: 2 };
    case "screen": return { id, kind, startMs: at, durationMs: 300, effect: "flash", intensity: 2 };
    case "text": return { id, kind, startMs: at, durationMs: 1200, text: "{activator} frappe !", at: { kind: "screen", at: "tableCenter", dy: -10 }, size: "m" };
    case "sound": return { id, kind, startMs: at, durationMs: 0, sound: "preset:tambour", volume: 1 };
    case "motif": return { id, kind, startMs: at, durationMs: getMotif("hand_give")?.durationMs ?? 760, motifId: "hand_give", cards: "resolved:outgoing", mode: "display" };
  }
}

export function ChoreographyEditor({ choreo, onChange, errorFor, path, tone }: { choreo: Choreography; onChange: (choreo: Choreography) => void; errorFor: ErrorFor; path: string; tone: PowerFxTone }) {
  const [selected, setSelected] = useState<string | null>(choreo.tracks[0]?.id ?? null);
  const stage = useRef<ChoreoDemoHandle>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const total = Math.max(3000, Math.ceil((choreographyDuration(choreo) + 600) / 1000) * 1000);
  const setTrack = (id: string, next: ChoreoTrack) => onChange({ tracks: choreo.tracks.map((track) => (track.id === id ? next : track)) });

  const drag = (event: ReactPointerEvent, track: ChoreoTrack, mode: "move" | "resize") => {
    event.preventDefault();
    event.stopPropagation();
    setSelected(track.id);
    const lane = laneRef.current?.getBoundingClientRect();
    if (!lane) return;
    const startX = event.clientX;
    const origin = { startMs: track.startMs, durationMs: track.durationMs };
    const onMove = (move: PointerEvent) => {
      const deltaMs = Math.round((((move.clientX - startX) / lane.width) * total) / 50) * 50;
      if (mode === "move") setTrack(track.id, { ...track, startMs: Math.max(0, Math.min(CHOREO_LIMITS.totalMs - track.durationMs, origin.startMs + deltaMs)) });
      else setTrack(track.id, { ...track, durationMs: Math.max(50, Math.min(CHOREO_LIMITS.totalMs - track.startMs, origin.durationMs + deltaMs)) });
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const current = choreo.tracks.find((track) => track.id === selected) ?? null;
  const currentIndex = current ? choreo.tracks.indexOf(current) : -1;
  return (
    <div className={styles.previewWrap} style={{ alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 520px", minWidth: 0 }}>
        <div className={styles.row} style={{ marginBottom: 8 }}>
          {(Object.keys(KIND_LABELS) as ChoreoTrack["kind"][]).map((kind) => (
            <button key={kind} type="button" className={`${styles.btn} ${styles.small}`} disabled={choreo.tracks.length >= CHOREO_LIMITS.tracks} onClick={() => {
              const track = newTrack(kind, choreo.tracks, current ? current.startMs : 0);
              onChange({ tracks: [...choreo.tracks, track] });
              setSelected(track.id);
            }}>+ {KIND_LABELS[kind].label}</button>
          ))}
        </div>
        {errorFor(`${path}.tracks`) && <span className={styles.fieldError}>{errorFor(`${path}.tracks`)}</span>}
        {/* Règle de temps */}
        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 6, fontSize: 11 }}>
          <span />
          <div style={{ position: "relative", height: 16, color: "#8f7a58" }}>
            {Array.from({ length: total / 500 + 1 }, (_, i) => <span key={i} style={{ position: "absolute", left: `${(i * 500 / total) * 100}%`, transform: "translateX(-50%)" }}>{i % 2 === 0 ? `${i / 2}s` : "·"}</span>)}
          </div>
          {choreo.tracks.map((track, index) => {
            const hasError = Boolean(errorFor(`${path}.tracks.${index}`)) || [...Object.keys(track)].some((key) => errorFor(`${path}.tracks.${index}.${key}`));
            const meta = KIND_LABELS[track.kind];
            const holds = track.kind === "cardPath" ? track.waypoints.reduce((sum, point) => sum + (point.holdMs ?? 0), 0) : 0;
            const width = Math.max(1.5, ((track.durationMs + holds) / total) * 100);
            return [
              <button key={`${track.id}-label`} type="button" onClick={() => setSelected(track.id)} style={{ textAlign: "left", padding: "4px 6px", borderRadius: 6, border: `1px solid ${selected === track.id ? meta.color : "transparent"}`, background: "#0c0906", color: hasError ? "#ff7b6b" : "#fff6df", font: "inherit", fontSize: 12, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <b style={{ color: meta.color }}>{meta.label}</b> · {track.id}{track.kind === "element" ? ` · ${EFFECT_LABELS[track.effect] ?? track.effect}` : track.kind === "text" ? ` · ${track.text}` : ""}
              </button>,
              <div key={`${track.id}-lane`} ref={index === 0 ? laneRef : undefined} style={{ position: "relative", height: 26, background: "#0c0906", borderRadius: 6 }}>
                <div onPointerDown={(event) => drag(event, track, "move")} title="Glisser pour déplacer"
                  style={{ position: "absolute", top: 3, bottom: 3, left: `${(track.startMs / total) * 100}%`, width: `${width}%`, minWidth: 8, borderRadius: 5, cursor: "grab", touchAction: "none",
                    background: `${meta.color}${selected === track.id ? "" : "aa"}`, boxShadow: selected === track.id ? `0 0 0 2px #fff6df` : "none", outline: hasError ? "2px solid #ff7b6b" : "none" }}>
                  {track.kind !== "sound" && <span onPointerDown={(event) => drag(event, track, "resize")} title="Étirer pour changer la durée" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", background: "rgba(0,0,0,.25)", borderRadius: "0 5px 5px 0" }} />}
                </div>
              </div>,
            ];
          })}
        </div>
        {current && (
          <div className={styles.stageCard} style={{ marginTop: 12 }}>
            <div className={styles.stageHead}>
              <strong style={{ color: KIND_LABELS[current.kind].color }}>{KIND_LABELS[current.kind].label}</strong>
              <F label="Identifiant" error={errorFor(`${path}.tracks.${currentIndex}.id`)}><input value={current.id} maxLength={24} onChange={(e) => {
                const id = e.target.value.replace(/[^a-z0-9_]/gi, "_");
                onChange({ tracks: choreo.tracks.map((track) => track.id === current.id ? { ...track, id } : track.kind === "element" && track.target.element === "card" && track.target.trackId === current.id ? { ...track, target: { element: "card", trackId: id } } : track) });
                setSelected(id);
              }} /></F>
              <span className={styles.spacer} />
              <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => { const copy = { ...structuredClone(current), id: `${current.id}_b` }; onChange({ tracks: [...choreo.tracks, copy] }); setSelected(copy.id); }}>Dupliquer</button>
              <button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} onClick={() => { onChange({ tracks: choreo.tracks.filter((track) => track.id !== current.id) }); setSelected(null); }}>Supprimer</button>
            </div>
            <TrackForm track={current} tracks={choreo.tracks} errorFor={errorFor} path={`${path}.tracks.${currentIndex}`} onChange={(next) => { setTrack(current.id, next); if (next.id !== current.id) setSelected(next.id); }} />
          </div>
        )}
      </div>
      <aside style={{ flex: "0 0 auto", display: "grid", gap: 8, justifyItems: "center", position: "sticky", top: 16 }}>
        <ChoreoDemoStage ref={stage} choreo={choreo} tone={tone} width={260} />
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => void stage.current?.play()}>▶ Rejouer l’aperçu</button>
        <span className={styles.hint} style={{ maxWidth: 260, textAlign: "center" }}>Table de démonstration : « la cible » est en haut, toi en bas. Durée : {(choreographyDuration(choreo) / 1000).toFixed(2)} s</span>
      </aside>
    </div>
  );
}
