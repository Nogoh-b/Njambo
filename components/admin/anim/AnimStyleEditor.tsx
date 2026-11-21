"use client";

/* Réglages d'un cosmétique « Style d'animation » (phase G5) : la liste
   blanche du style (traînée, densité, teinte, lueur, impact), un aperçu sur
   la table de démonstration avec le vrai lecteur du jeu, et « Essayer dans
   une partie » (cet onglet seulement, rien n'est enregistré). */

import { useRef, useState } from "react";
import { ChoreoDemoStage, type ChoreoDemoHandle } from "@/components/power/choreo/ChoreoDemoStage";
import { styleMomentMotif } from "@/engine/anim/moments";
import { MOTIF_TRAILS, type MotifTrail } from "@/engine/anim/motif";
import { getMomentMotif, getMotif, getStyledMomentMotif } from "@/engine/anim/registry";
import { STYLE_IMPACTS, STYLE_PREVIEW_PARAM, STYLE_TONES, encodeAnimStyle, type AnimStyle, type StyleImpact } from "@/engine/anim/style";
import type { PowerFxTone } from "@/engine/power/types";
import styles from "../AdminConsole.module.css";

const TRAIL_LABELS: Record<MotifTrail, string> = { none: "Aucune", light: "Lumineuse", sparks: "Étincelles", blur: "Flou de vitesse" };
const TONE_LABELS: Record<PowerFxTone, string> = { gold: "Or", pink: "Rose", teal: "Turquoise", cobalt: "Cobalt" };
const TONE_COLORS: Record<PowerFxTone, string> = { gold: "#f2bb45", pink: "#ff5b82", teal: "#1de4be", cobalt: "#6fa8ff" };
const IMPACT_LABELS: Record<StyleImpact, string> = { flash: "Flash lumineux", ring: "Onde d'impact", burst: "Gerbe d'étincelles" };

export function AnimStyleEditor({ style, errorFor, onChange }: { style: AnimStyle; errorFor(path: string): string | undefined; onChange(next: AnimStyle): void }) {
  const stage = useRef<ChoreoDemoHandle>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const set = <K extends keyof AnimStyle>(key: K, value: AnimStyle[K] | undefined) => {
    const next = { ...style };
    if (value === undefined) delete next[key]; else next[key] = value;
    onChange(next);
  };
  const preview = async (label: string, build: () => ReturnType<typeof getMotif>) => {
    const motif = build();
    if (!motif) return;
    setPlaying(label);
    try { await stage.current?.playMotif(motif); } finally { setPlaying(null); }
  };
  const launchBase = () => getMomentMotif("powerLaunch") ?? getMotif("launch_ability");
  const error = (key: string) => errorFor(`style.${key}`);

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }} data-testid="anim-style-editor">
      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
        <p className={styles.hint} style={{ marginTop: 0 }}>
          Le style colore les mouvements du joueur qui l&apos;équipe : sa carte jouée, son pli gagné, son pouvoir lancé. Tous les joueurs le voient.
          Il ne change jamais la durée : un impact qui dépasserait est raccourci.
        </p>
        <div className={styles.grid2}>
          <label className={`${styles.field} ${error("trail") ? styles.invalid : ""}`}><span>Traînée</span>
            <select data-testid="style-trail" value={style.trail ?? ""} onChange={(event) => set("trail", (event.target.value || undefined) as MotifTrail | undefined)}>
              <option value="">Celle du modèle</option>
              {MOTIF_TRAILS.map((trail) => <option key={trail} value={trail}>{TRAIL_LABELS[trail]}</option>)}
            </select>
            {error("trail") && <span className={styles.fieldError}>{error("trail")}</span>}
          </label>
          <label className={`${styles.field} ${error("trailIntensity") ? styles.invalid : ""}`}><span>Densité de la traînée</span>
            <select value={style.trailIntensity ?? ""} onChange={(event) => set("trailIntensity", (Number(event.target.value) || undefined) as AnimStyle["trailIntensity"])}>
              <option value="">Celle du modèle</option>
              <option value="1">Légère</option><option value="2">Moyenne</option><option value="3">Dense</option>
            </select>
          </label>
          <label className={`${styles.field} ${error("impact") ? styles.invalid : ""}`}><span>Impact à l&apos;arrivée</span>
            <select data-testid="style-impact" value={style.impact ?? ""} onChange={(event) => set("impact", (event.target.value || undefined) as StyleImpact | undefined)}>
              <option value="">Aucun en plus</option>
              {STYLE_IMPACTS.map((impact) => <option key={impact} value={impact}>{IMPACT_LABELS[impact]}</option>)}
            </select>
          </label>
          <label className={`${styles.field} ${error("glow") ? styles.invalid : ""}`}><span>Lueur en vol {style.glow !== undefined ? `(${Math.round(style.glow * 100)} %)` : "(celle du modèle)"}</span>
            <div className={styles.row} style={{ gap: 8, flexWrap: "nowrap" }}>
              <input type="checkbox" aria-label="Changer la lueur" data-testid="style-glow-on" checked={style.glow !== undefined} onChange={(event) => set("glow", event.target.checked ? 0.6 : undefined)} style={{ width: "auto", flex: "none" }} />
              <input type="range" aria-label="Lueur en vol" min={0} max={1} step={0.05} disabled={style.glow === undefined} value={style.glow ?? 0.6} onChange={(event) => set("glow", Number(event.target.value))} style={{ flex: 1, minWidth: 0 }} />
            </div>
          </label>
        </div>
        <div className={styles.field} style={{ marginTop: 10 }}><span>Teinte (traînée, lueur, réactions)</span>
          <div className={styles.row} style={{ gap: 6 }}>
            <button type="button" className={styles.chip} aria-pressed={style.tone === undefined} onClick={() => set("tone", undefined)}>Celle du jeu</button>
            {STYLE_TONES.map((tone) => (
              <button key={tone} type="button" className={styles.chip} data-testid={`style-tone-${tone}`} aria-pressed={style.tone === tone} onClick={() => set("tone", tone)}>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: TONE_COLORS[tone], marginRight: 6 }} />{TONE_LABELS[tone]}
              </button>
            ))}
          </div>
        </div>
        {errorFor("style") && <p className={styles.fieldError}>{errorFor("style")}</p>}
        <div className={styles.row} style={{ marginTop: 12, gap: 8 }}>
          <button type="button" className={`${styles.btn} ${styles.small}`} data-testid="style-preview-play" disabled={playing !== null} onClick={() => void preview("play", () => getStyledMomentMotif("play", style))}>▶ Carte jouée</button>
          <button type="button" className={`${styles.btn} ${styles.small}`} disabled={playing !== null} onClick={() => void preview("launch", () => { const base = launchBase(); return base ? styleMomentMotif("powerLaunch", base, style) : null; })}>▶ Pouvoir lancé</button>
          <button type="button" className={`${styles.btn} ${styles.small}`} data-testid="style-try" title="Ouvre le jeu dans un nouvel onglet avec ce style pour tes mouvements (rien n'est enregistré)" onClick={() => window.open(`/?${STYLE_PREVIEW_PARAM}=${encodeURIComponent(encodeAnimStyle(style))}`, "_blank")}>▶ Essayer dans une partie</button>
        </div>
      </div>
      <ChoreoDemoStage ref={stage} choreo={null} tone={style.tone ?? "gold"} width={200} />
    </div>
  );
}
