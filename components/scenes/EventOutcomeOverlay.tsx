"use client";

import Image from "@/components/ui/GameImage";
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
  /** Classement actif : rang après la partie (chargé en différé) et rang avant. */
  ranking?: { rank: number | null; previousRank: number | null };
  /** Éliminé avec rachat possible (phase 4). */
  revive?: { price: number; clock: string; remaining: number; affordable: boolean; busy: boolean; onRevive: () => void };
}

export function EventOutcomeOverlay({ outcome, event, tone, onClose, onContinue, ranking, revive }: Props) {
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
        return outcome.perfect ? {
          kicker: `${event.title} · ${total} / ${total} · sans perdre une vie`,
          title: "Parcours parfait !",
          body: "Aucune vie perdue : le bonus des légendes est pour toi.",
          cta: null,
        } : {
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
          body: revive
            ? `Plus aucune vie à la table ${outcome.stageIndex + 1} / ${total}… mais tu peux encore sauver ton parcours.`
            : `Plus aucune vie : ton parcours s’arrête à la table ${outcome.stageIndex + 1} / ${total}.`,
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

        {ranking && (outcome.kind === "advance" || outcome.kind === "completed") && (outcome.pointsGained ?? 0) > 0 && (
          <div className={styles.scoreStrip} aria-live="polite">
            <strong className={styles.points}>+{outcome.pointsGained} pts</strong>
            {ranking.rank !== null && (
              <span className={styles.rankMove}>
                {ranking.previousRank !== null && ranking.previousRank !== ranking.rank && <><span className={styles.rankOld}>{ranking.previousRank}e</span><span aria-hidden="true">→</span></>}
                <span className={styles.rankNew}>{ranking.rank === 1 ? "1er" : `${ranking.rank}e`}</span>
                {ranking.previousRank !== null && ranking.rank < ranking.previousRank && <span className={styles.rankUp} aria-label="en progression">▲ {ranking.previousRank - ranking.rank}</span>}
                {ranking.previousRank === null && <span className={styles.rankUp}>entrée au classement</span>}
              </span>
            )}
          </div>
        )}

        {rewards.length > 0 && (
          <ul className={styles.rewards} aria-label="Gains">
            {rewards.map((reward, index) => {
              const visual = rewardVisual(reward);
              return (
                <li key={`${reward.type}-${index}`} className={styles.reward} style={{ "--i": index } as CSSProperties}>
                  <Image src={visual.src} unoptimized={visual.src.startsWith("http")} alt="" width={40} height={40} />
                  <strong>+ {visual.label}</strong>
                </li>
              );
            })}
          </ul>
        )}

        {(outcome.kind === "advance" || outcome.kind === "completed") && (outcome.seasonPoints ?? 0) > 0 && (
          <p className={styles.seasonGain}>🏵️ +{outcome.seasonPoints} pts de saison</p>
        )}

        {revive && outcome.kind === "eliminated" && (
          <div className={styles.reviveBox}>
            <button type="button" data-nj-skin="none" className={styles.reviveBtn} disabled={revive.busy} onClick={revive.onRevive}>
              <span className={styles.reviveGem} aria-hidden="true">♦</span>
              <span>
                <strong>{revive.busy ? "Rachat…" : `Continuer · ${revive.price} cauris`}</strong>
                <small>{revive.affordable ? `Une vie rendue · encore ${revive.clock}` : `Pas assez de cauris · encore ${revive.clock}`}</small>
              </span>
            </button>
            <span className={styles.reviveNote}>{revive.remaining} rachat{revive.remaining > 1 ? "s" : ""} possible{revive.remaining > 1 ? "s" : ""} sur ce parcours</span>
          </div>
        )}

        <div className={styles.actions}>
          {copy.cta && onContinue && (
            <button type="button" data-nj-skin="none" className={styles.primary} onClick={onContinue}>
              {copy.cta} <span aria-hidden="true">→</span>
            </button>
          )}
          <button type="button" data-nj-skin="none" className={(copy.cta && onContinue) || revive ? styles.secondary : styles.primary} onClick={onClose}>
            {outcome.kind === "completed" ? "Récupérer" : copy.cta && onContinue ? "Plus tard" : revive ? "Abandonner le parcours" : "Voir le parcours"}
          </button>
        </div>
      </div>
    </div>
  );
}
