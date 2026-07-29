"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import { NjamboIcon, NjamboMark } from "@/components/ui/Art";
import { PlayCard } from "@/components/cards/PlayCard";
import { ResultActions, ResultLayout } from "@/components/ui/ResultLayout";
import { SettlementArena, type Seat } from "@/components/result/SettlementArena";
import { useAuth } from "@/hooks/useAuth";
import { useGame } from "@/contexts/GameContext";
import { useLobby } from "@/contexts/LobbyContext";
import { NKAP } from "@/data/mock";
import { getNextRoundPresentation, getResultReasonLabels } from "@/lib/gamePresentation";
import { useGsapTimeline, useMotionProfile } from "@/lib/motion";
import { listenFriends, sendFriendRequest } from "@/lib/socialData";
import type { Result } from "@/types/game";
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
}

export function ResultScreen({
  result,
  mise,
  onNext,
  onMenu,
  canNext,
  nextRequiresConsensus = false,
}: ResultScreenProps) {
  const { user } = useAuth();
  const { sfx } = useGame();
  const { currentRoom } = useLobby();
  const motion = useMotionProfile();
  const win = result.winner;
  const [nextRequested, setNextRequested] = useState(false);
  const titleId = useId();
  const summaryId = useId();
  const totalGain = result.gain + (result.doubles ? mise * (result.playersCount - 1) : 0);
  const scriptedMotion = motion.enabled && motion.allowEntranceCascade;
  const reasonLabels = getResultReasonLabels(result);
  const nextRound = getNextRoundPresentation(canNext, nextRequiresConsensus, nextRequested);
  /* Relations connues, pour n'proposer l'ajout qu'aux joueurs qui n'en font
     pas déjà partie. Les uid ajoutés localement s'y greffent aussitôt : la
     pastille disparaît sans attendre l'aller-retour serveur. */
  const [friendUids, setFriendUids] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!user?.uid) return undefined;
    return listenFriends(user.uid, (friends) => {
      setFriendUids(new Set(friends.map((friend) => friend.uid)));
    });
  }, [user?.uid]);

  /* Pendant l'attente d'une revanche, le bouton porte un compteur « 2/4 »
     plutôt qu'une phrase : c'est la seule forme qui ne casse jamais la ligne
     tout en disant ce qui manque. */
  const consentLabel = nextRequested && nextRequiresConsensus && currentRoom?.players?.length
    ? `${currentRoom.players.filter((player) => player.ready).length}/${currentRoom.players.length}`
    : null;

  const handleAddFriend = useCallback((seat: Seat) => {
    if (!seat.uid || !user) return;
    setFriendUids((previous) => new Set(previous).add(seat.uid as string));
    void sendFriendRequest(
      { uid: user.uid, name: user.name, emoji: user.emoji },
      { uid: seat.uid, name: seat.player.name, emoji: seat.player.emoji },
    );
  }, [user]);

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

  /* Rendue seulement si le règlement a été transmis : les anciennes parties
     rejouées depuis l'historique n'en ont pas et gardent l'affichage simple. */
  const arena = result.players && result.settlement && result.settlement.length > 0 ? (
    <SettlementArena
      players={result.players}
      settlement={result.settlement}
      winnerIdx={result.winnerIdx}
      motion={motion}
      friendUids={friendUids}
      onAddFriend={handleAddFriend}
    />
  ) : null;

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

      {/* L'arène porte désormais le montant : le pot central et le siège du
          vainqueur disent le gain mieux qu'un nombre isolé au-dessus d'eux. */}
      {arena ? (
        <div className={styles.arenaSlot}>{arena}</div>
      ) : (
        <>
          <div
            ref={gainRef}
            className={`${styles.gain} nj-result-gain`}
            style={{ opacity: scriptedMotion ? 0 : 1 }}
          >
            + {NKAP(totalGain)}
          </div>
          <div className={styles.gainOwner}>
            {win.isYou ? "Ton gain" : `Gain de ${win.name}`}
          </div>
        </>
      )}

      <div id={summaryId} className={styles.gainDetail}>
        {result.doubles ? "Pot et pénalités doublés" : "Le pot revient au ngata"}
      </div>

      {!win.isYou && (result.refund ?? 0) > 0 && (
        <div className={styles.refund}>Remboursement Cauris : + {NKAP(result.refund ?? 0)}</div>
      )}

      {/* Libellés courts + pictogramme : les deux actions tiennent sur une
          seule ligne jusqu'à 320 px. Le texte complet reste dans `ariaLabel`
          pour les lecteurs d'écran. */}
      <ResultActions status={nextRound.status}>
        {/* Système `njb` avec motifs pagne : le rose reste la couleur d'appel
            principale (cf. la convention dans Btn.tsx), le cobalt en soutien
            pour une sortie qui ne doit pas rivaliser avec elle. Les motifs
            sont monochromes et se teintent du ton choisi. */}
        <Btn
          tone="pink"
          fill="solid"
          motif="royal-bands"
          motifSides="both"
          onClick={handleNext}
          disabled={!canNext || nextRequested}
          ariaLabel={nextRound.label}
        >
          <span aria-hidden="true">↻</span> {consentLabel ?? nextRound.short}
        </Btn>
        <Btn
          tone="cobalt"
          fill="soft"
          motif="indigo-dots"
          motifSides="both"
          onClick={onMenu}
          ariaLabel="Quitter la table et revenir au menu"
        >
          <span aria-hidden="true">⌂</span> Menu
        </Btn>
      </ResultActions>
    </>
  );

  /* Le rail « Joueurs rencontrés » a été retiré : l'ajout en ami se fait
     directement depuis le siège de chaque joueur dans l'arène, là où on le
     regarde déjà. */

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
      outcome={win.isYou ? "win" : "loss"}
      decoration={(
        <>
          {motion.enabled && motion.allowDecorativeLoop && <div className="nj-result-aura" aria-hidden="true" />}
          {/* Les confettis marquent la victoire : les réserver au niveau `full`
              les rendait invisibles sur mobile, où il n'est jamais atteint. On
              baisse l'intensité au lieu de les supprimer. */}
          {motion.enabled && !motion.reduced && win.isYou && (
            <PowerParticles
              variant="confetti"
              zIndex={1}
              intensity={motion.level === "full" ? "full" : "balanced"}
            />
          )}
        </>
      )}
    />
  );
}
