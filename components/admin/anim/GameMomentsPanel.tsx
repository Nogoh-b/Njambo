"use client";

/* Moments du jeu (phase G4) : quel modèle de l'atelier anime chaque mouvement
   de base de la partie. Sans modèle, le moment garde l'animation actuelle du
   jeu. Mêmes règles que le serveur (validateMoments) : départ / arrivée
   imposés, durée plafonnée, pli gagné + fin de pli dans la pause de fin de
   pli. « Essayer dans une partie » ouvre le jeu avec l'attribution en cours,
   sur cet onglet seulement, sans rien enregistrer. */

import { useRef, useState } from "react";
import { ChoreoDemoStage, type ChoreoDemoHandle } from "@/components/power/choreo/ChoreoDemoStage";
import { GAME_CONFIG } from "@/config/gameConfig";
import {
  ANIM_V2_MOMENTS, GAME_MOMENTS, GAME_MOMENT_KEYS, MOMENT_PREVIEW_PARAM, encodeMomentPreview, isV2Ref, momentAnimV2, momentDurationMs, momentDurationV2, momentMotif, motifFitsMoment, v2IdOf, v2Ref, validateMoments,
  type GameMoment, type GameMomentDef, type MomentMap,
} from "@/engine/anim/moments";
import type { AnimMotif } from "@/engine/anim/motif";
import { getMotif, isMotifArchived, listMotifs } from "@/engine/anim/registry";
import type { AnimV2 } from "@/engine/anim/v2/model";
import { getAnimV2, isAnimV2Archived, listAnimsV2 } from "@/engine/anim/v2/registry";
import { useMotifCatalogRevision } from "@/hooks/useMotifCatalog";
import { anchorLabel } from "./MotifInspector";
import styles from "../AdminConsole.module.css";

const seconds = (ms: number) => `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} s`;

/** Modèles proposés pour un moment : ceux qui partent (et arrivent) au bon endroit, plus le choix courant s'il est archivé. */
function candidates(moment: GameMoment, current: string | undefined): AnimMotif[] {
  const list = listMotifs().filter((motif) => motifFitsMoment(moment, motif));
  const chosen = current && !isV2Ref(current) ? getMotif(current) : null;
  return chosen && !list.some((motif) => motif.id === chosen.id) ? [...list, chosen] : list;
}

/** Modèles V2 proposés : seulement pour les vrais déplacements (carte jouée, distribution), plus le choix courant s'il est archivé. */
function candidatesV2(moment: GameMoment, current: string | undefined): AnimV2[] {
  if (!ANIM_V2_MOMENTS.includes(moment)) return [];
  const list = listAnimsV2();
  const chosen = isV2Ref(current) ? getAnimV2(v2IdOf(current)) : null;
  return chosen && !list.some((model) => model.id === chosen.id) ? [...list, chosen] : list;
}

/** Modèle V1 ou V2 désigné par une attribution. */
function resolve(ref: string | undefined): { motif: AnimMotif | null; v2: AnimV2 | null } {
  if (!ref) return { motif: null, v2: null };
  return isV2Ref(ref) ? { motif: null, v2: getAnimV2(v2IdOf(ref)) } : { motif: getMotif(ref), v2: null };
}

