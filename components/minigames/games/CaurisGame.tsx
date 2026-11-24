"use client";

/* Lancer de cauris : on secoue la calebasse (pendant que le serveur tire),
   puis les 6 cauris sont lancés et retombent, chacun sur la face tirée.
   Animation 100 % transform (Web Animations API). */

import Image from "@/components/ui/GameImage";
import { useRef, useState } from "react";
import { CAURIS_TIERS, MINI_GAMES_BY_ID, type Reward } from "@/domain";
import { GameStage, PlayButton } from "../MiniGameKit";
import { miniGameError, type MiniGameProps } from "../useMiniGames";
import styles from "../MiniGames.module.css";

const game = MINI_GAMES_BY_ID.cauris;

/* Points d'atterrissage (en % de la natte), légèrement désordonnés. */
const LANDING = [
  { x: 18, y: 30, r: -24 }, { x: 46, y: 22, r: 38 }, { x: 76, y: 32, r: -60 },
  { x: 24, y: 66, r: 72 }, { x: 54, y: 72, r: -12 }, { x: 80, y: 62, r: 140 },
];

export function CaurisGame({ mg, onReward, onError, onAuth, onOdds }: MiniGameProps) {
  const { free } = mg.status("cauris");
  const [phase, setPhase] = useState<"idle" | "shaking" | "thrown">("idle");
  const [faces, setFaces] = useState<boolean[] | null>(null);
  const [landed, setLanded] = useState(false);
  const shellRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const bowlRef = useRef<HTMLDivElement>(null);

  const open = faces?.filter(Boolean).length ?? 0;
  const tier = faces ? CAURIS_TIERS.find((t) => t.counts.includes(open)) : null;

  const start = async () => {
    if (mg.guest) return onAuth();
    setPhase("shaking");
    setLanded(false);
    setFaces(null);
    const shake = bowlRef.current?.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(-9deg) translateX(-4px)" }, { transform: "rotate(8deg) translateX(4px)" }, { transform: "rotate(0deg)" }],
      { duration: 360, iterations: Infinity, easing: "ease-in-out" },
    );
    const minShake = new Promise((r) => setTimeout(r, 1_300));
    let reward: Reward | null = null;
    try {
      const [res] = await Promise.all([mg.api.play("cauris"), minShake]);
      if (res.script.game !== "cauris") throw new Error("script");
      reward = res.reward;
      shake?.cancel();
      setFaces(res.script.faces);
      setPhase("thrown");
      // Lancer : chaque cauri part de la calebasse et rebondit sur la natte.
      requestAnimationFrame(() => {
        shellRefs.current.forEach((el, i) => {
          if (!el) return;
          const spot = LANDING[i];
          el.animate(
            [
              { transform: `translate(-50%, -50%) translate(0px, 140px) rotate(0deg) scale(0.6)`, opacity: 0 },
              { transform: `translate(-50%, -50%) translate(0px, -40px) rotate(${spot.r * 3}deg) scale(1.15)`, opacity: 1, offset: 0.45 },
              { transform: `translate(-50%, -50%) translate(0px, 6px) rotate(${spot.r * 1.2}deg) scale(1)`, offset: 0.8 },
              { transform: `translate(-50%, -50%) translate(0px, 0px) rotate(${spot.r}deg) scale(1)`, opacity: 1 },
            ],
            { duration: 1_100 + i * 90, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", fill: "both" },
          );
        });
      });
      window.setTimeout(() => setLanded(true), 1_100 + 6 * 90);
      window.setTimeout(() => { if (reward) onReward(reward); }, 2_500);
    } catch (cause) {
      shake?.cancel();
      setPhase("idle");
      onError(miniGameError(cause));
    }
  };

  return (
    <GameStage
      game={game}
      onOdds={onOdds}
      hint={phase === "shaking" ? "Les cauris s’agitent dans la calebasse…" : landed && tier ? `${open} cauri${open > 1 ? "s" : ""} ouvert${open > 1 ? "s" : ""} · ${tier.label}` : "Bouche ouverte vers le ciel = cauri ouvert"}
      footer={<PlayButton game={game} free={free} guest={mg.guest} busy={phase === "shaking"} disabled={phase === "thrown" && !landed} label={phase === "idle" ? "LANCER LES CAURIS" : "RELANCER"} onClick={() => void start()} />}
    >
      <div className={styles.caurisMat}>
        <div ref={bowlRef} className={`${styles.calabash}${phase === "thrown" ? ` ${styles.calabashEmpty}` : ""}`} aria-hidden="true">
          <span className={styles.calabashRim} />
          {phase !== "thrown" && [0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={styles.bowlShell} style={{ left: `${22 + (i % 3) * 22}%`, top: `${30 + Math.floor(i / 3) * 26}%`, transform: `rotate(${i * 47}deg)` }}>
              <Image src="/assets/njambo/economy/cauri-64.webp" alt="" width={30} height={30} />
            </span>
          ))}
        </div>
        {phase === "thrown" && faces && LANDING.map((spot, i) => (
          <span
            key={i}
            ref={(el) => { shellRefs.current[i] = el; }}
            className={`${styles.thrownShell}${landed ? (faces[i] ? ` ${styles.shellOpen}` : ` ${styles.shellClosed}`) : ""}`}
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            aria-label={faces[i] ? "Cauri ouvert" : "Cauri fermé"}
          >
            {faces[i]
              ? <Image src="/assets/njambo/economy/cauri-128.webp" alt="" width={54} height={54} />
              : <span className={styles.shellBack} />}
          </span>
        ))}
      </div>
    </GameStage>
  );
}
