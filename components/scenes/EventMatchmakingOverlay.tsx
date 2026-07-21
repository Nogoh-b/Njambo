"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { onSnapshot, doc } from "@/lib/firestoreClient";
import { db } from "@/lib/firebase";
import { resolveEventTheme } from "@/lib/eventTheme";
import { NjamboIcon } from "@/components/ui/Art";
import styles from "./EventMatchmakingOverlay.module.css";

type RunStatus = "active" | "matchmaking" | "completed" | "eliminated" | "left";

interface RunDoc {
  status: RunStatus;
  currentMatchId?: string;
  stageIndex: number;
}

export interface EventMatchmakingOverlayProps {
  /** runId du run PvP en cours (status: matchmaking). */
  runId: string;
  /** eventId pour le thème visuel. */
  eventId: string;
  /** Titre de l'étape courante (ex: "Le Marché du Mboa"). */
  stageTitle: string;
  /** Nombre de joueurs requis pour cette table. */
  requiredPlayers: number;
  /** Appelé dès que le serveur a formé le groupe (currentMatchId arrivé
   *  sur le run). L'overlay disparaît, la table devient interactive. */
  onMatchStart: () => void;
  /** Appelé si le run est annulé/éliminé/introuvable — l'overlay se ferme. */
  onAbort: () => void;
}

/**
 * Overlay plein écran affiché par-dessus la table pendant qu'un événement
 * PvP cherche des adversaires. On ne peut pas l'annuler (ticket réservé) :
 * on attend que le serveur forme un groupe et écrive `currentMatchId`
 * sur le run du joueur. Aucune lecture de la collection `event_matchmaking`
 * (non lisible côté client) — on écoute `event_runs/{runId}` uniquement.
 */
export function EventMatchmakingOverlay({ runId, eventId, stageTitle, requiredPlayers, onMatchStart, onAbort }: EventMatchmakingOverlayProps) {
  const [status, setStatus] = useState<RunStatus>("matchmaking");
  const [elapsed, setElapsed] = useState(0);
  const theme = resolveEventTheme(eventId);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "event_runs", runId), (snapshot) => {
      if (!snapshot.exists()) { onAbort(); return; }
      const data = snapshot.data() as RunDoc;
      setStatus(data.status);
      if (typeof data.currentMatchId === "string" && data.currentMatchId) {
        onMatchStart();
      } else if (data.status === "eliminated" || data.status === "left" || data.status === "completed") {
        onAbort();
      }
    }, () => {
      // Erreur de lecture : on reste en attente, la sync adapter du dessous
      // gère la reconnexion. On n'abandonne pas silencieusement.
    });
    return unsub;
  }, [runId, onMatchStart, onAbort]);

  // Chronomètre d'attente (purement cosmétique).
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeLabel = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <div className={styles.overlay} role="dialog" aria-label="Recherche d’adversaires" aria-modal="true">
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.panel} style={{ "--event-accent": theme.accent, "--event-accent-soft": theme.accentSoft } as CSSProperties}>
        <div className={styles.radar} aria-hidden="true">
          <span className={styles.radarCore} />
          <span className={styles.radarRing} />
          <span className={`${styles.radarRing} ${styles.radarRing2}`} />
          <span className={`${styles.radarRing} ${styles.radarRing3}`} />
          <NjamboIcon name="users" tone="pink" size={32} />
        </div>

        <p className={styles.kicker}>{theme.label}</p>
        <h2 className={styles.title}>Recherche d’adversaires</h2>
        <p className={styles.stage}>{stageTitle}</p>

        <div className={styles.slots} aria-label={`Table de ${requiredPlayers} joueurs`}>
          <span className={`${styles.slot} ${styles.slotYou}`}>
            <NjamboIcon name="check" tone="teal" size={18} /> Toi
          </span>
          {Array.from({ length: requiredPlayers - 1 }, (_, index) => (
            <span key={index} className={`${styles.slot} ${styles.slotPending}`} aria-hidden="true">
              <span className={styles.slotDot} />
            </span>
          ))}
        </div>

        <p className={styles.hint}>
          Le Ter rassemble <strong>{requiredPlayers} joueurs</strong> sur cette table.
          Ton ticket est réservé — la partie démarrera dès qu’un groupe sera formé.
        </p>

        <div className={styles.meta}>
          <span><NjamboIcon name="hourglass" tone="light" size={16} /> {timeLabel}</span>
          <span className={styles.statusPill}>{status === "matchmaking" ? "En file" : status}</span>
        </div>
      </div>
    </div>
  );
}
