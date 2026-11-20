"use client";

import type { EventLifecycle } from "@/domain";
import styles from "./AdminConsole.module.css";

/** Message postMessage entre l'éditeur et l'iframe /admin/apercu. */
export const PREVIEW_MESSAGE = "njambo:event-preview";

export const LIFECYCLE_LABELS: Record<EventLifecycle, string> = {
  draft: "Brouillon",
  scheduled: "Programmé",
  live: "En ligne",
  ended: "Terminé",
  archived: "Archivé",
};

export function LifecycleBadge({ lifecycle }: { lifecycle: EventLifecycle }) {
  return <span className={`${styles.status} ${styles[`status_${lifecycle}`]}`}>{LIFECYCLE_LABELS[lifecycle]}</span>;
}

const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export function formatDateTime(ms: number | null | undefined) {
  if (!ms || !Number.isFinite(ms)) return "—";
  return dateTime.format(ms);
}
