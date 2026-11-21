"use client";

import { useMemo, useState } from "react";
import {
  CHANGELOG_ENTRIES,
  splitChangelogBySide,
  type ChangelogAdminSection,
  type ChangelogEntry,
  type ChangelogStatus,
} from "@/domain";
import adminStyles from "./AdminConsole.module.css";
import styles from "./ChangelogAdmin.module.css";

type ViewMode = "split" | "admin" | "app";
type StatusFilter = "all" | ChangelogStatus;

const STATUS_LABELS: Record<ChangelogStatus, string> = {
  new: "Nouveau",
  live: "Livré",
  wip: "En cours",
};

const SECTION_LABELS: Record<ChangelogAdminSection, string> = {
  dashboard: "Tableau de bord",
  changelog: "Nouveautés",
  events: "Événements",
  gameplay: "Règles des parties",
  seasons: "Saisons",
  cosmetics: "Cosmétiques",
  powers: "Cartes de pouvoir",
  animations: "Animations",
  assistant: "Assistant IA",
  notifications: "Notifications",
  players: "Joueurs",
  audit: "Audit",
  tools: "Outils",
};

function formatIsoDate(iso: string): string {
  const parsed = Date.parse(`${iso}T12:00:00Z`);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function matchesEntry(entry: ChangelogEntry, status: StatusFilter, needle: string): boolean {
  if (status !== "all" && entry.status !== status) return false;
  if (!needle) return true;
  const hay = [
    entry.title,
    entry.category,
    entry.summary,
    entry.date,
    ...entry.highlights,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

interface ChangelogAdminProps {
  onOpenSection: (section: ChangelogAdminSection) => void;
}

export function ChangelogAdmin({ onOpenSection }: ChangelogAdminProps) {
  const [view, setView] = useState<ViewMode>("split");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const allSplit = useMemo(() => splitChangelogBySide(CHANGELOG_ENTRIES), []);
  const latestDate = useMemo(() => {
    let latest = "";
    for (const entry of CHANGELOG_ENTRIES) {
      if (entry.date > latest) latest = entry.date;
    }
    return latest;
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return {
      admin: allSplit.admin.filter((entry) => matchesEntry(entry, statusFilter, needle)),
      app: allSplit.app.filter((entry) => matchesEntry(entry, statusFilter, needle)),
    };
  }, [allSplit, query, statusFilter]);

  const newCount = useMemo(
    () => CHANGELOG_ENTRIES.filter((entry) => entry.status === "new").length,
    [],
  );

  const renderColumn = (
    side: "admin" | "app",
    title: string,
    subtitle: string,
    entries: ChangelogEntry[],
  ) => (
    <section
      className={`${styles.column} ${side === "admin" ? styles.colAdmin : styles.colApp}`}
      aria-label={title}
    >
      <header className={styles.colHead}>
        <div>
          <span className={styles.colKicker}>
            {side === "admin" ? "BACK-OFFICE · RÉGIE DU TER" : "APPLICATION JOUEUR · NJAMBO"}
          </span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className={styles.colCount}>{entries.length}</span>
      </header>

      {entries.length === 0 ? (
        <div className={styles.emptyCol}>
          Aucune nouveauté ne correspond à ces filtres côté {side === "admin" ? "Admin" : "App"}.
        </div>
      ) : (
        <div className={styles.cardList}>
          {entries.map((entry) => (
            <article key={entry.id} className={styles.entryCard}>
              <div className={styles.entryTop}>
                <div className={styles.entryTags}>
                  <span className={`${styles.statusPill} ${styles[`st_${entry.status}`]}`}>
                    {STATUS_LABELS[entry.status]}
                  </span>
                  <span className={styles.categoryPill}>{entry.category}</span>
                </div>
                <time className={styles.entryDate} dateTime={entry.date}>
                  {formatIsoDate(entry.date)}
                </time>
              </div>

              <h3 className={styles.entryTitle}>{entry.title}</h3>
              <p className={styles.entrySummary}>{entry.summary}</p>

              <ul className={styles.highlightList}>
                {entry.highlights.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>

              {entry.adminSection && entry.adminSection !== "changelog" && (
                <div className={styles.entryFoot}>
                  <button
                    type="button"
                    className={`${adminStyles.btn} ${adminStyles.small}`}
                    onClick={() => onOpenSection(entry.adminSection!)}
                  >
                    Ouvrir « {SECTION_LABELS[entry.adminSection]} » →
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div>
      <div className={adminStyles.pageHead}>
        <div>
          <h1>Nouveautés</h1>
          <p>
            Journal complet et scindé de toutes les évolutions livrées côté Admin (Régie du Ter) et côté App (Application joueur).
          </p>
        </div>
      </div>

      {/* KPIs synthétiques */}
      <section className={adminStyles.panel}>
        <div className={adminStyles.kpis}>
          <div className={adminStyles.kpi}>
            <span>Total des nouveautés</span>
            <strong>{CHANGELOG_ENTRIES.length}</strong>
          </div>
          <div className={`${adminStyles.kpi} ${styles.kpiAdmin}`}>
            <span>Côté Admin</span>
            <strong>{allSplit.admin.length}</strong>
          </div>
          <div className={`${adminStyles.kpi} ${styles.kpiApp}`}>
            <span>Côté App</span>
            <strong>{allSplit.app.length}</strong>
          </div>
          <div className={adminStyles.kpi}>
            <span>Dernières livraisons</span>
            <strong>{newCount}</strong>
          </div>
          <div className={adminStyles.kpi}>
            <span>Dernière date</span>
            <strong className={styles.dateKpi}>{formatIsoDate(latestDate)}</strong>
          </div>
        </div>
      </section>

      {/* Barre de filtres & bascule scindée */}
      <section className={adminStyles.panel}>
        <div className={styles.toolbar}>
          <div className={styles.filterGroup} role="group" aria-label="Mode d’affichage">
            {(
              [
                { id: "split", label: "Vue scindée (Admin | App)" },
                { id: "admin", label: `Côté Admin (${filtered.admin.length})` },
                { id: "app", label: `Côté App (${filtered.app.length})` },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={adminStyles.chip}
                aria-pressed={view === mode.id}
                onClick={() => setView(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className={styles.filterGroup} role="group" aria-label="Filtrer par statut">
            {(
              [
                { id: "all", label: "Tous statuts" },
                { id: "new", label: "Nouveau" },
                { id: "live", label: "Livré" },
                { id: "wip", label: "En cours" },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                className={adminStyles.chip}
                aria-pressed={statusFilter === st.id}
                onClick={() => setStatusFilter(st.id)}
              >
                {st.label}
              </button>
            ))}
          </div>

          <label className={styles.searchWrap}>
            <span className={styles.srOnly}>Rechercher une nouveauté</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une fonctionnalité…"
              className={styles.searchInput}
            />
          </label>
        </div>
      </section>

      {/* Colonnes scindées Admin / App */}
      <div className={view === "split" ? styles.splitGrid : styles.singleGrid}>
        {(view === "split" || view === "admin") &&
          renderColumn(
            "admin",
            "Côté Admin",
            "Console Régie du Ter, outils de pilotage LiveOps, éditeurs et support.",
            filtered.admin,
          )}
        {(view === "split" || view === "app") &&
          renderColumn(
            "app",
            "Côté App",
            "Écrans joueurs, boutique, collection d’objets, parties, social et performances.",
            filtered.app,
          )}
      </div>
    </div>
  );
}
