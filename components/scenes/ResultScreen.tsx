"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSfx } from "@gxe/react";
import { NjamboIcon } from "@/components/ui/Art";
import { PlayCard } from "@/components/cards/PlayCard";
import { ResultActions, ResultLayout } from "@/components/ui/ResultLayout";
import { SettlementArena, type Seat } from "@/components/result/SettlementArena";
import { RematchView } from "@/components/result/RematchView";
import { useAuth } from "@/hooks/useAuth";
import { useLobby } from "@/contexts/LobbyContext";

import { NKAP } from "@/data/mock";
import { getNextRoundPresentation, getResultReasonLabels } from "@/lib/gamePresentation";
import { useGsapTimeline, useMotionProfile } from "@/lib/motion";
import { listenFriends, sendFriendRequest } from "@/lib/socialData";
import { LOSE_SOUND, WIN_SOUND } from "@/lib/gxeSfx";
import type { GameMode, Result, ResultSettlementEntry } from "@/types/game";
import styles from "./ResultScreen.module.css";
import { sysAsset } from "@/lib/assetPack";

/* Particules tsparticles chargées en lazy, client uniquement (jamais au SSR). */
const PowerParticles = dynamic(() => import("@/components/power/PowerParticles"), { ssr: false });

const NKAP_COIN_SRC = "/assets/njambo/economy/nkap-64.webp";

export interface ResultScreenProps {
  result: Result;
  gameMode?: GameMode;
  mise: number;
  onNext: () => void;
  onMenu: () => void;
  canNext: boolean;
  nextRequiresConsensus?: boolean;
  onBackRequestRef?: { current: (() => boolean) | null };
}

function getModeLabel(mode: GameMode | undefined, hasCrowns: boolean): string | null {
  switch (mode) {
    case "bot":
      return "Solo IA";
    case "online":
      return hasCrowns ? "En ligne · Classé" : "En ligne";
    case "friends":
      return "Entre amis";
    case "event":
      return "Événement";
    default:
      return null;
  }
}

