"use client";

/* Éditeur d'un modèle d'animation V2 (étape V2-4), repris du prototype
   « zones intelligentes » : le modèle ne règle que le mouvement (durée,
   courbure, rythme, effets, réorganisation de la main) ; les zones donnent
   les poses. Aperçu sur la table de démonstration, avec le lecteur du jeu,
   sur plusieurs trajets. Un export JSON du prototype peut être importé. */

import { useRef, useState, type ReactNode } from "react";
import { ChoreoDemoStage, DEMO_V2_ROUTES, type ChoreoDemoHandle, type DemoV2Route } from "@/components/power/choreo/ChoreoDemoStage";
import { ANIM_V2_EASINGS, ANIM_V2_EFFECTS, ANIM_V2_LIMITS, animV2Timeline, normalizeAnimV2, validateAnimV2, type AnimV2, type AnimV2Easing, type AnimV2Effect } from "@/engine/anim/v2/model";
import styles from "../AdminConsole.module.css";

const sec = (ms: number) => `${(ms / 1000).toFixed(2).replace(".", ",")} s`;

function F({ label, error, children, full }: { label: string; error?: string; children: ReactNode; full?: boolean }) {
  return <label className={`${styles.field} ${error ? styles.invalid : ""} ${full ? styles.full : ""}`}><span>{label}</span>{children}{error && <span className={styles.fieldError}>{error}</span>}</label>;
}
function Range({ label, value, min, max, step, format, onChange, error, testId }: { label: string; value: number; min: number; max: number; step: number; format(value: number): string; onChange(value: number): void; error?: string; testId?: string }) {
  return (
    <label className={`${styles.field} ${error ? styles.invalid : ""}`}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>{label}<b style={{ color: "var(--ink)" }}>{format(value)}</b></span>
      <input type="range" data-testid={testId} min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ padding: 0, accentColor: "var(--gold)" }} />
      {error && <span className={styles.fieldError}>{error}</span>}
    </label>
  );
}

