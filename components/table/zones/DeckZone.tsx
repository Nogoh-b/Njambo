"use client";

/* ═══════════════ DeckZone — Pioche 3D centrée + Mélange aronde/paquets + Poignet naturel ═══════════════
   Positionne la pioche EXACTEMENT au centre géométrique du plateau (50 %, centerTop) :
   le médaillon Pot est ancré en absolu afin de ne jamais décaler la pioche.
   Expose les deux handles du ZoneRegistry :
   - "deck" : rect non-tourné de la pioche centrée + pulse + pose V2 orientée ;
   - "pot"  : rect du pot + flash avec label (« +200 », « ×2 »…). */

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PlayCard } from "@/components/cards/PlayCard";
import { NjamboIcon } from "@/components/ui/Art";
import { displayFont } from "@/components/ui/Shell";
import { NKAP } from "@/data/mock";
import { rotateVector, stackPose } from "@/engine/anim/v2/pose";
import type { DeckEdge, Point2D } from "./deckAim";
import { buildShufflePlan } from "./shuffleChoreo";
import { useRegisterZone } from "./ZoneRegistry";
import { elementCenter, elementScale } from "./zonePose";
import styles from "./DeckZone.module.css";

/** Inclinaison de repos (0° = droite, tournée vers la main du joueur local). */
const DECK_REST_ANGLE = 0;
const DECK_DEPTH = { x: 1.5, y: -1.5 };
const DECK_LAYERS = 3;

/** Cartes animées pendant le mélange (aronde + paquets) : complet / lite. */
const SHUFFLE_CARDS_FULL = 14;
const SHUFFLE_CARDS_LITE = 8;

interface ShuffleStackProps {
  count: number;
  cardW: number;
  cardH: number;
  radius: number;
  riffleMs: number;
  packetsMs: number;
  frames: number;
}

/** Paquet animé en WAAPI : queue d'aronde puis paquets (keyframes calculées dans shuffleChoreo). */
function ShuffleStack({ count, cardW, cardH, radius, riffleMs, packetsMs, frames }: ShuffleStackProps) {
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const plan = useMemo(
    () => buildShufflePlan({ cardW, cardH, count, riffleMs, packetsMs, frames }),
    [cardW, cardH, count, riffleMs, packetsMs, frames],
  );

  useEffect(() => {
    const duration = riffleMs + packetsMs;
    if (duration <= 0) return;
    const anims = plan.cards.map((keyframes, i) => {
      const node = cardRefs.current[i];
      return typeof node?.animate === "function"
        ? node.animate(keyframes as unknown as Keyframe[], { duration, fill: "both", easing: "linear" })
        : null;
    });
    return () => anims.forEach((anim) => anim?.cancel());
  }, [plan, riffleMs, packetsMs]);

  return (
    <>
      {plan.cards.map((keyframes, i) => (
        <div
          key={i}
          ref={(node) => { cardRefs.current[i] = node; }}
          className={styles.shuffleCard}
          style={{ borderRadius: radius, transform: keyframes[0].transform, zIndex: keyframes[0].zIndex }}
        >
          <PlayCard hidden w={cardW} />
        </div>
      ))}
    </>
  );
}

export type DeckStage = "idle" | "shuffling" | "dealing";

interface DeckZoneProps {
  deckW: number;
  pot: number;
  ledSuit: string | null;
  ledColor?: string;
  /** Phase visuelle de la pioche : repos, mélange cérémoniel ou distribution orientée. */
  stage?: DeckStage;
  /** Compatibilité : vrai si une distribution est en cours lorsque `stage` est omis. */
  dealing?: boolean;
  /** Durée totale de l'animation de mélange (ms — réglable côté admin). */
  shuffleDurationMs?: number;
  /** Part de `shuffleDurationMs` jouée en paquets après la queue d'aronde (ms, 0 = aronde seule). */
  shufflePacketsMs?: number;
  /** Angle cumulé en degrés (0° = bas, 90° = gauche, 180° = haut, 270° = droite). */
  aimAngle?: number;
  /** Durée de rotation vers la main cible (ms — réglable côté admin). 0 = recalage silencieux. */
  aimTransitionMs?: number;
  /** Sens de la rotation en cours (+1 horaire, -1 anti-horaire) pour le roulis naturel du poignet. */
  turnDir?: 1 | -1;
  /** Légère translation du poignet (px) vers la main servie. */
  wristOffset?: Point2D;
  /** Compteur monotone incrémenté à chaque rotation vers un nouveau joueur (glisse + inertie papier). */
  turnSeq?: number;
  /** Compteur monotone incrémenté à chaque carte qui quitte la pioche (poussée du pouce). */
  launchSeq?: number;
  /** Bord par lequel sort la carte : avant, ou arrière quand la main servie est en face (pas de rotation). */
  launchEdge?: DeckEdge;
  /** Position verticale exacte du centre du plateau (ex. "47%" portrait, "48%" bureau). */
  centerTop?: string;
  /** Paysage compact (hauteur ≤ 620 px) : place le médaillon Pot à droite sans décentrer la pioche. */
  compactHeight?: boolean;
  motionEnabled: boolean;
  premiumFxAllowed: boolean;
  liteMotion: boolean;
  portrait?: boolean;
}