export function ResultScreen({
  result,
  gameMode,
  mise,
  onNext,
  onMenu,
  canNext,
  nextRequiresConsensus = false,
  onBackRequestRef,
}: ResultScreenProps) {
  const { user } = useAuth();
  const { currentRoom } = useLobby();
  const gxeSfx = useSfx();

  const motion = useMotionProfile();
  const win = result.winner;
  const [nextRequested, setNextRequested] = useState(false);
  const [showRematchScreen, setShowRematchScreen] = useState(false);
  const titleId = useId();
  const summaryId = useId();
  /* Mises doubles réellement reçues (plafonnées au solde, Totem des Ancêtres) quand le règlement les donne. */
  const doubleGain = result.settlement?.find((entry) => entry.doubleGain)?.doubleGain;
  const totalGain = result.gain + (doubleGain ?? (result.doubles ? mise * (result.playersCount - 1) : 0));
  const mySettlement = result.settlement?.find((entry) => result.players?.[entry.playerIdx]?.isYou);
  const scriptedMotion = motion.enabled && motion.allowEntranceCascade;
  const reasonLabels = getResultReasonLabels(result);

  /* Suivi en direct de la salle pour la revanche (en ligne / entre amis). */
  const roomPlayers = currentRoom?.players ?? [];
  const roomDissolved = nextRequiresConsensus && (!currentRoom || roomPlayers.length < 2);
  const effectiveCanNext = canNext && !roomDissolved;
  const incomingRematchRequester = useMemo(() => {
    if (!nextRequiresConsensus || !currentRoom || currentRoom.status !== "waiting") return null;
    const hostId = currentRoom.hostId;
    return currentRoom.players.find(
      (p) => p.uid !== user?.uid && p.uid !== hostId && p.ready,
    ) ?? null;
  }, [currentRoom, nextRequiresConsensus, user?.uid]);

  const nextRound = getNextRoundPresentation(effectiveCanNext, nextRequiresConsensus, nextRequested);
  const [friendUids, setFriendUids] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!onBackRequestRef) return;
    onBackRequestRef.current = () => {
      if (showRematchScreen) {
        setShowRematchScreen(false);
        return true;
      }
      onMenu();
      return false;
    };
    return () => { onBackRequestRef.current = null; };
  }, [onBackRequestRef, onMenu, showRematchScreen]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    return listenFriends(user.uid, (friends) => {
      setFriendUids(new Set(friends.map((friend) => friend.uid)));
    });
  }, [user?.uid]);

  const handleAddFriend = useCallback((seat: Seat) => {
    if (!seat.uid || !user) return;
    setFriendUids((previous) => new Set(previous).add(seat.uid as string));
    void sendFriendRequest(
      { uid: user.uid, name: user.name, emoji: user.emoji },
      { uid: seat.uid, name: seat.player.name, emoji: seat.player.emoji },
    );
  }, [user]);

  /* Garantit l'affichage de l'arène Nkap dans TOUS les modes dès que les joueurs
     de la manche sont connus, même si un serveur/replay n'a pas fourni `settlement`. */
  const effectiveSettlement = useMemo<ResultSettlementEntry[] | null>(() => {
    if (!result.players?.length) return null;
    if (result.settlement && result.settlement.length > 0) return result.settlement;
    return result.players.map((_player, index) => ({
      playerIdx: index,
      contributed: mise,
      nkapDelta: index === result.winnerIdx ? Math.max(0, totalGain - mise) : -mise,
    }));
  }, [mise, result.players, result.settlement, result.winnerIdx, totalGain]);

  const hasCrowns = Boolean(effectiveSettlement?.some((entry) => entry.crownsBefore !== undefined));
  const modeLabel = getModeLabel(gameMode, hasCrowns);

  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const crestRef = useRef<HTMLDivElement>(null);
  const gainRef = useRef<HTMLSpanElement>(null);

  useGsapTimeline(scriptedMotion, rootRef, (gsap) => {
    const introDuration = motion.allowFilterFx ? 0.46 : 0.36;
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    if (panelRef.current) {
      tl.fromTo(
        panelRef.current,
        { opacity: 0, y: 18, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: introDuration },
        0,
      );
    }
    if (crestRef.current) {
      tl.fromTo(
        crestRef.current,
        { opacity: 0, scale: 0.65, rotate: -10 },
        { opacity: 1, scale: 1, rotate: 0, duration: 0.56, ease: "back.out(2.1)" },
        0.08,
      );
    }
    if (gainRef.current && totalGain > 0) {
      const gainEl = gainRef.current;
      const counter = { value: 0 };
      const prefix = win.isYou ? "+ " : "Pot · ";
      gainEl.textContent = `${prefix}${NKAP(0)}`;
      tl.to(counter, {
        value: totalGain,
        duration: motion.allowLongCascade ? 0.9 : 0.68,
        ease: "power2.out",
        onUpdate: () => { gainEl.textContent = `${prefix}${NKAP(Math.round(counter.value))}`; },
        onComplete: () => { gainEl.textContent = `${prefix}${NKAP(totalGain)}`; },
      }, 0.42);
    }
  }, [scriptedMotion, totalGain, win.isYou]);

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
    gxeSfx.playChime(win.isYou ? WIN_SOUND : LOSE_SOUND);
  }, [gxeSfx, win.isYou]);

  const handleNext = () => {
    if (!effectiveCanNext) return;
    if (nextRequested) {
      if (nextRequiresConsensus) setShowRematchScreen(true);
      return;
    }
    setNextRequested(true);
    if (nextRequiresConsensus) setShowRematchScreen(true);
    onNext();
  };

  const arena = result.players && effectiveSettlement && effectiveSettlement.length > 0 ? (
    <SettlementArena
      players={result.players}
      settlement={effectiveSettlement}
      winnerIdx={result.winnerIdx}
      motion={motion}
      friendUids={friendUids}
      onAddFriend={handleAddFriend}
    />
  ) : null;

  const summaryText = totalGain > 0
    ? (result.doubles ? "Pot et pénalités doublés (×2)" : "Le pot Nkap revient au vainqueur")
    : gameMode === "friends"
      ? "Partie amicale terminée"
      : gameMode === "event"
        ? (win.isYou ? "Étape d'événement validée" : "Manche d'événement terminée")
        : "Manche terminée";

  const main = (
    <>
      <header className={styles.header}>
        {modeLabel && (
          <span className={styles.modePill}>{modeLabel}</span>
        )}

        <div className={styles.crestStage} aria-hidden="true">
          <div ref={crestRef} className={`${styles.crest}${win.isYou ? ` ${styles.crestWin}` : ` ${styles.crestLoss}`}`}>
            {win.isYou && motion.enabled && motion.allowDecorativeLoop && (
              <span className={styles.sunburst} />
            )}
            <span className={styles.crestMedallion}>
              <NjamboIcon name={win.isYou ? "trophy" : "crown"} tone="gold" size={28} />
            </span>
          </div>
        </div>

        <h1 id={titleId} className={styles.title}>
          {win.isYou ? "Victoire !" : `${win.name} gagne`}
        </h1>

        <div className={styles.reasons} role="list" aria-label="Condition de victoire">
          {reasonLabels.map((label) => (
            <span key={label} role="listitem" className={styles.reasonPill}>
              {label}
            </span>
          ))}
        </div>
      </header>

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
              <PlayCard card={card} w={46} />
            </div>
          ))}
        </div>
      )}

      {arena ? (
        <div className={styles.arenaSlot}>{arena}</div>
      ) : (
        <div className={styles.fallbackSlot}>
          <img src={sysAsset(NKAP_COIN_SRC)} alt="" className={styles.fallbackCoin} draggable={false} />
        </div>
      )}

      <div className={styles.summaryStrip}>
        {totalGain > 0 && (
          <div className={`${styles.nkapBanner}${win.isYou ? ` ${styles.nkapBannerWin}` : ""}`}>
            <img src={sysAsset(NKAP_COIN_SRC)} alt="" className={styles.nkapBannerCoin} draggable={false} />
            <span ref={gainRef} className={styles.nkapBannerValue}>
              {win.isYou ? `+ ${NKAP(totalGain)}` : `Pot · ${NKAP(totalGain)}`}
            </span>
          </div>
        )}

        <p id={summaryId} className={styles.gainDetail}>
          {summaryText}
        </p>
        {result.series && result.series.total > 1 && <p className={styles.gainDetail}>
          Série de {result.series.total} manches · {result.players?.map((player, index) => `${player.isYou ? "Toi" : player.name} : ${result.series!.scores[index] ?? 0}`).join(" · ")}
        </p>}

        {!win.isYou && (result.refund ?? 0) > 0 && (
          <div className={styles.refund}>
            <img src={sysAsset(NKAP_COIN_SRC)} alt="" className={styles.refundCoin} draggable={false} />
            <span>Remboursement Cauris : + {NKAP(result.refund ?? 0)}</span>
          </div>
        )}
        {!win.isYou && mySettlement?.doubleBlocked && (
          <div className={styles.refund}>
            <span aria-hidden="true">🗿</span>
            <span>Totem des Ancêtres : mise double évitée</span>
          </div>
        )}
        {!win.isYou && (mySettlement?.doublePenalty ?? 0) > 0 && (
          <div className={styles.refund}>
            <span aria-hidden="true">3</span>
            <span>Dernier pli gagné avec un 3 : mise double − {NKAP(mySettlement?.doublePenalty ?? 0)}</span>
          </div>
        )}

        {incomingRematchRequester && !nextRequested && !roomDissolved && (
          <div className={styles.rematchInvitePill} role="status" aria-live="polite">
            <span className={styles.rematchInviteDot} aria-hidden="true" />
            <span><strong>{incomingRematchRequester.name}</strong> demande une revanche !</span>
          </div>
        )}

        {roomDissolved && (
          <div className={styles.roomGonePill} role="status" aria-live="polite">
            Les autres joueurs ont quitté la table
          </div>
        )}
      </div>

      {gameMode === "event" ? (
        <ResultActions>
          <button
            type="button"
            data-nj-skin="none"
            className={`${styles.ctaPrimary}${win.isYou ? ` ${styles.ctaPrimaryWin}` : ""}`}
            onClick={onMenu}
            aria-label="Retour au parcours de l'événement"
          >
            <span className={styles.ctaGlyph} aria-hidden="true">→</span>
            <span>{win.isYou ? "Voir ma progression" : "Retour au parcours"}</span>
          </button>
        </ResultActions>
      ) : (
        <ResultActions status={roomDissolved ? null : nextRound.status}>
          <button
            type="button"
            data-nj-skin="none"
            className={`${styles.ctaPrimary}${win.isYou || incomingRematchRequester ? ` ${styles.ctaPrimaryWin}` : ""}`}
            onClick={handleNext}
            disabled={!effectiveCanNext || (nextRequested && !nextRequiresConsensus)}
            aria-label={nextRound.label}
          >
            <span className={styles.ctaGlyph} aria-hidden="true">{nextRequested ? "✓" : "↻"}</span>
            <span>
              {nextRequested && nextRequiresConsensus
                ? "Voir la revanche"
                : incomingRematchRequester && !nextRequested
                  ? "Accepter"
                  : nextRound.short}
            </span>
          </button>

          <button
            type="button"
            data-nj-skin="none"
            className={styles.ctaSecondary}
            onClick={onMenu}
            aria-label="Quitter la table et revenir au menu"
          >
            <span className={styles.ctaGlyph} aria-hidden="true">⌂</span>
            <span>Menu</span>
          </button>
        </ResultActions>
      )}
    </>
  );

  const rematchMain = (
    <RematchView
      room={currentRoom}
      currentUid={user?.uid}
      gameMode={gameMode}
      mise={mise}
      previousPlayers={result.players}
      motionProfile={motion}
      onShowResult={() => setShowRematchScreen(false)}
      onLeave={onMenu}
    />
  );

  return (
    <ResultLayout
      ref={rootRef}
      panelRef={panelRef}
      titleId={titleId}
      descriptionId={summaryId}
      motionMode={motion.mode}
      reducedMotion={motion.reduced}
      scriptedMotion={scriptedMotion}
      main={showRematchScreen && nextRequiresConsensus ? rematchMain : main}
      outcome={win.isYou ? "win" : "loss"}
      decoration={(
        <>
          {motion.enabled && motion.allowDecorativeLoop && <div className="nj-result-aura" aria-hidden="true" />}
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
