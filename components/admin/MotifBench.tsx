"use client";

/* Banc d'essai des modèles d'animation (phase G2) : joue chaque modèle du
   registre sur la table de démonstration, avec le même lecteur que le jeu,
   ainsi qu'une chorégraphie de pouvoir qui en utilise. Sert de vérification
   visuelle en attendant l'atelier complet (phase G3). */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChoreoDemoStage, DEMO_V2_ROUTES, type ChoreoDemoHandle, type DemoV2Route } from "@/components/power/choreo/ChoreoDemoStage";
import { DEFAULT_ANIMS_V2 } from "@/engine/anim/v2/defaults";
import { normalizeAnimV2, type AnimV2 } from "@/engine/anim/v2/model";
import { AnimV2Editor } from "./anim/AnimV2Editor";
import { MOTIF_GROUPS, normalizeMotif, validateMotif, type AnimMotif, type MotifGroup } from "@/engine/anim/motif";
import { Transport } from "./AnimationsAdmin";
import { createMotifClock } from "./anim/clock";
import { AnimStyleEditor } from "./anim/AnimStyleEditor";
import { GameMomentsPanel } from "./anim/GameMomentsPanel";
import { validateAnimStyle, type AnimStyle } from "@/engine/anim/style";
import { MotifCanvas } from "./anim/MotifCanvas";
import { MotifInspector } from "./anim/MotifInspector";
import { MotifTimeline } from "./anim/MotifTimeline";
import { buildScenePlan } from "./anim/motifScene";
import styles from "./AdminConsole.module.css";
import { listMotifs } from "@/engine/anim/registry";
import type { Choreography } from "@/engine/power/choreography";

/** Pouvoir fictif : la carte volée vole de la main de la cible à la tienne, puis la pioche tremble. */
const SAMPLE_CHOREO: Choreography = { tracks: [
  { id: "vol", kind: "motif", startMs: 0, durationMs: 760, motifId: "hand_give", cards: "resolved:outgoing", mode: "move",
    overrides: { from: { zone: "hand", player: "target" }, to: { zone: "hand", player: "self" }, face: { mode: "auto", window: [0.3, 0.7], easing: [0.45, 0, 0.55, 1] } } },
  { id: "pioche", kind: "element", startMs: 500, durationMs: 600, target: { element: "deck" }, effect: "shake", intensity: 2 },
  { id: "titre", kind: "text", startMs: 200, durationMs: 1200, text: "VOLÉE !", at: { kind: "screen", at: "tableCenter", dy: -12 }, size: "l" },
] };

export function MotifBench() {
  const [mode, setMode] = useState<"bench" | "studio" | "moments" | "style" | "v2">("bench");
  if (mode === "studio") return <LocalStudio onBack={() => setMode("bench")} />;
  if (mode === "moments") return <LocalMoments onBack={() => setMode("bench")} />;
  if (mode === "style") return <LocalStyle onBack={() => setMode("bench")} />;
  if (mode === "v2") return <LocalV2 onBack={() => setMode("bench")} />;
  return <Bench onStudio={() => setMode("studio")} onMoments={() => setMode("moments")} onStyle={() => setMode("style")} onV2={() => setMode("v2")} />;
}

