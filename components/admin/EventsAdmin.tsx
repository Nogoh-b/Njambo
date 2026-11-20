"use client";

/* Section Événements : liste filtrable + ouverture de l'éditeur. */

import { useCallback, useEffect, useState } from "react";
import { blankEventVersion, type EventLifecycle, type EventVersion } from "@/domain";
import { adminApi, adminErrorText, type AdminEventSummary } from "./adminApi";
import { EventEditor } from "./EventEditor";
import { LIFECYCLE_LABELS, LifecycleBadge, formatDateTime } from "./adminUi";
import styles from "./AdminConsole.module.css";

const FILTERS: Array<EventLifecycle | "all"> = ["all", "draft", "scheduled", "live", "ended", "archived"];
const EVENT_ID = /^[a-z0-9_]{3,64}$/;

type Editing = { event: EventVersion; summary: AdminEventSummary | null; isNew: boolean };

export function EventsAdmin({ events, reload }: { events: AdminEventSummary[] | null; reload: () => Promise<void> }) {
  const [filter, setFilter] = useState<EventLifecycle | "all">("all");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [askId, setAskId] = useState<{ mode: "new" } | { mode: "duplicate"; from: string } | null>(null);

  const open = useCallback(async (eventId: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const detail = await adminApi.getEvent(eventId);
      if (!detail.working) throw new Error("Fiche introuvable");
      setEditing({ event: detail.working, summary: detail.summary, isNew: false });
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorText(cause) });
    } finally {
      setBusy(false);
    }
  }, []);

  /* Après une action dans l'éditeur : rafraîchir la liste et le résumé (statut). */
  const onChanged = useCallback(async (eventId: string) => {
    await reload();
    try {
      const detail = await adminApi.getEvent(eventId);
      setEditing((current) => (current && current.event.eventId === eventId ? { ...current, summary: detail.summary, isNew: false } : current));
    } catch { /* la liste suffit */ }
  }, [reload]);

  const act = async (action: () => Promise<string>) => {
    setBusy(true);
    setNotice(null);
    try {
      setNotice({ kind: "ok", text: await action() });
      await reload();
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorText(cause) });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { if (!editing) window.scrollTo({ top: 0 }); }, [editing]);

  if (editing) {
    return (
      <EventEditor
        key={editing.event.eventId + (editing.isNew ? ":new" : "")}
        initial={editing.event}
        summary={editing.summary}
        isNew={editing.isNew}
        onClose={() => setEditing(null)}
        onChanged={(id) => void onChanged(id)}
      />
    );
  }

  const visible = (events ?? []).filter((event) => filter === "all" || event.lifecycle === filter);
  const count = (lifecycle: EventLifecycle) => (events ?? []).filter((event) => event.lifecycle === lifecycle).length;

  return (
    <div>
      <div className={styles.pageHead}>
        <div><h1>Événements</h1><p>Crée, programme et pilote les événements sans toucher au code.</p></div>
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => setAskId({ mode: "new" })}>+ Nouvel événement</button>
      </div>
      {notice && <div className={`${styles.notice} ${styles[notice.kind]}`}>{notice.text}</div>}
      <div className={styles.filters}>
        {FILTERS.map((key) => (
          <button key={key} type="button" className={styles.chip} aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {key === "all" ? `Tous (${events?.length ?? 0})` : `${LIFECYCLE_LABELS[key]} (${count(key)})`}
          </button>
        ))}
      </div>
      <section className={styles.panel}>
        {events === null ? <p className={styles.empty}>Chargement…</p> : visible.length === 0 ? <p className={styles.empty}>Aucun événement dans cette catégorie.</p> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Événement</th><th>Statut</th><th>Période</th><th>Révision</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {visible.map((event) => (
                  <tr key={event.eventId}>
                    <td>
                      <div className={styles.eventCell}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {event.imageUrl ? <img className={styles.thumb} src={event.imageUrl} alt="" /> : <span className={styles.thumb} />}
                        <div><strong>{event.title || event.eventId}</strong><code>{event.eventId} · {event.mode.toUpperCase()}</code></div>
                      </div>
                    </td>
                    <td>
                      <LifecycleBadge lifecycle={event.lifecycle} />
                      {event.hasDraft && event.lifecycle !== "draft" && <div className={styles.hint}>Brouillon en cours</div>}
                      {event.scheduledAt && event.lifecycle !== "scheduled" && <div className={styles.hint}>Rév. {event.scheduledRevision} le {formatDateTime(event.scheduledAt)}</div>}
                      {event.lifecycle === "scheduled" && event.scheduledAt && <div className={styles.hint}>le {formatDateTime(event.scheduledAt)}</div>}
                    </td>
                    <td className={styles.hint}>{event.startsAt ? formatDateTime(event.startsAt) : "Dès maintenant"}<br />→ {formatDateTime(event.endsAt)}</td>
                    <td>{event.activeRevision ? `rév. ${event.activeRevision}` : "—"}</td>
                    <td>
                      <div className={styles.row} style={{ justifyContent: "flex-end" }}>
                        <button type="button" className={`${styles.btn} ${styles.small} ${styles.primary}`} disabled={busy} onClick={() => void open(event.eventId)}>Modifier</button>
                        <button type="button" className={`${styles.btn} ${styles.small}`} disabled={busy} onClick={() => setAskId({ mode: "duplicate", from: event.eventId })}>Dupliquer</button>
                        {event.scheduledRevision && (
                          <button type="button" className={`${styles.btn} ${styles.small}`} disabled={busy} onClick={() => void act(async () => { await adminApi.cancelSchedule(event.eventId); return "Programmation annulée."; })}>Annuler la programmation</button>
                        )}
                        {event.lifecycle === "draft" && event.hasDraft && !event.activeRevision && (
                          <button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} disabled={busy} onClick={() => { if (window.confirm("Supprimer ce brouillon ?")) void act(async () => { await adminApi.discardDraft(event.eventId); return "Brouillon supprimé."; }); }}>Supprimer</button>
                        )}
                        {event.activeRevision && event.lifecycle !== "archived" && (
                          <button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} disabled={busy} onClick={() => { if (window.confirm(`Retirer « ${event.title} » du jeu ?`)) void act(async () => { await adminApi.archive(event.eventId, true); return "Événement archivé : il n’est plus visible des joueurs."; }); }}>Archiver</button>
                        )}
                        {event.lifecycle === "archived" && (
                          <button type="button" className={`${styles.btn} ${styles.small}`} disabled={busy} onClick={() => void act(async () => { await adminApi.archive(event.eventId, false); return "Événement remis en ligne."; })}>Désarchiver</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {askId && (
        <IdDialog
          title={askId.mode === "new" ? "Nouvel événement" : `Dupliquer « ${askId.from} »`}
          taken={new Set((events ?? []).map((event) => event.eventId))}
          onCancel={() => setAskId(null)}
          onConfirm={(id) => {
            const request = askId;
            setAskId(null);
            if (request.mode === "new") {
              setEditing({ event: blankEventVersion(id), summary: null, isNew: true });
            } else {
              void act(async () => { await adminApi.duplicate(request.from, id); await open(id); return `Copie créée en brouillon : ${id}.`; });
            }
          }}
        />
      )}
    </div>
  );
}

function IdDialog({ title, taken, onCancel, onConfirm }: { title: string; taken: Set<string>; onCancel: () => void; onConfirm: (id: string) => void }) {
  const [id, setId] = useState("");
  const error = !id ? null : !EVENT_ID.test(id) ? "3 à 64 caractères : a-z, 0-9 ou _." : taken.has(id) ? "Identifiant déjà utilisé." : null;
  return (
    <div className={styles.dialogBackdrop} role="dialog" aria-modal="true" onClick={onCancel}>
      <form className={styles.dialog} onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (id && !error) onConfirm(id); }}>
        <h2>{title}</h2>
        <label className={`${styles.field} ${error ? styles.invalid : ""}`}>
          <span>Identifiant (définitif)</span>
          <input autoFocus value={id} placeholder="ex. fete_du_ndole_2026" onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} />
          {error ? <span className={styles.fieldError}>{error}</span> : <span className={styles.hint}>Sert d’adresse et de clé de classement ; non modifiable ensuite.</span>}
        </label>
        <div className={styles.row}>
          <button type="button" className={styles.btn} onClick={onCancel}>Annuler</button>
          <button type="submit" className={`${styles.btn} ${styles.primary}`} disabled={!id || Boolean(error)}>Continuer</button>
        </div>
      </form>
    </div>
  );
}
