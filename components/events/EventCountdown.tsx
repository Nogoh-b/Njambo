"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMotionProfile, usePageActive } from "@/lib/motion";
import styles from "./EventCountdown.module.css";

export interface EventCountdownProps {
  startsAt: number;
  endsAt: number;
  accent?: "gold" | "teal";
  variant?: "card" | "banner";
  className?: string;
  /** Déclenché une fois quand l'horloge franchit startsAt ou endsAt. */
  onBoundaryReached?: () => void;
}

interface TimeParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function splitDuration(ms: number): TimeParts {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3_600);
  const minutes = Math.floor((totalSec % 3_600) / 60);
  const seconds = totalSec % 60;
  return { days, hours, minutes, seconds };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDeadlineHint(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Douala",
    }).format(timestamp);
  } catch {
    return "";
  }
}

/**
 * Chronomètre vivant isolé (tick 1 s sans re-render du parent).
 * Affiche le temps restant avant fin (ou avant ouverture si à venir),
 * avec flip animé des secondes, halo d'urgence (< 24 h / < 1 h) et jauge vivante.
 */
export function EventCountdown({
  startsAt,
  endsAt,
  accent = "gold",
  variant = "card",
  className,
  onBoundaryReached,
}: EventCountdownProps) {
  const motionProfile = useMotionProfile();
  const pageActive = usePageActive();
  const [now, setNow] = useState<number>(() => Date.now());
  const prevPhaseRef = useRef<"upcoming" | "active" | "ended" | null>(null);
  const boundaryCbRef = useRef(onBoundaryReached);
  boundaryCbRef.current = onBoundaryReached;

  const phase: "upcoming" | "active" | "ended" =
    startsAt > now ? "upcoming" : endsAt <= now ? "ended" : "active";

  /* Notifier le parent exactement au basculement upcoming -> active -> ended. */
  useEffect(() => {
    if (prevPhaseRef.current && prevPhaseRef.current !== phase) {
      boundaryCbRef.current?.();
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  /* Tick 1 s tant que l'événement n'est pas terminé. */
  useEffect(() => {
    if (phase === "ended") return;
    setNow(Date.now());
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    return () => window.clearInterval(id);
  }, [phase, startsAt, endsAt]);

  const targetMs = phase === "upcoming" ? startsAt : endsAt;
  const remainingMs = Math.max(0, targetMs - now);
  const parts = splitDuration(remainingMs);

  const tone = useMemo(() => {
    if (phase === "ended") return "ended" as const;
    if (phase === "upcoming") return "upcoming" as const;
    if (remainingMs < 3_600_000) return "critical" as const;
    if (remainingMs < 86_400_000) return "soon" as const;
    return accent;
  }, [accent, phase, remainingMs]);

  const label = useMemo(() => {
    if (phase === "ended") return "Clôturé";
    if (phase === "upcoming") return "Ouverture dans";
    if (tone === "critical") return "Dernière heure";
    if (tone === "soon") return "Clôture bientôt";
    return "Temps restant";
  }, [phase, tone]);

  /* Pourcentage de jauge : vrai ratio restant si fenêtre bornée, sinon jauge
     vivante de la minute en cours (toujours lisible sans induire en erreur). */
  const progressPct = useMemo(() => {
    if (phase === "ended") return 0;
    if (phase === "upcoming") {
      // Compte à rebours fluide sur la minute en cours avant ouverture
      return Math.max(8, Math.round(((60 - parts.seconds) / 60) * 100));
    }
    const windowMs = startsAt > 0 && endsAt > startsAt ? endsAt - startsAt : 0;
    if (windowMs > 0 && windowMs <= 180 * 86_400_000) {
      return Math.max(4, Math.min(100, (remainingMs / windowMs) * 100));
    }
    // Événement permanent ou saison longue : barre élégante qui respire sur la minute
    return Math.max(12, Math.round(((60 - parts.seconds) / 60) * 100));
  }, [endsAt, parts.seconds, phase, remainingMs, startsAt]);

  const deadlineHint = useMemo(() => {
    if (phase === "ended") return "";
    if (phase === "upcoming") return formatDeadlineHint(startsAt);
    // N'afficher la date d'échéance précise que si elle est à moins d'un an
    if (remainingMs < 365 * 86_400_000) return `Jusqu'au ${formatDeadlineHint(endsAt)}`;
    return "Saison active";
  }, [endsAt, phase, remainingMs, startsAt]);

  const animated = motionProfile.enabled && motionProfile.allowDecorativeLoop && pageActive && phase !== "ended";

  const units: Array<{ id: string; value: string; suffix: string; isSeconds?: boolean }> = [];
  if (parts.days > 0) {
    units.push({ id: "d", value: String(parts.days), suffix: "j" });
  }
  if (parts.days > 0 || parts.hours > 0) {
    units.push({ id: "h", value: pad2(parts.hours), suffix: "h" });
  }
  units.push({ id: "m", value: pad2(parts.minutes), suffix: "m" });
  units.push({ id: "s", value: pad2(parts.seconds), suffix: "s", isSeconds: true });

  return (
    <div
      className={[
        styles.root,
        styles[`variant_${variant}`],
        styles[`tone_${tone}`],
        animated ? styles.animated : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-live="off"
      aria-label={
        phase === "ended"
          ? "Événement terminé"
          : `${label} : ${parts.days > 0 ? `${parts.days} jours ` : ""}${parts.hours} heures ${parts.minutes} minutes ${parts.seconds} secondes`
      }
    >
      <span className={styles.glassGlint} aria-hidden="true" />

      <div className={styles.mainRow}>
        <div className={styles.labelGroup}>
          <span className={styles.clockBadge} aria-hidden="true">
            {phase !== "ended" && <span className={styles.pulseHalo} />}
            <svg
              className={styles.clockSvg}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15.5 14" />
            </svg>
          </span>

          <div className={styles.labelText}>
            <span className={styles.kicker}>{label}</span>
            {deadlineHint && <span className={styles.endDateHint}>{deadlineHint}</span>}
          </div>
        </div>

        {phase === "ended" ? (
          <span className={styles.endedBadge}>Terminé</span>
        ) : (
          <div className={styles.digitsGroup} suppressHydrationWarning>
            {units.map((unit, idx) => (
              <span key={unit.id} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                {idx > 0 && (
                  <span className={styles.colon} aria-hidden="true">
                    :
                  </span>
                )}
                <span className={`${styles.unitBox}${unit.isSeconds ? ` ${styles.unitSeconds}` : ""}`}>
                  <span
                    key={unit.isSeconds ? `s-${parts.seconds}` : unit.id}
                    className={`${styles.unitValue}${unit.isSeconds ? ` ${styles.secPop}` : ""}`}
                  >
                    {unit.value}
                  </span>
                  <span className={styles.unitSuffix}>{unit.suffix}</span>
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {phase !== "ended" && (
        <div className={styles.track} aria-hidden="true">
          <div className={styles.trackFill} style={{ transform: `scaleX(${progressPct / 100})` }}>
            <span className={styles.trackShimmer} />
          </div>
        </div>
      )}
    </div>
  );
}
