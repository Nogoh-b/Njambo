"use client";

/* Atelier V2 de la console (étape V2-4) : bibliothèque des modèles V2
   (modèles du jeu, publiés, brouillons, archivés), éditeur, puis le même
   cycle que les modèles V1 : brouillon → publication versionnée → catalogue
   diffusé à tous les joueurs. Une version trop longue pour un moment qui
   l'utilise est bloquée avant même d'appeler le serveur. */

import { useCallback, useEffect, useState } from "react";
import { GAME_MOMENTS, GAME_MOMENT_KEYS, momentIssuesForAnimV2, v2Ref, type MomentMap } from "@/engine/anim/moments";
import { DEFAULT_ANIMS_V2_BY_ID } from "@/engine/anim/v2/defaults";
import { normalizeAnimV2, validateAnimV2, type AnimV2 } from "@/engine/anim/v2/model";
import { adminApi, adminErrorText, issuesFromError, type AdminAnimV2Row } from "../adminApi";
import { AnimV2Editor } from "./AnimV2Editor";
import styles from "../AdminConsole.module.css";

interface Editing { model: AnimV2; isNew: boolean; saved: string }

const status = (row: AdminAnimV2Row) => row.archived ? "Archivé" : row.hasDraft ? (row.published ? `Brouillon (en ligne : rév. ${row.revision})` : "Brouillon") : row.published ? `Publié · rév. ${row.revision}` : "Modèle du jeu";

