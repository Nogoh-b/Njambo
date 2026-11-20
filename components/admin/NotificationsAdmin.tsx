"use client";

/* Section Notifications : campagnes d'événements (créées depuis les fiches)
   et campagnes libres, immédiates ou programmées, avec statistiques. */

import { useCallback, useEffect, useState } from "react";
import { adminApi, adminErrorText, type AdminCampaign, type AdminEventSummary } from "./adminApi";
import { formatDateTime } from "./adminUi";
import { toLocalInput } from "./EventEditor";
import styles from "./AdminConsole.module.css";

const AUDIENCE_LABELS: Record<AdminCampaign["audience"], string> = {
  all: "Tous les joueurs",
  active_run: "Joueurs en cours de parcours",
  not_joined: "Joueurs pas encore inscrits",
};

const STATUS: Record<AdminCampaign["status"], { label: string; className: string }> = {
  scheduled: { label: "Programmée", className: "status_scheduled" },
  sending: { label: "Envoi…", className: "status_live" },
  sent: { label: "Envoyée", className: "status_ended" },
  cancelled: { label: "Annulée", className: "status_archived" },
};

export function NotificationsAdmin({ events }: { events: AdminEventSummary[] | null }) {
  const [campaigns, setCampaigns] = useState<AdminCampaign[] | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", audience: "all", eventId: "", when: "now", at: toLocalInput(Date.now() + 3_600_000) });

  const load = useCallback(async () => {
    try { setCampaigns((await adminApi.campaigns()).campaigns); } catch (cause) { setNotice({ kind: "error", text: adminErrorText(cause) }); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const atMs = form.at ? new Date(form.at).getTime() : 0;
  const invalid = form.title.trim().length < 2 || form.body.trim().length < 2
    || (form.audience !== "all" && !form.eventId)
    || (form.when === "later" && atMs <= Date.now());

  const submit = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await adminApi.createCampaign({
        title: form.title.trim(), body: form.body.trim(), audience: form.audience,
        ...(form.eventId ? { eventId: form.eventId } : {}),
        sendAt: form.when === "later" ? atMs : null,
      });
      setNotice({ kind: "ok", text: form.when === "later" ? `Campagne programmée le ${formatDateTime(result.sendAt)}.` : "Campagne envoyée dans la minute." });
      setForm((current) => ({ ...current, title: "", body: "" }));
      await load();
    } catch (cause) {
      setNotice({ kind: "error", text: adminErrorText(cause) });
    } finally {
      setBusy(false);
    }
  };

  const eventOptions = (events ?? []).filter((event) => event.activeRevision);

  return (
    <div>
      <div className={styles.pageHead}><div><h1>Notifications</h1><p>Push + notification dans l’app. Les joueurs qui ont coupé les alertes d’événements ne reçoivent rien.</p></div></div>
      {notice && <div className={`${styles.notice} ${styles[notice.kind]}`}>{notice.text}</div>}

      <section className={styles.panel}>
        <h2>Nouvelle campagne</h2>
        <div className={styles.previewWrap}>
          <div style={{ flex: "1 1 420px", minWidth: 0 }}>
            <div className={styles.grid2}>
              <label className={`${styles.field} ${styles.full}`}><span>Titre ({form.title.length}/60)</span><input value={form.title} maxLength={60} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ex. La Fête du Ndolè commence !" /></label>
              <label className={`${styles.field} ${styles.full}`}><span>Message ({form.body.length}/160)</span><textarea value={form.body} maxLength={160} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="ex. 4 tables, 3 vies, un coffre à la clé. On t’attend !" /></label>
              <label className={styles.field}><span>Audience</span>
                <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
                  {Object.entries(AUDIENCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label className={`${styles.field} ${form.audience !== "all" && !form.eventId ? styles.invalid : ""}`}><span>Événement {form.audience === "all" ? "(facultatif : ouvre son détail)" : "(requis)"}</span>
                <select value={form.eventId} onChange={(e) => setForm({ ...form, eventId: e.target.value })}>
                  <option value="">—</option>
                  {eventOptions.map((event) => <option key={event.eventId} value={event.eventId}>{event.title}</option>)}
                </select>
              </label>
              <div className={`${styles.field} ${styles.full}`}>
                <span>Envoi</span>
                <div className={styles.row}>
                  <label className={styles.check}><input type="radio" checked={form.when === "now"} onChange={() => setForm({ ...form, when: "now" })} />Maintenant</label>
                  <label className={styles.check}><input type="radio" checked={form.when === "later"} onChange={() => setForm({ ...form, when: "later" })} />Programmer</label>
                  {form.when === "later" && <input type="datetime-local" value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} style={{ width: "auto" }} />}
                </div>
              </div>
            </div>
            <div className={styles.row} style={{ marginTop: 12 }}>
              <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy || invalid} onClick={() => { if (form.when === "later" || window.confirm(`Envoyer maintenant à : ${AUDIENCE_LABELS[form.audience as AdminCampaign["audience"]]} ?`)) void submit(); }}>
                {form.when === "later" ? "Programmer" : "Envoyer"}
              </button>
            </div>
          </div>
          <div style={{ flex: "0 1 320px" }}>
            <span className={styles.hint}>Aperçu</span>
            <div style={{ marginTop: 6, padding: 12, borderRadius: 14, background: "#f4f1ea", color: "#1b1b1b", display: "flex", gap: 10, boxShadow: "0 8px 24px #0006" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/njambo/card-back.webp" alt="" width={36} height={36} style={{ borderRadius: 8, objectFit: "cover" }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "#666" }}>Njambo · maintenant</div>
                <strong style={{ display: "block", fontSize: 14 }}>{form.title || "Titre de la notification"}</strong>
                <div style={{ fontSize: 13, overflowWrap: "anywhere" }}>{form.body || "Le message apparaît ici."}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.row} style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>Historique</h2><span className={styles.spacer} /><button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => void load()}>Actualiser</button></div>
        {campaigns === null ? <p className={styles.empty}>Chargement…</p> : campaigns.length === 0 ? <p className={styles.empty}>Aucune campagne.</p> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Envoi</th><th>Message</th><th>Audience</th><th>Statut</th><th>Résultat</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td className={styles.hint}>{formatDateTime(campaign.sentAt ?? campaign.sendAt)}</td>
                    <td><strong>{campaign.title}</strong><div className={styles.hint}>{campaign.body}</div><div className={styles.hint}>{campaign.source === "event" ? `Fiche « ${campaign.eventTitle ?? campaign.eventId} »` : campaign.eventId ? `Libre · ${campaign.eventTitle ?? campaign.eventId}` : "Libre"}</div></td>
                    <td>{AUDIENCE_LABELS[campaign.audience]}</td>
                    <td><span className={`${styles.status} ${styles[STATUS[campaign.status].className]}`}>{STATUS[campaign.status].label}</span>{campaign.cancelledReason && <div className={styles.hint}>{campaign.cancelledReason}</div>}</td>
                    <td className={styles.hint}>{campaign.stats && campaign.status !== "scheduled" ? <>{campaign.stats.inApp} dans l’app · {campaign.stats.pushSent} push<br />{campaign.stats.optedOut} refus · {campaign.stats.pushFailed} échecs</> : "—"}</td>
                    <td>{campaign.status === "scheduled" && <button type="button" className={`${styles.btn} ${styles.small} ${styles.danger}`} disabled={busy} onClick={() => void (async () => {
                      try { await adminApi.cancelCampaign(campaign.id); setNotice({ kind: "ok", text: "Campagne annulée." }); await load(); } catch (cause) { setNotice({ kind: "error", text: adminErrorText(cause) }); }
                    })()}>Annuler</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
