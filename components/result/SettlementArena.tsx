"use client";

import { useMemo, useRef } from "react";
import { AvatarIllustration, NjamboIcon } from "@/components/ui/Art";
import { useGame } from "@/contexts/GameContext";
import { NKAP } from "@/data/mock";
import { useGsapTimeline, type MotionProfile } from "@/lib/motion";
import type { Player, ResultSettlementEntry } from "@/types/game";
import styles from "./SettlementArena.module.css";

interface SettlementArenaProps {
  players: Player[];
  settlement: ResultSettlementEntry[];
  winnerIdx: number;
  motion: MotionProfile;
}

interface Seat {
  playerIdx: number;
  player: Player;
  nkapDelta: number;
  crownsDelta?: number;
  isWinner: boolean;
  /** Direction depuis le centre, sans unité (cos/sin). Le CSS la multiplie
   *  par les rayons, qu'il adapte à l'orientation et à la place disponible. */
  x: string;
  y: string;
}

/** Jetons émis par trajet. Le transfert des NKAP est le sujet même de cet
 *  écran : il doit jouer à TOUS les niveaux de motion, seul le nombre de
 *  jetons varie. Le réserver à `full` le rendait invisible sur mobile, où ce
 *  niveau n'est jamais atteint (cf. deriveMotionLevel), et une rétrogradation
 *  du capteur de FPS suffisait à le faire disparaître. Seul le respect de
 *  « mouvement réduit » (`off`) le supprime, à juste titre. */
const COINS_PER_TRIP: Record<string, number> = { full: 4, balanced: 3, lite: 2, off: 0 };

/* Les rayons de la couronne vivent dans le CSS (`--arena-rx` / `--arena-ry`) :
   c'est lui qui sait si l'on est en portrait, en paysage ou à l'étroit. Le JS
   n'émet que la DIRECTION de chaque siège, sans unité. Les figer ici en dur
   empêchait toute adaptation et cassait le paysage. */

function signed(value: number): string {
  return `${value > 0 ? "+ " : value < 0 ? "− " : ""}${NKAP(Math.abs(value))}`;
}

/** Le pot est un petit disque : il porte le nombre seul, sans l'unité, qui
 *  n'y tiendrait pas et que le contexte rend superflue. */
function bare(value: number): string {
  return value.toLocaleString("fr-FR");
}

