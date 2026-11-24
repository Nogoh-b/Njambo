"use client";

/* Pluie de Nkap : pendant 10 s, des pièces tombent ; on les touche pour les
   attraper. Pièces animées en transform (Web Animations API). Gratuit,
   1 partie par jour, gain plafonné par le serveur. */

import Image from "@/components/ui/GameImage";
import { useEffect, useRef, useState } from "react";
import { COINRAIN_DURATION_MS, COINRAIN_MAX_COINS, MINI_GAMES_BY_ID, coinRainReward } from "@/domain";
import { GameStage, PlayButton } from "../MiniGameKit";
import { miniGameError, type MiniGameProps } from "../useMiniGames";
import styles from "../MiniGames.module.css";

const game = MINI_GAMES_BY_ID.coinrain;

interface Coin { id: number; x: number; delay: number; fall: number; size: number }

function makeCoins(): Coin[] {
  return Array.from({ length: COINRAIN_MAX_COINS }, (_, id) => ({
    id,
    x: 6 + Math.random() * 82,
    delay: (id / COINRAIN_MAX_COINS) * (COINRAIN_DURATION_MS - 1_800) + Math.random() * 300,
    fall: 1_700 + Math.random() * 900,
    size: 38 + Math.random() * 14,
  }));
}

export function CoinRainGame({ mg, onReward, onError, onAuth, onOdds }: MiniGameProps) {
  const { free, left } = mg.status("coinrain");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [coins, setCoins] = useState<Coin[]>([]);
  const [caught, setCaught] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(COINRAIN_DURATION_MS / 1000);
  const fieldRef = useRef<HTMLDivElement>(null);
  const caughtRef = useRef(0);

  const running = sessionId !== null;

  /* Lance la chute de chaque pièce ; fin de manche au bout de 10 s. */
  useEffect(() => {
    if (!running || !fieldRef.current) return;
    const field = fieldRef.current;
    const height = field.getBoundingClientRect().height;
    const animations: Animation[] = [];
    field.querySelectorAll<HTMLElement>("[data-coin]").forEach((el) => {
      const coin = coins[Number(el.dataset.coin)];
      animations.push(el.animate(
        [{ transform: "translateY(-70px) rotate(0deg)" }, { transform: `translateY(${height + 70}px) rotate(${coin.x > 50 ? 260 : -260}deg)` }],
        { duration: coin.fall, delay: coin.delay, easing: "cubic-bezier(0.45, 0.05, 0.75, 0.95)", fill: "both" },
      ));
    });
    const started = Date.now();
    const tick = window.setInterval(() => setSecondsLeft(Math.max(0, Math.ceil((COINRAIN_DURATION_MS - (Date.now() - started)) / 1000))), 250);
    const end = window.setTimeout(async () => {
      const id = sessionId;
      setSessionId(null);
      try {
        const res = await mg.api.finishSkill(id!, caughtRef.current);
        onReward(res.reward);
      } catch (cause) {
        onError(miniGameError(cause));
      }
    }, COINRAIN_DURATION_MS);
    return () => {
      animations.forEach((a) => a.cancel());
      window.clearInterval(tick);
      window.clearTimeout(end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const start = async () => {
    if (mg.guest) return onAuth();
    setBusy(true);
    try {
      const { session } = await mg.api.startSkill("coinrain");
      setCoins(makeCoins());
      setCaught(new Set());
      caughtRef.current = 0;
      setSecondsLeft(COINRAIN_DURATION_MS / 1000);
      setSessionId(session.sessionId);
    } catch (cause) {
      onError(miniGameError(cause));
    } finally {
      setBusy(false);
    }
  };

  const catchCoin = (id: number) => {
    if (!running || caught.has(id)) return;
    caughtRef.current += 1;
    setCaught((c) => new Set(c).add(id));
  };

  const preview = (coinRainReward(caught.size) as { amount: number }).amount;

  return (
    <GameStage
      game={game}
      onOdds={onOdds}
      hint={running ? `${caught.size} pièce${caught.size > 1 ? "s" : ""} · ${secondsLeft} s · ${preview} Nkap` : left > 0 ? "Touche les pièces avant qu’elles touchent le sol" : "Plus de pluie aujourd’hui, reviens demain !"}
      footer={running ? (
        <div className={styles.timerBar} aria-hidden="true"><span style={{ transform: `scaleX(${secondsLeft / (COINRAIN_DURATION_MS / 1000)})` }} /></div>
      ) : (
        <PlayButton game={game} free={free} guest={mg.guest} busy={busy} disabled={!mg.guest && left < 1} label="FAIRE PLEUVOIR" onClick={() => void start()} />
      )}
    >
      <div ref={fieldRef} className={styles.rainField}>
        {running && coins.map((coin) => (
          <button
            key={coin.id}
            data-coin={coin.id}
            data-nj-skin="none"
            type="button"
            className={`${styles.rainCoin}${caught.has(coin.id) ? ` ${styles.rainCaught}` : ""}`}
            style={{ left: `${coin.x}%`, width: coin.size, height: coin.size }}
            onPointerDown={() => catchCoin(coin.id)}
            aria-label="Pièce de Nkap"
          >
            <Image src="/assets/njambo/economy/nkap-64.webp" alt="" width={56} height={56} />
          </button>
        ))}
        {!running && <span className={styles.rainIdle} aria-hidden="true"><Image src="/assets/njambo/economy/nkap-stack-128.webp" alt="" width={96} height={96} /></span>}
      </div>
    </GameStage>
  );
}
