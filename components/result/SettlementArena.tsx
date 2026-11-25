"use client";

import { useMemo, useRef } from "react";
import { useFx, useSfx } from "@gxe/react";
import { AvatarIllustration } from "@/components/ui/Art";
import { NKAP } from "@/data/mock";
import { COIN_SOUND, CROWN_SOUND } from "@/lib/gxeSfx";
import { useGsapTimeline, type MotionProfile } from "@/lib/motion";
import type { Player, ResultSettlementEntry } from "@/types/game";
import styles from "./SettlementArena.module.css";
import { sysAsset } from "@/lib/assetPack";

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
  contributed: number;
  nkapDelta: number;
  crownsBefore?: number;
  crownsDelta?: number;
  canAddFriend: boolean;
  isWinner: boolean;
  /** Direction depuis le centre, sans unité (cos/sin). Le CSS la multiplie
   *  par les rayons adaptés au portrait, au paysage et au nombre de joueurs. */
  x: string;
  y: string;
}

const NKAP_COIN_SRC = "/assets/njambo/economy/nkap-64.webp";
const NKAP_STACK_SRC = "/assets/njambo/economy/nkap-stack-64.webp";

/** Budget de pièces Nkap en vol vers le vainqueur selon le profil de fluidité.
 *  Le transfert Nkap joue sur TOUS les profils actifs (seul « mouvement réduit »
 *  le coupe), avec une densité généreuse en mode full/balanced. */
const COIN_BUDGET: Record<string, number> = { full: 18, balanced: 12, lite: 7, off: 0 };

function coinsForShare(budget: number, part: number, whole: number): number {
  if (budget <= 0) return 0;
  if (whole <= 0) return Math.min(budget, 4);
  return Math.max(3, Math.min(Math.ceil(budget * 0.65), Math.round((part / whole) * budget)));
}

