"use client";

import { useMemo, useRef } from "react";
import { useFx } from "@gxe/react";
import { AvatarIllustration } from "@/components/ui/Art";
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
  /** uid des joueurs déjà amis (ou en demande) : leur siège n'affiche pas le
   *  bouton d'ajout. Omis, aucun bouton n'est proposé. */
  friendUids?: ReadonlySet<string>;
  onAddFriend?: (seat: Seat) => void;
}

export interface Seat {
  playerIdx: number;
  player: Player;
  uid?: string;
  nkapDelta: number;
  crownsBefore?: number;
  crownsDelta?: number;
  canAddFriend: boolean;
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
const COIN_BUDGET: Record<string, number> = { full: 14, balanced: 9, lite: 5, off: 0 };

/** Teintes de jetons, panachées comme des jetons de valeurs différentes. Le
 *  cycle est déterministe : une même manche produit toujours le même mélange. */
const COIN_TONES = ["coinGold", "coinCopper", "coinTeal", "coinPalm"] as const;

/** Nombre de jetons d'un trajet, proportionnel à la part qu'il transporte.
 *  Un gros transfert doit se VOIR plus dense qu'un petit — c'est la densité,
 *  pas la vitesse, qui dit le montant. Toujours au moins un jeton, sinon un
 *  petit paiement passerait inaperçu. */
function coinsForShare(budget: number, part: number, whole: number): number {
  if (budget <= 0) return 0;
  if (whole <= 0) return Math.min(budget, 2);
  return Math.max(1, Math.min(budget, Math.round((part / whole) * budget)));
}

/* Les rayons de la couronne vivent dans le CSS (`--arena-rx` / `--arena-ry`) :
   c'est lui qui sait si l'on est en portrait, en paysage ou à l'étroit. Le JS
   n'émet que la DIRECTION de chaque siège, sans unité. Les figer ici en dur
   empêchait toute adaptation et cassait le paysage. */

/** Couronne vectorielle. Les médaillons bitmap de `NjamboIcon` sont chargés en
 *  64 px : réduits à 10-17 px ils deviennent illisibles. Un tracé simple reste
 *  net à toute taille et se colore par `currentColor`. */
function CrownGlyph({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M3 8.5 6.4 12 12 4.5 17.6 12 21 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V8.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function signed(value: number): string {
  return `${value > 0 ? "+ " : value < 0 ? "− " : ""}${NKAP(Math.abs(value))}`;
}

/** Le pot est un petit disque : il porte le nombre seul, sans l'unité, qui
 *  n'y tiendrait pas et que le contexte rend superflue. */
function bare(value: number): string {
  return value.toLocaleString("fr-FR");
}

export function SettlementArena({
  players, settlement, winnerIdx, motion, friendUids, onAddFriend,
}: SettlementArenaProps) {
  const { sfx } = useGame();
  const arenaRef = useRef<HTMLDivElement>(null);
  const potRef = useRef<HTMLDivElement>(null);
  const potAmountRef = useRef<HTMLSpanElement>(null);
  const flightRef = useRef<HTMLDivElement>(null);
  const seatRefs = useRef(new Map<number, HTMLDivElement>());
  /* Effets GXE : le moteur ignore ce qu'est une manche ; c'est ici, au point
     d'usage, qu'un fait de jeu (« le pot part chez le vainqueur ») devient une
     intention d'expérience. Sans FxLayer monté, c'est un no-op silencieux. */
  const fx = useFx();
  const allowParticles = motion.allowParticles;
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
      /* Ajoutable seulement si c'est un vrai compte, pas moi, pas un bot, et
         pas déjà dans mes relations. Sinon le bouton est simplement absent. */
      const uid = entry?.uid;
      const canAddFriend = Boolean(
        uid && !player.isYou && !entry?.bot && !friendUids?.has(uid),
      );

      return {
        playerIdx,
        player,
        uid,
        nkapDelta: entry?.nkapDelta ?? 0,
        crownsBefore: entry?.crownsBefore,
        crownsDelta: entry?.crownsDelta,
        canAddFriend,
        isWinner: playerIdx === winnerIdx,
        x: Math.cos(angle).toFixed(4),
        y: Math.sin(angle).toFixed(4),
      };
    });
  }, [players, settlement, winnerIdx, friendUids]);

  /* Le pot vaut la somme des mises engagées. En table d'entraînement la mise
     est nulle : on retombe alors sur le gain du vainqueur, qui vient du pot
     accumulé pendant la manche — sinon la scène afficherait un pot vide. */
  const potTotal = useMemo(() => {
    const staked = settlement.reduce((sum, entry) => sum + Math.max(0, entry.contributed), 0);
    if (staked > 0) return staked;
    const winner = settlement.find((entry) => entry.playerIdx === winnerIdx);
    return Math.max(0, winner?.nkapDelta ?? 0);
  }, [settlement, winnerIdx]);

  const showCrowns = seats.some((seat) => seat.crownsBefore !== undefined);
  /* Volontairement PAS conditionné à `allowEntranceCascade`, qui tombe en
     `lite` : seul « mouvement réduit » doit priver du transfert. */
  const scripted = motion.enabled && !motion.reduced;
  const coinBudget = COIN_BUDGET[motion.mode] ?? 5;

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
      count: number,
    ) => {
      if (!flight || count <= 0) return;
      const travel = (motion.allowLongCascade ? 0.9 : 0.74) * (kind === "crown" ? 0.92 : 1);
      /* Plus il y a de jetons, plus ils se serrent : une grosse somme part en
         grappe dense, une petite en gouttes espacées. */
      const step = Math.max(0.035, 0.34 / count);

      for (let index = 0; index < count; index += 1) {
        const token = document.createElement("span");
        token.className = kind === "crown"
          ? styles.crownToken
          : `${styles.coin} ${styles[COIN_TONES[index % COIN_TONES.length]]}`;
        token.setAttribute("aria-hidden", "true");
        if (kind === "crown") token.textContent = "♛";
        flight.appendChild(token);

        const delay = at + index * step;
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

    /* Temps 1 — les mises quittent les perdants et tombent dans le pot. Le
       budget de jetons se répartit au prorata : celui qui perd le plus en
       envoie visiblement plus. */
    const payIn = 0.62;
    const totalPaidIn = seats.reduce(
      (sum, seat) => (seat.isWinner || seat.nkapDelta >= 0 ? sum : sum + Math.abs(seat.nkapDelta)),
      0,
    );
    let sawPayment = false;
    seats.forEach((seat, order) => {
      const node = seatRefs.current.get(seat.playerIdx);
      if (!node || seat.isWinner || seat.nkapDelta >= 0) return;
      sawPayment = true;
      /* Les perdants paient l'un APRÈS l'autre : on voit qui donne quoi, au
         lieu d'une salve simultanée illisible. */
      const at = payIn + order * 0.22;
      flyTokens("coin", centreOf(node), potCentre, at, 22,
        coinsForShare(coinBudget, Math.abs(seat.nkapDelta), totalPaidIn));
      const counter = { value: 0 };
      const label = deltaRefs.current.get(seat.playerIdx);
      if (label) {
        /* `player.balance` est le solde APRÈS règlement : on remonte au solde
           d'avant pour le voir redescendre au rythme des jetons. */
        counter.value = seat.player.balance - seat.nkapDelta;
        tl.to(counter, {
          value: seat.player.balance,
          duration: 0.72,
          onUpdate: () => { label.textContent = bare(Math.round(counter.value)); },
          onComplete: () => { label.textContent = bare(seat.player.balance); },
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
      /* Le pot part en entier : c'est le trajet le plus dense de la scène. */
      flyTokens("coin", potCentre, centreOf(winnerNode), payOut, 26, coinBudget);

      /* Célébration GXE, calée sur l'arrivée des pièces : les confettis
         partent DU siège du vainqueur (ancrage sur l'élément réel). Le
         réglage `allowParticles` de l'app fait foi — le moteur ne décide
         jamais à sa place. */
      if (allowParticles) {
        tl.call(() => {
          const node = seatRefs.current.get(winnerIdx);
          if (node) fx.burst("confetti", node);
        }, undefined, payOut + 0.45);
      }

      const winnerLabel = deltaRefs.current.get(winnerIdx);
      const winnerSeat = seats.find((seat) => seat.playerIdx === winnerIdx);
      if (winnerLabel && winnerSeat) {
        const counter = { value: winnerSeat.player.balance - winnerSeat.nkapDelta };
        tl.to(counter, {
          value: winnerSeat.player.balance,
          duration: motion.allowLongCascade ? 0.8 : 0.62,
          onUpdate: () => { winnerLabel.textContent = bare(Math.round(counter.value)); },
          onComplete: () => { winnerLabel.textContent = bare(winnerSeat.player.balance); },
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
          /* Les couronnes restent peu nombreuses : elles se comptent à l'unité,
             une grappe dense les rendrait illisibles. */
          flyTokens("crown", centreOf(seatNode), centreOf(winnerNode), at, 20,
            Math.min(3, Math.max(1, Math.round(Math.abs(seat.crownsDelta) / 8))));
          crownOrder += 1;
        }

        /* Le compteur parcourt le TOTAL de couronnes, de l'ancien au nouveau :
           on voit le classement de chacun bouger, pas seulement l'écart. */
        const before = seat.crownsBefore ?? 0;
        const counter = { value: before };
        tl.to(counter, {
          value: before + seat.crownsDelta,
          duration: 0.7,
          onUpdate: () => { node.textContent = bare(Math.round(counter.value)); },
          onComplete: () => { node.textContent = bare(before + (seat.crownsDelta ?? 0)); },
        }, seat.crownsDelta < 0 ? at : crownsAt + 0.5);
      });
    }
  }, [scripted, seats, potTotal, showCrowns, coinBudget, winnerIdx, sfx, allowParticles, fx]);

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
                <CrownGlyph size={17} />
              </span>
            )}
          </span>

          <span className={styles.name} aria-hidden="true">{seat.player.name}</span>

          {/* Le solde complet n'est connu que pour le joueur local : le serveur
              ne divulgue pas le portefeuille des adversaires. Eux ne portent
              que leurs couronnes, ce qui allège aussi la scène. */}
          {seat.player.isYou && (
            <span
              ref={(node) => { if (node) deltaRefs.current.set(seat.playerIdx, node); }}
              className={`${styles.delta} ${
                seat.nkapDelta > 0 ? styles.deltaUp : seat.nkapDelta < 0 ? styles.deltaDown : styles.deltaFlat
              }`}
              aria-hidden="true"
            >
              {bare(seat.player.balance)}
            </span>
          )}

          {seat.crownsBefore !== undefined && (
            <span className={styles.crowns} aria-hidden="true">
              <CrownGlyph />
              <span ref={(node) => { if (node) crownRefs.current.set(seat.playerIdx, node); }}>
                {bare(seat.crownsBefore + (seat.crownsDelta ?? 0))}
              </span>
            </span>
          )}

          {onAddFriend && seat.canAddFriend && (
            <button
              type="button"
              className={styles.addFriend}
              onClick={() => onAddFriend(seat)}
              aria-label={`Ajouter ${seat.player.name} en ami`}
              data-nj-skin="none"
            >
              +
            </button>
          )}
        </div>
      ))}

      <div ref={flightRef} className={styles.flightLayer} aria-hidden="true" />
    </div>
  );
}
