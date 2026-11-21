"use client";

/* Section « Animations » : l'atelier des modèles d'animation (phase G3).
   Bibliothèque (modèles par défaut, publiés, brouillons, archivés), table
   schématique rejouée au ralenti avec le schéma éditable (A, B, ◆), ligne
   de temps, inspecteur, matrice des transitions et lecture sur la table de
   démonstration (même lecteur que le jeu). Brouillon → publication
   versionnée → catalogue diffusé à tous les joueurs. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChoreoDemoStage, type ChoreoDemoHandle } from "@/components/power/choreo/ChoreoDemoStage";
import { DEFAULT_MOTIFS_BY_ID } from "@/engine/anim/defaults";
import { GAME_MOMENTS, GAME_MOMENT_KEYS, momentIssuesForMotif, type MomentMap } from "@/engine/anim/moments";
import { MOTIF_GROUPS, normalizeMotif, validateMotif, type AnimMotif, type MotifGroup } from "@/engine/anim/motif";
import { getMotif } from "@/engine/anim/registry";
import { adminApi, adminErrorText, issuesFromError, type AdminMotifRow } from "./adminApi";
import { createMotifClock, useClockState, type MotifClock } from "./anim/clock";
import { GameMomentsPanel } from "./anim/GameMomentsPanel";
import { MotifCanvas } from "./anim/MotifCanvas";
import { MotifInspector, anchorLabel } from "./anim/MotifInspector";
import { MotifTimeline } from "./anim/MotifTimeline";
import { buildScenePlan, zoneAnchor, type SceneZone } from "./anim/motifScene";
import styles from "./AdminConsole.module.css";

interface Editing { motif: AnimMotif; isNew: boolean; saved: string }

const MATRIX: SceneZone[] = ["deck", "hand:me", "deposit:me", "center", "hand:top", "deposit:top", "avatar:me", "pot", "off:top"];
const MATRIX_LABELS: Record<string, string> = { deck: "Pioche", "hand:me": "Main lanceur", "deposit:me": "Dépôt lanceur", center: "Centre", "hand:top": "Main cible", "deposit:top": "Dépôt cible", "avatar:me": "Avatar lanceur", pot: "Pot", "off:top": "Hors-écran" };

function templateFor(from: SceneZone, to: SceneZone): string {
  if (from === to) return from === "hand:me" ? "hand_focus" : from.startsWith("deposit") || from === "center" ? "deposit_glow" : "card_flip_show";
  if (to === "deck") return "discard";
  if (to.startsWith("avatar")) return "to_player";
  if (from.startsWith("avatar")) return "launch_ability";
  if (to.startsWith("off")) return "center_remove";
  if (to.startsWith("hand")) return "draw";
  if (from === "deck") return "reveal_on_table";
  return "play";
}

const status = (row: AdminMotifRow) => row.archived ? "Archivé" : row.hasDraft ? (row.published ? `Brouillon (en ligne : rév. ${row.revision})` : "Brouillon") : row.published ? `Publié · rév. ${row.revision}` : "Modèle du jeu";

export function AnimationsAdmin() {
  const [rows, setRows] = useState<AdminMotifRow[] | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [serverIssues, setServerIssues] = useState<Array<{ path: string; message: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [showSchema, setShowSchema] = useState(true);
  const [matrix, setMatrix] = useState(false);
  const [demo, setDemo] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [moments, setMoments] = useState<MomentMap>({});
  const [momentsOpen, setMomentsOpen] = useState(false);
  const clockRef = useRef<MotifClock | null>(null);
  if (!clockRef.current && typeof window !== "undefined") clockRef.current = createMotifClock();
  const clock = clockRef.current;
  useEffect(() => () => clockRef.current?.dispose(), []);

  const load = useCallback(async () => {
    try {
      const result = await adminApi.animMotifs();
      setRows(result.motifs);
      setMoments(result.moments ?? {});
      return result.motifs;
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorText(cause) });
      return null;
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const open = (motif: AnimMotif, isNew = false) => {
    const normalized = normalizeMotif(motif);
    setEditing({ motif: normalized, isNew, saved: isNew ? "" : JSON.stringify(normalized) });
    setServerIssues([]);
    clock?.play(true);
  };
  // Ouvre le premier modèle au chargement.
  useEffect(() => { if (rows && !editing && rows[0]) open(rows[0].motif); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const motif = editing?.motif ?? null;
  const plan = useMemo(() => (motif ? buildScenePlan(motif) : null), [motif]);
  useEffect(() => { if (plan) clock?.setTotal(plan.totalMs); }, [plan, clock]);
  // Un modèle attribué à un moment du jeu doit continuer à lui convenir (le serveur refuse sinon la publication).
  const issues = useMemo(() => (motif ? [...validateMotif(motif), ...momentIssuesForMotif(moments, motif, getMotif)] : []), [motif, moments]);
  const usedBy = motif ? GAME_MOMENT_KEYS.filter((moment) => moments[moment] === motif.id).map((moment) => GAME_MOMENTS[moment].label) : [];
  const allIssues = issues.length ? issues : serverIssues;
  const errorFor = (path: string) => allIssues.find((issue) => issue.path === path)?.message;
  const dirty = editing ? JSON.stringify(editing.motif) !== editing.saved : false;
  const row = rows?.find((item) => item.id === motif?.id) ?? null;

  const act = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      setNotice({ kind: "ok", text: await action() });
    } catch (cause) {
      setServerIssues(issuesFromError(cause));
      setNotice({ kind: "error", text: adminErrorText(cause) });
    } finally {
      setBusy(false);
    }
  };
  const saveDraft = () => act(async () => {
    if (!motif) return "";
    const result = await adminApi.saveAnimMotifDraft(motif);
    setEditing((current) => current && { ...current, isNew: false, saved: JSON.stringify(current.motif) });
    await load();
    return result.issues.length ? `Brouillon enregistré, ${result.issues.length} erreur(s) à corriger avant de publier.` : "Brouillon enregistré.";
  });
  const publish = () => act(async () => {
    if (!motif) return "";
    await adminApi.saveAnimMotifDraft(motif);
    const result = await adminApi.publishAnimMotif(motif.id);
    setEditing((current) => current && { ...current, isNew: false, saved: JSON.stringify(current.motif) });
    await load();
    return `« ${motif.name} » publié (révision ${result.revision}) : tous les joueurs reçoivent la nouvelle mise en scène.`;
  });
  const discard = () => act(async () => {
    if (!motif) return "";
    await adminApi.discardAnimMotifDraft(motif.id);
    const next = await load();
    const fresh = next?.find((item) => item.id === motif.id);
    if (fresh) open(fresh.motif); else setEditing(null);
    return "Brouillon abandonné.";
  });
  const toggleArchive = () => act(async () => {
    if (!row) return "";
    await adminApi.setAnimMotifArchived(row.id, !row.archived);
    await load();
    return row.archived ? "Modèle désarchivé." : "Modèle archivé : il sort de la bibliothèque mais reste jouable.";
  });
  const saveMoments = async (next: MomentMap) => {
    try {
      const result = await adminApi.setGameMoments(next);
      setMoments(result.moments);
      const count = Object.keys(result.moments).length;
      return count ? `Attribution enregistrée (${count} moment(s) avec un modèle) : tous les joueurs la reçoivent.` : "Attribution enregistrée : tous les moments gardent l'animation actuelle du jeu.";
    } catch (cause) {
      const details = issuesFromError(cause);
      throw new Error(details.length ? details.map((issue) => issue.message).join(" ") : adminErrorText(cause));
    }
  };
  const uniqueId = (base: string) => {
    let id = base.slice(0, 44), n = 2;
    while (rows?.some((item) => item.id === id)) id = `${base.slice(0, 41)}_${n++}`;
    return id;
  };
  const duplicate = () => motif && open({ ...motif, id: uniqueId(`${motif.id}_copie`), name: `${motif.name} (copie)`.slice(0, 40), group: "custom" }, true);
  const createNew = () => open({ ...DEFAULT_MOTIFS_BY_ID.draw, id: uniqueId("nouveau_modele"), name: "Nouveau modèle", group: "custom", description: undefined }, true);
  const fromMatrix = (from: SceneZone, to: SceneZone) => {
    setMatrix(false);
    const existing = rows?.find((item) => JSON.stringify(item.motif.from) === JSON.stringify(zoneAnchor(from)) && JSON.stringify(item.motif.to) === JSON.stringify(zoneAnchor(to)));
    if (existing) { open(existing.motif); return; }
    const template = DEFAULT_MOTIFS_BY_ID[templateFor(from, to)];
    open({ ...template, id: uniqueId(`${from}_${to}`.replace(/[^a-z0-9]+/g, "_")), name: `${MATRIX_LABELS[from]} → ${MATRIX_LABELS[to]}`.slice(0, 40), group: "custom", from: zoneAnchor(from), to: zoneAnchor(to), preview: undefined, description: `Créé depuis le modèle « ${template.name} ».` }, true);
  };

  const visibleRows = (rows ?? []).filter((item) => showArchived || !item.archived);
  return (
    <div>
      <div className={styles.pageHead}>
        <div><h1>Animations</h1><p>L&apos;atelier des modèles d&apos;animation : cartes de pouvoir et mouvements du jeu. Tire les poignées sur la table, règle les courbes, publie.</p></div>
        <div className={styles.row}>
          <button type="button" className={styles.btn} data-testid="open-moments" onClick={() => setMomentsOpen(true)}>⚑ Moments du jeu</button>
          <button type="button" className={styles.btn} onClick={() => setMatrix(true)}>▦ Toutes les transitions</button>
          <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={createNew}>+ Nouveau modèle</button>
        </div>
      </div>
      {notice && <div className={`${styles.notice} ${styles[notice.kind]}`}>{notice.text}</div>}
      {!rows ? <p className={styles.empty}>Chargement…</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "220px 330px minmax(320px, 1fr)", gap: 14, alignItems: "start" }}>
          <aside className={styles.panel} style={{ position: "sticky", top: 12, maxHeight: "calc(100svh - 40px)", overflow: "auto", padding: 10 }}>
            {(Object.entries(MOTIF_GROUPS) as Array<[MotifGroup, string]>).map(([group, label]) => {
              const items = visibleRows.filter((item) => item.motif.group === group);
              if (!items.length) return null;
              return (
                <div key={group} style={{ marginBottom: 10 }}>
                  <div className={styles.hint} style={{ fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", margin: "4px 6px" }}>{label}</div>
                  {items.map((item) => (
                    <button key={item.id} type="button" data-testid={`motif-row-${item.id}`} onClick={() => open(item.motif)}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", marginBottom: 2, borderRadius: 9, border: `1px solid ${item.id === motif?.id ? "var(--gold)" : "transparent"}`, background: item.id === motif?.id ? "#2a1d12" : "none", color: "var(--ink)", cursor: "pointer" }}>
                      <b style={{ display: "block", fontSize: 13 }}>{item.motif.name}</b>
                      <small style={{ color: item.issues.length ? "var(--danger)" : "var(--faint)" }}>{item.issues.length ? `${item.issues.length} erreur(s)` : status(item)}</small>
                    </button>
                  ))}
                </div>
              );
            })}
            <label className={styles.check} style={{ fontSize: 12, margin: "6px" }}><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Afficher les archivés</label>
          </aside>

          {motif && plan && clock ? (
            <>
              <div style={{ position: "sticky", top: 12, display: "grid", gap: 10 }}>
                <MotifCanvas motif={motif} clock={clock} width={330} showSchema={showSchema} onChange={(next) => setEditing((current) => current && { ...current, motif: next })} />
                <Transport clock={clock} showSchema={showSchema} onSchema={setShowSchema} onDemo={() => setDemo(true)} />
                <MotifTimeline motif={motif} flights={plan.flights.length} totalMs={plan.totalMs} clock={clock} onChange={(next) => setEditing((current) => current && { ...current, motif: next })} />
              </div>
              <div>
                <section className={styles.panel}>
                  <div className={styles.row}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h2 style={{ margin: 0 }}>{motif.name} <code className={styles.hint}>{motif.id}</code></h2>
                      <p className={styles.hint} style={{ margin: "4px 0 0" }}>{anchorLabel(motif.from)} → {anchorLabel(motif.to)} · {editing?.isNew ? "nouveau" : row ? status(row) : ""}{dirty ? " · modifications non enregistrées" : ""}</p>
                      {usedBy.length > 0 && <p className={styles.hint} style={{ margin: "4px 0 0", color: "var(--gold)" }}>Anime dans le jeu : {usedBy.join(", ")}. Une publication change ce moment pour tous les joueurs.</p>}
                    </div>
                  </div>
                  <div className={styles.row} style={{ marginTop: 10 }}>
                    <button type="button" className={styles.btn} disabled={busy} onClick={() => void saveDraft()}>Enregistrer le brouillon</button>
                    <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy || issues.length > 0} data-testid="publish-motif" onClick={() => void publish()}>Publier</button>
                    <button type="button" className={styles.btn} disabled={busy} onClick={duplicate}>Dupliquer</button>
                    {row?.hasDraft && <button type="button" className={`${styles.btn} ${styles.danger}`} disabled={busy} onClick={() => void discard()}>Abandonner le brouillon</button>}
                    {row?.published && <button type="button" className={styles.btn} disabled={busy} onClick={() => void toggleArchive()}>{row.archived ? "Désarchiver" : "Archiver"}</button>}
                    {DEFAULT_MOTIFS_BY_ID[motif.id] && row?.published && <button type="button" className={styles.btn} disabled={busy} onClick={() => setEditing((current) => current && { ...current, motif: normalizeMotif(DEFAULT_MOTIFS_BY_ID[motif.id]) })}>Revenir au modèle du jeu</button>}
                  </div>
                  {allIssues.length > 0 && (
                    <ul className={styles.issues} style={{ marginTop: 10 }}>
                      {allIssues.slice(0, 8).map((issue) => <li key={issue.path}>{issue.message} <code>{issue.path}</code></li>)}
                    </ul>
                  )}
                </section>
                <MotifInspector motif={motif} isNew={editing?.isNew ?? false} errorFor={errorFor} clock={clock} onChange={(next) => setEditing((current) => current && { ...current, motif: next })} />
                <section className={styles.panel}>
                  <h2>Données <span className={styles.hint}>ce que le serveur enregistre</span></h2>
                  <pre style={{ maxHeight: 240, overflow: "auto", fontSize: 11, background: "#0c0906", border: "1px solid var(--line)", borderRadius: 10, padding: 10, margin: 0 }}>{JSON.stringify(motif, null, 2)}</pre>
                </section>
              </div>
            </>
          ) : <p className={styles.empty}>Choisis un modèle dans la bibliothèque.</p>}
        </div>
      )}

      {matrix && (
        <div className={styles.dialogBackdrop} onClick={(event) => { if (event.target === event.currentTarget) setMatrix(false); }}>
          <div className={styles.dialog} style={{ width: "min(880px, 100%)" }}>
            <h2>Toutes les transitions</h2>
            <p className={styles.hint}>Chaque case est un trajet « de → vers ». Une case dorée a déjà un modèle ; une case vide en crée un à partir du modèle le plus proche. La diagonale correspond aux animations sur place.</p>
            <div style={{ display: "grid", gridTemplateColumns: `110px repeat(${MATRIX.length}, 1fr)`, gap: 4, marginTop: 10 }}>
              <div className={styles.hint} style={{ alignSelf: "end", textAlign: "right" }}>de ↓ · vers →</div>
              {MATRIX.map((zone) => <div key={zone} className={styles.hint} style={{ textAlign: "center", alignSelf: "end", fontWeight: 700 }}>{MATRIX_LABELS[zone]}</div>)}
              {MATRIX.map((from) => (
                <div key={from} style={{ display: "contents" }}>
                  <div className={styles.hint} style={{ textAlign: "right", alignSelf: "center", fontWeight: 700 }}>{MATRIX_LABELS[from]}</div>
                  {MATRIX.map((to) => {
                    const existing = rows?.find((item) => JSON.stringify(item.motif.from) === JSON.stringify(zoneAnchor(from)) && JSON.stringify(item.motif.to) === JSON.stringify(zoneAnchor(to)));
                    return (
                      <button key={to} type="button" onClick={() => fromMatrix(from, to)} title={`${MATRIX_LABELS[from]} → ${MATRIX_LABELS[to]}`}
                        style={{ aspectRatio: "1.4", border: `1px ${existing ? "solid" : "dashed"} ${existing ? "#f2bb4599" : "var(--line)"}`, background: existing ? "#2a1d12" : from === to ? "#0f1414" : "#110d0a", color: existing ? "var(--ink)" : "var(--faint)", borderRadius: 8, fontSize: 10.5, fontWeight: existing ? 700 : 400, cursor: "pointer", padding: 2, lineHeight: 1.15 }}>
                        {existing ? existing.motif.name : from === to ? "sur place" : "+"}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className={styles.row}><button type="button" className={styles.btn} onClick={() => setMatrix(false)}>Fermer</button></div>
          </div>
        </div>
      )}

      {momentsOpen && (
        <div className={styles.dialogBackdrop} onClick={(event) => { if (event.target === event.currentTarget) setMomentsOpen(false); }}>
          <div className={styles.dialog} style={{ width: "min(1040px, 100%)", maxHeight: "calc(100svh - 40px)", overflow: "auto" }}>
            <h2>Moments du jeu</h2>
            <GameMomentsPanel saved={moments} onSave={saveMoments} onClose={() => setMomentsOpen(false)} />
          </div>
        </div>
      )}

      {demo && motif && <DemoDialog motif={motif} onClose={() => setDemo(false)} />}
    </div>
  );
}

export function Transport({ clock, showSchema, onSchema, onDemo }: { clock: MotifClock; showSchema: boolean; onSchema(value: boolean): void; onDemo(): void }) {
  const state = useClockState(clock);
  const speeds = [0.1, 0.25, 0.5, 1];
  return (
    <div className={styles.row} style={{ gap: 6 }}>
      <button type="button" className={`${styles.btn} ${styles.small} ${styles.primary}`} data-testid="clock-toggle" onClick={() => clock.toggle()}>{state.playing ? "❚❚" : "▶"}</button>
      <button type="button" className={`${styles.btn} ${styles.small}`} title="Rejouer depuis le début" onClick={() => clock.play(true)}>↺</button>
      {speeds.map((speed) => <button key={speed} type="button" className={styles.chip} style={{ padding: "4px 8px", fontSize: 11 }} aria-pressed={state.speed === speed} onClick={() => clock.setSpeed(speed)}>{speed === 1 ? "1×" : `${String(speed).replace(".", ",")}×`}</button>)}
      <label className={styles.check} style={{ fontSize: 12 }}><input type="checkbox" checked={state.loop} onChange={(event) => clock.setLoop(event.target.checked)} /> Boucle</label>
      <label className={styles.check} style={{ fontSize: 12 }}><input type="checkbox" checked={showSchema} onChange={(event) => onSchema(event.target.checked)} /> Schéma</label>
      <button type="button" className={`${styles.btn} ${styles.small}`} onClick={onDemo}>▶ Table de démonstration</button>
    </div>
  );
}

/** Lecture du modèle (même brouillon) par le vrai lecteur du jeu, sur la table de démonstration. */
function DemoDialog({ motif, onClose }: { motif: AnimMotif; onClose(): void }) {
  const stage = useRef<ChoreoDemoHandle>(null);
  const [playing, setPlaying] = useState(false);
  const play = useCallback(async () => {
    setPlaying(true);
    try { await stage.current?.playMotif(motif); } finally { setPlaying(false); }
  }, [motif]);
  useEffect(() => { const timer = setTimeout(() => void play(), 300); return () => clearTimeout(timer); }, [play]);
  return (
    <div className={styles.dialogBackdrop} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={styles.dialog} style={{ width: "auto" }}>
        <h2>{motif.name}</h2>
        <p className={styles.hint}>Joué par le lecteur du jeu : réactions des zones, main qui s&apos;écarte ou se resserre.</p>
        <ChoreoDemoStage ref={stage} choreo={null} width={300} />
        <div className={styles.row}>
          <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={playing} onClick={() => void play()}>▶ Rejouer</button>
          <button type="button" className={styles.btn} onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