/** Couronne vectorielle dorée nette à toute taille. */
function CrownGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M3 17.5L2 8.2L7.5 12L12 4.8L16.5 12L22 8.2L21 17.5C20.9 18.6 20 19.5 18.9 19.5H5.1C4 19.5 3.1 18.6 3 17.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function signedNkap(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString("fr-FR")}`;
}

function signedSpoken(value: number): string {
  return `${value > 0 ? "+ " : value < 0 ? "− " : ""}${NKAP(Math.abs(value))}`;
}

function bare(value: number): string {
  return value.toLocaleString("fr-FR");
}

export function SettlementArena({
  players,
  settlement,
  winnerIdx,
  motion,
  friendUids,
  onAddFriend,
}: SettlementArenaProps) {
  const gxeSfx = useSfx();
  const fx = useFx();
  const arenaRef = useRef<HTMLDivElement>(null);
  const potRef = useRef<HTMLDivElement>(null);
  const potInnerRef = useRef<HTMLDivElement>(null);
  const potAmountRef = useRef<HTMLSpanElement>(null);
  const flightRef = useRef<HTMLDivElement>(null);
  const seatRefs = useRef(new Map<number, HTMLDivElement>());
  const avatarRefs = useRef(new Map<number, HTMLSpanElement>());
  const winnerRippleRef = useRef<HTMLSpanElement>(null);
  const deltaRefs = useRef(new Map<number, HTMLSpanElement>());
  const balanceRefs = useRef(new Map<number, HTMLSpanElement>());
  const crownRefs = useRef(new Map<number, HTMLSpanElement>());
  const allowParticles = motion.allowParticles;

  const seats = useMemo<Seat[]>(() => {
    const byIdx = new Map(settlement.map((entry) => [entry.playerIdx, entry]));
    const count = players.length;
    const anchor = Math.max(0, players.findIndex((player) => player.isYou));

    return players.map((player, playerIdx) => {
      const entry = byIdx.get(playerIdx);
      const step = ((playerIdx - anchor + count) % count) / count;
      const angle = (90 + step * 360) * (Math.PI / 180);
      const uid = entry?.uid;
      const canAddFriend = Boolean(
        uid && !player.isYou && !entry?.bot && !friendUids?.has(uid),
      );

      return {
        playerIdx,
        player,
        uid,
        contributed: entry?.contributed ?? 0,
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

  /* Pot affiché au centre de la table miniature. */
  const potTotal = useMemo(() => {
    const staked = settlement.reduce((sum, entry) => sum + Math.max(0, entry.contributed), 0);
    if (staked > 0) return staked;
    const winner = settlement.find((entry) => entry.playerIdx === winnerIdx);
    return Math.max(0, winner?.nkapDelta ?? 0);
  }, [settlement, winnerIdx]);

  const showCrowns = seats.some((seat) => seat.crownsBefore !== undefined);
  const scripted = motion.enabled && !motion.reduced;
  const coinBudget = COIN_BUDGET[motion.mode] ?? 7;

  useGsapTimeline(scripted, arenaRef, (gsap) => {
    const arena = arenaRef.current;
    const flight = flightRef.current;
    const pot = potRef.current;
    const potInner = potInnerRef.current;
    if (!arena || !pot || !potInner) return;

    flight?.replaceChildren();

    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    const base = arena.getBoundingClientRect();
    const centreOf = (node: Element) => {
      const box = node.getBoundingClientRect();
      return {
        x: box.left - base.left + box.width / 2,
        y: box.top - base.top + box.height / 2,
      };
    };
    const potCentre = centreOf(pot);
    const seatInners = Array.from(arena.querySelectorAll(`.${styles.seatInner}`));

    /* Entrée théâtrale des sièges puis du coffre central Nkap. */
    tl.fromTo(
      seatInners,
      { opacity: 0, scale: 0.84, y: 8 },
      { opacity: 1, scale: 1, y: 0, duration: 0.36, stagger: 0.06, ease: "back.out(1.6)" },
      0,
    ).fromTo(
      potInner,
      { opacity: 0, scale: 0.62 },
      { opacity: 1, scale: 1, duration: 0.44, ease: "back.out(2)" },
      0.14,
    );

    /** Émet une gerbe d'étincelles dorées à l'impact d'une vague de pièces Nkap. */
    const spawnImpactSparks = (atPt: { x: number; y: number }, count: number, radius: number) => {
      if (!flight || motion.mode === "lite") return;
      for (let i = 0; i < count; i += 1) {
        const spark = document.createElement("span");
        spark.className = styles.coinSpark;
        spark.setAttribute("aria-hidden", "true");
        flight.appendChild(spark);
        const angle = (i / count) * Math.PI * 2 + (i % 2) * 0.25;
        const dist = radius * (0.65 + (i % 3) * 0.22);
        gsap.fromTo(
          spark,
          { x: atPt.x - 4, y: atPt.y - 4, opacity: 1, scale: 0.45 },
          {
            x: atPt.x - 4 + Math.cos(angle) * dist,
            y: atPt.y - 4 + Math.sin(angle) * dist,
            opacity: 0,
            scale: 1.35,
            duration: 0.56,
            ease: "power2.out",
            onComplete: () => spark.remove(),
          },
        );
      }
    };

    /** Vol courbé parabolique (Bézier quadratique) de vraies pièces Nkap ou de
     *  médaillons couronnes, avec roulis 3D, éclat d'apex et son synchronisé. */
    const flyCurvedTokens = (
      kind: "nkap" | "crown",
      from: { x: number; y: number },
      to: { x: number; y: number },
      at: number,
      count: number,
      opts?: { heroStream?: boolean; onFirstLand?: () => void; onStreamMid?: () => void },
    ) => {
      if (!flight || count <= 0) return;
      const hero = Boolean(opts?.heroStream);
      const size = kind === "crown" ? 22 : hero ? 26 : 22;
      const half = size / 2;
      const travel = (motion.allowLongCascade ? 0.84 : 0.7) * (hero ? 1.06 : 0.92);
      const step = hero
        ? Math.max(0.032, 0.44 / Math.max(1, count))
        : Math.max(0.042, 0.28 / Math.max(1, count));

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = -dy / dist;
      const ny = dx / dist;
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;

      for (let index = 0; index < count; index += 1) {
        const token = document.createElement("span");
        token.className = kind === "crown"
          ? styles.crownToken
          : `${styles.nkapCoin}${hero ? ` ${styles.nkapCoinHero}` : ""}`;
        token.setAttribute("aria-hidden", "true");

        if (kind === "crown") {
          token.textContent = "♛";
        } else {
          const img = document.createElement("img");
          img.src = sysAsset(NKAP_COIN_SRC);
          img.alt = "";
          img.draggable = false;
          img.className = styles.nkapCoinImg;
          token.appendChild(img);
        }
        flight.appendChild(token);

        /* Éventail courbé harmonieux : chaque pièce décrit sa propre parabole
           en altitude, offrant une vraie cascade généreuse et lisible. */
        const lane = count <= 1 ? 0 : (index / (count - 1)) * 2 - 1;
        const curveSpread = (hero ? 42 : 26) * lane + ((index % 2 === 0 ? 1 : -1) * (hero ? 10 : 6));
        const loft = hero ? 28 + (index % 3) * 10 : 18 + (index % 2) * 8;
        const cx = mx + nx * curveSpread;
        const cy = my + ny * curveSpread - loft;
        const endJitterX = lane * (hero ? 9 : 5);
        const endJitterY = ((index % 3) - 1) * (hero ? 5 : 3);
        const targetX = to.x + endJitterX;
        const targetY = to.y + endJitterY;
        const spins = kind === "nkap" ? (hero ? 2.5 + (index % 2) * 0.5 : 2) : 1;
        const rotDir = index % 2 === 0 ? 1 : -1;
        const delay = at + index * step;

        const prog = { t: 0 };
        gsap.set(token, {
          x: from.x - half,
          y: from.y - half,
          opacity: 0,
          scale: 0.52,
        });

        tl.to(prog, {
          t: 1,
          duration: travel,
          ease: hero ? "power2.inOut" : "power1.inOut",
          onUpdate: () => {
            const t = prog.t;
            const inv = 1 - t;
            const px = inv * inv * from.x + 2 * inv * t * cx + t * t * targetX;
            const py = inv * inv * from.y + 2 * inv * t * cy + t * t * targetY;
            /* Effet d'envol : grossit à l'apex de la parabole puis atterrit net. */
            const apexBoost = Math.sin(t * Math.PI);
            const scale = (hero ? 0.72 : 0.68) + apexBoost * (hero ? 0.54 : 0.42);
            /* Miroitement 3D de la pièce d'or Nkap en rotation. */
            const flipX = kind === "nkap"
              ? 0.48 + 0.52 * Math.abs(Math.cos(t * Math.PI * spins))
              : 1;
            const opacity = t < 0.1 ? t / 0.1 : t > 0.88 ? Math.max(0, (1 - t) / 0.12) : 1;
            gsap.set(token, {
              x: px - half,
              y: py - half,
              scaleX: scale * flipX,
              scaleY: scale,
              rotation: rotDir * t * (kind === "nkap" ? 190 : 28),
              opacity,
            });
          },
          onComplete: () => {
            gsap.set(token, { opacity: 0 });
          },
        }, delay);

        /* Cliquetis Nkap musical à l'atterrissage (calé sur la 1re pièce, et un
           second éclat au milieu de la grande vague vers le vainqueur). */
        if (index === 0) {
          tl.call(() => {
            gxeSfx.playChime(kind === "crown" ? CROWN_SOUND : COIN_SOUND);
            opts?.onFirstLand?.();
          }, [], delay + travel * 0.9);
        } else if (hero && index === Math.floor(count * 0.45)) {
          tl.call(() => {
            gxeSfx.playChime(COIN_SOUND);
            opts?.onStreamMid?.();
          }, [], delay + travel * 0.9);
        }
      }
    };

    /* ── Temps 1 : les perdants versent leurs Nkap dans le pot central ── */
    const payIn = 0.46;
    const payers = seats.filter((seat) => !seat.isWinner && (seat.nkapDelta < 0 || seat.contributed > 0));
    const totalPaidIn = payers.reduce(
      (sum, seat) => sum + Math.max(Math.abs(seat.nkapDelta), seat.contributed),
      0,
    );
    let sawPayment = false;

    payers.forEach((seat, order) => {
      const node = avatarRefs.current.get(seat.playerIdx) ?? seatRefs.current.get(seat.playerIdx);
      const amount = seat.nkapDelta < 0 ? Math.abs(seat.nkapDelta) : seat.contributed;
      if (!node || amount <= 0) return;
      sawPayment = true;

      const at = payIn + order * 0.18;
      const count = coinsForShare(coinBudget, amount, totalPaidIn);
      flyCurvedTokens("nkap", centreOf(node), potCentre, at, count, {
        onFirstLand: () => {
          gsap.fromTo(
            potInner,
            { scale: 1 },
            { scale: 1.14, duration: 0.16, yoyo: true, repeat: 1, ease: "power2.out" },
          );
          spawnImpactSparks(potCentre, 5, 24);
        },
      });

      /* Compteur delta du perdant (0 → −250). */
      const deltaNode = deltaRefs.current.get(seat.playerIdx);
      if (deltaNode && seat.nkapDelta < 0) {
        const counter = { value: 0 };
        deltaNode.textContent = signedNkap(0);
        tl.to(counter, {
          value: seat.nkapDelta,
          duration: 0.62,
          onUpdate: () => { deltaNode.textContent = signedNkap(Math.round(counter.value)); },
          onComplete: () => { deltaNode.textContent = signedNkap(seat.nkapDelta); },
        }, at + 0.08);
      }

      /* Solde total du joueur local s'il perd. */
      const balNode = balanceRefs.current.get(seat.playerIdx);
      if (balNode && seat.player.isYou && seat.nkapDelta < 0) {
        const startBal = Math.max(0, seat.player.balance - seat.nkapDelta);
        const counter = { value: startBal };
        balNode.textContent = `Solde ${bare(startBal)}`;
        tl.to(counter, {
          value: seat.player.balance,
          duration: 0.65,
          onUpdate: () => { balNode.textContent = `Solde ${bare(Math.round(counter.value))}`; },
          onComplete: () => { balNode.textContent = `Solde ${bare(seat.player.balance)}`; },
        }, at + 0.1);
      }
    });

    /* ── Temps 2 : grande cascade dorée de pièces Nkap du pot vers le vainqueur ── */
    const payOut = sawPayment ? payIn + payers.length * 0.18 + 0.92 : 0.62;
    const winnerAvatar = avatarRefs.current.get(winnerIdx) ?? seatRefs.current.get(winnerIdx);
    const winnerSeatEl = seatRefs.current.get(winnerIdx);
    const winnerSeat = seats.find((seat) => seat.playerIdx === winnerIdx);

    if (winnerAvatar && winnerSeat) {
      const winnerCentre = centreOf(winnerAvatar);

      /* Le coffre central gonfle et libère tout le pactole vers le vainqueur. */
      tl.to(potInner, { scale: 1.18, duration: 0.22, ease: "power2.out" }, payOut - 0.18)
        .to(potInner, { scale: potTotal > 0 ? 0.92 : 1, duration: 0.34, ease: "power2.inOut" }, payOut + 0.06);

      const payoutCoins = potTotal > 0 ? coinBudget : Math.min(8, coinBudget);
      flyCurvedTokens("nkap", potCentre, winnerCentre, payOut, payoutCoins, {
        heroStream: true,
        onFirstLand: () => {
          /* Onde de choc dorée + rebond du médaillon vainqueur + gerbe d'étincelles. */
          if (winnerRippleRef.current) {
            gsap.fromTo(
              winnerRippleRef.current,
              { scale: 0.55, opacity: 0.95 },
              { scale: 2.35, opacity: 0, duration: 0.72, ease: "power2.out" },
            );
          }
          gsap.fromTo(
            winnerAvatar,
            { scale: 1 },
            { scale: 1.13, duration: 0.22, yoyo: true, repeat: 1, ease: "back.out(2)" },
          );
          spawnImpactSparks(winnerCentre, 10, 40);
          if (allowParticles && winnerSeatEl) fx.burst("confetti", winnerSeatEl);
        },
        onStreamMid: () => {
          if (winnerRippleRef.current) {
            gsap.fromTo(
              winnerRippleRef.current,
              { scale: 0.7, opacity: 0.72 },
              { scale: 2.1, opacity: 0, duration: 0.58, ease: "power2.out" },
            );
          }
          spawnImpactSparks(winnerCentre, 7, 34);
        },
      });

      /* Compteur de gain du vainqueur qui monte au fil de l'arrivée des pièces. */
      const winnerDeltaNode = deltaRefs.current.get(winnerIdx);
      const displayWinnerDelta = winnerSeat.nkapDelta > 0 ? winnerSeat.nkapDelta : potTotal;
      if (winnerDeltaNode && displayWinnerDelta > 0) {
        const counter = { value: 0 };
        winnerDeltaNode.textContent = signedNkap(0);
        tl.to(counter, {
          value: displayWinnerDelta,
          duration: motion.allowLongCascade ? 0.85 : 0.65,
          ease: "power2.out",
          onUpdate: () => { winnerDeltaNode.textContent = signedNkap(Math.round(counter.value)); },
          onComplete: () => { winnerDeltaNode.textContent = signedNkap(displayWinnerDelta); },
        }, payOut + 0.42);
      }

      /* Solde total du joueur local s'il gagne. */
      const winnerBalNode = balanceRefs.current.get(winnerIdx);
      if (winnerBalNode && winnerSeat.player.isYou && winnerSeat.nkapDelta > 0) {
        const startBal = Math.max(0, winnerSeat.player.balance - winnerSeat.nkapDelta);
        const counter = { value: startBal };
        winnerBalNode.textContent = `Solde ${bare(startBal)}`;
        tl.to(counter, {
          value: winnerSeat.player.balance,
          duration: motion.allowLongCascade ? 0.85 : 0.65,
          ease: "power2.out",
          onUpdate: () => { winnerBalNode.textContent = `Solde ${bare(Math.round(counter.value))}`; },
          onComplete: () => { winnerBalNode.textContent = `Solde ${bare(winnerSeat.player.balance)}`; },
        }, payOut + 0.42);
      }

      /* Le pot central se vide au rythme de la pluie de Nkap. */
      if (potAmountRef.current && potTotal > 0) {
        const node = potAmountRef.current;
        const counter = { value: potTotal };
        tl.to(counter, {
          value: 0,
          duration: 0.62,
          ease: "power2.in",
          onUpdate: () => { node.textContent = bare(Math.round(counter.value)); },
          onComplete: () => { node.textContent = bare(0); },
        }, payOut + 0.14);
      }
    }

    /* ── Temps 3 : transfert direct des couronnes en match classé ── */
    const crownsAt = payOut + 1.18;
    if (showCrowns && winnerAvatar) {
      const winnerCentre = centreOf(winnerAvatar);
      let crownOrder = 0;

      seats.forEach((seat) => {
        const node = crownRefs.current.get(seat.playerIdx);
        if (!node || seat.crownsDelta === undefined) return;
        const seatAvatar = avatarRefs.current.get(seat.playerIdx) ?? seatRefs.current.get(seat.playerIdx);
        const at = crownsAt + crownOrder * 0.18;

        if (seat.crownsDelta < 0 && seatAvatar) {
          flyCurvedTokens(
            "crown",
            centreOf(seatAvatar),
            winnerCentre,
            at,
            Math.min(4, Math.max(1, Math.round(Math.abs(seat.crownsDelta) / 7))),
          );
          crownOrder += 1;
        }

        const before = seat.crownsBefore ?? 0;
        const counter = { value: before };
        tl.to(counter, {
          value: before + seat.crownsDelta,
          duration: 0.68,
          onUpdate: () => { node.textContent = bare(Math.round(counter.value)); },
          onComplete: () => { node.textContent = bare(before + (seat.crownsDelta ?? 0)); },
        }, seat.crownsDelta < 0 ? at : crownsAt + 0.45);
      });
    }
  }, [scripted, seats, potTotal, showCrowns, coinBudget, winnerIdx, gxeSfx, allowParticles, fx, motion.mode, motion.allowLongCascade]);

  return (
    <div
      ref={arenaRef}
      className={styles.arena}
      role="list"
      aria-label="Règlement de la manche"
      data-dense={players.length >= 4 || undefined}
    >
      {/* Table miniature Salon Royal (acajou sculpté, laiton & feutre émeraude) */}
      <div className={styles.mat} aria-hidden="true" />

      {/* Coffre central Nkap (ou sceau Ngata en manche amicale sans mise) */}
      <div ref={potRef} className={styles.pot} aria-hidden="true">
        <div ref={potInnerRef} className={`${styles.potInner}${potTotal <= 0 ? ` ${styles.potInnerHonor}` : ""}`}>
          {potTotal > 0 ? (
            <>
              <img
                src={sysAsset(NKAP_STACK_SRC)}
                alt=""
                className={styles.potCoinImg}
                draggable={false}
              />
              <span ref={potAmountRef} className={styles.potAmount}>
                {bare(potTotal)}
              </span>
              <span className={styles.potUnit}>NKAP</span>
            </>
          ) : (
            <>
              <span className={styles.potHonorCrown}>
                <CrownGlyph size={22} />
              </span>
              <span className={styles.potUnit}>NGATA</span>
            </>
          )}
        </div>
      </div>

      {seats.map((seat) => {
        const displayDelta = seat.isWinner
          ? (seat.nkapDelta > 0 ? seat.nkapDelta : potTotal)
          : seat.nkapDelta;
        const showDeltaPill = displayDelta !== 0;

        return (
          <div
            key={seat.playerIdx}
            ref={(node) => { if (node) seatRefs.current.set(seat.playerIdx, node); }}
            className={`${styles.seat}${seat.isWinner ? ` ${styles.seatWinner}` : ""}`}
            style={{ "--ux": seat.x, "--uy": seat.y } as React.CSSProperties}
            role="listitem"
            aria-label={[
              seat.player.name,
              seat.isWinner ? "gagne la manche" : "perd la manche",
              showDeltaPill ? signedSpoken(displayDelta) : "",
              seat.crownsDelta !== undefined ? `${signedNkap(seat.crownsDelta)} couronnes` : "",
            ].filter(Boolean).join(", ")}
          >
            <div className={styles.seatInner}>
              <span
                ref={(node) => { if (node) avatarRefs.current.set(seat.playerIdx, node); }}
                className={styles.avatarWrap}
                aria-hidden="true"
              >
                {seat.isWinner && (
                  <span ref={winnerRippleRef} className={styles.winnerRipple} />
                )}
                <AvatarIllustration seed={seat.player.emoji} size={42} active={seat.isWinner} />
                {seat.isWinner && (
                  <span className={styles.crownMark}>
                    <CrownGlyph size={15} />
                  </span>
                )}
              </span>

              <span className={styles.namePill} aria-hidden="true">
                <span className={styles.name}>{seat.player.name}</span>
              </span>

              {showDeltaPill ? (
                <span
                  className={`${styles.nkapPill} ${
                    displayDelta > 0 ? styles.nkapPillUp : styles.nkapPillDown
                  }`}
                  aria-hidden="true"
                >
                  <img src={sysAsset(NKAP_COIN_SRC)} alt="" className={styles.nkapMiniIcon} draggable={false} />
                  <span ref={(node) => { if (node) deltaRefs.current.set(seat.playerIdx, node); }}>
                    {signedNkap(displayDelta)}
                  </span>
                </span>
              ) : seat.isWinner ? (
                <span className={`${styles.nkapPill} ${styles.nkapPillUp}`} aria-hidden="true">
                  <CrownGlyph size={11} />
                  <span>Ngata</span>
                </span>
              ) : null}

              {seat.player.isYou && seat.player.balance > 0 && (
                <span
                  ref={(node) => { if (node) balanceRefs.current.set(seat.playerIdx, node); }}
                  className={styles.balanceHint}
                  aria-hidden="true"
                >
                  Solde {bare(seat.player.balance)}
                </span>
              )}

              {seat.crownsBefore !== undefined && (
                <span className={styles.crowns} aria-hidden="true">
                  <CrownGlyph size={11} />
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
          </div>
        );
      })}

      <div ref={flightRef} className={styles.flightLayer} aria-hidden="true" />
    </div>
  );
}