export function GameMomentsPanel({ saved, onSave, onClose }: {
  /** Attribution enregistrée (celle que reçoivent les joueurs). */
  saved: MomentMap;
  /** Absent : aperçu local (banc d'essai), rien n'est enregistré. Renvoie le message de réussite, lève une erreur lisible sinon. */
  onSave?(map: MomentMap): Promise<string>;
  onClose?(): void;
}) {
  useMotifCatalogRevision(); // re-rendu à chaque publication (nouveaux modèles proposés)
  const [draft, setDraft] = useState<MomentMap>(saved);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [playing, setPlaying] = useState<GameMoment | null>(null);
  const stage = useRef<ChoreoDemoHandle>(null);

  const issues = validateMoments(draft, getMotif);
  const errorFor = (moment: GameMoment) => issues.filter((issue) => issue.path === `moments.${moment}`).map((issue) => issue.message).join(" ");
  const dirty = encodeMomentPreview(draft) !== encodeMomentPreview(saved);
  const choose = (moment: GameMoment, id: string) => {
    setNotice(null);
    setDraft((current) => {
      const next = { ...current };
      if (id) next[moment] = id; else delete next[moment];
      return next;
    });
  };
  const preview = async (moment: GameMoment) => {
    const { motif, v2 } = resolve(draft[moment]);
    if (!motif && !v2) return;
    setPlaying(moment);
    try {
      if (v2) await stage.current?.playAnimV2(momentAnimV2(moment, v2), moment === "deal" ? "draw" : "play");
      else if (motif) await stage.current?.playMotif(momentMotif(moment, motif));
    } finally { setPlaying(null); }
  };
  const save = async () => {
    if (!onSave) return;
    setBusy(true);
    try { setNotice({ kind: "ok", text: await onSave(draft) }); } catch (cause) { setNotice({ kind: "error", text: cause instanceof Error ? cause.message : String(cause) }); } finally { setBusy(false); }
  };
  const tryInGame = () => window.open(`/?${MOMENT_PREVIEW_PARAM}=${encodeURIComponent(encodeMomentPreview(draft))}`, "_blank");

  const win = draft.trickWin ? getMotif(draft.trickWin) : null;
  const collect = draft.trickCollect ? getMotif(draft.trickCollect) : null;
  const trickTotal = (win ? momentDurationMs("trickWin", win) : 0) + (collect ? momentDurationMs("trickCollect", collect) : 0);

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 520px", minWidth: 0 }}>
        <p className={styles.hint} style={{ marginTop: 0 }}>
          Un moment sans modèle garde l&apos;animation actuelle du jeu. Un modèle doit partir (et arriver) là où le moment l&apos;impose, et tenir dans sa durée.
          Seuls les modèles publiés ou ceux du jeu sont proposés : tous les joueurs doivent les avoir.
        </p>
        {notice && <div className={`${styles.notice} ${styles[notice.kind]}`}>{notice.text}</div>}
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="game-moments">
            <thead><tr><th>Moment</th><th>Départ → arrivée</th><th>Modèle</th><th>Durée</th><th /></tr></thead>
            <tbody>
              {GAME_MOMENT_KEYS.map((moment) => {
                const def: GameMomentDef = GAME_MOMENTS[moment];
                const id = draft[moment];
                const { motif, v2 } = resolve(id);
                const error = errorFor(moment);
                const options = candidates(moment, id);
                const optionsV2 = candidatesV2(moment, id);
                const duration = def.timing !== "motif" ? null : motif ? momentDurationMs(moment, motif) : v2 ? momentDurationV2(moment, v2) : null;
                return (
                  <tr key={moment} data-testid={`moment-${moment}`}>
                    <td style={{ maxWidth: 240 }}>
                      <b>{def.label}</b>
                      <div className={styles.hint}>{def.description}</div>
                    </td>
                    <td className={styles.hint} style={{ whiteSpace: "nowrap" }}>{anchorLabel(def.from)} → {def.to ? anchorLabel(def.to) : "libre"}</td>
                    <td style={{ minWidth: 200 }}>
                      <label className={`${styles.field} ${error ? styles.invalid : ""}`}>
                        <select value={id ?? ""} data-testid={`moment-select-${moment}`} onChange={(event) => choose(moment, event.target.value)}>
                          <option value="">Animation actuelle du jeu</option>
                          {optionsV2.length > 0 ? (
                            <>
                              <optgroup label="Modèles V1">
                                {options.map((item) => <option key={item.id} value={item.id}>{item.name}{isMotifArchived(item.id) ? " (archivé)" : ""}</option>)}
                              </optgroup>
                              <optgroup label="Animation V2 · zones intelligentes">
                                {optionsV2.map((item) => <option key={item.id} value={v2Ref(item.id)}>V2 · {item.name}{isAnimV2Archived(item.id) ? " (archivé)" : ""}</option>)}
                              </optgroup>
                            </>
                          ) : options.map((item) => <option key={item.id} value={item.id}>{item.name}{isMotifArchived(item.id) ? " (archivé)" : ""}</option>)}
                        </select>
                      </label>
                      {v2 && <div className={styles.hint}>V2 : les zones donnent les poses, le modèle règle le mouvement.</div>}
                      {id && !motif && !v2 && <div className={styles.fieldError}>Modèle « {isV2Ref(id) ? `V2 ${v2IdOf(id)}` : id} » introuvable : l&apos;animation actuelle du jeu s&apos;applique.</div>}
                      {error && <div className={styles.fieldError}>{error}</div>}
                      {options.length === 0 && <div className={styles.hint}>Aucun modèle ne part de « {anchorLabel(def.from)} » : crée-en un depuis « Toutes les transitions ».</div>}
                    </td>
                    <td style={{ whiteSpace: "nowrap", color: duration !== null && def.maxMs && duration > def.maxMs ? "var(--danger)" : undefined }}>
                      {def.timing === "game"
                        ? <span className={styles.hint}>rythme du jeu<br />{GAME_CONFIG.anim.dealPerCard} ms entre les cartes, vol {GAME_CONFIG.anim.dealFlight} ms</span>
                        : <>{duration !== null ? seconds(duration) : "—"} <span className={styles.hint}>/ {seconds(def.maxMs ?? 0)} max{def.measure === "flight" ? " (vol)" : ""}</span></>}
                    </td>
                    <td>
                      <button type="button" className={`${styles.btn} ${styles.small}`} disabled={(!motif && !v2) || playing !== null} title="Jouer sur la table de démonstration" onClick={() => void preview(moment)}>
                        {playing === moment ? "…" : "▶"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className={styles.hint} data-testid="trick-total" style={{ color: trickTotal > GAME_CONFIG.anim.trickPause ? "var(--danger)" : undefined }}>
          Pause de fin de pli : « Pli gagné » puis « Fin de pli » = {seconds(trickTotal)} sur {seconds(GAME_CONFIG.anim.trickPause)}.
        </p>
        <div className={styles.row} style={{ justifyContent: "flex-end" }}>
          <button type="button" className={styles.btn} disabled={busy || Object.keys(draft).length === 0} onClick={() => { setNotice(null); setDraft({}); }}>Tout remettre à l&apos;animation actuelle</button>
          <button type="button" className={styles.btn} data-testid="try-moments" disabled={issues.length > 0} title="Ouvre le jeu dans un nouvel onglet avec cette attribution (rien n'est enregistré)" onClick={tryInGame}>▶ Essayer dans une partie</button>
          {onSave && <button type="button" className={`${styles.btn} ${styles.primary}`} data-testid="save-moments" disabled={busy || !dirty || issues.length > 0} onClick={() => void save()}>Enregistrer l&apos;attribution</button>}
          {onClose && <button type="button" className={styles.btn} onClick={onClose}>Fermer</button>}
        </div>
        {!onSave && <p className={styles.hint}>Aperçu local : rien n&apos;est enregistré. L&apos;attribution se publie dans la console admin, section Animations.</p>}
        {onSave && dirty && <p className={styles.hint}>Modifications non enregistrées.</p>}
      </div>
      <ChoreoDemoStage ref={stage} choreo={null} width={220} />
    </div>
  );
}
