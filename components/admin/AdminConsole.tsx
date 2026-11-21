"use client";

/* Console admin « Régie du Ter » : navigation latérale + sections.
   Accès réservé aux comptes `admin` (auth_users.admin, porté par le jeton
   d'accès et vérifié aussi côté serveur sur chaque commande). */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { auth, getIdTokenResult } from "@/lib/authClient";
import { db } from "@/lib/firebase";
import { backendCallable } from "@/lib/backendCallable";
import { collection, limit, onSnapshot, orderBy, query } from "@/lib/firestoreClient";
import { adminApi, adminErrorText, type AdminEventSummary } from "./adminApi";
import { EventsAdmin } from "./EventsAdmin";
import { PlayersAdmin } from "./PlayersAdmin";
import { PowerCardsAdmin } from "./PowerCardsAdmin";
import { AnimationsAdmin } from "./AnimationsAdmin";
import { AssistantAdmin } from "./AssistantAdmin";
import { useMotifCatalogLoader } from "@/hooks/useMotifCatalog";
import { SeasonsAdmin } from "./SeasonsAdmin";
import { CosmeticsAdmin } from "./CosmeticsAdmin";
import { NotificationsAdmin } from "./NotificationsAdmin";
import { GameplayAdmin } from "./GameplayAdmin";
import { ChangelogAdmin } from "./ChangelogAdmin";
import type { ChangelogAdminSection } from "@/domain";
import { LIFECYCLE_LABELS, LifecycleBadge, formatDateTime } from "./adminUi";
import styles from "./AdminConsole.module.css";

type Section = ChangelogAdminSection;

const NAV: Array<{ key: Section; label: string; soon?: string }> = [
  { key: "dashboard", label: "Tableau de bord" },
  { key: "changelog", label: "Nouveautés" },
  { key: "events", label: "Événements" },
  { key: "gameplay", label: "Règles des parties" },
  { key: "seasons", label: "Saisons" },
  { key: "cosmetics", label: "Cosmétiques" },
  { key: "powers", label: "Cartes de pouvoir" },
  { key: "animations", label: "Animations" },
  { key: "assistant", label: "Assistant IA" },
  { key: "notifications", label: "Notifications" },
  { key: "players", label: "Joueurs" },
  { key: "audit", label: "Audit" },
  { key: "tools", label: "Outils" },
];

function ConsoleBody() {
  const { user, loading } = useAuth();
  // Modèles d'animation publiés : bibliothèque de l'atelier, chorégraphies et validation des cartes.
  useMotifCatalogLoader();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [section, setSection] = useState<Section>("dashboard");
  const [events, setEvents] = useState<AdminEventSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) { setAllowed(false); return; }
    void getIdTokenResult(auth.currentUser, true).then((token) => setAllowed(token.claims.admin === true)).catch(() => setAllowed(false));
  }, [user]);

  const reload = useCallback(async () => {
    try {
      const result = await adminApi.listEvents();
      setEvents(result.events);
      setLoadError(null);
    } catch (cause) {
      setLoadError(adminErrorText(cause));
    }
  }, []);

  useEffect(() => { if (allowed) void reload(); }, [allowed, reload]);

  if (loading || allowed === null) return <main className="nj-admin"><p>Vérification des droits…</p></main>;
  if (!user || user.isAnonymous || !allowed) {
    return (
      <main className="nj-admin">
        <h1>Régie du Ter</h1>
        <p>Accès refusé. Un compte avec le droit <code>admin</code> est requis.</p>
        <p>Depuis <code>server/</code> : <code>node scripts/set-admin.cjs ton.email@exemple.com</code>, puis reconnecte-toi.</p>
        <Link href="/">Retour au jeu</Link>
      </main>
    );
  }

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar} aria-label="Sections de la console">
        <div className={styles.brand}><small>BACK-OFFICE</small><strong>Régie du Ter</strong></div>
        {NAV.map((item) => (
          <button key={item.key} type="button" className={styles.navItem} aria-current={section === item.key ? "page" : undefined} disabled={Boolean(item.soon)} onClick={() => setSection(item.key)}>
            {item.label}{item.soon && <span className={styles.soon}>{item.soon}</span>}
          </button>
        ))}
        <div className={styles.sidebarFoot}>{user.email}<br /><Link href="/">← Retour au jeu</Link></div>
      </nav>
      <main className={styles.main}>
        {loadError && <div className={`${styles.notice} ${styles.error}`}>{loadError} <button type="button" className={`${styles.btn} ${styles.small}`} onClick={() => void reload()}>Réessayer</button></div>}
        {section === "dashboard" && <Dashboard events={events} openEvents={() => setSection("events")} />}
        {section === "changelog" && <ChangelogAdmin onOpenSection={setSection} />}
        {section === "events" && <EventsAdmin events={events} reload={reload} />}
        {section === "gameplay" && <GameplayAdmin />}
        {section === "notifications" && <NotificationsAdmin events={events} />}
        {section === "seasons" && <SeasonsAdmin />}
        {section === "cosmetics" && <CosmeticsAdmin />}
        {section === "powers" && <PowerCardsAdmin onOpenSection={setSection} />}
        {section === "animations" && <AnimationsAdmin onOpenSection={setSection} />}
        {section === "assistant" && <AssistantAdmin onOpenSection={setSection} />}
        {section === "players" && <PlayersAdmin />}
        {section === "audit" && <AuditLog />}
        {section === "tools" && <Tools />}
      </main>
    </div>
  );
}

