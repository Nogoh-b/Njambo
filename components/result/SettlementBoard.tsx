"use client";

import { useMemo, useRef } from "react";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { NKAP } from "@/data/mock";
import { useGsapTimeline, type MotionProfile } from "@/lib/motion";
import type { Player, ResultSettlementEntry } from "@/types/game";
import styles from "./SettlementBoard.module.css";

interface SettlementBoardProps {
  players: Player[];
  settlement: ResultSettlementEntry[];
  winnerIdx: number;
  motion: MotionProfile;
}

interface BoardRow {
  playerIdx: number;
  player: Player;
  nkapDelta: number;
  crownsBefore?: number;
  crownsDelta?: number;
  isWinner: boolean;
}

/** Nombre de jetons envoyés par perdant. Volontairement bas : l'audit perf a
 *  montré que ce sont les gros volumes d'éléments animés qui coûtent, pas la
 *  durée. `full` n'est jamais atteint sur mobile (cf. deriveMotionLevel). */
const COINS_PER_LOSER: Record<string, number> = { full: 3, balanced: 2, lite: 0, off: 0 };

function signed(value: number): string {
  return `${value > 0 ? "+ " : value < 0 ? "− " : ""}${NKAP(Math.abs(value))}`;
}

export function SettlementBoard({ players, settlement, winnerIdx, motion }: SettlementBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const flightRef = useRef<HTMLDivElement>(null);
  const amountRefs = useRef(new Map<number, HTMLSpanElement>());
  const deltaRefs = useRef(new Map<number, HTMLSpanElement>());
  const crownRefs = useRef(new Map<number, HTMLSpanElement>());

  const rows = useMemo<BoardRow[]>(() => {
    const byIdx = new Map(settlement.map((entry) => [entry.playerIdx, entry]));
    return players.map((player, playerIdx) => {
      const entry = byIdx.get(playerIdx);
      return {
        playerIdx,
        player,
        nkapDelta: entry?.nkapDelta ?? 0,
        crownsBefore: entry?.crownsBefore,
        crownsDelta: entry?.crownsDelta,
        isWinner: playerIdx === winnerIdx,
      };
    });
  }, [players, settlement, winnerIdx]);

  /* Les couronnes ne sont renseignées qu'en match classé : hors de là on
     masque la colonne plutôt que d'afficher un +0 trompeur. */
  const showCrowns = rows.some((row) => row.crownsBefore !== undefined);
  const scripted = motion.enabled && motion.allowEntranceCascade;
  const coinsPerLoser = COINS_PER_LOSER[motion.mode] ?? 0;

  useGsapTimeline(scripted, containerRef, (gsap) => {
    const container = containerRef.current;
    const flight = flightRef.current;
    if (!container) return;
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

    /* 1. Les lignes se posent, le vainqueur en dernier pour le suspense. */
    const rowNodes = Array.from(container.querySelectorAll(`.${styles.row}`));
    tl.fromTo(
      rowNodes,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.32, stagger: 0.06 },
      0,
    );

    /* 2. Les compteurs partent de zéro et rejoignent leur valeur réelle. */
    rows.forEach((row) => {
      const node = deltaRefs.current.get(row.playerIdx);
      if (!node) return;
      const counter = { value: 0 };
      tl.to(counter, {
        value: row.nkapDelta,
        duration: motion.allowLongCascade ? 0.8 : 0.6,
        onUpdate: () => { node.textContent = signed(Math.round(counter.value)); },
        onComplete: () => { node.textContent = signed(row.nkapDelta); },
      }, 0.36);
    });

    if (showCrowns) {
      rows.forEach((row) => {
        const node = crownRefs.current.get(row.playerIdx);
        if (!node || row.crownsDelta === undefined) return;
        const counter = { value: 0 };
        tl.to(counter, {
          value: row.crownsDelta,
          duration: 0.5,
          onUpdate: () => { node.textContent = signed(Math.round(counter.value)); },
          onComplete: () => { node.textContent = signed(row.crownsDelta ?? 0); },
        }, 0.9);
      });
    }

    /* 3. Vol des jetons du perdant vers le vainqueur. Les positions sont
          mesurées relativement au conteneur, et les jetons créés hors React
          pour ne pas déclencher de rendu pendant l'animation. */
    if (!flight || coinsPerLoser === 0) return;
    const winnerCell = amountRefs.current.get(winnerIdx);
    if (!winnerCell) return;
    const base = container.getBoundingClientRect();
    const target = winnerCell.getBoundingClientRect();
    const targetX = target.left - base.left + target.width / 2;
    const targetY = target.top - base.top + target.height / 2;

    rows.forEach((row) => {
      if (row.isWinner || row.nkapDelta >= 0) return;
      const cell = amountRefs.current.get(row.playerIdx);
      if (!cell) return;
      const from = cell.getBoundingClientRect();
      const originX = from.left - base.left + from.width / 2;
      const originY = from.top - base.top + from.height / 2;

      for (let index = 0; index < coinsPerLoser; index += 1) {
        const coin = document.createElement("span");
        coin.className = styles.coin;
        coin.setAttribute("aria-hidden", "true");
        flight.appendChild(coin);
        const delay = 0.4 + index * 0.09;
        /* Léger crochet latéral pour que les jetons ne se superposent pas. */
        const arc = (index - (coinsPerLoser - 1) / 2) * 26;
        tl.fromTo(
          coin,
          { x: originX - 11, y: originY - 11, opacity: 0, scale: 0.6 },
          { opacity: 1, scale: 1, duration: 0.16 },
          delay,
        )
          .to(coin, {
            x: targetX - 11 + arc * 0.2,
            y: targetY - 11,
            duration: motion.allowLongCascade ? 0.62 : 0.5,
            ease: "power1.inOut",
          }, delay)
          .to(coin, { opacity: 0, scale: 0.7, duration: 0.18 }, delay + 0.5);
      }
    });
  }, [scripted, rows, showCrowns, coinsPerLoser, winnerIdx]);

  return (
    <div ref={containerRef} className={styles.board}>
      <p className={styles.caption}>Règlement de la manche</p>

      {rows.map((row) => {
        const balanceKnown = row.player.isYou;
        return (
          <div
            key={row.playerIdx}
            className={`${styles.row}${row.isWinner ? ` ${styles.rowWinner}` : ""}`}
            /* L'issue est annoncée d'un bloc : les compteurs animés restent
               masqués aux lecteurs d'écran pour ne pas égrener les valeurs. */
            aria-label={[
              row.player.name,
              row.isWinner ? "gagne la manche" : "perd la manche",
              signed(row.nkapDelta),
              row.crownsDelta !== undefined ? `${signed(row.crownsDelta)} couronnes` : "",
            ].filter(Boolean).join(", ")}
          >
            <span className={styles.avatar} aria-hidden="true">
              <AvatarIllustration seed={row.player.emoji} size={34} active={row.isWinner} />
            </span>

            <span className={styles.identity} aria-hidden="true">
              <span className={styles.name}>{row.player.name}</span>
              {row.isWinner && <span className={styles.badge}>Ngata</span>}
            </span>

            <span
              ref={(node) => { if (node) amountRefs.current.set(row.playerIdx, node); }}
              className={styles.amounts}
              aria-hidden="true"
            >
              {/* Le solde absolu n'est connu que pour le joueur local : le
                  serveur ne divulgue pas le portefeuille des adversaires. */}
              {balanceKnown && <span className={styles.balance}>{NKAP(row.player.balance)}</span>}

              <span
                ref={(node) => { if (node) deltaRefs.current.set(row.playerIdx, node); }}
                className={`${balanceKnown ? styles.delta : styles.balance} ${row.nkapDelta >= 0 ? styles.deltaUp : styles.deltaDown}`}
              >
                {signed(row.nkapDelta)}
              </span>

              {showCrowns && row.crownsDelta !== undefined && (
                <span className={styles.crowns}>
                  <NjamboIcon name="crown" tone="gold" size={11} />
                  <span ref={(node) => { if (node) crownRefs.current.set(row.playerIdx, node); }}>
                    {signed(row.crownsDelta)}
                  </span>
                </span>
              )}
            </span>
          </div>
        );
      })}

      <div ref={flightRef} className={styles.flightLayer} aria-hidden="true" />
    </div>
  );
}
