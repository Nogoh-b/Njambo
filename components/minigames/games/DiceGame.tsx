"use client";

/* Les dés du quartier : deux dés 3D (CSS) qui roulent pendant le tirage
   serveur puis ralentissent et se posent sur les faces tirées. Rotation
   pilotée en requestAnimationFrame (transform uniquement). */

import { useEffect, useRef, useState } from "react";
import { MINI_GAMES_BY_ID, dicePayout, type Reward } from "@/domain";
import { decelProgress } from "@/lib/fortuneWheel";
import { GameStage, PlayButton } from "../MiniGameKit";
import { miniGameError, type MiniGameProps } from "../useMiniGames";
import styles from "../MiniGames.module.css";

const game = MINI_GAMES_BY_ID.dice;

/* Rotation (x, y en degrés) qui amène la face n devant. */
const FACE_ROT: Record<number, [number, number]> = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const FACES: Array<{ n: number; cls: string }> = [
  { n: 1, cls: "faceFront" }, { n: 6, cls: "faceBack" }, { n: 3, cls: "faceRight" },
  { n: 4, cls: "faceLeft" }, { n: 2, cls: "faceTop" }, { n: 5, cls: "faceBottom" },
];

interface Spin { x: number; y: number; vx: number; vy: number }

function Die({ cubeRef }: { cubeRef: (el: HTMLDivElement | null) => void }) {
  return (
    <div className={styles.dieScene}>
      <div ref={cubeRef} className={styles.dieCube}>
        {FACES.map(({ n, cls }) => (
          <div key={n} className={`${styles.dieFace} ${styles[cls]}`}>
            {Array.from({ length: 9 }, (_, i) => <span key={i} className={PIPS[n].includes(i) ? styles.pip : styles.pipEmpty} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DiceGame({ mg, onReward, onError, onAuth, onOdds }: MiniGameProps) {
  const { free } = mg.status("dice");
  const [phase, setPhase] = useState<"idle" | "rolling" | "landed">("idle");
  const [values, setValues] = useState<[number, number] | null>(null);
  const cubes = useRef<Array<HTMLDivElement | null>>([null, null]);
  const spins = useRef<Spin[]>([{ x: -20, y: 25, vx: 0, vy: 0 }, { x: -20, y: -30, vx: 0, vy: 0 }]);
  const frame = useRef(0);

  const paint = () => {
    spins.current.forEach((s, i) => {
      const el = cubes.current[i];
      if (el) el.style.transform = `rotateX(${s.x}deg) rotateY(${s.y}deg)`;
    });
  };

  useEffect(() => {
    paint();
    return () => cancelAnimationFrame(frame.current);
  }, []);

  const tumble = () => {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      spins.current.forEach((s) => { s.x += s.vx * dt; s.y += s.vy * dt; });
      paint();
      frame.current = requestAnimationFrame(loop);
    };
    frame.current = requestAnimationFrame(loop);
  };

  /* Ralentit chaque dé jusqu'à la face voulue (≥ 1,5 tour de plus, ~1,8 s). */
  const settle = (targets: [number, number]) => new Promise<void>((resolve) => {
    cancelAnimationFrame(frame.current);
    const plans = spins.current.map((s, i) => {
      const [fx, fy] = FACE_ROT[targets[i]];
      const toX = Math.ceil((s.x + 540 - fx) / 360) * 360 + fx;
      const toY = Math.ceil((s.y + 540 - fy) / 360) * 360 + fy;
      return { fromX: s.x, fromY: s.y, toX, toY };
    });
    const t0 = performance.now();
    const duration = 1_800;
    const loop = (now: number) => {
      const u = decelProgress((now - t0) / duration);
      plans.forEach((p, i) => {
        spins.current[i].x = p.fromX + (p.toX - p.fromX) * u;
        spins.current[i].y = p.fromY + (p.toY - p.fromY) * u;
      });
      paint();
      if (now - t0 < duration) frame.current = requestAnimationFrame(loop);
      else resolve();
    };
    frame.current = requestAnimationFrame(loop);
  });

  const start = async () => {
    if (mg.guest) return onAuth();
    setPhase("rolling");
    setValues(null);
    spins.current.forEach((s, i) => { s.vx = 620 + i * 90; s.vy = 480 - i * 140; });
    tumble();
    try {
      const [res] = await Promise.all([mg.api.play("dice"), new Promise((r) => setTimeout(r, 900))]);
      if (res.script.game !== "dice") throw new Error("script");
      await settle(res.script.dice);
      setValues(res.script.dice);
      setPhase("landed");
      const reward: Reward = res.reward;
      window.setTimeout(() => onReward(reward), 1_200);
    } catch (cause) {
      cancelAnimationFrame(frame.current);
      setPhase("idle");
      onError(miniGameError(cause));
    }
  };

  const sum = values ? values[0] + values[1] : 0;
  const doubled = values ? values[0] === values[1] : false;

  return (
    <GameStage
      game={game}
      onOdds={onOdds}
      hint={phase === "landed" && values
        ? `${values[0]} + ${values[1]} = ${sum}${doubled ? " · Double ! Gain ×2" : ""} → ${dicePayout(sum) * (doubled ? 2 : 1)} Nkap`
        : "Somme 7 : 60 Nkap · 8 à 11 : 100 Nkap · Double 6 : 800 Nkap"}
      footer={<PlayButton game={game} free={free} guest={mg.guest} busy={phase === "rolling"} label={phase === "idle" ? "LANCER LES DÉS" : "RELANCER"} onClick={() => void start()} />}
    >
      <div className={`${styles.diceTable}${doubled && phase === "landed" ? ` ${styles.diceDouble}` : ""}`}>
        <Die cubeRef={(el) => { cubes.current[0] = el; }} />
        <Die cubeRef={(el) => { cubes.current[1] = el; }} />
      </div>
    </GameStage>
  );
}