export function SettlementArena({ players, settlement, winnerIdx, motion }: SettlementArenaProps) {
  const { sfx } = useGame();
  const arenaRef = useRef<HTMLDivElement>(null);
  const potRef = useRef<HTMLDivElement>(null);
  const potAmountRef = useRef<HTMLSpanElement>(null);
  const flightRef = useRef<HTMLDivElement>(null);
  const seatRefs = useRef(new Map<number, HTMLDivElement>());
  const deltaRefs = useRef(new Map<number, HTMLSpanElement>());
  const crownRefs = useRef(new Map<number, HTMLSpanElement>());

  const seats = useMemo<Seat[]>(() => {
    const byIdx = new Map(settlement.map((entry) => [entry.playerIdx, entry]));
    const count = players.length;
    /* Le joueur local est ancré en bas, comme à la table : on retrouve sa
       place sans la chercher. Les autres se répartissent dans le sens horaire. */
    const anchor = Math.max(0, players.findIndex((player) => player.isYou));

    return players.map((player, playerIdx) => {
      const entry = byIdx.get(playerIdx);
      const step = ((playerIdx - anchor + count) % count) / count;
      const angle = (90 + step * 360) * (Math.PI / 180);
      return {
        playerIdx,
        player,
        nkapDelta: entry?.nkapDelta ?? 0,
        crownsDelta: entry?.crownsDelta,
        isWinner: playerIdx === winnerIdx,
        x: Math.cos(angle).toFixed(4),
        y: Math.sin(angle).toFixed(4),
      };
    });
  }, [players, settlement, winnerIdx]);

  /* Le pot vaut la somme des mises engagées. En table d'entraînement la mise
     est nulle : on retombe alors sur le gain du vainqueur, qui vient du pot
     accumulé pendant la manche — sinon la scène afficherait un pot vide. */
  const potTotal = useMemo(() => {
    const staked = settlement.reduce((sum, entry) => sum + Math.max(0, entry.contributed), 0);
    if (staked > 0) return staked;
    const winner = settlement.find((entry) => entry.playerIdx === winnerIdx);
    return Math.max(0, winner?.nkapDelta ?? 0);
  }, [settlement, winnerIdx]);

  const showCrowns = seats.some((seat) => seat.crownsDelta !== undefined);
  /* Volontairement PAS conditionné à `allowEntranceCascade`, qui tombe en
     `lite` : seul « mouvement réduit » doit priver du transfert. */
  const scripted = motion.enabled && !motion.reduced;
  const coinsPerTrip = COINS_PER_TRIP[motion.mode] ?? 2;

  useGsapTimeline(scripted, arenaRef, (gsap) => {
    const arena = arenaRef.current;
    const flight = flightRef.current;
    const pot = potRef.current;
    if (!arena || !pot) return;

    /* Les jetons sont créés à la main : le `revert()` du contexte GSAP ne les
       connaît pas et ne les retirerait pas. On repart d'une couche vide à
       chaque construction pour éviter qu'ils ne s'accumulent. */
    flight?.replaceChildren();

    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    const base = arena.getBoundingClientRect();
    const centreOf = (node: Element) => {
      const box = node.getBoundingClientRect();
      return { x: box.left - base.left + box.width / 2, y: box.top - base.top + box.height / 2 };
    };
    const potCentre = centreOf(pot);

    /* Les sièges se posent, puis le pot apparaît : on lit d'abord qui joue. */
    tl.fromTo(
      Array.from(arena.querySelectorAll(`.${styles.seat}`)),
      { opacity: 0, scale: 0.86 },
      { opacity: 1, scale: 1, duration: 0.34, stagger: 0.07 },
      0,
    ).fromTo(pot, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.8)" }, 0.12);

    /* Un seul mécanisme de vol pour les deux monnaies : seuls le glyphe et le
       son changent. Les couronnes voyagent de perdant à vainqueur en direct —
       elles ne transitent pas par le pot, qui ne concerne que les NKAP. */
    const flyTokens = (
      kind: "coin" | "crown",
      from: { x: number; y: number },
      to: { x: number; y: number },
      at: number,
      spread: number,
    ) => {
      if (!flight || coinsPerTrip === 0) return;
      const count = kind === "crown" ? Math.max(1, coinsPerTrip - 1) : coinsPerTrip;
      const travel = (motion.allowLongCascade ? 0.9 : 0.74) * (kind === "crown" ? 0.92 : 1);

      for (let index = 0; index < count; index += 1) {
        const token = document.createElement("span");
        token.className = kind === "crown" ? styles.crownToken : styles.coin;
        token.setAttribute("aria-hidden", "true");
        if (kind === "crown") token.textContent = "♛";
        flight.appendChild(token);

        const delay = at + index * 0.1;
        /* Décalage perpendiculaire décroissant : les jetons partent en éventail
           puis se resserrent à l'arrivée, ce qui évite l'empilement. */
        const offset = (index - (count - 1) / 2) * spread;
        tl.fromTo(
          token,
          { x: from.x - 9, y: from.y - 9, opacity: 0, scale: 0.5 },
          { opacity: 1, scale: 1, duration: 0.18 },
          delay,
        )
          .to(token, {
            x: to.x - 9 + offset * 0.25,
            y: to.y - 9,
            duration: travel,
            ease: "power1.inOut",
          }, delay)
          .to(token, { opacity: 0, scale: 0.62, duration: 0.2 }, delay + travel - 0.14);

        /* Le son se déclenche à l'ATTERRISSAGE, pas au départ : c'est le
           contact qui doit s'entendre. Un seul jeton sonne par trajet, sinon
           la rafale devient une bouillie. */
        if (index === 0) {
          tl.call(() => { sfx((sound) => (kind === "crown" ? sound.crown() : sound.coin())); }, [], delay + travel);
        }
      }
    };

    /* Temps 1 — les mises quittent les perdants et tombent dans le pot. */
    const payIn = 0.62;
    let sawPayment = false;
    seats.forEach((seat, order) => {
      const node = seatRefs.current.get(seat.playerIdx);
      if (!node || seat.isWinner || seat.nkapDelta >= 0) return;
      sawPayment = true;
      /* Les perdants paient l'un APRÈS l'autre : on voit qui donne quoi, au
         lieu d'une salve simultanée illisible. */
      const at = payIn + order * 0.22;
      flyTokens("coin", centreOf(node), potCentre, at, 22);
      const counter = { value: 0 };
      const label = deltaRefs.current.get(seat.playerIdx);
      if (label) {
        tl.to(counter, {
          value: seat.nkapDelta,
          duration: 0.72,
          onUpdate: () => { label.textContent = signed(Math.round(counter.value)); },
          onComplete: () => { label.textContent = signed(seat.nkapDelta); },
        }, at);
      }
    });

    /* Temps 2 — le pot bascule chez le vainqueur. Il part même si personne n'a
       payé à l'instant (mise nulle) : le pot s'est rempli pendant la manche. */
    const payOut = sawPayment ? 2.1 : 0.8;
    const winnerNode = seatRefs.current.get(winnerIdx);
    if (winnerNode) {
      tl.to(pot, { scale: 1.12, duration: 0.2, ease: "power2.out" }, payOut - 0.2)
        .to(pot, { scale: 1, duration: 0.26 }, payOut);
      flyTokens("coin", potCentre, centreOf(winnerNode), payOut, 26);

      const winnerLabel = deltaRefs.current.get(winnerIdx);
      const winnerSeat = seats.find((seat) => seat.playerIdx === winnerIdx);
      if (winnerLabel && winnerSeat) {
        const counter = { value: 0 };
        tl.to(counter, {
          value: winnerSeat.nkapDelta,
          duration: motion.allowLongCascade ? 0.7 : 0.55,
          onUpdate: () => { winnerLabel.textContent = signed(Math.round(counter.value)); },
          onComplete: () => { winnerLabel.textContent = signed(winnerSeat.nkapDelta); },
        }, payOut + 0.2);
      }

      /* Le pot se vide au rythme de son transfert. */
      if (potAmountRef.current) {
        const node = potAmountRef.current;
        const counter = { value: potTotal };
        tl.to(counter, {
          value: 0,
          duration: 0.6,
          onUpdate: () => { node.textContent = bare(Math.round(counter.value)); },
          onComplete: () => { node.textContent = bare(0); },
        }, payOut + 0.2);
      }
    }

    /* Temps 3 — les couronnes, une fois l'argent posé. Elles VOLENT elles
       aussi : le classement se transfère de perdant à vainqueur, en direct et
       sans passer par le pot, qui ne concerne que les NKAP. */
    const crownsAt = payOut + 1.25;
    if (showCrowns) {
      const winnerNode = seatRefs.current.get(winnerIdx);
      let crownOrder = 0;

      seats.forEach((seat) => {
        const node = crownRefs.current.get(seat.playerIdx);
        if (!node || seat.crownsDelta === undefined) return;

        /* Chaque perdant de couronnes envoie les siennes au vainqueur. */
        const seatNode = seatRefs.current.get(seat.playerIdx);
        const at = crownsAt + crownOrder * 0.2;
        if (seat.crownsDelta < 0 && seatNode && winnerNode) {
          flyTokens("crown", centreOf(seatNode), centreOf(winnerNode), at, 20);
          crownOrder += 1;
        }

        const counter = { value: 0 };
        tl.to(counter, {
          value: seat.crownsDelta,
          duration: 0.6,
          onUpdate: () => { node.textContent = signed(Math.round(counter.value)); },
          onComplete: () => { node.textContent = signed(seat.crownsDelta ?? 0); },
        }, seat.crownsDelta < 0 ? at : crownsAt + 0.5);
      });
    }
  }, [scripted, seats, potTotal, showCrowns, coinsPerTrip, winnerIdx, sfx]);

  return (
    <div
      ref={arenaRef}
      className={styles.arena}
      role="list"
      aria-label="Règlement de la manche"
      data-dense={players.length >= 4 || undefined}
    >
      {/* La natte, posée avant tout le reste : elle est le sol de la scène. */}
      <div className={styles.mat} aria-hidden="true" />

      <div ref={potRef} className={styles.pot} aria-hidden="true">
        <span ref={potAmountRef} className={styles.potAmount}>{bare(potTotal)}</span>
      </div>

      {seats.map((seat) => (
        <div
          key={seat.playerIdx}
          ref={(node) => { if (node) seatRefs.current.set(seat.playerIdx, node); }}
          className={`${styles.seat}${seat.isWinner ? ` ${styles.seatWinner}` : ""}`}
          style={{ "--ux": seat.x, "--uy": seat.y } as React.CSSProperties}
          role="listitem"
          /* L'issue est annoncée d'un bloc : les compteurs animés restent
             masqués aux lecteurs d'écran pour ne pas égrener les valeurs. */
          aria-label={[
            seat.player.name,
            seat.isWinner ? "gagne la manche" : "perd la manche",
            signed(seat.nkapDelta),
            seat.crownsDelta !== undefined ? `${signed(seat.crownsDelta)} couronnes` : "",
          ].filter(Boolean).join(", ")}
        >
          <span className={styles.avatarWrap} aria-hidden="true">
            <AvatarIllustration seed={seat.player.emoji} size={44} active={seat.isWinner} />
            {seat.isWinner && (
              <span className={styles.crownMark}>
                <NjamboIcon name="crown" tone="gold" size={18} />
              </span>
            )}
          </span>

          <span className={styles.name} aria-hidden="true">{seat.player.name}</span>

          <span
            ref={(node) => { if (node) deltaRefs.current.set(seat.playerIdx, node); }}
            className={`${styles.delta} ${
              seat.nkapDelta > 0 ? styles.deltaUp : seat.nkapDelta < 0 ? styles.deltaDown : styles.deltaFlat
            }`}
            aria-hidden="true"
          >
            {signed(seat.nkapDelta)}
          </span>

          {showCrowns && seat.crownsDelta !== undefined && (
            <span className={styles.crowns} aria-hidden="true">
              <NjamboIcon name="crown" tone="gold" size={10} />
              <span ref={(node) => { if (node) crownRefs.current.set(seat.playerIdx, node); }}>
                {signed(seat.crownsDelta)}
              </span>
            </span>
          )}
        </div>
      ))}

      <div ref={flightRef} className={styles.flightLayer} aria-hidden="true" />
    </div>
  );
}