function Dashboard({ events, openEvents }: { events: AdminEventSummary[] | null; openEvents: () => void }) {
  const list = events ?? [];
  const live = list.filter((event) => event.lifecycle === "live");
  const upcoming = list.filter((event) => event.lifecycle === "scheduled" || (event.scheduledAt ?? 0) > 0);
  const now = Date.now();
  const endingSoon = live.filter((event) => event.endsAt - now < 48 * 3_600_000);
  return (
    <div>
      <div className={styles.pageHead}><div><h1>Tableau de bord</h1><p>Ce qui tourne en ce moment dans le Ter.</p></div></div>
      <section className={styles.panel}>
        <div className={styles.kpis}>
          {(["live", "scheduled", "draft", "ended", "archived"] as const).map((lifecycle) => (
            <div key={lifecycle} className={styles.kpi}><span>{LIFECYCLE_LABELS[lifecycle]}</span><strong>{events ? list.filter((event) => event.lifecycle === lifecycle).length : "…"}</strong></div>
          ))}
        </div>
      </section>
      <section className={styles.panel}>
        <h2>En ligne</h2>
        {live.length === 0 ? <p className={styles.hint}>Aucun événement en ligne.</p> : (
          <table className={styles.table}><tbody>
            {live.map((event) => (
              <tr key={event.eventId}><td><strong>{event.title}</strong></td><td><LifecycleBadge lifecycle={event.lifecycle} /></td><td className={styles.hint}>fin le {formatDateTime(event.endsAt)}</td></tr>
            ))}
          </tbody></table>
        )}
        {endingSoon.length > 0 && <p className={styles.hint}>⏳ {endingSoon.length} événement(s) se termine(nt) dans moins de 48 h.</p>}
      </section>
      <section className={styles.panel}>
        <h2>À venir</h2>
        {upcoming.length === 0 ? <p className={styles.hint}>Rien de programmé.</p> : (
          <table className={styles.table}><tbody>
            {upcoming.map((event) => (
              <tr key={event.eventId}><td><strong>{event.title}</strong></td><td className={styles.hint}>mise en ligne {formatDateTime(event.scheduledAt ?? event.startsAt)}</td></tr>
            ))}
          </tbody></table>
        )}
        <div className={styles.row} style={{ marginTop: 12 }}><button type="button" className={`${styles.btn} ${styles.primary}`} onClick={openEvents}>Gérer les événements</button></div>
      </section>
    </div>
  );
}

interface AuditEntry { id: string; uid: string; action: string; createdAt: number; [key: string]: unknown }

