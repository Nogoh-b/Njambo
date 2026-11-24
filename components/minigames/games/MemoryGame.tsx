"use client";

/* Paires du marché : 12 cartes (6 paires d'objets du marché), 25 secondes.
   La partie est comptée par le serveur dès le départ ; le gain dépend des
   paires trouvées et du temps restant, plafonné côté serveur. */

import Image from "@/components/ui/GameImage";
import { useEffect, useRef, useState } from "react";
import { MEMORY_DURATION_MS, MEMORY_PAIRS, MINI_GAMES_BY_ID, memoryReward } from "@/domain";
import { GameStage, PlayButton } from "../MiniGameKit";
import { miniGameError, type MiniGameProps } from "../useMiniGames";
import styles from "../MiniGames.module.css";
import { sysAsset } from "@/lib/assetPack";

const game = MINI_GAMES_BY_ID.memory;
const SYMBOLS = [
  sysAsset("/assets/njambo/economy/nkap-stack-64.webp"),
  sysAsset("/assets/njambo/economy/cauris-pouch-64.webp"),
  sysAsset("/assets/njambo/economy/energy-flask-64.webp"),
  sysAsset("/assets/njambo/tickets/ticket-bronze-64.webp"),
  sysAsset("/assets/njambo/books/book-normal-64.webp"),
  sysAsset("/assets/njambo/economy/cauri-64.webp"),
];

function shuffled(): number[] {
  const deck = [...SYMBOLS.keys(), ...SYMBOLS.keys()];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function MemoryGame({ mg, onReward, onError, onAuth, onOdds }: MiniGameProps) {
  const { free, left } = mg.status("memory");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [deck, setDeck] = useState<number[]>(() => shuffled());
  const [open, setOpen] = useState<number[]>([]);
  const [found, setFound] = useState<Set<number>>(new Set());
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const finishing = useRef(false);

  const running = sessionId !== null;
  const timeLeft = running ? Math.max(0, endsAt - now) : MEMORY_DURATION_MS;
  const pairs = found.size;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [running]);

  const finish = async (pairsFound: number, msLeft: number) => {
    if (!sessionId || finishing.current) return;
    finishing.current = true;
    try {
      const res = await mg.api.finishSkill(sessionId, pairsFound, msLeft);
      onReward(res.reward);
    } catch (cause) {
      onError(miniGameError(cause));
    } finally {
      setSessionId(null);
      finishing.current = false;
    }
  };

  useEffect(() => {
    if (running && (timeLeft <= 0 || pairs === MEMORY_PAIRS)) void finish(pairs, timeLeft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, timeLeft, pairs]);

  const start = async () => {
    if (mg.guest) return onAuth();
    setBusy(true);
    try {
      const { session } = await mg.api.startSkill("memory");
      setDeck(shuffled());
      setOpen([]);
      setFound(new Set());
      const t = Date.now();
      setNow(t);
      setEndsAt(t + MEMORY_DURATION_MS);
      setSessionId(session.sessionId);
    } catch (cause) {
      onError(miniGameError(cause));
    } finally {
      setBusy(false);
    }
  };

  const flip = (index: number) => {
    if (!running || open.includes(index) || found.has(deck[index]) || open.length === 2) return;
    const next = [...open, index];
    setOpen(next);
    if (next.length === 2) {
      const [a, b] = next;
      if (deck[a] === deck[b]) {
        window.setTimeout(() => { setFound((f) => new Set(f).add(deck[a])); setOpen([]); }, 280);
      } else {
        window.setTimeout(() => setOpen([]), 700);
      }
    }
  };

  const preview = memoryReward(pairs, timeLeft).type === "nkap" ? (memoryReward(pairs, timeLeft) as { amount: number }).amount : 0;

  return (
    <GameStage
      game={game}
      onOdds={onOdds}
      hint={running ? `${pairs}/${MEMORY_PAIRS} paires · ${Math.ceil(timeLeft / 1000)} s · ${preview} Nkap` : left > 0 ? "Retrouve les 6 paires avant la fin du temps" : "Plus de partie aujourd’hui, reviens demain !"}
      footer={running ? (
        <div className={styles.timerBar} aria-hidden="true"><span style={{ transform: `scaleX(${timeLeft / MEMORY_DURATION_MS})` }} /></div>
      ) : (
        <PlayButton game={game} free={free} guest={mg.guest} busy={busy} disabled={!mg.guest && left < 1} label="COMMENCER" onClick={() => void start()} />
      )}
    >
      <div className={styles.memoryGrid}>
        {deck.map((symbol, i) => {
          const shown = open.includes(i) || found.has(symbol);
          return (
            <button
              key={i}
              data-nj-skin="none"
              type="button"
              className={`${styles.memoryCard}${shown ? ` ${styles.memoryShown}` : ""}${found.has(symbol) ? ` ${styles.memoryFound}` : ""}`}
              onClick={() => flip(i)}
              disabled={!running}
              aria-label={shown ? "Carte retournée" : "Carte cachée"}
            >
              <span className={styles.memoryInner}>
                <span className={styles.memoryBack} />
                <span className={styles.memoryFront}><Image src={SYMBOLS[symbol]} alt="" width={40} height={40} /></span>
              </span>
            </button>
          );
        })}
      </div>
    </GameStage>
  );
}
