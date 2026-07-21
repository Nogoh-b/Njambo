"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { NjamboIcon, NjamboMark } from "@/components/ui/Art";
import { PlayCard } from "@/components/cards/PlayCard";
import { ResultActions, ResultLayout } from "@/components/ui/ResultLayout";
import { SocialActions } from "@/components/social/SocialActions";
import { useAuth } from "@/hooks/useAuth";
import { useGame } from "@/contexts/GameContext";
import { NKAP } from "@/data/mock";
import { getNextRoundPresentation, getResultReasonLabels } from "@/lib/gamePresentation";
import { useGsapTimeline, useMotionProfile } from "@/lib/motion";
import type { Result, RoomPlayer } from "@/types/game";
import styles from "./ResultScreen.module.css";

/* Particules tsparticles chargées en lazy, client uniquement (jamais au SSR). */
const PowerParticles = dynamic(() => import("@/components/power/PowerParticles"), { ssr: false });

export interface ResultScreenProps {
  result: Result;
  mise: number;
  onNext: () => void;
  onMenu: () => void;
  canNext: boolean;
  nextRequiresConsensus?: boolean;
  socialPlayers?: RoomPlayer[];
}

export function ResultScreen({
  result,
  mise,
  onNext,
  onMenu,
  canNext,
  nextRequiresConsensus = false,
  socialPlayers = [],
}: ResultScreenProps) {
  const { user } = useAuth();
  const { sfx } = useGame();
  const motion = useMotionProfile();
  const win = result.winner;
  const [nextRequested, setNextRequested] = useState(false);
  const titleId = useId();
  const summaryId = useId();
  const totalGain = result.gain + (result.doubles ? mise * (result.playersCount - 1) : 0);
  const scriptedMotion = motion.enabled && motion.allowEntranceCascade;
  const reasonLabels = getResultReasonLabels(result);
  const nextRound = getNextRoundPresentation(canNext, nextRequiresConsensus, nextRequested);
  const opponents = useMemo(
    () => socialPlayers.filter((player) => player.uid !== user?.uid),
    [socialPlayers, user?.uid],
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const gainRef = useRef<HTMLDivElement>(null);

  /* Séquence scénarisée réservée aux profils full/balanced. Le profil lite
     reçoit le contenu final immédiatement, sans 3D, rotation ni compteur. */
  useGsapTimeline(scriptedMotion, rootRef, (gsap) => {
    const introDuration = motion.allowFilterFx ? 0.5 : 0.4;
    const markDuration = motion.allowFilterFx ? 0.6 : 0.48;
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    if (panelRef.current) {
      tl.fromTo(
        panelRef.current,
        { opacity: 0, y: 16, scale: 0.985 },
        { opacity: 1, y: 0, scale: 1, duration: introDuration },
        0,
      );
    }
    if (markRef.current) {
      tl.fromTo(
        markRef.current,
        { opacity: 0, scale: 0.72, rotate: -8 },
        { opacity: 1, scale: 1, rotate: 0, duration: markDuration, ease: "back.out(2.1)" },
        0.1,
      );
    }
    if (gainRef.current) {
      const gain = gainRef.current;
      const counter = { value: 0 };
      gsap.set(gain, { opacity: 0, scale: 0.78 });
      tl.to(gain, { opacity: 1, scale: 1, duration: introDuration, ease: "back.out(2)" }, 0.24)
        .to(counter, {
          value: totalGain,
          duration: motion.allowLongCascade ? 0.85 : 0.68,
          ease: "power2.out",
          onUpdate: () => { gain.textContent = `+ ${NKAP(Math.round(counter.value))}`; },
          onComplete: () => { gain.textContent = `+ ${NKAP(totalGain)}`; },
        }, 0.24);
    }
  }, [scriptedMotion, totalGain]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    sfx((sound) => {
      if (win.isYou) sound.win();
      else sound.lose();
    });
  }, [sfx, win.isYou]);

  const handleNext = () => {
    if (!canNext || nextRequested) return;
    setNextRequested(true);
    onNext();
  };

  const main = (
    <>
      <div className={styles.markStage} aria-hidden="true">
        <span ref={markRef} className={styles.mark}>
          <NjamboMark size={110} compact />
          <span className={`${styles.markBadge} nj-title-icon`}>
            <NjamboIcon name={win.isYou ? "trophy" : "crown"} tone="gold" size={30} />
          </span>
        </span>
      </div>

      <h1 id={titleId} className={styles.title}>
        {win.isYou ? "Tu gagnes !" : `${win.name} gagne`}
      </h1>

      <div className={styles.reasons} role="list" aria-label="Condition de victoire">
        {reasonLabels.map((label) => <span key={label} role="listitem"><Chip strong>{label}</Chip></span>)}
      </div>

      {result.type === "instant" && (
        <div className={styles.hand} aria-label={`Main gagnante de ${win.name}`}>
          {win.hand.map((card, index) => (
            <div
              key={card.id}
              className={styles.handCard}
              style={{
                marginLeft: index === 0 ? 0 : -18,
                transform: `rotate(${(index - 2) * 7}deg)`,
              }}
            >
              <PlayCard card={card} w={48} />
            </div>
          ))}
        </div>
      )}

      <div
        ref={gainRef}
        className={`${styles.gain} nj-result-gain`}
        style={{ opacity: scriptedMotion ? 0 : 1 }}
      >
        + {NKAP(totalGain)}
      </div>
      <div id={summaryId} className={styles.gainOwner}>
        {win.isYou ? "Ton gain" : `Gain de ${win.name}`}
      </div>
      <div className={styles.gainDetail}>
        {result.doubles ? "Pot et pénalités doublés" : "Le pot revient au ngata"}
      </div>

      {!win.isYou && (result.refund ?? 0) > 0 && (
        <div className={styles.refund}>Remboursement Cauris : + {NKAP(result.refund ?? 0)}</div>
      )}

      <ResultActions status={nextRound.status}>
        <Btn
          variant="pink"
          onClick={handleNext}
          disabled={!canNext || nextRequested}
          ariaLabel={nextRound.label}
        >
          {nextRound.label}
        </Btn>
        <Btn variant="dark" onClick={onMenu} ariaLabel="Quitter la table et revenir au menu">
          Menu
        </Btn>
      </ResultActions>
    </>
  );

  const rail = opponents.length > 0 ? (
    <>
      <h2 className={styles.railTitle}>Joueurs rencontrés</h2>
      <div className={styles.socialList}>
        {opponents.map((player) => (
          <div key={player.uid} className={styles.socialPlayer}>
            <span className={styles.socialName}>{player.name}</span>
            <SocialActions player={player} compact />
          </div>
        ))}
      </div>
    </>
  ) : undefined;

  return (
    <ResultLayout
      ref={rootRef}
      panelRef={panelRef}
      titleId={titleId}
      descriptionId={summaryId}
      motionMode={motion.mode}
      reducedMotion={motion.reduced}
      scriptedMotion={scriptedMotion}
      main={main}
      rail={rail}
      decoration={(
        <>
          {motion.enabled && motion.allowDecorativeLoop && <div className="nj-result-aura" aria-hidden="true" />}
          {motion.enabled && motion.allowParticles && win.isYou && <PowerParticles variant="confetti" zIndex={1} />}
        </>
      )}
    />
  );
}
