"use client";

/* Plus haut ou plus bas : avec les cartes Njambo (3 à 10). Chaque bonne
   réponse fait monter le gain (×1,2 → ×5) ; on peut encaisser à tout moment.
   Une égalité perd. La carte suivante est tirée par le serveur. */

import { useEffect, useState } from "react";
import { PlayCard } from "@/components/cards/PlayCard";
import { GAME_CONFIG } from "@/config/gameConfig";
import { HILO_MAX_STEPS, HILO_MULTIPLIERS, HILO_RANK_MAX, HILO_RANK_MIN, MINI_GAMES_BY_ID, hiloPayout, type HiLoGuess } from "@/domain";
import type { Card } from "@/types/game";
import { GameStage, PlayButton } from "../MiniGameKit";
import { miniGameError, type MiniGameProps } from "../useMiniGames";
import styles from "../MiniGames.module.css";

const game = MINI_GAMES_BY_ID.hilo;

function cardOf(value: number, draw: number): Card {
  const suit = GAME_CONFIG.suits[(value + draw) % GAME_CONFIG.suits.length];
  return { rank: String(value), value, suit: suit.s, color: suit.color, id: `hilo-${draw}-${value}` };
}

interface Round { sessionId: string; stake: number; wins: number; current: number; draw: number }

export function HiLoGame({ mg, onReward, onError, onAuth, onOdds }: MiniGameProps) {
  const { free } = mg.status("hilo");
  const [round, setRound] = useState<Round | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ value: number; won: boolean; draw: number } | null>(null);
  const [lost, setLost] = useState(false);

  /* Reprise d'une partie en cours (application fermée en plein milieu). */
  useEffect(() => {
    const s = mg.session;
    if (!round && s?.game === "hilo" && typeof s.current === "number") {
      setRound({ sessionId: s.sessionId, stake: s.stake ?? 0, wins: s.wins ?? 0, current: s.current, draw: (s.wins ?? 0) + 1 });
    }
  }, [mg.session, round]);

  const start = async () => {
    if (mg.guest) return onAuth();
    setBusy(true);
    setLost(false);
    setFlash(null);
    try {
      const { session } = await mg.api.startHiLo();
      setRound({ sessionId: session.sessionId, stake: session.stake ?? 0, wins: session.wins ?? 0, current: session.current ?? HILO_RANK_MIN, draw: (session.wins ?? 0) + 1 });
    } catch (cause) {
      onError(miniGameError(cause));
    } finally {
      setBusy(false);
    }
  };

  const guess = async (g: HiLoGuess) => {
    if (!round) return;
    setBusy(true);
    try {
      const res = await mg.api.guessHiLo(round.sessionId, g);
      setFlash({ value: res.next, won: res.won, draw: round.draw });
      // Laisser le temps de voir la carte se retourner.
      await new Promise((r) => setTimeout(r, 900));
      if (!res.won) {
        setLost(true);
        setRound(null);
      } else if (res.finished) {
        setRound(null);
        if (res.reward) onReward(res.reward);
      } else {
        setRound({ ...round, wins: res.wins, current: res.next, draw: round.draw + 1 });
      }
      setFlash(null);
    } catch (cause) {
      onError(miniGameError(cause));
    } finally {
      setBusy(false);
    }
  };

  const cashOut = async () => {
    if (!round) return;
    setBusy(true);
    try {
      const res = await mg.api.cashOutHiLo(round.sessionId);
      setRound(null);
      onReward(res.reward);
    } catch (cause) {
      onError(miniGameError(cause));
    } finally {
      setBusy(false);
    }
  };

  const wins = round?.wins ?? 0;
  const payout = round ? hiloPayout(round.stake, wins) : 0;

  return (
    <GameStage
      game={game}
      onOdds={onOdds}
      hint={lost ? "Raté ! La mise est perdue." : round ? "La suivante sera-t-elle plus haute ou plus basse ? Une égalité perd." : "Mise 100 Nkap et grimpe l’échelle jusqu’à ×5."}
      footer={round ? (
        <div className={styles.hiloActions}>
          <button data-nj-skin="none" type="button" className={`${styles.hiloBtn} ${styles.hiloUp}`} disabled={busy || round.current >= HILO_RANK_MAX} onClick={() => void guess("higher")}>▲ Plus haut</button>
          <button data-nj-skin="none" type="button" className={`${styles.hiloBtn} ${styles.hiloDown}`} disabled={busy || round.current <= HILO_RANK_MIN} onClick={() => void guess("lower")}>▼ Plus bas</button>
          <button data-nj-skin="none" type="button" className={styles.cashBtn} disabled={busy || wins < 1} onClick={() => void cashOut()}>
            {wins < 1 ? "Encaisser après 1 bonne réponse" : `Encaisser ${payout} Nkap`}
          </button>
        </div>
      ) : (
        <PlayButton game={game} free={free} guest={mg.guest} busy={busy} label={lost ? "REJOUER" : "MISER ET JOUER"} onClick={() => void start()} />
      )}
    >
      <div className={styles.hiloBoard}>
        <ol className={styles.hiloLadder} aria-label="Échelle des gains">
          {HILO_MULTIPLIERS.slice(1).map((m, i) => (
            <li key={m} className={`${i + 1 <= wins ? styles.ladderDone : ""}${i + 1 === wins + 1 && round ? ` ${styles.ladderNext}` : ""}`}>
              ×{String(m).replace(".", ",")}
            </li>
          )).reverse()}
        </ol>
        <div className={styles.hiloCards}>
          <div className={styles.hiloSlot}>
            {round ? <PlayCard card={cardOf(round.current, round.draw - 1)} w={92} /> : <PlayCard hidden w={92} />}
            <small>Carte visible</small>
          </div>
          <div className={`${styles.hiloSlot}${flash ? ` ${styles.hiloFlip}` : ""}${flash && !flash.won ? ` ${styles.hiloLost}` : ""}`}>
            {flash ? <PlayCard card={cardOf(flash.value, flash.draw)} w={92} glow={flash.won} /> : <PlayCard hidden w={92} />}
            <small>{wins >= HILO_MAX_STEPS ? "" : "Suivante"}</small>
          </div>
        </div>
      </div>
    </GameStage>
  );
}
