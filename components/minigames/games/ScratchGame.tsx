"use client";

/* Ticket à gratter : 6 cases recouvertes d'une pellicule dorée que l'on gratte
   au doigt (canvas). Trois symboles identiques = le lot de ce symbole. */

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { MINI_GAMES_BY_ID, type InstantScript, type Reward } from "@/domain";
import { rewardIconSrc } from "@/lib/shopVisuals";
import { GameStage, PlayButton } from "../MiniGameKit";
import { miniGameError, type MiniGameProps } from "../useMiniGames";
import styles from "../MiniGames.module.css";

const game = MINI_GAMES_BY_ID.scratch;
const REVEAL_AT = 0.55; // part grattée à partir de laquelle tout se dévoile

function shortLabel(reward: Reward): [string, string] {
  if (reward.type === "nkap") return [String(reward.amount), "Nkap"];
  if (reward.type === "cauris") return [String(reward.amount), "cauris"];
  if (reward.type === "energy_pass") return ["1 h", "Énergie"];
  if (reward.type === "ticket") return ["Ticket", "Bronze"];
  return ["Livre", "Normal"];
}

export function ScratchGame({ mg, onReward, onError, onAuth, onOdds }: MiniGameProps) {
  const { free } = mg.status("scratch");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ reward: Reward; script: Extract<InstantScript, { game: "scratch" }> } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scratching = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const strokes = useRef(0);

  /* Pellicule dorée avec motif, redessinée à chaque nouveau ticket. */
  const paintFoil = useCallback(() => {
    const canvas = canvasRef.current;
    const grid = gridRef.current;
    if (!canvas || !grid) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const { width, height } = grid.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.scale(ratio, ratio);
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#f6dc8a");
    gradient.addColorStop(0.5, "#c8922c");
    gradient.addColorStop(1, "#f0cf72");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(90, 52, 8, 0.22)";
    for (let y = 8; y < height; y += 16) {
      for (let x = (y / 16) % 2 ? 8 : 0; x < width; x += 16) {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = "rgba(60, 32, 4, 0.55)";
    ctx.font = "900 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GRATTE ICI", width / 2, height / 2 + 4);
  }, []);

  useEffect(() => {
    if (result && !revealed) paintFoil();
  }, [result, revealed, paintFoil]);

  const finish = useCallback(() => {
    if (!result || revealed) return;
    setRevealed(true);
    window.setTimeout(() => onReward(result.reward), 1_900);
  }, [onReward, result, revealed]);

  const clearedRatio = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return 0;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 4 * 24) {
      total += 1;
      if (data[i] < 40) clear += 1;
    }
    return total ? clear / total : 0;
  };

  const scratchAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 34;
    ctx.beginPath();
    const from = lastPoint.current ?? { x, y };
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(x + 0.01, y);
    ctx.stroke();
    lastPoint.current = { x, y };
    strokes.current += 1;
    if (strokes.current % 8 === 0 && clearedRatio() > REVEAL_AT) finish();
  };

  const start = async () => {
    if (mg.guest) return onAuth();
    setBusy(true);
    setRevealed(false);
    try {
      const res = await mg.api.play("scratch");
      if (res.script.game === "scratch") setResult({ reward: res.reward, script: res.script });
      strokes.current = 0;
    } catch (cause) {
      onError(miniGameError(cause));
    } finally {
      setBusy(false);
    }
  };

  const playing = result !== null && !revealed;
  const cells = result?.script.cells ?? [0, 1, 2, 3, 4, 5].map(() => -1);

  return (
    <GameStage
      game={game}
      onOdds={onOdds}
      hint={playing ? "Gratte la pellicule avec ton doigt" : revealed ? "Trois symboles pareils : c’est gagné !" : undefined}
      footer={
        playing ? (
          <button data-nj-skin="none" type="button" className={styles.ghostBtn} onClick={finish}>Tout gratter d’un coup</button>
        ) : (
          <PlayButton game={game} free={free} guest={mg.guest} busy={busy} label={result ? "UN AUTRE TICKET" : "PRENDRE UN TICKET"} onClick={() => void start()} />
        )
      }
    >
      <div className={styles.scratchTicket}>
        <div ref={gridRef} className={styles.scratchGrid}>
          {cells.map((symbolIndex, i) => {
            const symbol = result?.script.symbols[symbolIndex];
            const winning = revealed && symbolIndex === result?.script.winning;
            const [top, bottom] = symbol ? shortLabel(symbol) : ["?", ""];
            return (
              <div key={i} className={`${styles.scratchCell}${winning ? ` ${styles.scratchWin}` : ""}${revealed && !winning ? ` ${styles.scratchDim}` : ""}`}>
                {symbol ? <Image src={rewardIconSrc(symbol)} alt="" width={40} height={40} /> : <span className={styles.scratchQ}>?</span>}
                <strong>{top}</strong>
                <small>{bottom}</small>
              </div>
            );
          })}
          {result && (
            <canvas
              ref={canvasRef}
              className={`${styles.scratchFoil}${revealed ? ` ${styles.scratchFoilGone}` : ""}`}
              onPointerDown={(e) => {
                scratching.current = true;
                lastPoint.current = null;
                (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
                scratchAt(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => { if (scratching.current) scratchAt(e.clientX, e.clientY); }}
              onPointerUp={() => { scratching.current = false; lastPoint.current = null; }}
              onPointerCancel={() => { scratching.current = false; lastPoint.current = null; }}
              aria-label="Pellicule à gratter"
            />
          )}
        </div>
        {!result && <div className={styles.scratchCover} aria-hidden="true"><span>Ticket du quartier</span></div>}
      </div>
    </GameStage>
  );
}