export function AnimV2Editor({ model, isNew, onChange, extraIssues = [] }: {
  model: AnimV2;
  /** L'identifiant ne se change qu'à la création. */
  isNew: boolean;
  onChange(model: AnimV2): void;
  /** Erreurs venues d'ailleurs (serveur, moments du jeu), ajoutées à la validation locale. */
  extraIssues?: Array<{ path: string; message: string }>;
}) {
  const issues = [...validateAnimV2(model), ...extraIssues];
  const e = (path: string) => issues.find((issue) => issue.path === `anim.${path}`)?.message;
  const set = (patch: Partial<AnimV2>) => onChange({ ...model, ...patch });
  const setMotion = (patch: Partial<AnimV2["motion"]>) => set({ motion: { ...model.motion, ...patch } });
  const setEffects = (patch: Partial<AnimV2["effects"]>) => set({ effects: { ...model.effects, ...patch } });
  const timeline = animV2Timeline(model);

  const stage = useRef<ChoreoDemoHandle>(null);
  const [route, setRoute] = useState<DemoV2Route>("draw");
  const [playing, setPlaying] = useState(false);
  const play = async (next: DemoV2Route = route) => {
    setRoute(next);
    setPlaying(true);
    try { await stage.current?.playAnimV2(model, next); } finally { setPlaying(false); }
  };

  const [importText, setImportText] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importJson = () => {
    try {
      const raw = JSON.parse(importText ?? "") as Record<string, unknown>;
      // Un export du prototype n'a ni identifiant ni nom : on garde ceux du modèle ouvert.
      onChange(normalizeAnimV2({ ...raw, id: model.id, name: typeof raw.name === "string" ? raw.name : model.name, description: typeof raw.description === "string" ? raw.description : model.description }));
      setImportText(null);
      setImportError(null);
    } catch {
      setImportError("JSON illisible : colle l'export du prototype (« Exporter l'animation JSON »).");
    }
  };

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 380px", minWidth: 0 }}>
        <section className={styles.panel}>
          <h2>Identité</h2>
          <div className={styles.grid2}>
            <F label="Identifiant" error={e("id")}><input value={model.id} disabled={!isNew} maxLength={48} data-testid="v2-id" onChange={(event) => set({ id: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} /></F>
            <F label="Nom" error={e("name")}><input value={model.name} maxLength={ANIM_V2_LIMITS.name} data-testid="v2-name" onChange={(event) => set({ name: event.target.value })} /></F>
            <F label="Description" error={e("description")} full><input value={model.description ?? ""} maxLength={ANIM_V2_LIMITS.description} onChange={(event) => set({ description: event.target.value || undefined })} /></F>
          </div>
        </section>
        <section className={styles.panel}>
          <h2>Mouvement <span className={styles.hint}>la zone d&apos;arrivée impose la place, l&apos;angle et la face</span></h2>
          <div className={styles.grid2}>
            <Range label="Durée du vol" testId="v2-duration" value={model.motion.durationMs} min={ANIM_V2_LIMITS.durationMs.min} max={1600} step={10} format={sec} onChange={(durationMs) => setMotion({ durationMs })} error={e("motion.durationMs")} />
            <Range label="Courbure" testId="v2-curve" value={Math.round(model.motion.curve * 100)} min={ANIM_V2_LIMITS.curve.min * 100} max={ANIM_V2_LIMITS.curve.max * 100} step={5} format={(v) => `${v > 0 ? "+" : ""}${v} %`} onChange={(v) => setMotion({ curve: v / 100 })} error={e("motion.curve")} />
            <F label="Rythme" error={e("motion.easing")}>
              <select value={model.motion.easing} data-testid="v2-easing" onChange={(event) => setMotion({ easing: event.target.value as AnimV2Easing })}>
                {(Object.entries(ANIM_V2_EASINGS) as Array<[AnimV2Easing, { label: string }]>).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
              </select>
            </F>
            <Range label="Réorganisation de la main" value={model.handReflowMs} min={ANIM_V2_LIMITS.handReflowMs.min} max={ANIM_V2_LIMITS.handReflowMs.max} step={50} format={(v) => `${v} ms`} onChange={(handReflowMs) => set({ handReflowMs })} error={e("handReflowMs")} />
          </div>
        </section>
        <section className={styles.panel}>
          <h2>Effets <span className={styles.hint}>sur la zone, jamais sur sa forme</span></h2>
          <div className={styles.grid2}>
            {(["onLeave", "onEnter"] as const).map((key) => (
              <F key={key} label={key === "onLeave" ? "Effet de sortie (départ)" : "Effet d'entrée (arrivée)"} error={e(`effects.${key}`)}>
                <select value={model.effects[key]} data-testid={`v2-${key}`} onChange={(event) => setEffects({ [key]: event.target.value as AnimV2Effect })}>
                  {(Object.entries(ANIM_V2_EFFECTS) as Array<[AnimV2Effect, { label: string }]>).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
                </select>
              </F>
            ))}
          </div>
          <p className={styles.hint} style={{ marginBottom: 0 }}>
            Calendrier : sortie au décollage, réorganisation à {sec(timeline.reflowAt)}, entrée à {sec(timeline.enterFxAt)}, atterrissage à {sec(timeline.landAt)} ; fin de tout à {sec(timeline.totalMs)}.
            La carte jouée tolère un vol de 0,9 s au plus ; la distribution garde le rythme du jeu.
          </p>
        </section>
        {issues.length > 0 && (
          <ul className={styles.issues} data-testid="v2-issues">
            {issues.slice(0, 8).map((issue) => <li key={issue.path + issue.message}>{issue.message} <code>{issue.path}</code></li>)}
          </ul>
        )}
        <section className={styles.panel}>
          <div className={styles.row}>
            <h2 style={{ margin: 0, flex: 1 }}>Données <span className={styles.hint}>ce que le serveur enregistre</span></h2>
            <button type="button" className={`${styles.btn} ${styles.small}`} data-testid="v2-import-open" onClick={() => { setImportText(importText === null ? "" : null); setImportError(null); }}>{importText === null ? "Importer un JSON du prototype" : "Annuler l'import"}</button>
          </div>
          {importText !== null && (
            <div style={{ marginTop: 8 }}>
              <textarea data-testid="v2-import-text" value={importText} onChange={(event) => setImportText(event.target.value)} rows={6} placeholder='{ "schema": "njambo.anim.v2", "motion": { … } }' style={{ width: "100%", fontFamily: "monospace", fontSize: 11 }} />
              {importError && <div className={styles.fieldError}>{importError}</div>}
              <button type="button" className={`${styles.btn} ${styles.small} ${styles.primary}`} data-testid="v2-import-apply" disabled={!importText?.trim()} onClick={importJson}>Appliquer</button>
            </div>
          )}
          <pre data-testid="v2-json" style={{ maxHeight: 220, overflow: "auto", fontSize: 11, background: "#0c0906", border: "1px solid var(--line)", borderRadius: 10, padding: 10, margin: "8px 0 0" }}>{JSON.stringify(model, null, 2)}</pre>
        </section>
      </div>
      <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
        <div className={styles.row} style={{ gap: 6 }}>
          {(Object.entries(DEMO_V2_ROUTES) as Array<[DemoV2Route, string]>).map(([key, label]) => (
            <button key={key} type="button" className={`${styles.btn} ${styles.small} ${route === key ? styles.primary : ""}`} data-testid={`v2-route-${key}`} disabled={playing} onClick={() => void play(key)}>▶ {label}</button>
          ))}
        </div>
        <ChoreoDemoStage ref={stage} choreo={null} width={280} />
        <p className={styles.hint} style={{ maxWidth: 280, margin: 0 }}>Joué par le lecteur du jeu, même brouillon : un même modèle sert pour tous les trajets.</p>
      </div>
    </div>
  );
}