function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => onSnapshot(
    query(collection(db, "admin_audit"), orderBy("createdAt", "desc"), limit(100)),
    (snapshot) => setEntries(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AuditEntry)),
    (cause) => setError(cause.message),
  ), []);
  return (
    <div>
      <div className={styles.pageHead}><div><h1>Audit</h1><p>Les 100 dernières actions admin (temps réel).</p></div></div>
      {error && <div className={`${styles.notice} ${styles.error}`}>{error}</div>}
      <section className={styles.panel}>
        {entries === null ? <p className={styles.empty}>Chargement…</p> : entries.length === 0 ? <p className={styles.empty}>Aucune action consignée.</p> : (
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.audit}`}>
              <thead><tr><th>Date</th><th>Action</th><th>Par</th><th>Détails</th></tr></thead>
              <tbody>
                {entries.map(({ id, uid, action, createdAt, ...details }) => (
                  <tr key={id}><td>{formatDateTime(createdAt)}</td><td><strong>{action}</strong></td><td><code>{uid === "system" ? "système" : uid.slice(0, 10)}</code></td><td><code>{JSON.stringify(details)}</code></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* Outils historiques : données de base, préversion, brouillon JSON brut. */
function Tools() {
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [type, setType] = useState("offer");
  const [contentId, setContentId] = useState("nouveau_contenu");
  const [revision, setRevision] = useState(1);
  const [payloadText, setPayloadText] = useState('{\n  "title": "Nouveau contenu",\n  "published": false\n}');
  const [lastDraftId, setLastDraftId] = useState<string | null>(null);
  let payload: Record<string, unknown> | null = null;
  try { payload = JSON.parse(payloadText) as Record<string, unknown>; } catch { payload = null; }

  const run = async (action: () => Promise<string>) => {
    try { setStatus({ kind: "ok", text: await action() }); } catch (cause) { setStatus({ kind: "error", text: adminErrorText(cause) }); }
  };

  return (
    <div>
      <div className={styles.pageHead}><div><h1>Outils</h1><p>Amorçage, interrupteurs et contenu JSON brut (offres, boosters, tables de gains).</p></div></div>
      {status && <div className={`${styles.notice} ${styles[status.kind]}`}>{status.text}</div>}
      <section className={styles.panel}>
        <h2>Mise en route</h2>
        <div className={styles.row}>
          <button type="button" className={styles.btn} onClick={() => void run(async () => {
            const result = await backendCallable("seedLiveOps")({});
            return `Données initiales prêtes : ${JSON.stringify(result.data)}`;
          })}>Installer les données de base</button>
          <button type="button" className={styles.btn} onClick={() => void run(async () => {
            const result = await backendCallable("updateFeatureFlags")({ flags: { economy: true, authoritativeMatches: true, shop: true, events: true, simulatedPayments: true, admin: true, notifications: true } });
            return `Fonctionnalités activées : ${JSON.stringify(result.data)}`;
          })}>Activer la préversion</button>
          <button type="button" className={styles.btn} onClick={() => void run(async () => {
            const result = await backendCallable<Record<string, unknown>, { created: number; total: number; published: number; catalogRevision: number }>("seedPowerCards")({});
            return `Cartes de pouvoir : ${result.data.created} migrée(s) sur ${result.data.total} ; catalogue publié (révision ${result.data.catalogRevision}, ${result.data.published} cartes).`;
          })}>Migrer les cartes de pouvoir en base</button>
        </div>
      </section>
      <section className={styles.panel}>
        <h2>Contenu JSON brut</h2>
        <p className={styles.hint}>Les événements se gèrent dans la section Événements.</p>
        <div className={styles.grid3}>
          <label className={styles.field}><span>Type</span><select value={type} onChange={(e) => setType(e.target.value)}><option value="offer">Offre</option><option value="booster_definition">Booster</option><option value="reward_table">Table de récompenses</option><option value="runtime_config">Configuration moteur</option></select></label>
          <label className={styles.field}><span>Identifiant</span><input value={contentId} maxLength={96} onChange={(e) => setContentId(e.target.value.replace(/[^a-z0-9_]/g, "_"))} /></label>
          <label className={styles.field}><span>Révision</span><input type="number" min={1} value={revision} onChange={(e) => setRevision(Number(e.target.value))} /></label>
          <label className={`${styles.field} ${styles.full} ${payload ? "" : styles.invalid}`}><span>Contenu JSON</span><textarea rows={12} spellCheck={false} value={payloadText} onChange={(e) => setPayloadText(e.target.value)} />{!payload && <span className={styles.fieldError}>JSON invalide</span>}</label>
        </div>
        <div className={styles.row} style={{ marginTop: 10 }}>
          <button type="button" className={styles.btn} disabled={!payload} onClick={() => void run(async () => {
            const result = await backendCallable<Record<string, unknown>, { draftId: string }>("saveAdminDraft")({ type, contentId, revision, payload });
            setLastDraftId(result.data.draftId);
            return `Brouillon ${result.data.draftId} enregistré.`;
          })}>Enregistrer le brouillon</button>
          <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!lastDraftId} onClick={() => void run(async () => {
            const result = await backendCallable("publishAdminDraft")({ draftId: lastDraftId });
            return `Publication confirmée : ${JSON.stringify(result.data)}`;
          })}>Publier la révision</button>
        </div>
      </section>
    </div>
  );
}

export function AdminConsole() { return <AuthProvider><ConsoleBody /></AuthProvider>; }
