"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSfx } from "@gxe/react";
import { AvatarIllustration } from "@/components/ui/Art";
import GameImage from "@/components/ui/GameImage";
import { PlayCard } from "@/components/cards/PlayCard";
import { ResultActions, ResultLayout } from "@/components/ui/ResultLayout";
import { RematchView } from "@/components/result/RematchView";
import { VictoryConfetti } from "@/components/result/VictoryConfetti";
import { useAuth } from "@/hooks/useAuth";
import { useLobby } from "@/contexts/LobbyContext";
import { useOptionalEconomy } from "@/contexts/EconomyContext";

import { NKAP } from "@/data/mock";
import { getNextRoundPresentation, getResultReasonLabels } from "@/lib/gamePresentation";
import { useGsapTimeline, useMotionProfile } from "@/lib/motion";
import { resolveRankProgress } from "@/lib/playerRank";
import { listenFriends, sendFriendRequest } from "@/lib/socialData";
import { CARD_SOUND, COIN_SOUND, CROWN_SOUND, LOSE_SOUND, UI_CLICK_SOUND, WIN_SOUND } from "@/lib/gxeSfx";
import type { GameMode, Player, Result, ResultSettlementEntry } from "@/types/game";
import { sysAsset } from "@/lib/assetPack";
import styles from "./ResultScreen.module.css";

const NKAP_COIN_SRC = "/assets/njambo/economy/nkap-64.webp";
const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const COIN_BUDGET: Record<string, number> = { full: 14, balanced: 9, lite: 5, off: 0 };

export interface ResultScreenProps {
  result: Result;
  gameMode?: GameMode;
  mise: number;
  onNext: () => void;
  onMenu: () => void;
  canNext: boolean;
  nextRequiresConsensus?: boolean;
  onBackRequestRef?: { current: (() => boolean) | null };
}

interface StripSeat {
  playerIdx: number;
  player: Player;
  uid?: string;
  contributed: number;
  nkapDelta: number;
  crownsBefore?: number;
  crownsDelta?: number;
  canAddFriend: boolean;
  isWinner: boolean;
}

function getModeLabel(mode: GameMode | undefined, hasCrowns: boolean): string | null {
  switch (mode) {
    case "bot":
      return "Solo IA · Salon Royal";
    case "online":
      return hasCrowns ? "En ligne · Classé" : "En ligne";
    case "friends":
      return "Entre amis";
    case "event":
      return "Événement";
    default:
      return null;
  }
}

function signedCompact(value: number): string {
  const abs = Math.abs(value).toLocaleString("fr-FR");
  return value > 0 ? `+ ${abs}` : value < 0 ? `− ${abs}` : "0";
}

function bare(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString("fr-FR");
}

function getHeroTitle(result: Result): string {
  const win = result.winner;
  if (result.series && result.series.total > 1) {
    return win.isYou ? "Série Remportée !" : `${win.name} prend la série`;
  }
  if (win.isYou) {
    if (result.type === "instant") return "Victoire Éclair !";
    return result.doubles ? "Victoire ×2 !" : "Victoire !";
  }
  return result.doubles ? `${win.name} clôt au 3 ×2` : `${win.name} gagne`;
}

function getHeroSubtitle(result: Result, gameMode: GameMode | undefined): string {
  const win = result.winner;
  if (result.series && result.series.total > 1) {
    return win.isYou
      ? `Série de ${result.series.total} manches dominée`
      : `${win.name} remporte la série de ${result.series.total} manches`;
  }
  if (result.type === "instant") {
    switch (result.reason) {
      case "exact21":
        return win.isYou ? "21 exact dès la distribution · Gains ×2" : `${win.name} ouvre un 21 exact · Mises doublées`;
      case "flush":
        return win.isYou ? "5 cartes de même couleur · Victoire directe" : `${win.name} ouvre une couleur complète`;
      case "under21":
        return win.isYou
          ? `Donne sous 21 (${result.total} pts) · Victoire directe`
          : `${win.name} ouvre sous 21 (${result.total} pts)`;
    }
  }
  if (result.doubles) {
    return win.isYou
      ? "Dernier pli clos avec un 3 · Mises doublées"
      : `${win.name} pose le 3 au dernier tour · Pénalité ×2`;
  }
  if (gameMode === "event") {
    return win.isYou ? "Étape d'événement validée" : "Manche d'événement terminée";
  }
  return win.isYou ? "Dernier pli dominé à la table" : `${win.name} prend le dernier pli`;
}

function getRuleExplanation(result: Result): string {
  if (result.series && result.series.total > 1) {
    return `Match en ${result.series.total} manches : le vainqueur de la série rafle le pot cumulé.`;
  }
  if (result.type === "instant") {
    switch (result.reason) {
      case "exact21":
        return "Main exacte à 21 points dès la donne = victoire immédiate & gains doublés (×2).";
      case "flush":
        return "Cinq cartes de la même couleur dès la donne = victoire immédiate.";
      case "under21":
        return `Total de main sous 21 (${result.total} pts) dès la donne = victoire immédiate.`;
    }
  }
  if (result.doubles) {
    return "Clore le dernier pli avec un 3 double instantanément les gains et pénalités (×2) !";
  }
  return "Remporter le dernier pli de la manche attribue tout le pot de la table.";
}

/** Couronne vectorielle dorée nette (signature Blason Chef). */
function CrownGlyph({ size = 16, color = "#ffd86b" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M3 17.6L1.8 8L7.5 12.2L12 4.4L16.5 12.2L22.2 8L21 17.6C20.8 18.8 19.9 19.6 18.8 19.6H5.2C4.1 19.6 3.2 18.8 3 17.6Z"
        fill={color}
        stroke="#fff7ce"
        strokeWidth="0.9"
      />
      <circle cx="12" cy="4" r="1.5" fill="#fffbe2" />
      <circle cx="12" cy="14.2" r="1.4" fill="#1de4be" />
    </svg>
  );
}