export function AnimV2Admin({ onChanged }: { onChanged?(): void }) {
  const [rows, setRows] = useState<AdminAnimV2Row[] | null>(null);
  const [moments, setMoments] = useState<MomentMap>({});
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [serverIssues, setServerIssues] = useState<Array<{ path: string; message: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await adminApi.animsV2();
      setRows(result.models);
      setMoments(result.moments ?? {});
      return result.models;
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorText(cause) });
      return null;
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const open = (model: AnimV2, isNew = false) => {
    const normalized = normalizeAnimV2(model);
    setEditing({ model: normalized, isNew, saved: isNew ? "" : JSON.stringify(normalized) });
    setServerIssues([]);
  };
  useEffect(() => { if (rows && !editing && rows[0]) open(rows[0].model); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const model = editing?.model ?? null;
  const row = rows?.find((item) => item.id === model?.id) ?? null;
  const momentIssues = model ? momentIssuesForAnimV2(moments, model).map((issue) => ({ ...issue, path: "anim.motion.durationMs" })) : [];
  const blocking = model ? [...validateAnimV2(model), ...momentIssues] : [];
  const usedBy = model ? GAME_MOMENT_KEYS.filter((moment) => moments[moment] === v2Ref(model.id)).map((moment) => GAME_MOMENTS[moment].label) : [];
  const dirty = editing ? JSON.stringify(editing.model) !== editing.saved : false;

  const act = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      setNotice({ kind: "ok", text: await action() });
      onChanged?.();
    } catch (cause) {
      setServerIssues(issuesFromError(cause));
      setNotice({ kind: "error", text: adminErrorText(cause) });
    } finally {
      setBusy(false);
    }
  };
  const saveDraft = () => act(async () => {
    if (!model) return "";
    const result = await adminApi.saveAnimV2Draft(model);
    setEditing((current) => current && { ...current, isNew: false, saved: JSON.stringify(current.model) });
    await load();
    return result.issues.length ? `Brouillon enregistré, ${result.issues.length} erreur(s) à corriger avant de publier.` : "Brouillon enregistré.";
  });
  const publish = () => act(async () => {
    if (!model) return "";
    await adminApi.saveAnimV2Draft(model);
    const result = await adminApi.publishAnimV2(model.id);
    setEditing((current) => current && { ...current, isNew: false, saved: JSON.stringify(current.model) });
    await load();
    return `« ${model.name} » publié (révision ${result.revision}) : tous les joueurs le reçoivent.`;
  });
  const discard = () => act(async () => {
    if (!model) return "";
    await adminApi.discardAnimV2Draft(model.id);
    const next = await load();
    const fresh = next?.find((item) => item.id === model.id);
    if (fresh) open(fresh.model); else setEditing(null);
    return "Brouillon abandonné.";
  });
  const toggleArchive = () => act(async () => {
    if (!row) return "";
    await adminApi.setAnimV2Archived(row.id, !row.archived);
    await load();
    return row.archived ? "Modèle désarchivé." : "Modèle archivé : il sort de la bibliothèque mais reste jouable.";
  });
  const uniqueId = (base: string) => {
    let id = base.slice(0, 44), n = 2;
    while (rows?.some((item) => item.id === id)) id = `${base.slice(0, 41)}_${n++}`;
    return id;
  };
  const leave = () => !dirty || window.confirm("Quitter ce modèle sans enregistrer tes modifications ?");
  const createNew = () => leave() && open({ ...DEFAULT_ANIMS_V2_BY_ID.v2_fluide, id: uniqueId("v2_nouveau"), name: "Nouveau modèle V2", description: undefined }, true);
  const duplicate = () => model && open({ ...model, id: uniqueId(`${model.id}_copie`), name: `${model.name} (copie)`.slice(0, 40) }, true);

  const visible = (rows ?? []).filter((item) => showArchived || !item.archived);
  return (
    <div>
      {notice && <div className={`${styles.notice} ${styles[notice.kind]}`} data-testid="v2-notice">{notice.text}</div>}
      {!rows ? <p className={styles.empty}>Chargement…</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "200px minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
          <aside className={styles.panel} style={{ padding: 10 }}>
            <button type="button" className={`${styles.btn} ${styles.small} ${styles.primary}`} style={{ width: "100%", marginBottom: 8 }} onClick={createNew}>+ Nouveau modèle V2</button>
            {visible.map((item) => (
              <button key={item.id} type="button" data-testid={`v2-row-${item.id}`} onClick={() => leave() && open(item.model)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", marginBottom: 2, borderRadius: 9, border: `1px solid ${item.id === model?.id ? "var(--gold)" : "transparent"}`, background: item.id === model?.id ? "#2a1d12" : "none", color: "var(--ink)", cursor: "pointer" }}>
                <b style={{ display: "block", fontSize: 13 }}>{item.model.name}</b>
                <small style={{ color: item.issues.length ? "var(--danger)" : "var(--faint)" }}>{item.issues.length ? `${item.issues.length} erreur(s)` : status(item)}</small>
              </button>
            ))}
            <label className={styles.check} style={{ fontSize: 12, margin: "6px" }}><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Afficher les archivés</label>
          </aside>
          {model ? (
            <div>
              <section className={styles.panel}>
                <h2 style={{ margin: 0 }}>{model.name || "Sans nom"} <code className={styles.hint}>{model.id}</code></h2>
                <p className={styles.hint} style={{ margin: "4px 0 0" }}>{editing?.isNew ? "nouveau" : row ? status(row) : ""}{dirty ? " · modifications non enregistrées" : ""}</p>
                {usedBy.length > 0 && <p className={styles.hint} style={{ margin: "4px 0 0", color: "var(--gold)" }}>Anime dans le jeu : {usedBy.join(", ")}. Une publication change ce moment pour tous les joueurs.</p>}
                <div className={styles.row} style={{ marginTop: 10 }}>
                  <button type="button" className={styles.btn} disabled={busy} data-testid="v2-save" onClick={() => void saveDraft()}>Enregistrer le brouillon</button>
                  <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy || blocking.length > 0} data-testid="v2-publish" onClick={() => void publish()}>Publier</button>
                  <button type="button" className={styles.btn} disabled={busy} onClick={duplicate}>Dupliquer</button>
                  {row?.hasDraft && <button type="button" className={`${styles.btn} ${styles.danger}`} disabled={busy} onClick={() => void discard()}>Abandonner le brouillon</button>}
                  {row?.published && <button type="button" className={styles.btn} disabled={busy} onClick={() => void toggleArchive()}>{row.archived ? "Désarchiver" : "Archiver"}</button>}
                  {DEFAULT_ANIMS_V2_BY_ID[model.id] && row?.published && <button type="button" className={styles.btn} disabled={busy} onClick={() => setEditing((current) => current && { ...current, model: normalizeAnimV2(DEFAULT_ANIMS_V2_BY_ID[model.id]) })}>Revenir au modèle du jeu</button>}
                </div>
              </section>
              <AnimV2Editor model={model} isNew={editing?.isNew ?? false} extraIssues={[...momentIssues, ...(blocking.length ? [] : serverIssues)]} onChange={(next) => setEditing((current) => current && { ...current, model: next })} />
            </div>
          ) : <p className={styles.empty}>Choisis un modèle dans la bibliothèque.</p>}
        </div>
      )}
    </div>
  );
}