function Bench({ onStudio, onMoments, onStyle, onV2 }: { onStudio(): void; onMoments(): void; onStyle(): void; onV2(): void }) {
  const stage = useRef<ChoreoDemoHandle>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const motifs = listMotifs();

  const run = async (label: string, job: () => Promise<void>) => {
    setPlaying(label);
    try { await job(); } finally { setPlaying(null); }
  };
  const playOne = (motif: AnimMotif) => run(motif.id, () => stage.current?.playMotif(motif) ?? Promise.resolve());
  const playAll = () => run("tout", async () => {
    for (const motif of motifs) await stage.current?.playMotif(motif);
  });
  const routes = Object.entries(DEMO_V2_ROUTES) as Array<[DemoV2Route, string]>;
  const playAllV2 = () => run("tout V2", async () => {
    for (const model of DEFAULT_ANIMS_V2) for (const [route] of routes) await stage.current?.playAnimV2(model, route);
  });

  return (
    <main style={{ minHeight: "100vh", background: "#0b0807", color: "#fff4df", fontFamily: "var(--font-manrope, system-ui)", padding: "24px 20px", display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
      <section style={{ flex: "1 1 420px", maxWidth: 640 }}>
        <h1 style={{ margin: "0 0 4px", font: "800 24px var(--font-bricolage, system-ui)" }}>Banc d&apos;essai des modèles d&apos;animation</h1>
        <p style={{ margin: "0 0 18px", color: "#a99b8b" }}>Chaque modèle est joué par le lecteur du jeu sur la table de démonstration (toi en bas, la cible en haut).</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <button type="button" data-testid="play-all" disabled={!!playing} onClick={() => void playAll()} style={buttonStyle(true)}>▶ Tout jouer</button>
          <button type="button" data-testid="open-studio" onClick={onStudio} style={buttonStyle(false)}>✎ Atelier (aperçu local)</button>
          <button type="button" data-testid="open-moments" onClick={onMoments} style={buttonStyle(false)}>⚑ Moments du jeu (aperçu local)</button>
          <button type="button" data-testid="open-style" onClick={onStyle} style={buttonStyle(false)}>✦ Style d&apos;animation (aperçu local)</button>
          <button type="button" data-testid="play-choreo" disabled={!!playing} onClick={() => void run("choreo", () => stage.current?.play(SAMPLE_CHOREO) ?? Promise.resolve())} style={buttonStyle(false)}>▶ Chorégraphie avec un modèle</button>
        </div>
        {(Object.entries(MOTIF_GROUPS) as Array<[MotifGroup, string]>).map(([group, label]) => {
          const items = motifs.filter((motif) => motif.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} style={{ marginBottom: 14 }}>
              <h2 style={{ margin: "0 0 6px", font: "800 11px var(--font-bricolage, system-ui)", letterSpacing: ".09em", textTransform: "uppercase", color: "#d7a957" }}>{label}</h2>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {items.map((motif) => (
                  <button key={motif.id} type="button" data-testid={`motif-${motif.id}`} title={motif.description} disabled={!!playing} onClick={() => void playOne(motif)}
                    style={{ ...buttonStyle(false), borderColor: playing === motif.id ? "#f2bb45" : "#45352a" }}>
                    {motif.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div data-testid="v2-section" style={{ marginTop: 22, paddingTop: 14, borderTop: "1px solid #3a2b1b" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, font: "800 15px var(--font-bricolage, system-ui)" }}>Animation V2 · zones intelligentes</h2>
            <button type="button" data-testid="v2-play-all" disabled={!!playing} onClick={() => void playAllV2()} style={buttonStyle(false)}>▶ Tout jouer (V2)</button>
            <button type="button" data-testid="open-v2-studio" onClick={onV2} style={buttonStyle(false)}>◇ Atelier V2 (aperçu local)</button>
          </div>
          <p style={{ margin: "0 0 10px", color: "#a99b8b", fontSize: 13 }}>Les zones donnent la pose de départ et d&apos;arrivée ; le modèle ne règle que le mouvement. Un même modèle joue tous les trajets.</p>
          {DEFAULT_ANIMS_V2.map((model) => (
            <div key={model.id} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <span title={model.description} style={{ minWidth: 86, font: "800 11px var(--font-bricolage, system-ui)", letterSpacing: ".09em", textTransform: "uppercase", color: "#d7a957" }}>{model.name}</span>
              {routes.map(([route, label]) => {
                const key = `${model.id}-${route}`;
                return (
                  <button key={route} type="button" data-testid={`v2-${key}`} disabled={!!playing} onClick={() => void run(key, () => stage.current?.playAnimV2(model, route) ?? Promise.resolve())}
                    style={{ ...buttonStyle(false), borderColor: playing === key ? "#f2bb45" : "#45352a" }}>
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p data-testid="bench-status" style={{ color: "#a99b8b", minHeight: 20 }}>{playing ? `Lecture : ${playing}` : "Prêt."}</p>
      </section>
      <ChoreoDemoStage ref={stage} choreo={null} width={300} />
    </main>
  );
}

const buttonStyle = (primary: boolean) => ({
  border: `1px solid ${primary ? "#f2bb45" : "#45352a"}`, background: primary ? "#f2bb45" : "#17110d", color: primary ? "#1b1010" : "#fff4df",
  borderRadius: 10, padding: "7px 12px", font: "700 13px var(--font-manrope, system-ui)", cursor: "pointer",
});

/* Atelier en local (sans serveur ni enregistrement) : mêmes composants que la
   section Animations de la console, pour les vérifications sans compte admin. */
const SHELL_VARS = { "--ink": "#fff6df", "--muted": "#c9b48f", "--faint": "#8f7a58", "--gold": "#f2bb45", "--panel": "#17110c", "--panel-2": "#21180f", "--line": "#3a2b1b", "--danger": "#ff7b6b" } as CSSProperties;

function LocalStudio({ onBack }: { onBack(): void }) {
  const motifs = listMotifs();
  const [motif, setMotif] = useState<AnimMotif>(() => normalizeMotif(motifs[0]));
  const [showSchema, setShowSchema] = useState(true);
  const [demo, setDemo] = useState(false);
  const clock = useMemo(() => createMotifClock(), []);
  useEffect(() => () => clock.dispose(), [clock]);
  const plan = useMemo(() => buildScenePlan(motif), [motif]);
  useEffect(() => clock.setTotal(plan.totalMs), [clock, plan]);
  const issues = validateMotif(motif);
  const stage = useRef<ChoreoDemoHandle>(null);
  useEffect(() => { if (demo) void stage.current?.playMotif(motif).finally(() => setDemo(false)); }, [demo, motif]);
  return (
    <main style={{ ...SHELL_VARS, minHeight: "100vh", background: "#0a0808", color: "#fff6df", fontFamily: "var(--font-manrope, system-ui)", padding: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={onBack} style={buttonStyle(false)}>← Banc d&apos;essai</button>
        <select data-testid="studio-motif" value={motif.id} onChange={(event) => { const next = motifs.find((item) => item.id === event.target.value); if (next) { setMotif(normalizeMotif(next)); clock.play(true); } }} style={{ padding: "7px 10px", borderRadius: 9, background: "#0c0906", color: "#fff6df", border: "1px solid #3a2b1b" }}>
          {motifs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <span data-testid="studio-issues" style={{ color: issues.length ? "#ff7b6b" : "#8f7a58", fontSize: 12 }}>{issues.length ? `${issues.length} erreur(s) : ${issues[0].path}` : "Modèle valide."}</span>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 10, width: 330 }}>
          <MotifCanvas motif={motif} clock={clock} width={330} showSchema={showSchema} onChange={setMotif} />
          <Transport clock={clock} showSchema={showSchema} onSchema={setShowSchema} onDemo={() => setDemo(true)} />
          <MotifTimeline motif={motif} flights={plan.flights.length} totalMs={plan.totalMs} clock={clock} onChange={setMotif} />
        </div>
        <div style={{ flex: "1 1 380px", minWidth: 320 }}>
          <MotifInspector motif={motif} isNew={false} errorFor={(path) => issues.find((issue) => issue.path === path)?.message} clock={clock} onChange={setMotif} />
        </div>
        <div style={{ display: demo ? "block" : "none" }}><ChoreoDemoStage ref={stage} choreo={null} width={260} /></div>
      </div>
      <p className={styles.hint}>Aperçu local : rien n&apos;est enregistré. La publication se fait dans la console admin, section Animations.</p>
    </main>
  );
}

/* Moments du jeu en local : même panneau que la console, sans enregistrement. */
function LocalMoments({ onBack }: { onBack(): void }) {
  return (
    <main style={{ ...SHELL_VARS, minHeight: "100vh", background: "#0a0808", color: "#fff6df", fontFamily: "var(--font-manrope, system-ui)", padding: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <button type="button" onClick={onBack} style={buttonStyle(false)}>← Banc d&apos;essai</button>
        <h1 style={{ margin: 0, font: "800 20px var(--font-bricolage, system-ui)" }}>Moments du jeu</h1>
      </div>
      <GameMomentsPanel saved={{}} />
    </main>
  );
}

/* Atelier V2 en local : même éditeur que la console (section Animations, ◇ Animation V2), sans enregistrement. */
function LocalV2({ onBack }: { onBack(): void }) {
  const [model, setModel] = useState<AnimV2>(() => normalizeAnimV2(DEFAULT_ANIMS_V2[0]));
  return (
    <main style={{ ...SHELL_VARS, minHeight: "100vh", background: "#0a0808", color: "#fff6df", fontFamily: "var(--font-manrope, system-ui)", padding: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={onBack} style={buttonStyle(false)}>← Banc d&apos;essai</button>
        <h1 style={{ margin: 0, font: "800 20px var(--font-bricolage, system-ui)" }}>Atelier V2</h1>
        <select data-testid="v2-studio-model" value={DEFAULT_ANIMS_V2.some((item) => item.id === model.id) ? model.id : ""} onChange={(event) => { const next = DEFAULT_ANIMS_V2.find((item) => item.id === event.target.value); if (next) setModel(normalizeAnimV2(next)); }} style={{ padding: "7px 10px", borderRadius: 9, background: "#0c0906", color: "#fff6df", border: "1px solid #3a2b1b" }}>
          {DEFAULT_ANIMS_V2.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      <AnimV2Editor model={model} isNew={false} onChange={setModel} />
      <p className={styles.hint}>Aperçu local : rien n&apos;est enregistré. La publication se fait dans la console admin, section Animations, ◇ Animation V2.</p>
    </main>
  );
}

/* Style d'animation en local : même éditeur que la section Cosmétiques, sans enregistrement. */
function LocalStyle({ onBack }: { onBack(): void }) {
  const [style, setStyle] = useState<AnimStyle>({ trail: "sparks", tone: "pink", impact: "burst" });
  const issues = validateAnimStyle(style);
  return (
    <main style={{ ...SHELL_VARS, minHeight: "100vh", background: "#0a0808", color: "#fff6df", fontFamily: "var(--font-manrope, system-ui)", padding: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <button type="button" onClick={onBack} style={buttonStyle(false)}>← Banc d&apos;essai</button>
        <h1 style={{ margin: 0, font: "800 20px var(--font-bricolage, system-ui)" }}>Style d&apos;animation</h1>
        <span data-testid="style-issues" style={{ color: issues.length ? "#ff7b6b" : "#8f7a58", fontSize: 12 }}>{issues.length ? `${issues.length} erreur(s)` : "Style valide."}</span>
      </div>
      <AnimStyleEditor style={style} errorFor={(path) => issues.find((issue) => issue.path === path)?.message} onChange={setStyle} />
      <p className={styles.hint}>Aperçu local : rien n&apos;est enregistré. Un style se crée dans la console admin, section Cosmétiques (type « Style d&apos;animation »).</p>
    </main>
  );
}