/** Sceau héraldique exact de « 4 · Blason Chef » : Trophée or en victoire, Bouclier émeraude en défaite. */
function RoyalSealSvg({ win, gradId }: { win: boolean; gradId: string }) {
  return (
    <svg className={styles.sealSvg} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradId} x1="32" y1="4" x2="32" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={win ? "#fffbe0" : "#e2f5f1"} />
          <stop offset="50%" stopColor={win ? "#ffcf40" : "#8ec2bc"} />
          <stop offset="100%" stopColor={win ? "#b36606" : "#3e6a68"} />
        </linearGradient>
      </defs>
      <polygon
        points="32,3 40,9 50,8 54,17 61,24 58,34 61,44 53,50 49,59 39,58 32,62 25,58 15,59 11,50 3,44 6,34 3,24 10,17 14,8 24,9"
        fill={win ? "rgba(68, 39, 9, 0.92)" : "rgba(18, 38, 40, 0.92)"}
        stroke={`url(#${gradId})`}
        strokeWidth="2.2"
      />
      <circle
        cx="32"
        cy="32"
        r="21"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="1.2"
        strokeDasharray="3 2.5"
        opacity="0.8"
      />
      {win ? (
        <>
          <path d="M21 22H43V32C43 38 38.2 42.5 32 42.5C25.8 42.5 21 38 21 32V22Z" fill={`url(#${gradId})`} />
          <path
            d="M21 25H16C16 30.5 18.2 33.8 21.5 34.8M43 25H48C48 30.5 45.8 33.8 42.5 34.8"
            stroke="#ffe584"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <rect x="29.5" y="42.5" width="5" height="6" fill="#d58a16" />
          <rect x="23" y="48.5" width="18" height="4" rx="2" fill={`url(#${gradId})`} />
        </>
      ) : (
        <>
          <path
            d="M32 16L45 21.5V33.5C45 41.2 39.5 46.8 32 50C24.5 46.8 19 41.2 19 33.5V21.5L32 16Z"
            fill="rgba(29, 228, 190, 0.2)"
            stroke={`url(#${gradId})`}
            strokeWidth="2"
          />
          <path
            d="M26 32.5L30.2 36.7L38.5 27.5"
            stroke="#a6fff0"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}

export function ResultScreen({
  result,
  gameMode,
  mise,
  onNext,
  onMenu,
  canNext,
  nextRequiresConsensus = false,
  onBackRequestRef,
}: ResultScreenProps) {
  const { user } = useAuth();
  const { currentRoom } = useLobby();
  const economyCtx = useOptionalEconomy();
  const gxeSfx = useSfx();

  const motion = useMotionProfile();
  const win = result.winner;
  const [nextRequested, setNextRequested] = useState(false);
  const [showRematchScreen, setShowRematchScreen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const titleId = useId();
  const summaryId = useId();
  const sealGradId = useId().replaceAll(":", "");

  const doubleGain = result.settlement?.find((entry) => entry.doubleGain)?.doubleGain;
  const totalGain = result.gain + (doubleGain ?? (result.doubles ? mise * (result.playersCount - 1) : 0));
  const scriptedMotion = motion.enabled && motion.allowEntranceCascade;
  const reasonLabels = getResultReasonLabels(result);

  /* Suivi en direct de la salle pour la revanche (en ligne / entre amis). */
  const roomPlayers = currentRoom?.players ?? [];
  const roomDissolved = nextRequiresConsensus && (!currentRoom || roomPlayers.length < 2);
  const effectiveCanNext = canNext && !roomDissolved;
  const incomingRematchRequester = useMemo(() => {
    if (!nextRequiresConsensus || !currentRoom || currentRoom.status !== "waiting") return null;
    const hostId = currentRoom.hostId;
    return currentRoom.players.find(
      (p) => p.uid !== user?.uid && p.uid !== hostId && p.ready,
    ) ?? null;
  }, [currentRoom, nextRequiresConsensus, user?.uid]);

  const nextRound = getNextRoundPresentation(effectiveCanNext, nextRequiresConsensus, nextRequested);
  const [friendUids, setFriendUids] = useState<ReadonlySet<string>>(new Set());
  const [requestedFriendUids, setRequestedFriendUids] = useState<ReadonlySet<string>>(new Set());

  const showQuickToast = useCallback((message: string) => {
    setToastMsg(message);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 1850);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    if (!onBackRequestRef) return;
    onBackRequestRef.current = () => {
      if (showRematchScreen) {
        setShowRematchScreen(false);
        return true;
      }
      onMenu();
      return false;
    };
    return () => { onBackRequestRef.current = null; };
  }, [onBackRequestRef, onMenu, showRematchScreen]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    return listenFriends(user.uid, (friends) => {
      setFriendUids(new Set(friends.map((friend) => friend.uid)));
    });
  }, [user?.uid]);

  const handleAddFriend = useCallback((seat: StripSeat) => {
    if (!seat.uid || !user || requestedFriendUids.has(seat.uid)) return;
    gxeSfx.play(UI_CLICK_SOUND);
    setRequestedFriendUids((previous) => new Set(previous).add(seat.uid as string));
    showQuickToast(`Demande d'ami envoyée à ${seat.player.name} ✓`);
    void sendFriendRequest(
      { uid: user.uid, name: user.name, emoji: user.emoji },
      { uid: seat.uid, name: seat.player.name, emoji: seat.player.emoji },
    );
  }, [gxeSfx, requestedFriendUids, showQuickToast, user]);

  /* Règlement par joueur, garanti même si le replay/serveur n'a pas fourni `settlement`. */
  const effectiveSettlement = useMemo<ResultSettlementEntry[]>(() => {
    if (!result.players?.length) return [];
    if (result.settlement && result.settlement.length > 0) return result.settlement;
    return result.players.map((_player, index) => ({
      playerIdx: index,
      contributed: mise,
      nkapDelta: index === result.winnerIdx ? Math.max(0, totalGain - mise) : -mise,
    }));
  }, [mise, result.players, result.settlement, result.winnerIdx, totalGain]);

  const seats = useMemo<StripSeat[]>(() => {
    if (!result.players?.length) return [];
    const byIdx = new Map(effectiveSettlement.map((entry) => [entry.playerIdx, entry]));
    return result.players.map((player, playerIdx) => {
      const entry = byIdx.get(playerIdx);
      const uid = entry?.uid;
      const canAddFriend = Boolean(uid && !player.isYou && !entry?.bot && !friendUids.has(uid));
      return {
        playerIdx,
        player,
        uid,
        contributed: entry?.contributed ?? 0,
        nkapDelta: entry?.nkapDelta ?? 0,
        crownsBefore: entry?.crownsBefore,
        crownsDelta: entry?.crownsDelta,
        canAddFriend,
        isWinner: playerIdx === result.winnerIdx,
      };
    });
  }, [effectiveSettlement, friendUids, result.players, result.winnerIdx]);

  const myPlayer = useMemo(() => result.players?.find((p) => p.isYou) ?? (win.isYou ? win : null), [result.players, win]);
  const mySettlement = useMemo(
    () => effectiveSettlement.find((entry) => result.players?.[entry.playerIdx]?.isYou),
    [effectiveSettlement, result.players],
  );

  const potTotal = useMemo(() => {
    const staked = effectiveSettlement.reduce((sum, entry) => sum + Math.max(0, entry.contributed), 0);
    if (staked > 0) return Math.max(staked, totalGain);
    return totalGain;
  }, [effectiveSettlement, totalGain]);

  const myNetDelta = useMemo(() => {
    if (mySettlement) return mySettlement.nkapDelta;
    if (win.isYou) return totalGain;
    return mise > 0 ? -mise : 0;
  }, [mise, mySettlement, totalGain, win.isYou]);

  const myBalanceAfter = myPlayer?.balance ?? 0;
  const myBalanceBefore = Math.max(0, myBalanceAfter - myNetDelta);

  const hasCrowns = Boolean(effectiveSettlement.some((entry) => entry.crownsBefore !== undefined));
  const modeLabel = getModeLabel(gameMode, hasCrowns);

  /* Progression de rang (couronnes de la manche en classé, ou rang courant du profil en fallback). */
  const myCrownsBefore = mySettlement?.crownsBefore ?? economyCtx?.rank.crowns ?? 1_000;
  const myCrownsDelta = mySettlement?.crownsDelta ?? 0;
  const myCrownsAfter = Math.max(0, myCrownsBefore + myCrownsDelta);
  const rankBefore = useMemo(() => resolveRankProgress(myCrownsBefore), [myCrownsBefore]);
  const rankAfter = useMemo(() => resolveRankProgress(myCrownsAfter), [myCrownsAfter]);
  const isSeriesMatch = Boolean(result.series && result.series.total > 1);

  /* Encart pouvoir / bonus sous le séparateur de la tuile Trésor Nkap. */
  const treasureCallout = useMemo(() => {
    if (!win.isYou && (result.refund ?? 0) > 0) {
      return {
        title: "Cauris Chanceux !",
        detail: `+ ${NKAP(result.refund ?? 0)} remboursés`,
      };
    }
    if (!win.isYou && mySettlement?.doubleBlocked) {
      return {
        title: "Totem des Ancêtres !",
        detail: "Mise double évitée",
      };
    }
    if (!win.isYou && (mySettlement?.doublePenalty ?? 0) > 0) {
      return {
        title: "Coup de 3 · ×2",
        detail: `Pénalité − ${NKAP(mySettlement?.doublePenalty ?? 0)}`,
      };
    }
    if (win.isYou && result.doubles) {
      return {
        title: result.type === "instant" ? "Donne Royale ×2" : "Coup de 3 Royal !",
        detail: "Pénalité ×2 encaissée sur la table",
      };
    }
    return null;
  }, [mySettlement?.doubleBlocked, mySettlement?.doublePenalty, result.doubles, result.refund, result.type, win.isYou]);

  const heroTitle = getHeroTitle(result);
  const heroSubtitle = getHeroSubtitle(result, gameMode);
  const ruleExplanation = getRuleExplanation(result);

  /* ── Références GSAP pour la chorégraphie exacte Blason Chef ── */
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const sealRef = useRef<HTMLDivElement>(null);
  const ribbonRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const treasureTileRef = useRef<HTMLDivElement>(null);
  const cardTileRef = useRef<HTMLButtonElement>(null);
  const rankTileRef = useRef<HTMLDivElement>(null);
  const cardHeroRef = useRef<HTMLDivElement>(null);
  const stampRef = useRef<HTMLSpanElement>(null);
  const netDeltaRef = useRef<HTMLSpanElement>(null);
  const balanceRef = useRef<HTMLSpanElement>(null);
  const rankRingRef = useRef<SVGCircleElement>(null);
  const rankPctRef = useRef<HTMLSpanElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const flightRef = useRef<HTMLDivElement>(null);
  const seatAvatarRefs = useRef(new Map<number, HTMLSpanElement>());

  const coinBudget = COIN_BUDGET[motion.mode] ?? 5;

  const launchReactionBubble = useCallback((emoji: string, buttonEl: HTMLButtonElement) => {
    gxeSfx.play(UI_CLICK_SOUND);
    showQuickToast(`Réaction ${emoji} envoyée à la table !`);

    if (!motion.enabled || motion.reduced) return;
    const panel = panelRef.current;
    const layer = flightRef.current;
    if (!panel || !layer) return;

    const pb = panel.getBoundingClientRect();
    const bb = buttonEl.getBoundingClientRect();
    const ox = bb.left - pb.left + bb.width / 2;
    const oy = bb.top - pb.top;

    for (let i = 0; i < 4; i += 1) {
      const bubble = document.createElement("span");
      bubble.className = styles.reactionBubble;
      bubble.textContent = emoji;
      bubble.setAttribute("aria-hidden", "true");
      bubble.style.left = `${ox + (Math.random() - 0.5) * 34}px`;
      bubble.style.top = `${oy}px`;
      bubble.style.fontSize = `${16 + Math.round(Math.random() * 8)}px`;
      layer.appendChild(bubble);

      const dx = (Math.random() - 0.5) * 52;
      const dy = -110 - Math.random() * 64;
      requestAnimationFrame(() => {
        bubble.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.25)`;
        bubble.style.opacity = "0";
      });
      window.setTimeout(() => bubble.remove(), 980);
    }
  }, [gxeSfx, motion.enabled, motion.reduced, showQuickToast]);

  useGsapTimeline(scriptedMotion && !showRematchScreen, rootRef, (gsap) => {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    const panel = panelRef.current;
    const flight = flightRef.current;
    flight?.replaceChildren();

    /** Onde de choc + gerbe d'étincelles à l'atterrissage des pièces Nkap. */
    const spawnImpactBurst = (pt: { x: number; y: number }, hero: boolean) => {
      if (!flight) return;
      const ring = document.createElement("span");
      ring.className = hero ? styles.impactRingGold : styles.impactRingTeal;
      ring.style.left = `${pt.x}px`;
      ring.style.top = `${pt.y}px`;
      ring.setAttribute("aria-hidden", "true");
      flight.appendChild(ring);
      window.setTimeout(() => ring.remove(), 600);

      if (motion.mode === "lite") return;
      const sparkCount = hero ? 10 : 5;
      for (let i = 0; i < sparkCount; i += 1) {
        const sp = document.createElement("span");
        sp.className = hero ? styles.impactSparkGold : styles.impactSparkTeal;
        sp.setAttribute("aria-hidden", "true");
        flight.appendChild(sp);
        const ang = (i / sparkCount) * Math.PI * 2 + (i % 2) * 0.25;
        const dist = 22 + (i % 3) * 11;
        gsap.fromTo(
          sp,
          { x: pt.x - 3, y: pt.y - 3, opacity: 1, scale: 1 },
          {
            x: pt.x - 3 + Math.cos(ang) * dist,
            y: pt.y - 3 + Math.sin(ang) * dist,
            opacity: 0,
            scale: 0.25,
            duration: 0.46,
            ease: "power2.out",
            onComplete: () => sp.remove(),
          },
        );
      }
    };

    /* ── Acte 1 : Entrée du panneau, Sceau Héraldique, Ruban & Titre ── */
    if (panel) {
      tl.fromTo(
        panel,
        { opacity: 0, y: 20, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: motion.allowFilterFx ? 0.4 : 0.3 },
        0,
      );
    }
    if (sealRef.current) {
      tl.fromTo(
        sealRef.current,
        { opacity: 0, scale: 0.6, y: 16 },
        { opacity: 1, scale: 1, y: 0, duration: 0.56, ease: "back.out(2.1)" },
        0.04,
      );
    }
    if (ribbonRef.current) {
      tl.fromTo(
        ribbonRef.current,
        { opacity: 0, scaleX: 0.18, scaleY: 1.25 },
        { opacity: 1, scaleX: 1, scaleY: 1, duration: 0.5, ease: "back.out(1.7)" },
        0.08,
      );
    }
    if (titleRef.current) {
      tl.fromTo(
        titleRef.current,
        { opacity: 0, scale: 0.72, y: 14 },
        { opacity: 1, scale: 1, y: 0, duration: 0.52, ease: "back.out(1.6)" },
        0.12,
      );
    }
    if (subtitleRef.current) {
      tl.fromTo(
        subtitleRef.current,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.42 },
        0.18,
      );
    }

    /* ── Acte 2 : Cascade Bento, Slam Carte Décisive & Jauge de Rang ── */
    const bentoNodes = [treasureTileRef.current, cardTileRef.current, rankTileRef.current].filter(Boolean);
    if (bentoNodes.length > 0) {
      tl.fromTo(
        bentoNodes,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.46, stagger: 0.09, ease: "power3.out" },
        0.22,
      );
    }
    if (cardHeroRef.current) {
      tl.fromTo(
        cardHeroRef.current,
        { opacity: 0, y: 36, scale: 1.45, rotate: -14 },
        { opacity: 1, y: 0, scale: 1, rotate: 0, duration: 0.58, ease: "back.out(1.8)" },
        0.3,
      );
      tl.call(() => gxeSfx.play(CARD_SOUND), [], 0.46);
    }
    if (stampRef.current) {
      tl.fromTo(
        stampRef.current,
        { opacity: 0, scale: 2.4, rotate: -26 },
        { opacity: 1, scale: 1, rotate: -6, duration: 0.4, ease: "back.out(2.3)" },
        0.54,
      );
    }
    if (stripRef.current) {
      tl.fromTo(
        stripRef.current,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.44 },
        0.46,
      );
    }

    /* Compteur animé du Trésor Nkap */
    if (netDeltaRef.current && myNetDelta !== 0) {
      const node = netDeltaRef.current;
      const counter = { value: 0 };
      node.textContent = signedCompact(0);
      tl.to(counter, {
        value: myNetDelta,
        duration: motion.allowLongCascade ? 0.78 : 0.6,
        ease: "power2.out",
        onUpdate: () => { node.textContent = signedCompact(Math.round(counter.value)); },
        onComplete: () => { node.textContent = signedCompact(myNetDelta); },
      }, 0.3);
    }

    /* Compteur animé du solde total */
    if (balanceRef.current && myBalanceAfter > 0 && myNetDelta !== 0) {
      const node = balanceRef.current;
      const counter = { value: myBalanceBefore };
      node.textContent = bare(myBalanceBefore);
      tl.to(counter, {
        value: myBalanceAfter,
        duration: motion.allowLongCascade ? 0.84 : 0.64,
        ease: "power2.out",
        onUpdate: () => { node.textContent = bare(counter.value); },
        onComplete: () => { node.textContent = bare(myBalanceAfter); },
      }, 0.42);
    }

    /* Jauge circulaire SVG de Rang animée (Blason Chef exact) */
    if (rankRingRef.current && !isSeriesMatch) {
      const ring = rankRingRef.current;
      const startPct = hasCrowns ? rankBefore.progressPct : Math.max(8, rankAfter.progressPct - 14);
      const endPct = rankAfter.progressPct;
      const startOffset = RING_CIRCUMFERENCE * (1 - startPct / 100);
      const endOffset = RING_CIRCUMFERENCE * (1 - endPct / 100);
      gsap.set(ring, { strokeDashoffset: startOffset });
      tl.to(ring, {
        strokeDashoffset: endOffset,
        duration: 0.92,
        ease: "power2.out",
      }, 0.56);

      if (rankPctRef.current) {
        const pctNode = rankPctRef.current;
        const pctCounter = { value: startPct };
        pctNode.textContent = `${startPct}%`;
        tl.to(pctCounter, {
          value: endPct,
          duration: 0.92,
          ease: "power2.out",
          onUpdate: () => { pctNode.textContent = `${Math.round(pctCounter.value)}%`; },
          onComplete: () => { pctNode.textContent = `${endPct}%`; },
        }, 0.54);
      }

      if (win.isYou && hasCrowns && myCrownsDelta > 0) {
        tl.call(() => gxeSfx.playChime(CROWN_SOUND), [], 0.62);
      }
    }

    /* ── Acte 3 : Vol parabolique des pièces Nkap + onde de choc & étincelles ── */
    if (panel && flight && coinBudget > 0 && potTotal > 0 && seats.length >= 2) {
      const targetNode = win.isYou
        ? treasureTileRef.current
        : seatAvatarRefs.current.get(result.winnerIdx) ?? treasureTileRef.current;

      const losers = seats.filter((s) => !s.isWinner && (s.nkapDelta < 0 || s.contributed > 0));
      if (targetNode && losers.length > 0) {
        tl.call(() => {
          const base = panel.getBoundingClientRect();
          const centreOf = (el: Element) => {
            const box = el.getBoundingClientRect();
            return { x: box.left - base.left + box.width / 2, y: box.top - base.top + box.height / 2 };
          };
          const toPt = centreOf(targetNode);
          const perLoser = Math.max(3, Math.min(5, Math.ceil(coinBudget / losers.length)));

          losers.forEach((loser, order) => {
            const fromEl = seatAvatarRefs.current.get(loser.playerIdx);
            if (!fromEl) return;
            const fromPt = centreOf(fromEl);
            const dx = toPt.x - fromPt.x;
            const dy = toPt.y - fromPt.y;
            const dist = Math.hypot(dx, dy) || 1;
            const nx = -dy / dist;
            const ny = dx / dist;
            const mx = (fromPt.x + toPt.x) / 2;
            const my = (fromPt.y + toPt.y) / 2;
            const heroWave = order === 0 && win.isYou;

            for (let i = 0; i < perLoser; i += 1) {
              const coin = document.createElement("span");
              coin.className = `${styles.flyingCoin}${heroWave ? ` ${styles.flyingCoinHero}` : ""}`;
              coin.setAttribute("aria-hidden", "true");
              const img = document.createElement("img");
              img.src = sysAsset(NKAP_COIN_SRC);
              img.alt = "";
              img.draggable = false;
              coin.appendChild(img);
              flight.appendChild(coin);

              const half = heroWave ? 12 : 9;
              const lane = perLoser <= 1 ? 0 : (i / (perLoser - 1)) * 2 - 1;
              const cx = mx + nx * ((heroWave ? 48 : 28) * lane + (i % 2 === 0 ? 10 : -10));
              const cy = my + ny * ((heroWave ? 48 : 28) * lane) - (heroWave ? 32 : 18);
              const prog = { t: 0 };
              const delay = order * 0.11 + i * (heroWave ? 0.036 : 0.044);

              gsap.to(prog, {
                t: 1,
                duration: heroWave ? 0.7 : 0.54,
                delay,
                ease: "power2.inOut",
                onUpdate: () => {
                  const t = prog.t;
                  const inv = 1 - t;
                  const px = inv * inv * fromPt.x + 2 * inv * t * cx + t * t * toPt.x;
                  const py = inv * inv * fromPt.y + 2 * inv * t * cy + t * t * toPt.y;
                  const sc = (heroWave ? 0.76 : 0.68) + Math.sin(t * Math.PI) * (heroWave ? 0.5 : 0.4);
                  const flipX = 0.42 + 0.58 * Math.abs(Math.cos(t * Math.PI * 3));
                  const op = t < 0.1 ? t / 0.1 : t > 0.88 ? Math.max(0, (1 - t) / 0.12) : 1;
                  gsap.set(coin, {
                    x: px - half,
                    y: py - half,
                    scaleX: sc * flipX,
                    scaleY: sc,
                    rotation: t * 210,
                    opacity: op,
                  });
                },
                onComplete: () => {
                  coin.remove();
                  if (i === 0 || (heroWave && i === Math.floor(perLoser * 0.5)) || (heroWave && i === perLoser - 1)) {
                    spawnImpactBurst(toPt, heroWave || win.isYou);
                    gxeSfx.playChime(COIN_SOUND);
                    if (i === 0 && order === 0 && treasureTileRef.current && win.isYou) {
                      gsap.fromTo(
                        treasureTileRef.current,
                        { scale: 1 },
                        { scale: 1.03, duration: 0.15, yoyo: true, repeat: 1, ease: "power2.out" },
                      );
                    }
                  }
                },
              });
            }
          });
        }, [], 0.48);
      }
    }
  }, [
    scriptedMotion,
    showRematchScreen,
    myNetDelta,
    myBalanceBefore,
    myBalanceAfter,
    hasCrowns,
    myCrownsDelta,
    rankBefore.progressPct,
    rankAfter.progressPct,
    isSeriesMatch,
    coinBudget,
    potTotal,
    seats,
    win.isYou,
    result.winnerIdx,
    motion.allowFilterFx,
    motion.allowLongCascade,
    motion.mode,
    gxeSfx,
  ]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    gxeSfx.playChime(win.isYou ? WIN_SOUND : LOSE_SOUND);
  }, [gxeSfx, win.isYou]);

  const handleNext = () => {
    if (!effectiveCanNext) return;
    if (nextRequested) {
      if (nextRequiresConsensus) setShowRematchScreen(true);
      return;
    }
    setNextRequested(true);
    if (nextRequiresConsensus) setShowRematchScreen(true);
    onNext();
  };

  const toggleRuleExplain = () => {
    gxeSfx.play(UI_CLICK_SOUND);
    setRuleOpen((open) => !open);
  };

  const finalRingOffset = RING_CIRCUMFERENCE * (1 - rankAfter.progressPct / 100);
  const seriesScores = result.series?.scores ?? [];
  const showFriendlyBanner = potTotal <= 0 && myNetDelta === 0;

  const main = (
    <div className={styles.blasonRoot}>
      {/* Couche locale pour le vol parabolique des pièces Nkap, étincelles et bulles réactions */}
      <div ref={flightRef} className={styles.flightLayer} aria-hidden="true" />

      {toastMsg && (
        <div className={styles.quickToast} role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}

      {/* ── Acte 1 : Sceau Héraldique, Ruban Diagonal & Titre Monumental ── */}
      <header className={styles.header}>
        <div className={styles.sealStage} aria-hidden="true">
          {win.isYou && motion.enabled && motion.allowDecorativeLoop && (
            <>
              <span className={styles.sunburst} />
              <span className={styles.dashedOrbit} />
            </>
          )}
          {!win.isYou && motion.enabled && motion.allowDecorativeLoop && (
            <span className={styles.lossBeacon} />
          )}
          <div ref={sealRef} className={styles.sealCore}>
            <RoyalSealSvg win={win.isYou} gradId={sealGradId} />
          </div>
        </div>

        {modeLabel && (
          <div ref={ribbonRef} className={`${styles.ribbon}${win.isYou ? ` ${styles.ribbonWin}` : ` ${styles.ribbonLoss}`}`}>
            <span>{modeLabel}</span>
            {isSeriesMatch && result.series && (
              <span>· Série {result.series.total}</span>
            )}
          </div>
        )}

        <h1 ref={titleRef} id={titleId} className={styles.title}>
          {heroTitle}
        </h1>

        <p ref={subtitleRef} id={summaryId} className={styles.subtitle}>
          {heroSubtitle}
        </p>
      </header>

      {/* ── Acte 2 : Grille Bento Vivante (Trésor Nkap · Coup Décisif · Rang Radial) ── */}
      <div className={styles.bento}>
        {/* Tuile 1 : Trésor Nkap */}
        <div
          ref={treasureTileRef}
          className={`${styles.tile} ${styles.tileTreasure}${win.isYou ? ` ${styles.tileTreasureWin}` : ` ${styles.tileTreasureLoss}`}`}
        >
          <div className={styles.treasureRow}>
            <div className={styles.treasureLeft}>
              <span className={styles.tileKicker}>
                {showFriendlyBanner ? "Partie amicale" : "Trésor Nkap"}
              </span>
              <div className={styles.treasureValueRow}>
                {showFriendlyBanner ? (
                  <span className={styles.friendlyBadge}>
                    <CrownGlyph size={16} />
                    <span>{win.isYou ? "Ngata · Victoire" : "Ngata · Honneur"}</span>
                  </span>
                ) : (
                  <>
                    <GameImage
                      src={NKAP_COIN_SRC}
                      alt=""
                      width={26}
                      height={26}
                      className={styles.treasureCoin}
                      draggable={false}
                    />
                    <span
                      ref={netDeltaRef}
                      className={`${styles.treasureValue}${myNetDelta >= 0 ? ` ${styles.valPositive}` : ` ${styles.valNegative}`}`}
                    >
                      {signedCompact(myNetDelta)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {!showFriendlyBanner && (
              <div className={styles.treasureRight}>
                {myBalanceAfter > 0 && (
                  <>
                    <span className={styles.balanceLabel}>Solde total</span>
                    <strong ref={balanceRef} className={styles.balanceValue}>
                      {bare(myBalanceAfter)}
                    </strong>
                  </>
                )}
                {potTotal > 0 && (
                  <span className={styles.potMeta}>Pot {bare(potTotal)}</span>
                )}
              </div>
            )}
          </div>

          {treasureCallout && (
            <div className={`${styles.callout}${win.isYou ? ` ${styles.calloutWin}` : ` ${styles.calloutLoss}`}`}>
              <span aria-hidden="true">✦</span>
              <span>
                <strong>{treasureCallout.title}</strong> · {treasureCallout.detail}
              </span>
            </div>
          )}
        </div>

        {/* Tuile 2 : Coup Décisif Interactive (carte toujours visible + explication au clic) */}
        <button
          ref={cardTileRef}
          type="button"
          data-nj-skin="none"
          className={`${styles.tile} ${styles.tilePlay}`}
          onClick={toggleRuleExplain}
          aria-expanded={ruleOpen}
          aria-label={`Coup décisif : ${reasonLabels.join(", ")}. Toucher pour lire la règle.`}
        >
          <span className={styles.tileKicker}>
            Coup décisif <span className={styles.infoDot} aria-hidden="true">ⓘ</span>
          </span>

          <div className={styles.cardShowcase}>
            {motion.enabled && !motion.reduced && (
              <>
                <span className={`${styles.cardShockOuter}${win.isYou ? ` ${styles.shockGold}` : ` ${styles.shockCrimson}`}`} aria-hidden="true" />
                <span className={`${styles.cardShockInner}${win.isYou ? ` ${styles.shockTeal}` : ` ${styles.shockAmber}`}`} aria-hidden="true" />
              </>
            )}
            <div ref={cardHeroRef} className={styles.cardHeroAnim}>
              {result.type === "instant" ? (
                <div className={styles.instantFan} aria-label={`Main gagnante de ${win.name}`}>
                  {win.hand.slice(0, 5).map((card, index) => (
                    <span
                      key={card.id}
                      className={styles.fanItem}
                      style={{
                        marginLeft: index === 0 ? 0 : -20,
                        transform: `rotate(${(index - 2) * 8.5}deg) translateY(${Math.abs(index - 2) * 2.5}px)`,
                      }}
                    >
                      <PlayCard card={card} w={34} glow={win.isYou} />
                    </span>
                  ))}
                </div>
              ) : (
                <div className={`${styles.decisiveWrap}${win.isYou ? ` ${styles.decisiveFoilWin}` : ` ${styles.decisiveFoilLoss}`}`}>
                  <PlayCard card={result.lastCard} w={58} glow={win.isYou} />
                  {result.doubles && (
                    <span ref={stampRef} className={styles.doubleStamp} aria-hidden="true">
                      ×2
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={styles.playCaption} role="list" aria-label="Condition de victoire">
            {ruleOpen ? (
              <span className={styles.ruleInline}>{ruleExplanation}</span>
            ) : (
              <span role="listitem">{reasonLabels.slice(0, 2).join(" · ")}</span>
            )}
          </div>
        </button>

        {/* Tuile 3 : Jauge Radiale de Rang (couronne + % au centre, exact Blason Chef) */}
        <div ref={rankTileRef} className={`${styles.tile} ${styles.tileRank}`}>
          {isSeriesMatch && result.series ? (
            <>
              <span className={styles.tileKicker}>Série · {result.series.total} manches</span>
              <div className={styles.seriesBoard}>
                {(result.players ?? []).map((player, index) => (
                  <div key={`${player.name}-${index}`} className={styles.seriesRow}>
                    <span className={styles.seriesName}>{player.isYou ? "Toi" : player.name}</span>
                    <strong className={styles.seriesScore}>{seriesScores[index] ?? 0}</strong>
                  </div>
                ))}
              </div>
              <span className={styles.rankLabel}>Score final</span>
            </>
          ) : (
            <>
              <div className={styles.rankTop}>
                <span className={styles.tileKicker}>Rang</span>
                {hasCrowns && myCrownsDelta !== 0 ? (
                  <span
                    className={`${styles.crownDelta}${myCrownsDelta > 0 ? ` ${styles.crownUp}` : ` ${styles.crownDown}`}`}
                  >
                    <span>{myCrownsDelta > 0 ? `+${myCrownsDelta}` : myCrownsDelta}</span>
                    <CrownGlyph size={12} color={myCrownsDelta > 0 ? "#ffd86b" : "#ff9fb2"} />
                  </span>
                ) : (
                  <span className={styles.crownNeutral}>
                    <span>{bare(myCrownsAfter)}</span>
                    <CrownGlyph size={12} color="#ffd86b" />
                  </span>
                )}
              </div>

              <div className={styles.ringWrap} aria-label={`${rankAfter.label}, progression ${rankAfter.progressPct}%`}>
                <svg className={styles.ringSvg} width="66" height="66" viewBox="0 0 66 66" aria-hidden="true">
                  <circle className={styles.ringBg} cx="33" cy="33" r={RING_RADIUS} />
                  <circle
                    ref={rankRingRef}
                    className={`${styles.ringProgress}${win.isYou ? ` ${styles.ringWin}` : ` ${styles.ringLoss}`}`}
                    cx="33"
                    cy="33"
                    r={RING_RADIUS}
                    strokeDasharray={RING_CIRCUMFERENCE.toFixed(1)}
                    strokeDashoffset={finalRingOffset.toFixed(1)}
                  />
                </svg>
                <div className={styles.ringCenter}>
                  <CrownGlyph size={18} color={win.isYou ? "#ffd86b" : "#9ad4cc"} />
                  <span ref={rankPctRef} className={styles.ringPct}>
                    {rankAfter.progressPct}%
                  </span>
                </div>
              </div>

              <div className={styles.rankFoot}>
                <strong className={styles.rankLabel}>{rankAfter.label}</strong>
                <span className={styles.rankNext}>
                  {rankAfter.nextTier ? `→ ${rankAfter.nextTier.label}` : "Rang suprême"}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Acte 3 : Bandeau Joueurs + Boutons de Réaction Rapide (👏 / 🔥) ── */}
      {seats.length > 0 && (
        <div ref={stripRef} className={styles.playersStrip}>
          <div className={styles.seatsRow} role="list" aria-label="Règlement des joueurs">
            {seats.map((seat) => {
              const displayDelta = seat.isWinner
                ? (seat.nkapDelta > 0 ? seat.nkapDelta : potTotal)
                : seat.nkapDelta;
              const justRequested = Boolean(seat.uid && requestedFriendUids.has(seat.uid));
              return (
                <div
                  key={seat.playerIdx}
                  className={`${styles.seatChip}${seat.isWinner ? ` ${styles.seatWinner}` : ""}${seat.player.isYou ? ` ${styles.seatSelf}` : ""}`}
                  role="listitem"
                >
                  <span
                    ref={(node) => {
                      if (node) seatAvatarRefs.current.set(seat.playerIdx, node);
                      else seatAvatarRefs.current.delete(seat.playerIdx);
                    }}
                    className={styles.seatAvatarWrap}
                  >
                    <AvatarIllustration seed={seat.player.emoji} size={40} active={seat.isWinner} />
                    {seat.isWinner && (
                      <span className={styles.seatCrown} aria-hidden="true">
                        <CrownGlyph size={12} />
                      </span>
                    )}
                    {(seat.canAddFriend || justRequested) && (
                      <button
                        type="button"
                        data-nj-skin="none"
                        className={`${styles.addFriendBtn}${justRequested ? ` ${styles.addFriendDone}` : ""}`}
                        onClick={() => handleAddFriend(seat)}
                        disabled={justRequested}
                        aria-label={justRequested ? `Demande envoyée à ${seat.player.name}` : `Ajouter ${seat.player.name} en ami`}
                      >
                        {justRequested ? "✓" : "+"}
                      </button>
                    )}
                  </span>

                  <span className={styles.seatName}>
                    {seat.player.isYou ? "Toi" : seat.player.name}
                  </span>

                  {displayDelta !== 0 ? (
                    <span
                      className={`${styles.seatDelta}${displayDelta > 0 ? ` ${styles.seatDeltaUp}` : ` ${styles.seatDeltaDown}`}`}
                    >
                      {signedCompact(displayDelta)}
                    </span>
                  ) : seat.isWinner ? (
                    <span className={`${styles.seatDelta} ${styles.seatDeltaUp}`}>Ngata</span>
                  ) : (
                    <span className={styles.seatDeltaMuted}>—</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Réactions rapides 👏 et 🔥 exactes de Blason Chef */}
          <div className={styles.reactionsCol} aria-label="Réactions rapides">
            <button
              type="button"
              data-nj-skin="none"
              className={`${styles.reactBtn} ${styles.reactClap}`}
              onClick={(event) => launchReactionBubble("👏", event.currentTarget)}
              aria-label="Envoyer une réaction Bravo"
            >
              👏
            </button>
            <button
              type="button"
              data-nj-skin="none"
              className={`${styles.reactBtn} ${styles.reactFire}`}
              onClick={(event) => launchReactionBubble("🔥", event.currentTarget)}
              aria-label="Envoyer une réaction Chaud"
            >
              🔥
            </button>
          </div>
        </div>
      )}

      {/* ── Statuts Revanche & Boutons d'Action 3D ── */}
      <div className={styles.footerWrap}>
        {incomingRematchRequester && !nextRequested && !roomDissolved && (
          <div className={styles.rematchInvitePill} role="status" aria-live="polite">
            <span className={styles.rematchInviteDot} aria-hidden="true" />
            <span><strong>{incomingRematchRequester.name}</strong> demande une revanche !</span>
          </div>
        )}

        {roomDissolved && (
          <div className={styles.roomGonePill} role="status" aria-live="polite">
            Les autres joueurs ont quitté la table
          </div>
        )}

        {gameMode === "event" ? (
          <ResultActions>
            <button
              type="button"
              data-nj-skin="none"
              className={`${styles.ctaPrimary}${win.isYou ? ` ${styles.ctaPrimaryWin}` : ` ${styles.ctaPrimaryRevive}`}`}
              onClick={onMenu}
              aria-label="Retour au parcours de l'événement"
            >
              <span className={styles.ctaGlyph} aria-hidden="true">→</span>
              <span>{win.isYou ? "Voir ma progression" : "Retour au parcours"}</span>
            </button>
          </ResultActions>
        ) : (
          <ResultActions status={roomDissolved ? null : nextRound.status}>
            <button
              type="button"
              data-nj-skin="none"
              className={`${styles.ctaPrimary}${
                win.isYou || incomingRematchRequester
                  ? ` ${styles.ctaPrimaryWin}`
                  : ` ${styles.ctaPrimaryRevive}`
              }`}
              onClick={handleNext}
              disabled={!effectiveCanNext || (nextRequested && !nextRequiresConsensus)}
              aria-label={nextRound.label}
            >
              <span className={styles.ctaGlyph} aria-hidden="true">{nextRequested ? "✓" : "↻"}</span>
              <span>
                {nextRequested && nextRequiresConsensus
                  ? "Voir la revanche"
                  : incomingRematchRequester && !nextRequested
                    ? "Accepter"
                    : nextRound.short}
              </span>
            </button>

            <button
              type="button"
              data-nj-skin="none"
              className={styles.ctaSecondary}
              onClick={onMenu}
              aria-label="Quitter la table et revenir au menu"
            >
              <span className={styles.ctaGlyph} aria-hidden="true">⌂</span>
              <span>Menu</span>
            </button>
          </ResultActions>
        )}
      </div>
    </div>
  );

  const rematchMain = (
    <RematchView
      room={currentRoom}
      currentUid={user?.uid}
      gameMode={gameMode}
      mise={mise}
      previousPlayers={result.players}
      motionProfile={motion}
      onShowResult={() => setShowRematchScreen(false)}
      onLeave={onMenu}
    />
  );

  return (
    <ResultLayout
      ref={rootRef}
      panelRef={panelRef}
      titleId={titleId}
      descriptionId={summaryId}
      motionMode={motion.mode}
      reducedMotion={motion.reduced}
      scriptedMotion={scriptedMotion && !showRematchScreen}
      main={showRematchScreen && nextRequiresConsensus ? rematchMain : main}
      outcome={win.isYou ? "win" : "loss"}
      decoration={
        motion.enabled && motion.allowDecorativeLoop ? (
          <div className="nj-result-aura" aria-hidden="true" />
        ) : null
      }
      foregroundDecoration={
        !showRematchScreen ? (
          <VictoryConfetti
            motion={motion}
            outcome={win.isYou ? "win" : "loss"}
            emphatic={Boolean(result.doubles || isSeriesMatch)}
          />
        ) : null
      }
    />
  );
}
