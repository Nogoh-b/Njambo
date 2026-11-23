"use client";

/* ═══════════════ FortuneWheel — roue des retrouvailles réaliste ═══════════════
   - Seul le DISQUE tourne : cadre, ampoules, moyeu et aiguille restent fixes.
   - Démarrage immédiat (léger élan arrière puis lancée), rotation libre pendant
     que le serveur tire le lot, puis décélération lente qui s'arrête EXACTEMENT
     sur la case du lot gagné.
   - L'aiguille bute sur chaque clou du disque et rebondit (ressort amorti).
   - Tout est animé en `transform` (GPU) via requestAnimationFrame. */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { WHEEL_REWARDS, type Reward } from "@/domain/catalog";
import {
  SEGMENT_DEG,
  WHEEL_ORDER,
  decelDuration,
  decelProgress,
  mod360,
  restingAngleFor,
  segmentIndexForReward,
  travelTo,
} from "@/lib/fortuneWheel";
import { rewardIconSrc } from "@/lib/shopVisuals";
import styles from "./FortuneWheel.module.css";

export interface FortuneWheelHandle {
  /** Lance la roue tout de suite (avant même la réponse du serveur). */
  start: () => void;
  /** Ralentit et s'arrête sur la case de ce gain ; résout une fois le gain mis en valeur. */
  landOn: (reward: Reward) => Promise<void>;
  /** Arrêt doux sans gain (erreur serveur). */
  abort: () => void;
}

interface FortuneWheelProps {
  /** false : arrêt court et sans ressort (animations coupées / mouvement réduit). */
  animated?: boolean;
  /** Roue prête à être lancée : les ampoules s'animent. */
  ready?: boolean;
  /** Appelé à chaque clou franchi (son de cliquet). */
  onTick?: () => void;
}

/* Habillage des cases : couleurs de la roue d'origine, texte lisible sur chacune. */
const SEGMENT_STYLE = [
  { fill: "#ead7b0", deep: "#b8955c", ink: "#2a1606" }, // 100 Nkap — ivoire
  { fill: "#d0651c", deep: "#7c3209", ink: "#fff8ea" }, // Ticket — cuivre
  { fill: "#e3aa22", deep: "#8a5a06", ink: "#2a1606" }, // 250 Nkap — or
  { fill: "#1f9f93", deep: "#0b544d", ink: "#f2fffb" }, // Énergie — sarcelle
  { fill: "#b8213f", deep: "#5e0a1d", ink: "#fff0f3" }, // Cauris — carmin
  { fill: "#2546a8", deep: "#0f2160", ink: "#eef3ff" }, // Livre — cobalt
];

const SEGMENT_LABEL: Array<[string, string]> = [
  ["100", "Nkap"],
  ["Ticket", "Bronze"],
  ["250", "Nkap"],
  ["1 h", "Énergie"],
  ["5", "cauris"],
  ["Livre", "Normal"],
];

const PEG_STEP = SEGMENT_DEG / 2; // un clou à chaque bord de case + un au milieu
const PEG_REACH = 7; // degrés pendant lesquels un clou pousse l'aiguille
const MAX_FLAP = 26; // déviation max de l'aiguille (degrés)
const CRUISE_SPEED = 560; // degrés / seconde en rotation libre
const SPIN_UP_MS = 900;
const WIND_BACK_DEG = 14;
const WIND_BACK_MS = 260;
const MIN_TRAVEL = 720; // au moins deux tours complets pendant la décélération
const WIN_HOLD_MS = 1100; // le gain reste mis en valeur avant la suite

type Phase =
  | { kind: "idle" }
  | { kind: "windback"; t0: number; from: number }
  | { kind: "spinup"; t0: number; from: number }
  | { kind: "cruise"; lastT: number }
  | { kind: "decel"; t0: number; from: number; travel: number; duration: number; onDone: () => void };

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [r * Math.sin(rad), -r * Math.cos(rad)];
}