export const DeckZone = memo(function DeckZone({
  deckW,
  pot,
  stage: stageProp,
  dealing = false,
  shuffleDurationMs = 3200,
  shufflePacketsMs = 0,
  aimAngle = DECK_REST_ANGLE,
  aimTransitionMs = 320,
  turnDir = 1,
  wristOffset,
  turnSeq = 0,
  launchSeq = 0,
  launchEdge = "front",
  centerTop,
  compactHeight = false,
  motionEnabled,
  liteMotion,
  portrait = false,
}: DeckZoneProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const potRef = useRef<HTMLDivElement>(null);
  const [pulsing, setPulsing] = useState(false);
  const [potFlash, setPotFlash] = useState<{ key: string; label?: string } | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stage: DeckStage = stageProp ?? (dealing ? "dealing" : "idle");
  const isShuffling = motionEnabled && stage === "shuffling";
  const isDealing = stage === "dealing";
  const effectiveAngle = motionEnabled ? aimAngle : DECK_REST_ANGLE;
  const effectiveOffset = motionEnabled && wristOffset ? wristOffset : { x: 0, y: 0 };
  const liveAngleRef = useRef(effectiveAngle);
  liveAngleRef.current = effectiveAngle;

  const visualDeckW = Math.round(deckW * (portrait ? 0.78 : compactHeight ? 0.8 : 0.88));
  const visualDeckH = Math.round(visualDeckW * 1.45);
  const cardRadius = Math.max(8, visualDeckW * 0.14);
  const resolvedTop = centerTop ?? (portrait ? "47%" : "48%");

  useRegisterZone("deck", {
    getRect: () => anchorRef.current?.getBoundingClientRect() ?? null,
    getElement: () => deckRef.current ?? anchorRef.current,
    pulse: (durationMs = 900) => {
      setPulsing(true);
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
      pulseTimer.current = setTimeout(() => setPulsing(false), durationMs);
    },
    // Animation V2 : paquet centré et orienté selon la visée courante de la pioche.
    poseOf: (cardIdx: number, count?: number) => {
      const anchor = anchorRef.current;
      if (!anchor) return null;
      const angle = liveAngleRef.current;
      const scale = elementScale(anchor, 0);
      const depth = rotateVector(DECK_DEPTH.x * scale, DECK_DEPTH.y * scale, angle);
      return stackPose(
        {
          center: elementCenter(anchor),
          rotate: angle,
          cardWidth: visualDeckW * scale,
          depth,
          layers: DECK_LAYERS,
        },
        cardIdx,
        count ?? cardIdx + 1,
      );
    },
  });

  useRegisterZone("pot", {
    getRect: () => potRef.current?.getBoundingClientRect() ?? null,
    getElement: () => potRef.current,
    flash: (label?: string) => {
      setPotFlash({ key: `pot-${Date.now()}`, label });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setPotFlash(null), 1600);
    },
  });

  const turnDurMs = Math.max(80, aimTransitionMs || 320);
  const clusterStyle: CSSProperties = {
    top: resolvedTop,
    zIndex: isShuffling ? 26 : isDealing ? 12 : 5,
    ["--deck-w" as string]: `${visualDeckW}px`,
    ["--deck-h" as string]: `${visualDeckH}px`,
    ["--shuffle-dur" as string]: `${shuffleDurationMs}ms`,
    ["--turn-dur" as string]: `${turnDurMs}ms`,
    ["--turn-dir" as string]: String(turnDir),
    ["--pot-gap" as string]: portrait ? "11px" : "14px",
  };

  // Courbe humaine souple (accélération douce du poignet puis décélération naturelle, sans rebond mécanique).
  const aimWrapStyle: CSSProperties = {
    transform: `translate3d(${effectiveOffset.x}px, ${effectiveOffset.y}px, 0) rotate(${effectiveAngle}deg)`,
    transition:
      motionEnabled && aimTransitionMs > 0
        ? `transform ${aimTransitionMs}ms cubic-bezier(0.38, 0.04, 0.22, 1)`
        : "none",
    willChange: isDealing || isShuffling ? "transform" : undefined,
  };

  const turningNow = motionEnabled && isDealing && turnSeq > 0 && aimTransitionMs > 0;
  const shadowClass = [
    styles.deckFeltShadow,
    turningNow && !liteMotion ? (turnSeq % 2 === 0 ? styles.deckShadowGlideA : styles.deckShadowGlideB) : "",
  ].filter(Boolean).join(" ");

  const turnShellClass = [
    styles.deckTurnShell,
    turningNow ? (turnSeq % 2 === 0 ? styles.deckTurnGlideA : styles.deckTurnGlideB) : "",
  ].filter(Boolean).join(" ");

  const tiltBodyClass = [
    styles.deckTiltBody,
    motionEnabled && isDealing ? styles.deckTiltDealing : "",
    motionEnabled && pulsing && !isShuffling ? styles.deckTiltPulsing : "",
  ].filter(Boolean).join(" ");

  const back2Class = [
    styles.stackLayer,
    styles.stackLayerBack2,
    turningNow && !liteMotion ? (turnSeq % 2 === 0 ? styles.stackFanBack2A : styles.stackFanBack2B) : "",
  ].filter(Boolean).join(" ");

  const back1Class = [
    styles.stackLayer,
    styles.stackLayerBack1,
    turningNow && !liteMotion ? (turnSeq % 2 === 0 ? styles.stackFanBack1A : styles.stackFanBack1B) : "",
  ].filter(Boolean).join(" ");

  const fromBack = launchEdge === "back";
  const topCardClass = [
    styles.stackLayerTop,
    motionEnabled && isDealing ? (fromBack ? styles.stackLayerTopThumbPeekBack : styles.stackLayerTopThumbPeek) : "",
    motionEnabled && isDealing && launchSeq > 0 && !fromBack
      ? (launchSeq % 2 === 0 ? styles.topCardFollowA : styles.topCardFollowB)
      : "",
  ].filter(Boolean).join(" ");

  const sheenClass = [
    styles.leadingEdgeSheen,
    fromBack ? styles.leadingEdgeSheenBack : "",
    isDealing ? styles.leadingEdgeSheenVisible : "",
    motionEnabled && isDealing && launchSeq > 0
      ? (launchSeq % 2 === 0 ? styles.leadingEdgeSheenPulseA : styles.leadingEdgeSheenPulseB)
      : "",
  ].filter(Boolean).join(" ");

  const packetsMs = Math.max(0, Math.min(shufflePacketsMs, shuffleDurationMs));
  const riffleMs = Math.max(0, shuffleDurationMs - packetsMs);

  return (
    <div
      className={`${styles.cluster} ${motionEnabled && !liteMotion && (isDealing || isShuffling) ? "nj-pot-cluster nj-pot-cluster-ready" : "nj-pot-cluster"}`}
      style={clusterStyle}
      data-deck-zone="center"
      data-deck-stage={stage}
      data-deck-aim={Math.round(((effectiveAngle % 360) + 360) % 360)}
      data-deck-turn-ms={aimTransitionMs}
    >
      {/* Ancre non tournée : garantit que la pioche est exactement centrée sur (50 %, centerTop) */}
      <div ref={anchorRef} className={styles.deckAnchor}>
        {/* Couche orientée naturellement vers la main du joueur servi */}
        <div ref={deckRef} className={styles.deckAimWrap} style={aimWrapStyle}>
          <div className={shadowClass} aria-hidden="true" />
          <div className={turnShellClass}>
            <div className={tiltBodyClass}>
              {isShuffling ? (
                <ShuffleStack
                  count={liteMotion ? SHUFFLE_CARDS_LITE : SHUFFLE_CARDS_FULL}
                  cardW={visualDeckW}
                  cardH={visualDeckH}
                  radius={cardRadius}
                  riffleMs={riffleMs}
                  packetsMs={packetsMs}
                  frames={liteMotion ? 60 : 120}
                />
              ) : (
                <>
                  <div className={back2Class}>
                    <PlayCard hidden w={visualDeckW} />
                  </div>
                  <div className={back1Class}>
                    <PlayCard hidden w={visualDeckW} />
                  </div>
                  {/* Pas de carte fantôme éjectée : la carte qui vole (éventail, V1 ou V2) part
                      elle-même de la pioche, au même instant, et c'est elle qu'on voit sortir. */}
                  <div className={topCardClass} style={{ borderRadius: cardRadius }}>
                    <PlayCard hidden w={visualDeckW} />
                  </div>
                </>
              )}

              {/* Reflet chaud discret sur la tranche avant (+Y) vers le joueur servi */}
              {motionEnabled && <span className={sheenClass} aria-hidden="true" />}
            </div>
          </div>
        </div>
      </div>

      {/* Médaillon Pot épuré posé sur le feutre (absolu : ne décale jamais la pioche du centre) */}
      <div
        ref={potRef}
        className={`${styles.potAnchor} ${compactHeight ? styles.potRight : styles.potAbove}${isShuffling ? ` ${styles.potDimmed}` : ""}`}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: portrait ? "4px 9px 4px 6px" : "5px 11px 5px 7px",
            borderRadius: 999,
            border: "1px solid rgba(255, 214, 96, 0.44)",
            background: "rgba(6, 20, 16, 0.76)",
            boxShadow: "inset 0 1px 0 rgba(255, 244, 200, 0.2), 0 6px 14px rgba(0, 0, 0, 0.42)",
            whiteSpace: "nowrap",
          }}
        >
          <NjamboIcon name="coin" tone="gold" size={portrait ? 14 : 16} />
          <span
            style={{
              ...displayFont,
              fontWeight: 900,
              fontSize: portrait ? 11.5 : 13,
              color: "#ffe88a",
              letterSpacing: "0.02em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {NKAP(pot)}
          </span>
        </div>
        {potFlash && (
          <div key={potFlash.key} className="nj-pot-flash" aria-hidden="true">
            {potFlash.label ?? ""}
          </div>
        )}
      </div>
    </div>
  );
});
