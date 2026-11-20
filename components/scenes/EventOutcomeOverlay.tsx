"use client";

import Image from "next/image";
import { useEffect, useRef, type CSSProperties } from "react";
import type { EventVersion } from "@/domain";
import type { EventOutcome } from "@/lib/eventOutcome";
import { rewardVisual } from "@/lib/eventRewards";
import { NjamboIcon } from "@/components/ui/Art";
import styles from "./EventOutcomeOverlay.module.css";

export { resolveEventOutcome, type EventOutcome } from "@/lib/eventOutcome";

/* ═══════════════ Conséquences d'une partie d'événement ═══════════════
   Au retour sur le parcours, on compare la photo prise avant la partie
   (EventReturnSnapshot) au run réglé par le serveur, puis on met en scène
   ce qui a changé : table validée, vie perdue, élimination, grand prix. */

interface Props {
  outcome: EventOutcome;
  event: EventVersion;
  tone: "gold" | "teal";
  onClose: () => void;
  /** Rejouer tout de suite (table suivante ou même table). */
  onContinue?: () => void;
}

export function EventOutcomeOverlay({ outcome, event, tone, onClose, onContinue }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const total = event.stages.length;
  const livesLeft = Math.max(0, event.allowedLosses - outcome.losses);
  const stage = event.stages[outcome.stageIndex];
  const positive = outcome.kind === "advance" || outcome.kind === "completed";

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (keyEvent: KeyboardEvent) => { if (keyEvent.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = (() => {
    switch (outcome.kind) {
      case "advance":
        return {
          kicker: `Table ${outcome.stageIndex + 1} / ${total} validée`,
          title: "Table remportée !",
          body: `${stage?.title ?? "Étape"} est à toi. La table ${outcome.stageIndex + 2} t’attend.`,
          cta: "Table suivante",
        };
      case "completed":
        return {
          kicker: `${event.title} · ${total} / ${total}`,
          title: "Grand prix !",
          body: "Tu as traversé toutes les tables du parcours.",
          cta: null,
        };
      case "life_lost":
        return {
          kicker: `Table ${outcome.stageIndex + 1} / ${total}`,
          title: "Une vie perdue",
          body: `Ta progression est conservée. Il te reste ${livesLeft} vie${livesLeft > 1 ? "s" : ""}.`,
          cta: "Retenter la table",
        };
      case "eliminated":
        return {
          kicker: `${event.title}`,
          title: "Éliminé",
          body: `Plus aucune vie : ton parcours s’arrête à la table ${outcome.stageIndex + 1} / ${total}.`,
          cta: null,
        };
    }
  })();

  const rewards = outcome.kind === "advance" || outcome.kind === "completed" ? outcome.rewards : [];
  const progressBefore = outcome.kind === "advance" ? outcome.stageIndex / total : outcome.kind === "completed" ? (total - 1) / total : outcome.stageIndex / total;
  const progressAfter = outcome.kind === "advance" ? (outcome.stageIndex + 1) / total : outcome.kind === "completed" ? 1 : progressBefore;

  return (
    <div className={`${styles.overlay} ${styles[`kind_${outcome.kind}`]} ${styles[`tone_${tone}`]}`} role="dialog" aria-modal="true" aria-labelledby="event-outcome-title">
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />

      {outcome.kind === "completed" && (
        <div className={styles.confetti} aria-hidden="true">
          {Array.from({ length: 28 }, (_, index) => (
            <span key={index} style={{ "--i": index } as CSSProperties} />
          ))}
        </div>
      )}

      <div ref={panelRef} className={styles.panel} tabIndex={-1}>
        <span className={styles.rays} aria-hidden="true" />

        <div className={styles.emblem} aria-hidden="true">
          <NjamboIcon
            name={outcome.kind === "completed" ? "crown" : positive ? "trophy" : outcome.kind === "eliminated" ? "empty" : "hourglass"}
            tone={positive ? "gold" : "light"}
            size={40}
          />
        </div>

        <p className={styles.kicker}>{copy.kicker}</p>
        <h2 id="event-outcome-title" className={styles.title}>{copy.title}</h2>

        {/* Vies : la gemme perdue se brise, les autres restent. */}
        <div className={styles.lives} aria-label={`${livesLeft} vie${livesLeft > 1 ? "s" : ""} sur ${event.allowedLosses}`}>
          {Array.from({ length: event.allowedLosses }, (_, index) => {
            const justLost = !positive && index === livesLeft;
            const alive = index < livesLeft;
            const brokenBefore = !alive && !justLost;
            const allBreak = outcome.kind === "eliminated" && justLost;
            return (
              <span
                key={index}
                className={`${styles.gem}${alive ? ` ${styles.gemOn}` : ""}${brokenBefore ? ` ${styles.gemOff}` : ""}${justLost ? ` ${styles.gemBreak}` : ""}${allBreak ? ` ${styles.gemBreakFinal}` : ""}`}
                aria-hidden="true"
              >
                ♦
                {justLost && (
                  <>
                    <i className={styles.shard} style={{ "--dx": "-22px", "--dy": "-16px", "--r": "-70deg" } as CSSProperties} />
                    <i className={styles.shard} style={{ "--dx": "20px", "--dy": "-20px", "--r": "60deg" } as CSSProperties} />
                    <i className={styles.shard} style={{ "--dx": "-14px", "--dy": "22px", "--r": "-30deg" } as CSSProperties} />
                    <i className={styles.shard} style={{ "--dx": "18px", "--dy": "18px", "--r": "90deg" } as CSSProperties} />
                  </>
                )}
              </span>
            );
          })}
        </div>

        {/* Progression du parcours : la barre se remplit de l'ancienne à la nouvelle étape. */}
        <div className={styles.track} aria-hidden="true">
          <span
            className={styles.trackFill}
            style={{ "--from": `${Math.round(progressBefore * 100)}%`, "--to": `${Math.round(progressAfter * 100)}%` } as CSSProperties}
          />
          {event.stages.map((item, index) => (
            <span
              key={item.id}
              className={`${styles.trackDot}${index < Math.round(progressAfter * total) ? ` ${styles.trackDotOn}` : ""}${outcome.kind === "advance" && index === outcome.stageIndex ? ` ${styles.trackDotFresh}` : ""}`}
              style={{ left: `${((index + 1) / total) * 100}%` }}
            />
          ))}
        </div>

        <p className={styles.body}>{copy.body}</p>

        {rewards.length > 0 && (
          <ul className={styles.rewards} aria-label="Gains">
            {rewards.map((reward, index) => {
              const visual = rewardVisual(reward);
              return (
                <li key={`${reward.type}-${index}`} className={styles.reward} style={{ "--i": index } as CSSProperties}>
                  <Image src={visual.src} alt="" width={40} height={40} />
                  <strong>+ {visual.label}</strong>
                </li>
              );
            })}
          </ul>
        )}

        <div className={styles.actions}>
          {copy.cta && onContinue && (
            <button type="button" data-nj-skin="none" className={styles.primary} onClick={onContinue}>
              {copy.cta} <span aria-hidden="true">→</span>
            </button>
          )}
          <button type="button" data-nj-skin="none" className={copy.cta && onContinue ? styles.secondary : styles.primary} onClick={onClose}>
            {outcome.kind === "completed" ? "Récupérer" : copy.cta && onContinue ? "Plus tard" : "Voir le parcours"}
          </button>
        </div>
      </div>
    </div>
  );
}