function wedgePath(index: number, r: number): string {
  const a0 = index * SEGMENT_DEG - SEGMENT_DEG / 2;
  const a1 = a0 + SEGMENT_DEG;
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  return `M0 0 L${x0.toFixed(3)} ${y0.toFixed(3)} A${r} ${r} 0 0 1 ${x1.toFixed(3)} ${y1.toFixed(3)} Z`;
}

export const FortuneWheel = forwardRef<FortuneWheelHandle, FortuneWheelProps>(function FortuneWheel(
  { animated = true, ready = false, onTick },
  ref,
) {
  const discRef = useRef<SVGGElement>(null);
  const pointerRef = useRef<HTMLSpanElement>(null);
  const angleRef = useRef(0);
  const phaseRef = useRef<Phase>({ kind: "idle" });
  const frameRef = useRef(0);
  const pendingLandRef = useRef<(() => void) | null>(null);
  const flapRef = useRef({ angle: 0, velocity: 0, lastPeg: 0 });
  const lastFrameRef = useRef(0);
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);

  const paint = useCallback(() => {
    if (discRef.current) discRef.current.style.transform = `rotate(${angleRef.current}deg)`;
    if (pointerRef.current) pointerRef.current.style.transform = `rotate(${flapRef.current.angle}deg)`;
  }, []);

  /* Aiguille : un clou la pousse tant qu'il est à moins de PEG_REACH degrés,
     puis elle revient avec un ressort amorti (petit rebond réaliste). */
  const updatePointer = useCallback((dt: number) => {
    const flap = flapRef.current;
    const pegPhase = mod360(angleRef.current) % PEG_STEP; // 0 = clou pile sous l'aiguille
    const pegIndex = Math.floor(angleRef.current / PEG_STEP);
    if (pegIndex !== flap.lastPeg) {
      flap.lastPeg = pegIndex;
      onTickRef.current?.();
    }
    const pushing = pegPhase < PEG_REACH;
    const target = pushing ? -MAX_FLAP * (pegPhase / PEG_REACH) : 0;
    if (pushing && flap.angle > target) {
      flap.angle = target; // le clou impose sa position
      flap.velocity = 0;
    } else {
      const stiffness = 520;
      const damping = 16;
      const accel = -stiffness * flap.angle - damping * flap.velocity;
      flap.velocity += accel * dt;
      flap.angle += flap.velocity * dt;
    }
  }, []);

  const loop = useCallback((now: number) => {
    const phase = phaseRef.current;
    const dt = Math.min(0.05, lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 0.016);
    lastFrameRef.current = now;

    if (phase.kind === "windback") {
      const u = Math.min(1, (now - phase.t0) / WIND_BACK_MS);
      angleRef.current = phase.from - WIND_BACK_DEG * Math.sin((u * Math.PI) / 2);
      if (u >= 1) phaseRef.current = { kind: "spinup", t0: now, from: angleRef.current };
    } else if (phase.kind === "spinup") {
      // Accélération quadratique jusqu'à la vitesse de croisière.
      const t = Math.min(SPIN_UP_MS, now - phase.t0) / 1000;
      const T = SPIN_UP_MS / 1000;
      angleRef.current = phase.from + (CRUISE_SPEED / (2 * T)) * t * t;
      if (now - phase.t0 >= SPIN_UP_MS) {
        phaseRef.current = { kind: "cruise", lastT: now };
        const land = pendingLandRef.current;
        pendingLandRef.current = null;
        land?.();
      }
    } else if (phase.kind === "cruise") {
      angleRef.current += CRUISE_SPEED * ((now - phase.lastT) / 1000);
      phase.lastT = now;
    } else if (phase.kind === "decel") {
      const u = (now - phase.t0) / phase.duration;
      angleRef.current = phase.from + phase.travel * decelProgress(u);
      if (u >= 1) {
        angleRef.current = phase.from + phase.travel;
        phaseRef.current = { kind: "idle" };
        phase.onDone();
      }
    }

    updatePointer(dt);
    paint();

    const settling = Math.abs(flapRef.current.angle) > 0.05 || Math.abs(flapRef.current.velocity) > 0.5;
    if (phaseRef.current.kind !== "idle" || settling) {
      frameRef.current = requestAnimationFrame(loop);
    } else {
      frameRef.current = 0;
      lastFrameRef.current = 0;
    }
  }, [paint, updatePointer]);

  const ensureLoop = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(loop);
  }, [loop]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const decelerateTo = useCallback((target: number, minTravel: number, onDone: () => void) => {
    const from = angleRef.current;
    const travel = travelTo(from, target, minTravel);
    const duration = animated ? decelDuration(travel, CRUISE_SPEED) * 1000 : 700;
    phaseRef.current = { kind: "decel", t0: performance.now(), from, travel, duration, onDone };
    ensureLoop();
  }, [animated, ensureLoop]);

  useImperativeHandle(ref, () => ({
    start() {
      setWinner(null);
      setSpinning(true);
      pendingLandRef.current = null;
      if (!animated) {
        phaseRef.current = { kind: "cruise", lastT: performance.now() };
      } else {
        phaseRef.current = { kind: "windback", t0: performance.now(), from: angleRef.current };
      }
      ensureLoop();
    },
    landOn(reward) {
      return new Promise<void>((resolve) => {
        const segment = segmentIndexForReward(reward);
        const land = () => {
          if (segment < 0) {
            // Gain hors roue (ne devrait pas arriver) : arrêt doux sans mise en valeur.
            decelerateTo(mod360(angleRef.current + 200), animated ? MIN_TRAVEL : 0, () => {
              setSpinning(false);
              resolve();
            });
            return;
          }
          const target = restingAngleFor(segment, Math.random() * 2 - 1);
          decelerateTo(target, animated ? MIN_TRAVEL : 0, () => {
            setSpinning(false);
            setWinner(segment);
            window.setTimeout(resolve, animated ? WIN_HOLD_MS : 250);
          });
        };
        const phase = phaseRef.current.kind;
        if (phase === "windback" || phase === "spinup") pendingLandRef.current = land;
        else land();
      });
    },
    abort() {
      pendingLandRef.current = null;
      if (phaseRef.current.kind === "idle" || phaseRef.current.kind === "decel") return;
      decelerateTo(mod360(angleRef.current + 90), animated ? 360 : 0, () => setSpinning(false));
    },
  }), [animated, decelerateTo, ensureLoop]);

  const bulbs = 16;

  return (
    <div className={`${styles.wheel}${ready && !spinning ? ` ${styles.ready}` : ""}${spinning ? ` ${styles.spinning}` : ""}${animated ? "" : ` ${styles.still}`}`}>
      {/* ── Cadre fixe : jante + ampoules ── */}
      <svg className={styles.frame} viewBox="-110 -110 220 220" aria-hidden="true">
        <defs>
          <radialGradient id="fw-rim" cx="50%" cy="38%" r="70%">
            <stop offset="0%" stopColor="#7a5226" />
            <stop offset="55%" stopColor="#3c2410" />
            <stop offset="100%" stopColor="#1a0e05" />
          </radialGradient>
          <linearGradient id="fw-brass" x1="0" y1="-1" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffe9a3" />
            <stop offset="50%" stopColor="#d89b2b" />
            <stop offset="100%" stopColor="#7a4a0c" />
          </linearGradient>
        </defs>
        <circle r="108" fill="url(#fw-rim)" />
        <circle r="107" fill="none" stroke="url(#fw-brass)" strokeWidth="2.5" />
        <circle r="93" fill="none" stroke="url(#fw-brass)" strokeWidth="2" />
      </svg>

      <div className={styles.bulbs} aria-hidden="true">
        {Array.from({ length: bulbs }, (_, i) => (
          <span
            key={i}
            className={styles.bulb}
            style={{ transform: `rotate(${(360 / bulbs) * i}deg) translateY(calc(var(--wheel-size) * -0.4645))`, animationDelay: `${(i % 4) * 0.18}s` }}
          />
        ))}
      </div>

      {/* ── Disque : la SEULE partie qui tourne ── */}
      <svg className={styles.discSvg} viewBox="-110 -110 220 220" role="img" aria-label="Roue des retrouvailles : 100 Nkap, ticket bronze, 250 Nkap, énergie 1 h, 5 cauris, livre normal">
        <defs>
          <radialGradient id="fw-shade" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000" stopOpacity="0" />
            <stop offset="62%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.38" />
          </radialGradient>
          <radialGradient id="fw-gloss" cx="40%" cy="22%" r="75%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
            <stop offset="45%" stopColor="#fff" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          {SEGMENT_STYLE.map((s, i) => (
            <radialGradient key={i} id={`fw-seg-${i}`} cx="0" cy="0" r="92" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={s.deep} />
              <stop offset="45%" stopColor={s.fill} />
              <stop offset="100%" stopColor={s.fill} />
            </radialGradient>
          ))}
        </defs>

        <g ref={discRef} className={styles.disc}>
          {WHEEL_ORDER.map((catalogIndex, i) => {
            const style = SEGMENT_STYLE[i];
            const [line1, line2] = SEGMENT_LABEL[i];
            const reward = WHEEL_REWARDS[catalogIndex].value;
            const mid = i * SEGMENT_DEG;
            return (
              <g key={i}>
                <path d={wedgePath(i, 91)} fill={`url(#fw-seg-${i})`} stroke="#2a1a0a" strokeWidth="1.2" />
                <g transform={`rotate(${mid})`}>
                  <image href={rewardIconSrc(reward)} x="-13" y="-81" width="26" height="26" preserveAspectRatio="xMidYMid meet" />
                  <text y="-44" textAnchor="middle" className={styles.amount} fill={style.ink}>{line1}</text>
                  <text y="-33" textAnchor="middle" className={styles.unit} fill={style.ink}>{line2}</text>
                </g>
              </g>
            );
          })}
          {/* Mise en valeur de la case gagnante */}
          {winner !== null && (
            <path d={wedgePath(winner, 91)} className={styles.winGlow} />
          )}
          {/* Clous : à chaque bord de case et au milieu */}
          {Array.from({ length: WHEEL_ORDER.length * 2 }, (_, i) => {
            const [x, y] = polar(86, i * PEG_STEP + SEGMENT_DEG / 2);
            return <circle key={i} cx={x} cy={y} r={i % 2 === 0 ? 3 : 2.2} fill="url(#fw-brass-disc)" className={styles.peg} />;
          })}
          <circle r="91" fill="url(#fw-shade)" pointerEvents="none" />
        </g>

        {/* Reflet fixe (ne tourne pas : la lumière vient d'en haut) */}
        <circle r="91" fill="url(#fw-gloss)" pointerEvents="none" />
        {/* Moyeu fixe */}
        <circle r="17" fill="url(#fw-brass)" stroke="#5c3608" strokeWidth="1.5" />
        <circle r="10" fill="#2a1606" />
        <circle r="5" fill="url(#fw-brass)" />
        <defs>
          <linearGradient id="fw-brass-disc" x1="0" y1="-1" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff3c4" />
            <stop offset="100%" stopColor="#b9801c" />
          </linearGradient>
        </defs>
      </svg>

      {/* ── Aiguille fixe (pivote sur son axe quand un clou la pousse) ── */}
      <span ref={pointerRef} className={styles.pointer} aria-hidden="true">
        <svg viewBox="0 0 40 58">
          <defs>
            <linearGradient id="fw-pointer" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffe9a3" />
              <stop offset="55%" stopColor="#e2a531" />
              <stop offset="100%" stopColor="#8a560e" />
            </linearGradient>
          </defs>
          <path d="M21.5 56 L7.5 18 A14 14 0 1 1 35.5 18 Z" fill="rgba(0,0,0,0.38)" />
          <path d="M20 54 L6 16 A14 14 0 1 1 34 16 Z" fill="url(#fw-pointer)" stroke="#5c3608" strokeWidth="2" />
          <circle cx="20" cy="14" r="5" fill="#2a1606" />
          <circle cx="20" cy="14" r="2.4" fill="#ffe9a3" />
        </svg>
      </span>
    </div>
  );
});
