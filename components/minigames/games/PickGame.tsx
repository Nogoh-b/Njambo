"use client";

/* « Tire ta carte » et « Coffres du marché » : 3 choix cachés. Le lot tiré
   par le serveur apparaît sous le choix du joueur, puis les deux autres se
   révèlent (« tu aurais pu avoir… »). */

import Image from "@/components/ui/GameImage";
import { useState } from "react";
import { MINI_GAMES_BY_ID, type Reward } from "@/domain";
import { rewardIconSrc, rewardLabel } from "@/lib/shopVisuals";
import { GameStage, PlayButton } from "../MiniGameKit";
import { miniGameError, type MiniGameProps } from "../useMiniGames";
import styles from "../MiniGames.module.css";
import { sysAsset } from "@/lib/assetPack";

function Chest({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 120 100" className={styles.chestSvg} aria-hidden="true">
      <defs>
        <linearGradient id="chest-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a5602a" />
          <stop offset="100%" stopColor="#5a2c0e" />
        </linearGradient>
        <linearGradient id="chest-brass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe9a3" />
          <stop offset="100%" stopColor="#b47a16" />
        </linearGradient>
      </defs>
      <rect x="10" y="46" width="100" height="48" rx="6" fill="url(#chest-wood)" stroke="#3a1a06" strokeWidth="2" />
      <rect x="10" y="62" width="100" height="6" fill="url(#chest-brass)" />
      <g style={{ transformBox: "view-box", transformOrigin: "12px 46px", transform: open ? "rotate(-32deg)" : "none", transition: "transform 520ms cubic-bezier(.2,1.3,.4,1)" }}>
        <path d="M10 46 Q10 14 60 14 Q110 14 110 46 Z" fill="url(#chest-wood)" stroke="#3a1a06" strokeWidth="2" />
        <path d="M10 46 Q10 14 60 14 Q110 14 110 46" fill="none" stroke="url(#chest-brass)" strokeWidth="5" />
      </g>
      <rect x="52" y="50" width="16" height="20" rx="3" fill="url(#chest-brass)" stroke="#5c3608" strokeWidth="1.5" />
      <circle cx="60" cy="59" r="3" fill="#3a1a06" />
    </svg>
  );
}

export function PickGame({ mg, onReward, onError, onAuth, onOdds, variant }: MiniGameProps & { variant: "pick" | "chests" }) {
  const game = MINI_GAMES_BY_ID[variant];
  const { free } = mg.status(variant);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [items, setItems] = useState<Reward[] | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  const choose = async (index: number) => {
    if (mg.guest) return onAuth();
    if (busy || items) return;
    setBusy(true);
    setChosen(index);
    try {
      const res = await mg.api.play(variant, index);
      if (res.script.game !== variant) throw new Error("script");
      setItems(res.script.items);
      window.setTimeout(() => setShowOthers(true), 900);
      window.setTimeout(() => onReward(res.reward), 2_000);
    } catch (cause) {
      setChosen(null);
      onError(miniGameError(cause));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setItems(null); setChosen(null); setShowOthers(false); };
  const done = items !== null;

  return (
    <GameStage
      game={game}
      onOdds={onOdds}
      hint={done ? (showOthers ? "Les autres choix cachaient…" : "Voici ton lot !") : variant === "pick" ? "Touche une carte pour la retourner" : "Touche un coffre pour l’ouvrir"}
      footer={done
        ? <PlayButton game={game} free={free} guest={mg.guest} label="REJOUER" onClick={reset} />
        : <PlayButton game={game} free={free} guest={mg.guest} busy={busy} disabled={!mg.guest} label={variant === "pick" ? "CHOISIS UNE CARTE" : "CHOISIS UN COFFRE"} onClick={onAuth} />}
    >
      <div className={styles.pickRow}>
        {[0, 1, 2].map((i) => {
          const revealed = items !== null && (i === chosen || showOthers);
          const reward = items?.[i];
          return (
            <button
              key={i}
              data-nj-skin="none"
              type="button"
              className={`${styles.pickItem}${variant === "chests" ? ` ${styles.pickChest}` : ""}${revealed ? ` ${styles.pickRevealed}` : ""}${i === chosen ? ` ${styles.pickChosen}` : ""}${revealed && i !== chosen ? ` ${styles.pickOther}` : ""}`}
              disabled={busy || done}
              onClick={() => void choose(i)}
              aria-label={revealed && reward ? rewardLabel(reward) : variant === "pick" ? `Carte ${i + 1}` : `Coffre ${i + 1}`}
            >
              {variant === "pick" ? (
                <span className={styles.pickCard}>
                  <span className={styles.pickBack}><Image src={sysAsset("/assets/njambo/books/card-back-256.webp")} alt="" fill sizes="110px" /></span>
                  <span className={styles.pickFront}>
                    {reward && <><Image src={rewardIconSrc(reward)} alt="" width={52} height={52} /><strong>{rewardLabel(reward)}</strong></>}
                  </span>
                </span>
              ) : (
                <span className={styles.chestWrap}>
                  <Chest open={revealed} />
                  {revealed && reward && (
                    <span className={styles.chestLoot}>
                      <Image src={rewardIconSrc(reward)} alt="" width={44} height={44} />
                      <strong>{rewardLabel(reward)}</strong>
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </GameStage>
  );
}
