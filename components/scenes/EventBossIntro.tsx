"use client";

/* Présentation du boss avant d'entrer à sa table (phase 4). */

import { useEffect, useRef } from "react";
import type { EventStage } from "@/domain";
import styles from "./EventBossIntro.module.css";

const LEVEL_LABELS = ["", "Apprenti", "Habitué", "Redoutable", "Maître", "Légende"];

export function EventBossIntro({ stage, onDone }: { stage: EventStage; onDone: () => void }) {
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => {
    const timer = window.setTimeout(() => done.current(), 2_400);
    return () => window.clearTimeout(timer);
  }, []);
  if (!stage.boss) return null;
  const level = Math.max(1, Math.min(5, stage.boss.botLevel));
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`Boss : ${stage.boss.name}`} onClick={onDone}>
      <div className={styles.flash} aria-hidden="true" />
      <div className={styles.card}>
        <span className={styles.kicker}>Table du boss · {stage.title}</span>
        <div className={styles.avatar}>
          {stage.boss.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element -- avatar uploadé depuis l'admin (URL du VPS)
            ? <img src={stage.boss.avatarUrl} alt="" />
            : <span aria-hidden="true">👑</span>}
        </div>
        <h2 className={styles.name}>{stage.boss.name}</h2>
        <span className={styles.level}>{"★".repeat(level)}{"☆".repeat(5 - level)} · {LEVEL_LABELS[level]}</span>
        <span className={styles.tap}>Touchez pour commencer</span>
      </div>
    </div>
  );
}
