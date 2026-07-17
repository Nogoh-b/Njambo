"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import { PlayCard } from "@/components/cards/PlayCard";
import { PowerCardView } from "@/components/power/PowerCardView";
import { PowerTargetModal } from "@/components/power/PowerTargetModal";
import { usePowerFxOrchestrator } from "@/components/power/PowerFxOrchestrator";
import { Avatar } from "@/components/table/Avatar";
import { DepositZone } from "@/components/table/DepositZone";
import { Fan } from "@/components/table/Fan";
import { FlyingCard } from "@/components/table/FlyingCard";
import { DeckZone } from "@/components/table/zones/DeckZone";
import { RevealOverlay } from "@/components/table/zones/RevealOverlay";
import { ZoneRegistry, ZoneRegistryProvider } from "@/components/table/zones/ZoneRegistry";
import { NjamboIcon, NjamboMark } from "@/components/ui/Art";
import { Chip } from "@/components/ui/Chip";
import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import { GAME_CONFIG } from "@/config/gameConfig";
import { DEV, devEquippedPowers } from "@/config/devConfig";
import { CEREMONIAL_STRIP, T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useInventory } from "@/contexts/EconomyContext";
import { BOTS, NKAP } from "@/data/mock";
import { powerRequiresTarget as requiresTarget, powerScriptOf } from "@/config/powers";
import { selectInHand } from "@/engine/power/selectors";
import type {
  ChoiceRequest,
  PowerCardChoice,
  PowerChoices,
  PowerFxPreset,
  PowerFxTone,
} from "@/engine/power/types";
import { useAuth } from "@/hooks/useAuth";
import { useViewport } from "@/hooks/useViewport";
import { loadGsap, useGsapTimeline, useMotionProfile, type MotionLevel } from "@/lib/motion";
import { markPerformance, recordBoardRender } from "@/lib/performanceMetrics";
import { REACTION_EMOJIS, listenReactions, sendReaction } from "@/lib/reactions";
import { LocalGameSync } from "@/sync/LocalGameSync";
import { AuthoritativeGameSync } from "@/sync/AuthoritativeGameSync";
import { stabilizeGameState } from "@/sync/stateIdentity";
import type {
  BotDifficulty,
  Card,
  Flight,
  GameState,
  GameSyncActions,
  Phase,
  Player,
  PowerCardId,
  Result,
  RoomPlayer,
  Suit,
  SyncStatus,
} from "@/types/game";

/* ═══════════════ TableScreen — la table de jeu ═══════════════
   Rendu pur de la table + animations.
   La logique de jeu est déléguée au GameSync (Local ou Firestore). */

interface TableScreenProps {
  gameMode: "bot" | "online" | "friends" | "event";
  onResult: (result: Result) => void;
  onRoundRestart: () => void;
  onMenu: () => void;
  initialBotCount?: number;
  initialMise?: number;
  initialDifficulty?: BotDifficulty;
  roomId?: string;
  roomPlayers?: RoomPlayer[];
  roomHostId?: string;
  eventRunId?: string;
  onNextRoundRef: { current: (() => void) | null };
  paused?: boolean;
}

interface CardBurst {
  key: string;
  left: number;
  top: number;
  tone: string;
}

type ReactionTone = "gold" | "teal" | "pink";

interface TableReaction {
  key: string;
  label: string;
  detail?: string;
  tone: ReactionTone;
}

type MomentOverlayType = "roundStart" | "yourTurn" | "dominance" | "win" | "doubleWin";
type MomentOverlayAsset = "cards" | "mark" | "crown" | "trophy" | "coin";

interface MomentOverlay {
  key: string;
  type: MomentOverlayType;
  title: string;
  subtitle?: string;
  tone: ReactionTone;
  asset: MomentOverlayAsset;
  /** Durée d'affichage (ms) — la timeline GSAP s'y cale (entrée + maintien + sortie). */
  durationMs?: number;
}

interface ReactionBubble {
  key: string;
  uiIdx: number;
  emoji: string;
}

class TurnTimerStore {
  private seconds: number;
  private readonly listeners = new Set<() => void>();

  constructor(initialSeconds: number) {
    this.seconds = initialSeconds;
  }

  getSnapshot = () => this.seconds;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  set(seconds: number) {
    if (seconds === this.seconds) return;
    this.seconds = seconds;
    this.listeners.forEach((listener) => listener());
  }
}

interface TimerAvatarProps {
  store: TurnTimerStore;
  player: Player;
  seatIdx: number;
  active: boolean;
  turnSeconds: number;
  size: number;
  className: string;
  style: CSSProperties;
  motionEnabled: boolean;
}

const TimerAvatar = memo(function TimerAvatar({
  store,
  player,
  seatIdx,
  active,
  turnSeconds,
  size,
  className,
  style,
  motionEnabled,
}: TimerAvatarProps) {
  const seconds = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return (
    <div
      className={`${className}${motionEnabled && active && seconds <= 5 ? " nj-avatar-seat-urgent" : ""}`}
      style={style}
    >
      <Avatar
        p={player}
        seatIdx={seatIdx}
        active={active}
        seconds={active ? seconds : turnSeconds}
        turnSeconds={turnSeconds}
        size={size}
      />
    </div>
  );
});

interface TransientSnapshot {
  flights: Flight[];
  cardBursts: CardBurst[];
  reactionBubbles: ReactionBubble[];
}

class TransientAnimationStore {
  private snapshot: TransientSnapshot = { flights: [], cardBursts: [], reactionBubbles: [] };
  private readonly listeners = new Set<() => void>();

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(next: Partial<TransientSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener());
  }

  setFlights = (updater: (current: Flight[]) => Flight[]) => {
    this.update({ flights: updater(this.snapshot.flights) });
  };

  setCardBursts = (updater: (current: CardBurst[]) => CardBurst[]) => {
    this.update({ cardBursts: updater(this.snapshot.cardBursts) });
  };

  setReactionBubbles = (updater: (current: ReactionBubble[]) => ReactionBubble[]) => {
    this.update({ reactionBubbles: updater(this.snapshot.reactionBubbles) });
  };

  clear() {
    this.update({ flights: [], cardBursts: [], reactionBubbles: [] });
  }
}

const TransientAnimationLayer = memo(function TransientAnimationLayer({
  store,
  motionEnabled,
  liteMotion,
  reactionPosition,
}: {
  store: TransientAnimationStore;
  motionEnabled: boolean;
  liteMotion: boolean;
  reactionPosition: (uiIdx: number) => { left: string; top: string };
}) {
  const { flights, cardBursts, reactionBubbles } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  return (
    <>
      {flights.map((flight) => (
        <FlyingCard key={flight.key} f={flight} effects={motionEnabled && !liteMotion} />
      ))}
      {motionEnabled && !liteMotion && cardBursts.map((burst) => (
        <div
          key={burst.key}
          className="nj-card-burst"
          style={{ left: burst.left, top: burst.top, "--burst-tone": burst.tone } as CSSProperties}
          aria-hidden="true"
        >
          <span /><span /><span /><span />
        </div>
      ))}
      {reactionBubbles.map((bubble) => {
        const position = reactionPosition(bubble.uiIdx);
        return (
          <div
            key={bubble.key}
            style={{
              position: "absolute",
              left: position.left,
              top: position.top,
              transform: "translate(-50%,-140%)",
              zIndex: 55,
              pointerEvents: "none",
            }}
            aria-hidden="true"
          >
            <span className="nj-reaction-bubble" style={{ animation: "reactionFloat 2.4s ease-out both" }}>
              {bubble.emoji}
            </span>
          </div>
        );
      })}
    </>
  );
});

interface MomentOverlayRequest {
  moment: Omit<MomentOverlay, "key">;
  duration: number;
}

const TABLE_READABILITY_MS = GAME_CONFIG.anim.moment;
const ROUND_INTRO_MS = GAME_CONFIG.anim.roundIntro;
const MOMENT_DEFAULT_MS = GAME_CONFIG.anim.moment;
const TABLE_REACTION_MS = GAME_CONFIG.anim.moment;
const POWER_OVERLAY_MS = GAME_CONFIG.anim.powerMax;

function isLiteMotion(level: MotionLevel): boolean {
  return level === "lite";
}

function isBalancedMotion(level: MotionLevel): boolean {
  return level === "balanced";
}

function GameMomentOverlay({ moment, motionLevel }: { moment: MomentOverlay; motionLevel: MotionLevel }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lite = isLiteMotion(motionLevel);
  const balanced = isBalancedMotion(motionLevel);

  /* Séquence scriptée GSAP : fond, halo, cartes qui balayent, sceau, titre,
     sous-titre — entrée, MAINTIEN (étiré selon la durée d'affichage), sortie.
     Le reflet du titre (::after) et l'éclat de particules restent en CSS. */
  useGsapTimeline(true, rootRef, (gsap) => {
    const durationSec = Math.max(0.72, (moment.durationMs ?? 1550) / 1000 * (lite ? 0.62 : balanced ? 0.8 : 1));
    // La sortie démarre ~0,34s avant l'unmount ; le maintien remplit le reste.
    const exitLead = lite ? 0.22 : balanced ? 0.28 : 0.34;
    const exitAt = Math.max(lite ? 0.48 : 0.72, durationSec - exitLead);
    const cross = exitAt + 0.34; // les cartes dérivent sur toute la fenêtre

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    tl.fromTo(rootRef.current, { opacity: 0 }, { opacity: 1, duration: 0.16 }, 0)
      .to(rootRef.current, { opacity: 0, duration: 0.32, ease: "power1.in" }, exitAt + 0.02);

    tl.fromTo(".nj-moment-halo",
      { opacity: 0, scale: 0.72, rotate: -18 },
      { opacity: 0.95, scale: 1, rotate: 6, duration: 0.5, ease: "power2.out" }, 0)
      .to(".nj-moment-halo", { opacity: 0, scale: 1.18, rotate: 36, duration: 0.6, ease: "power1.in" }, exitAt - 0.15);

    // Les cartes sweep ne sont pas rendues en mode lite (cf. JSX plus bas) :
    // ne pas créer leurs tweens sinon GSAP warn « target not found ».
    if (!lite) {
      tl.fromTo(".nj-moment-card-sweep-left",
        { opacity: 0, x: "-18vw", y: 24, rotate: -28, scale: 0.82 },
        { x: "54vw", y: -12, rotate: 18, scale: 1.05, duration: cross, ease: "power1.inOut" }, 0)
        .to(".nj-moment-card-sweep-left", { opacity: 1, duration: 0.22, ease: "power2.out" }, 0)
        .to(".nj-moment-card-sweep-left", { opacity: 0, duration: 0.36, ease: "power1.in" }, exitAt - 0.05);

      tl.fromTo(".nj-moment-card-sweep-right",
        { opacity: 0, x: "18vw", y: -18, rotate: 26, scale: 0.78 },
        { x: "-54vw", y: 16, rotate: -18, scale: 1.02, duration: cross, ease: "power1.inOut" }, 0.08)
        .to(".nj-moment-card-sweep-right", { opacity: 0.92, duration: 0.22, ease: "power2.out" }, 0.08)
        .to(".nj-moment-card-sweep-right", { opacity: 0, duration: 0.36, ease: "power1.in" }, exitAt);
    }

    tl.fromTo(".nj-moment-asset",
      { opacity: 0, xPercent: -50, y: 18, scale: 0.66, rotate: -8 },
      { opacity: 1, xPercent: -50, y: 0, scale: 1, rotate: 0, duration: 0.55, ease: "back.out(2)" }, 0.08)
      .to(".nj-moment-asset", { opacity: 0, xPercent: -50, y: -18, scale: 0.9, rotate: 5, duration: 0.32, ease: "power1.in" }, exitAt + 0.02);

    tl.fromTo(".nj-moment-copy strong",
      { opacity: 0, y: 24, scale: 0.72 },
      { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, 0.12)
      .to(".nj-moment-copy strong", { opacity: 0, y: -16, scale: 0.92, duration: 0.32, ease: "power1.in" }, exitAt);

    tl.fromTo(".nj-moment-copy span",
      { opacity: 0, y: 12, scale: 0.88 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "power3.out" }, 0.2)
      .to(".nj-moment-copy span", { opacity: 0, y: -8, scale: 0.96, duration: 0.3, ease: "power1.in" }, exitAt + 0.02);
  });

  return (
    <div ref={rootRef} className={`nj-moment-overlay nj-moment-${moment.tone} nj-moment-${moment.type}`} aria-hidden="true">
      <div className="nj-moment-halo" />
      {!lite && (
        <>
          <div className="nj-moment-card-sweep nj-moment-card-sweep-left">
            <PlayCard hidden w={52} />
          </div>
          <div className="nj-moment-card-sweep nj-moment-card-sweep-right">
            <PlayCard hidden w={46} />
          </div>
        </>
      )}
      <div className="nj-moment-asset">
        {moment.asset === "mark" && <NjamboMark size={94} compact />}
        {moment.asset === "cards" && <NjamboIcon name="cards" tone="gold" size={78} />}
        {moment.asset === "crown" && <NjamboIcon name="crown" tone="gold" size={82} />}
        {moment.asset === "trophy" && <NjamboIcon name="trophy" tone="gold" size={82} />}
        {moment.asset === "coin" && <NjamboIcon name="coin" tone="gold" size={82} />}
      </div>
      <div className="nj-moment-copy">
        <strong>{moment.title}</strong>
        {moment.subtitle && <span>{moment.subtitle}</span>}
      </div>
      <div className="nj-moment-particles">
        {Array.from({ length: lite ? 4 : balanced ? 6 : 8 }, (_, index) => (
          <i
            key={index}
            style={{
              "--particle-angle": `${index * 45}deg`,
              "--particle-delay": `${index * 28}ms`,
            } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}

export function TableScreen({
  gameMode,
  onResult,
  onRoundRestart,
  onMenu,
  initialBotCount = 2,
  initialMise = 250,
  initialDifficulty = "normal",
  roomId,
  roomPlayers,
  roomHostId,
  eventRunId,
  onNextRoundRef,
  paused = false,
}: TableScreenProps) {
  useEffect(() => {
    markPerformance("table:mount");
    return () => markPerformance("table:unmount");
  }, []);
  useEffect(() => recordBoardRender());
  const { profile, cfg, sfx } = useGame();
  const motion = useMotionProfile();
  const { user: authUser } = useAuth();
  const authUid = authUser?.uid ?? "";
  /* Prédicat UNIQUE de sélection du sync : partagé entre l'instanciation du
     sync et le sourcing des pouvoirs équipés — s'ils divergent, on afficherait
     des pouvoirs locaux sur un match serveur (→ POWER_NOT_EQUIPPED). */
  const isLocalSync = gameMode === "bot" && (!authUser || authUser.isAnonymous);
  const serverInventory = useInventory();
  const A = cfg.anim;
  const mise = initialMise;
  const roomPlayersKey = roomPlayers?.map((p) => p.uid).join("|") ?? "";
  const roomSessionReady = Boolean(roomId && roomHostId && roomPlayers?.length);
  // Clé d'identité de session : en mode bot, l'auth n'a aucun rôle → on ne
  // veut PAS relancer (re-distribuer) la partie quand l'auth Firebase se
  // résout après le montage. Seuls online/friends dépendent de l'uid.
  const sessionAuthKey = `${authUid}:${authUser?.isAnonymous ? "guest" : "account"}`;

  /* ----- responsive ----- */
  const vp = useViewport();
  const portrait = vp.portrait;
  const vmin = Math.min(vp.w, vp.h);
  const youW = Math.round(Math.max(48, Math.min(78, vmin * 0.165)));
  const botW = Math.round(youW * 0.66);
  const depW = Math.round(Math.max(38, youW * 0.78));
  const deckW = Math.round(youW * 0.7);
  const fanHy = youW * 1.45;
  const fanHb = botW * 1.45;
  const tableInset = portrait
    ? "5% -8% 7% -8%"
    : vp.h <= 620
      ? "10% 8% 12% 8%"
      : "8% 4% 10% 4%";

  /* ----- État synchronisé (provenant du sync adapter) ----- */
  const [gameState, setGameState] = useState<GameState>({
    phase: "idle",
    trickNo: 1,
    trickPlays: [],
    leaderIdx: 0,
    turnIdx: 0,
    pot: 0,
    dominantIdx: null,
    banner: "",
    players: [],
  });

  /* ----- État d'animation (local au TableScreen) ----- */
  const transientStoreRef = useRef<TransientAnimationStore | null>(null);
  if (!transientStoreRef.current) transientStoreRef.current = new TransientAnimationStore();
  const transientStore = transientStoreRef.current;
  const setFlights = transientStore.setFlights;
  const setCardBursts = transientStore.setCardBursts;
  const setReactionBubbles = transientStore.setReactionBubbles;
  const [roundIntro, setRoundIntro] = useState(false);
  const [momentOverlay, setMomentOverlay] = useState<MomentOverlay | null>(null);
  const [tableReaction, setTableReaction] = useState<TableReaction | null>(null);
  const [goldFlash, setGoldFlash] = useState(false);
  const [screenEffect] = useState<"win" | "lose" | null>(null);
  const [banner, setBanner] = useState("");
  const [powerChoiceConfirm, setPowerChoiceConfirm] = useState<{
    selected: number;
    min: number;
    max: number;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);
  /* Confirmation avant de quitter une partie EN COURS (abandon + retour menu). */
  const [confirmQuit, setConfirmQuit] = useState(false);
  const timerStoreRef = useRef<TurnTimerStore | null>(null);
  if (!timerStoreRef.current) timerStoreRef.current = new TurnTimerStore(cfg.turnSeconds);
  const timerStore = timerStoreRef.current;
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: gameMode === "bot" ? "live" : "connecting",
    updatedAt: Date.now(),
  });

  /* ----- Cartes pouvoir (UI d'activation) -----
     Sync serveur → source de vérité = inventaire serveur (equippedCards,
     validé par usePowerCardHandler), enveloppée par les triches dev
     (NEXT_PUBLIC_DEV_ALL_POWERS/POWER_COUNT — le serveur accepte via
     POWERS_DEV_BYPASS) ; sync local (invité) → profil local. */
  const fallbackEquippedPowers: PowerCardId[] = isLocalSync
    ? (profile.equippedPowers ?? [])
    : devEquippedPowers((serverInventory.equippedCards ?? []) as PowerCardId[]);
  const [usedPowers, setUsedPowers] = useState<Set<PowerCardId>>(new Set());
  const [targetingCard, setTargetingCard] = useState<PowerCardId | null>(null);

  /* ----- Registre des zones (mains, dépôts, timers, pioche, révélation) -----
     Les zones s'y auto-enregistrent avec leurs handles d'animation ; les vols
     de cartes et l'orchestrateur des pouvoirs les pilotent par là. */
  const registryRef = useRef<ZoneRegistry | null>(null);
  if (!registryRef.current) registryRef.current = new ZoneRegistry();
  const zoneRegistry = registryRef.current;

  const tableRootRef = useRef<HTMLDivElement>(null);
  const gsapRef = useRef<Awaited<ReturnType<typeof loadGsap>> | null>(null);

  const animatingRef = useRef(false);
  const animationEndsAtRef = useRef(0);
  const syncRef = useRef<GameSyncActions | null>(null);
  const playersRef = useRef<GameState["players"]>([]);
  const turnIdxRef = useRef(0);
  const delayedStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const powerTransitionDepthRef = useRef(0);
  const pendingPowerStateRef = useRef<GameState | null>(null);
  const animatedPlayIdsRef = useRef<Set<string>>(new Set());
  const animationsOnRef = useRef(motion.enabled);
  const sfxRef = useRef(sfx);
  const burstTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const prevPhaseRef = useRef<Phase>("idle");
  const prevTurnIdxFxRef = useRef<number | null>(null);
  const roundIntroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dealSweepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const momentOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const momentOverlayQueueRef = useRef<MomentOverlayRequest[]>([]);
  const momentOverlayActiveRef = useRef(false);
  const roundRestartPendingRef = useRef(false);

  /* ----- Dérivés de l'état ----- */
  const { players, phase, trickNo, trickPlays, turnIdx, pot, dominantIdx } = gameState;
  useEffect(() => {
    if (phase === "dealing") markPerformance("distribution:start");
    if (phase === "turns") markPerformance("distribution:ready");
  }, [phase]);
  const n = players.length;
  const expectedPlayerCount = n || (gameMode === "bot" || gameMode === "event" ? initialBotCount + 1 : roomPlayers?.length ?? 0);
  const displayedPot = roundIntro ? mise * Math.max(expectedPlayerCount, 1) : pot;
  const you = players[0];
  const yourHand = you?.hand;
  const authoritativePowers = you?.equippedPowers?.length
    ? you.equippedPowers
    : (serverInventory.equippedCards ?? []) as PowerCardId[];
  const equippedPowers: PowerCardId[] = isLocalSync
    ? fallbackEquippedPowers
    : devEquippedPowers(authoritativePowers);
  const ledSuit: string | null = trickPlays[0]?.card.suit ?? null;
  const ledInfo: Suit | undefined = ledSuit ? cfg.suits.find((s) => s.s === ledSuit) : undefined;
  const isYourTurn = phase === "turns" && turnIdx === 0;
  const yourLegal = useMemo(
    () => yourHand && isYourTurn ? legalCards(yourHand, ledSuit) : null,
    [isYourTurn, ledSuit, yourHand],
  );

  /* Quitter : confirmation quand une partie est EN COURS ; sinon retour direct.
     En ligne, la confirmation serveur précède toujours le retour au menu. */
  const matchInProgress = phase === "turns" || phase === "dealing" || phase === "trickEnd";
  const handleMenuTap = () => {
    if (matchInProgress) setConfirmQuit(true);
    else onMenu();
  };
  const handleQuitConfirm = async () => {
    setConfirmQuit(false);
    try {
      await syncRef.current?.abandon?.();
      onMenu();
    } catch {
      setBanner("Abandon impossible. Vérifiez votre connexion puis réessayez.");
    }
  };
  const motionEnabled = motion.enabled;
  const motionLevel = motion.level;
  const liteMotion = isLiteMotion(motionLevel);
  const balancedMotion = isBalancedMotion(motionLevel);
  const premiumFxAllowed = motionLevel === "full";
  const baseTableFx = roundIntro || phase === "dealing" || !!momentOverlay || !!tableReaction;
  const getYourDropRect = useCallback(() => registryRef.current?.deposit(0)?.getRect() ?? null, []);

  useEffect(() => {
    playersRef.current = players;
    turnIdxRef.current = turnIdx;
  }, [players, turnIdx]);

  const gameStateRef = useRef<GameState | null>(null);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    animationsOnRef.current = motionEnabled;
  }, [motionEnabled]);

  useEffect(() => {
    sfxRef.current = sfx;
  }, [sfx]);

  /* ----- Fonction legalCards locale (réexport pour le dérivé) ----- */
  function legalCards(hand: { suit: string }[], led: string | null): number[] {
    if (!led) return hand.map((_, i) => i);
    const inSuit = hand.map((c, i) => (c.suit === led ? i : -1)).filter((i) => i >= 0);
    return inSuit.length > 0 ? inSuit : hand.map((_, i) => i);
  }

  /* ----- sièges ----- */
  const EDGES: Record<number, ("left" | "top" | "right")[]> = {
    1: ["top"],
    2: ["left", "right"],
    3: ["left", "top", "right"],
  };
  const seatEdge = (i: number): "bottom" | "left" | "top" | "right" =>
    i === 0 ? "bottom" : EDGES[players.length - 1]?.[i - 1] ?? "top";
  const seatAngle: Record<"bottom" | "left" | "top" | "right", number> = {
    bottom: 0,
    left: 90,
    top: 180,
    right: 270,
  };

  const fanAnchor = (edge: "bottom" | "left" | "top" | "right") => {
    const bleedY = fanHy * 0.35;
    const bleedB = fanHb * 0.28;
    switch (edge) {
      case "bottom":
        return { left: "50%", top: `calc(100% - ${bleedY}px)`, angle: 0 };
      case "top":
        return { left: "50%", top: `${bleedB}px`, angle: 180 };
      case "left":
        return { left: `${bleedB}px`, top: portrait ? "42%" : "44%", angle: 90 };
      case "right":
        return { left: `calc(100% - ${bleedB}px)`, top: portrait ? "42%" : "44%", angle: 270 };
      default:
        return { left: "50%", top: "50%", angle: 0 };
    }
  };
  const depositPos = (edge: "bottom" | "left" | "top" | "right") => {
    switch (edge) {
      case "bottom":
        return { left: "50%", top: portrait ? "63%" : "66%" };
      case "top":
        return { left: "50%", top: portrait ? "27%" : "24%" };
      case "left":
        return { left: portrait ? "29%" : "33%", top: "45%" };
      case "right":
        return { left: portrait ? "71%" : "67%", top: "45%" };
      default:
        return { left: "50%", top: "50%" };
    }
  };
  const avatarPos = (edge: "bottom" | "left" | "top" | "right"): React.CSSProperties => {
    switch (edge) {
      case "bottom":
        return { right: 10, bottom: 10 };
      case "top": {
        // 2 joueurs = centré, 3+ joueurs = décalé gauche mais plafonné à 15% du viewport
        const rawOffset = n <= 2 ? 0 : botW * 3.2;
        const offset = Math.max(0, Math.min(vp.w * 0.15, rawOffset));
        return { left: "50%", top: 8, transform: `translateX(calc(-50% - ${offset}px))` };
      }
      case "left":
        return { left: 10, top: portrait ? "17%" : "10%" };
      case "right":
        return { right: 10, top: portrait ? "17%" : "10%" };
      default:
        return {};
    }
  };

  /* ----- Callbacks pour le sync ----- */
  // Le solde affiché vient désormais du snapshot economy. L'adapter local invité
  // peut calculer un pot pour l'animation, mais il ne modifie aucune ressource.
  const handleUpdateBalance = useCallback(() => {}, []);

  const handleBanner = useCallback((text: string) => {
    setBanner(text);
  }, []);

  /* Précharge GSAP dès que les animations sont actives (client-only). */
  useEffect(() => {
    if (!motionEnabled) return;
    let mounted = true;
    loadGsap().then((g) => {
      if (mounted) gsapRef.current = g;
    });
    return () => {
      mounted = false;
    };
  }, [motionEnabled]);

  /* Secousse d'impact GSAP sur toute la table (fin de pli, victoire). */
  const impactShake = useCallback((intensity = 8) => {
    const g = gsapRef.current;
    const el = tableRootRef.current;
    if (!g || !el || !animationsOnRef.current) return;
    g.fromTo(
      el,
      { x: 0, y: 0 },
      {
        x: `random(${-intensity}, ${intensity})`,
        y: `random(${-intensity * 0.6}, ${intensity * 0.6})`,
        duration: 0.055,
        repeat: 7,
        yoyo: true,
        ease: "power1.inOut",
        onComplete: () => g.set(el, { x: 0, y: 0 }),
      },
    );
  }, []);

  /* Révélation d'ouverture de manche (GSAP) : les mains puis les sièges
     apparaissent en cascade (stagger). On n'anime QUE opacity + filter —
     jamais transform, qui porte le positionnement de chaque siège/main. */
  useGsapTimeline(motionEnabled && roundIntro && n > 0, tableRootRef, (gsap) => {
    gsap.fromTo(".nj-round-hand-reveal",
      { opacity: 0 },
      { opacity: 1, duration: 0.48, ease: "power2.out", stagger: 0.05 });
    gsap.fromTo(".nj-round-seat-reveal",
      { opacity: 0 },
      { opacity: 1, duration: 0.48, ease: "power2.out", stagger: 0.11 });
  }, [roundIntro, n]);

  const consumeConfirmedPowerInventory = useCallback((cardIds: PowerCardId[]) => {
    // Les cartes acquises sont permanentes : leur activation ne retire plus
    // la possession ni l'équipement du joueur.
    void cardIds;
  }, []);

  const uiIndexFromPowerUid = useCallback((uid?: string): number | null => {
    if (!uid) return null;
    if (uid === "local") return 0;
    if (uid.startsWith("bot-")) {
      const idx = Number(uid.slice(4));
      return Number.isFinite(idx) ? idx : null;
    }
    // Sync serveur : moi = seat 0 en mode bot/event PvE ; les bots serveur
    // (`bot_<matchId>_<n>`) occupent les seats suivants dans l'ordre.
    if (authUid && uid === authUid) return 0;
    if (uid.startsWith("bot_")) {
      const idx = Number(uid.slice(uid.lastIndexOf("_") + 1));
      return Number.isFinite(idx) ? idx + 1 : null;
    }
    if (!authUid || !roomPlayers?.length) return null;
    const serverIdx = roomPlayers.findIndex((player) => player.uid === uid);
    const myIdx = roomPlayers.findIndex((player) => player.uid === authUid);
    if (serverIdx < 0 || myIdx < 0) return null;
    return (serverIdx - myIdx + roomPlayers.length) % roomPlayers.length;
  }, [authUid, roomPlayers]);

  const playNextMomentOverlay = useCallback(() => {
    if (!animationsOnRef.current) {
      momentOverlayQueueRef.current = [];
      momentOverlayActiveRef.current = false;
      setMomentOverlay(null);
      return;
    }

    const next = momentOverlayQueueRef.current.shift();
    if (!next) {
      momentOverlayActiveRef.current = false;
      setMomentOverlay(null);
      return;
    }

    momentOverlayActiveRef.current = true;
    setMomentOverlay({
      ...next.moment,
      key: `${next.moment.type}-${Date.now()}`,
      durationMs: next.duration,
    });

    /* Secousse d'impact sur les moments forts (pli dominé, ngata gagné). */
    if (next.moment.type === "dominance") impactShake(7);
    else if (next.moment.type === "win" || next.moment.type === "doubleWin") impactShake(12);

    if (momentOverlayTimerRef.current) clearTimeout(momentOverlayTimerRef.current);
    momentOverlayTimerRef.current = setTimeout(() => {
      momentOverlayTimerRef.current = null;
      playNextMomentOverlay();
    }, next.duration);
  }, [impactShake]);

  const showMomentOverlay = useCallback((
    moment: Omit<MomentOverlay, "key">,
    duration = MOMENT_DEFAULT_MS,
  ) => {
    if (!animationsOnRef.current) return;
    momentOverlayQueueRef.current.push({ moment, duration });
    if (!momentOverlayActiveRef.current) playNextMomentOverlay();
  }, [playNextMomentOverlay]);

  const showTableReaction = useCallback((label: string, tone: ReactionTone = "gold", detail?: string) => {
    if (!animationsOnRef.current) return;
    if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
    setTableReaction({
      key: `${label}-${Date.now()}`,
      label,
      detail,
      tone,
    });
    reactionTimerRef.current = setTimeout(() => {
      setTableReaction(null);
      reactionTimerRef.current = null;
    }, TABLE_REACTION_MS);
  }, []);

  /* ----- Orchestrateur générique des animations de pouvoir ----- */

  /** seat moteur (activation.resolved.targetSeats) → index UI (0 = moi). */
  const uiIndexFromSeat = useCallback((seat: number): number => {
    if (gameMode === "bot" || !authUid || !roomPlayers?.length) return seat;
    const myIdx = roomPlayers.findIndex((player) => player.uid === authUid);
    if (myIdx < 0) return seat;
    return (seat - myIdx + roomPlayers.length) % roomPlayers.length;
  }, [gameMode, authUid, roomPlayers]);

  /** Vol de carte générique (pouvoirs) — carte null = vol face cachée. */
  const launchFlight = useCallback((req: {
    card: Card | null;
    from: DOMRect;
    to: DOMRect;
    faceUp: boolean;
    angle?: number;
    fxPreset?: PowerFxPreset;
    fxTone?: PowerFxTone;
    onArrive?: () => void;
  }): Promise<void> => {
    const card: Card = req.card ?? { rank: "?", value: 0, suit: "?", color: "#888", id: `power-flight-${Date.now()}` };
    const key = `${card.id}-pfl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setFlights((f) => [
      ...f,
      {
        key,
        card,
        from: req.from,
        to: req.to,
        w: depW,
        angle: req.angle ?? 0,
        dropRot: Math.random() * 14 - 7,
        isYou: req.faceUp,
        faceUp: req.faceUp,
        fxPreset: req.fxPreset,
        fxTone: req.fxTone,
      },
    ]);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        setFlights((f) => f.filter((flight) => flight.key !== key));
        req.onArrive?.();
        resolve();
      }, A.dropFlight);
      burstTimersRef.current.push(timer);
    });
  }, [A.dropFlight, depW, setFlights]);

  const beginStateTransition = useCallback(() => {
    if (powerTransitionDepthRef.current === 0) {
      pendingPowerStateRef.current = null;
      if (delayedStateTimerRef.current) {
        clearTimeout(delayedStateTimerRef.current);
        delayedStateTimerRef.current = null;
      }
    }
    powerTransitionDepthRef.current += 1;
    animatingRef.current = true;
    timerStore.set(cfg.turnSeconds);
  }, [cfg.turnSeconds, timerStore]);

  const commitStateTransition = useCallback(() => {
    const pending = pendingPowerStateRef.current;
    if (!pending) return;
    pendingPowerStateRef.current = null;
    setGameState((prev) => stabilizeGameState(prev, pending));
  }, []);

  const endStateTransition = useCallback(() => {
    commitStateTransition();
    powerTransitionDepthRef.current = Math.max(0, powerTransitionDepthRef.current - 1);
    if (powerTransitionDepthRef.current === 0) {
      animatingRef.current = Date.now() < animationEndsAtRef.current - 20;
    }
  }, [commitStateTransition]);

  const orchestrator = usePowerFxOrchestrator({
    registry: zoneRegistry,
    motionEnabled,
    liteMotion,
    balancedMotion,
    overlayMs: POWER_OVERLAY_MS,
    flightMs: A.dropFlight,
    uiIndexFromUid: uiIndexFromPowerUid,
    uiIndexFromSeat,
    getPlayers: () => playersRef.current,
    playSfx: () => sfxRef.current((sn) => sn.dominance()),
    impactShake,
    showTableReaction,
    launchFlight,
    beginStateTransition,
    commitStateTransition,
    endStateTransition,
  });
  const orchestratorRunRef = useRef(orchestrator.run);
  orchestratorRunRef.current = orchestrator.run;
  const clearAurasRef = useRef(orchestrator.clearAuras);
  clearAurasRef.current = orchestrator.clearAuras;
  const activeTableFx = baseTableFx || orchestrator.fxActive;

  /* Les auras de protection tombent à la fin de manche / nouvelle donne. */
  useEffect(() => {
    if (phase === "result" || phase === "dealing") clearAurasRef.current();
  }, [phase]);

  useEffect(() => {
    return () => {
      if (roundIntroTimerRef.current) clearTimeout(roundIntroTimerRef.current);
      if (dealSweepTimerRef.current) clearTimeout(dealSweepTimerRef.current);
      if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
      if (momentOverlayTimerRef.current) clearTimeout(momentOverlayTimerRef.current);
      momentOverlayQueueRef.current = [];
      momentOverlayActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (motionEnabled) return;
    momentOverlayQueueRef.current = [];
    momentOverlayActiveRef.current = false;
    if (momentOverlayTimerRef.current) {
      clearTimeout(momentOverlayTimerRef.current);
      momentOverlayTimerRef.current = null;
    }
    setMomentOverlay(null);
  }, [motionEnabled]);

  useEffect(() => {
    const previousPhase = prevPhaseRef.current;
    if (previousPhase === phase) return;

    if (phase === "dealing") {
      prevTurnIdxFxRef.current = null;
      if (dealSweepTimerRef.current) clearTimeout(dealSweepTimerRef.current);
      dealSweepTimerRef.current = setTimeout(() => {
        sfxRef.current((sound) => sound.dealSweep());
        dealSweepTimerRef.current = null;
      }, 120);
    }

    if (phase === "result") {
      showTableReaction("Revanche ?", "teal", "La table reste chaude");
    }

    prevPhaseRef.current = phase;
  }, [motionEnabled, phase, showTableReaction]);

  useEffect(() => {
    if (phase !== "turns") return;
    if (prevTurnIdxFxRef.current === turnIdx) return;
    prevTurnIdxFxRef.current = turnIdx;

    const activePlayer = players[turnIdx];

    // Annonce du tour (À TOI / réaction) DIFFÉRÉE jusqu'à ce que la carte du
    // joueur précédent soit posée : sinon l'overlay démarre pendant le vol.
    const announceTurn = () => {
      if (turnIdx === 0) {
        sfxRef.current((sound) => sound.turnStart());
        showMomentOverlay({
          type: "yourTurn",
          title: "À TOI",
          subtitle: ledSuit ? `Suis ${ledSuit}` : "Donne la tendance",
          tone: "teal",
          asset: "cards",
        }, MOMENT_DEFAULT_MS);
        showTableReaction(
          ledSuit ? `Suis ${ledSuit}` : "A toi de jouer",
          "teal",
          ledSuit ? "Pose la bonne couleur" : "Donne la tendance",
        );
      } else if (motionEnabled && activePlayer) {
        showTableReaction("Tour en cours", "gold", activePlayer.name);
      }
    };

    const landDelay = Math.max(0, animationEndsAtRef.current - Date.now()) + A.landSettle;
    if (landDelay <= 0) {
      announceTurn();
      return;
    }
    const t = setTimeout(announceTurn, landDelay);
    return () => clearTimeout(t);
  }, [A.landSettle, motionEnabled, ledSuit, phase, players, showMomentOverlay, showTableReaction, turnIdx]);

  /* ----- Initialiser le sync adapter ----- */
  useEffect(() => {
    let sync: GameSyncActions;

    if (isLocalSync) {
      sync = new LocalGameSync({
        profile,
        bots: BOTS,
        cfg,
        mise,
        initialBotCount,
        difficulty: initialDifficulty,
        onResult,
        onUpdateBalance: handleUpdateBalance,
        onBanner: handleBanner,
      });
    } else if (authUid) {
      if ((gameMode === "online" || gameMode === "friends") && (!roomId || !roomHostId || !roomPlayers?.length)) {
        setBanner("Connexion a la salle...");
        return;
      }
      sync = new AuthoritativeGameSync({
        mode: gameMode,
        uid: authUid,
        hostId: roomHostId,
        roomId,
        roomPlayers,
        eventRunId,
        profile,
        stake: mise,
        botCount: initialBotCount,
        onResult,
      });
    } else {
      setBanner("Un compte permanent est requis.");
      return;
    }

    syncRef.current = sync;
    const animatedPlayIds = animatedPlayIdsRef.current;

    // Écouter les événements du sync. (La détection de swap par diff a disparu :
    // l'orchestrateur anime depuis activation.resolved, source de vérité moteur.)
    const applyIncomingState = (state: GameState) => {
      setGameState((prev) => stabilizeGameState(prev, state));
      if (roundRestartPendingRef.current && (state.phase === "dealing" || state.phase === "turns")) {
        roundRestartPendingRef.current = false;
        onRoundRestart();
      }
    };

    const unsubState = sync.onStateUpdate((state) => {
      setBanner("");
      if (powerTransitionDepthRef.current > 0) {
        pendingPowerStateRef.current = state;
        return;
      }
      if (animatingRef.current) {
        if (delayedStateTimerRef.current) clearTimeout(delayedStateTimerRef.current);
        // Révéler le dépôt réel juste avant l'atterrissage : assez tôt pour
        // qu'aucun trou n'apparaisse, assez tard pour éviter la carte en double.
        const revealBeforeLandingMs = 40;
        const delay = Math.max(0, animationEndsAtRef.current - Date.now() - revealBeforeLandingMs);
        delayedStateTimerRef.current = setTimeout(() => {
          applyIncomingState(state);
          delayedStateTimerRef.current = null;
        }, delay);
        return;
      }
      applyIncomingState(state);
    });

    const unsubPlay = sync.onPlayCard(({ playerIdx, cardIdx, card, playId }) => {
      markPerformance("card:play");
      if (playId) {
        if (animatedPlayIds.has(playId)) return;
        animatedPlayIds.add(playId);
      }

      sfxRef.current((s) => s.card());
      const handZone = zoneRegistry.hand(playerIdx);
      const from = handZone?.getCardRect(cardIdx) ?? handZone?.getRect() ?? null;
      const to = zoneRegistry.deposit(playerIdx)?.getRect() ?? null;

      if (from && to) {
        animatingRef.current = true;
        timerStore.set(cfg.turnSeconds);
        animationEndsAtRef.current = Date.now() + A.dropFlight;
        const dropRot = Math.random() * 18 - 9;
        handZone?.setHiddenCard(cardIdx);
        setFlights((f) => [
          ...f,
          {
            key: card.id + "-" + Date.now(),
            card,
            from,
            to,
            w: depW,
            angle: seatAngle[seatEdge(playerIdx)],
            dropRot,
            isYou: playerIdx === 0,
          },
        ]);
        const landingTimer = setTimeout(() => {
          animatingRef.current = false;
          setFlights((f) => f.slice(1));
          handZone?.setHiddenCard(null);
          if (animationsOnRef.current) {
            const burstKey = `${card.id}-burst-${Date.now()}`;
            setCardBursts((items) => [
              ...items,
              {
                key: burstKey,
                left: to.left + to.width / 2,
                top: to.top + to.height / 2,
                tone: card.color === "#c1292e" ? T.pink : T.gold,
              },
            ]);
            const cleanupTimer = setTimeout(() => {
              setCardBursts((items) => items.filter((item) => item.key !== burstKey));
            }, 620);
            burstTimersRef.current.push(cleanupTimer);
          }
        }, A.dropFlight);
        burstTimersRef.current.push(landingTimer);
      }
    });

    const unsubTrickEnd = sync.onTrickEnd((winnerIdx) => {
      const winnerName = playersRef.current[winnerIdx]?.name ?? "Joueur";
      // On attend que la carte décisive soit POSÉE (+ un beat de settle) avant
      // d'annoncer le gagnant : sinon « NJAMBO ! » couvre une carte encore en vol.
      const landDelay = Math.max(0, animationEndsAtRef.current - Date.now()) + A.landSettle;

      const announce = () => {
        setBanner(`${winnerName} domine le tour`);
        sfxRef.current((sound) => sound.dominance());
        showMomentOverlay({
          type: "dominance",
          title: "NJAMBO !",
          subtitle: winnerIdx === 0 ? "Tu domines le tour" : winnerName,
          tone: winnerIdx === 0 ? "teal" : "gold",
          asset: "crown",
        }, MOMENT_DEFAULT_MS + 200);
        showTableReaction(
          winnerIdx === 0 ? "Bien joué" : "Domine",
          winnerIdx === 0 ? "teal" : "gold",
          winnerIdx === 0 ? "Tu prends le tour" : winnerName,
        );
        if (animationsOnRef.current) {
          setGoldFlash(false);
          const goldTimer = setTimeout(() => setGoldFlash(true), 200);
          burstTimersRef.current.push(goldTimer);
        }
        const bannerTimer = setTimeout(() => {
          setBanner("");
          setGoldFlash(false);
        }, Math.max(700, A.trickPause - landDelay));
        burstTimersRef.current.push(bannerTimer);
      };

      if (landDelay <= 0) announce();
      else {
        const announceTimer = setTimeout(announce, landDelay);
        burstTimersRef.current.push(announceTimer);
      }
    });

    const unsubRoundEnd = sync.onRoundEnd((result) => {
      showMomentOverlay({
        type: result.doubles ? "doubleWin" : "win",
        title: result.doubles ? "X2" : "NGATA GAGNÉ",
        subtitle: result.winner.isYou ? "Tu prends la caisse" : `${result.winner.name} prend la caisse`,
        tone: result.winner.isYou ? "gold" : "pink",
        asset: result.doubles ? "coin" : result.winner.isYou ? "trophy" : "crown",
      }, result.doubles ? MOMENT_DEFAULT_MS + 600 : MOMENT_DEFAULT_MS + 350);
    });

    const unsubTimer = sync.onTimerTick((s) => {
      if (animatingRef.current || powerTransitionDepthRef.current > 0) {
        timerStore.set(cfg.turnSeconds);
        return;
      }
      timerStore.set(s);
      if (s <= 5 && playersRef.current[turnIdxRef.current]?.isYou) sfxRef.current((sn) => sn.tick());
    });

    const unsubSyncStatus = sync.onSyncStatus(setSyncStatus);

    const unsubPower = sync.onPowerActivated((activation) => {
      markPerformance("power:activate");
      const mine = activation.activatedByUid === "local" || activation.activatedByUid === authUid;
      // `activation.used` peut être FAUX si la carte n'a eu aucun effet (ex :
      // Marché de Nuit sans carte plus forte dans la pioche) — dans ce cas
      // elle N'A PAS été consommée, donc on ne doit PAS la griser dans l'UI.
      if (mine && activation.used) {
        setUsedPowers((prev) => {
          const next = new Set(prev);
          next.add(activation.cardId);
          return next;
        });
        consumeConfirmedPowerInventory(activation.consumedCardIds ?? [activation.cardId]);
      }
      // Toute l'animation est GÉNÉRIQUE : l'orchestrateur rejoue le script de
      // la carte (config/powers) depuis activation.resolved — zéro branche
      // par carte ou par tag ici. Ajouter une carte = écrire son script.
      orchestratorRunRef.current(activation);
    });

    // Démarrer la partie
    let gameStarted = false;
    const startSync = () => {
      if (gameStarted) return;
      gameStarted = true;
      setRoundIntro(false);
      sync.start();
    };

    if (animationsOnRef.current) {
      setRoundIntro(true);
      sfxRef.current((sound) => sound.roundStart());
      showMomentOverlay({
        type: "roundStart",
        title: "À LA TABLE",
        subtitle: `${expectedPlayerCount} joueurs · Pot ${NKAP(mise * Math.max(expectedPlayerCount, 1))}`,
        tone: "gold",
        asset: "mark",
      }, ROUND_INTRO_MS);
      if (roundIntroTimerRef.current) clearTimeout(roundIntroTimerRef.current);
      roundIntroTimerRef.current = setTimeout(() => {
        roundIntroTimerRef.current = null;
        startSync();
      }, ROUND_INTRO_MS);
    } else {
      startSync();
    }

    return () => {
      unsubState();
      unsubPlay();
      unsubTrickEnd();
      unsubRoundEnd();
      unsubTimer();
      unsubSyncStatus();
      unsubPower();
      if (roundIntroTimerRef.current) {
        clearTimeout(roundIntroTimerRef.current);
        roundIntroTimerRef.current = null;
      }
      if (momentOverlayTimerRef.current) {
        clearTimeout(momentOverlayTimerRef.current);
        momentOverlayTimerRef.current = null;
      }
      momentOverlayQueueRef.current = [];
      momentOverlayActiveRef.current = false;
      setMomentOverlay(null);
      if (delayedStateTimerRef.current) clearTimeout(delayedStateTimerRef.current);
      pendingPowerStateRef.current = null;
      powerTransitionDepthRef.current = 0;
      burstTimersRef.current.forEach((timer) => clearTimeout(timer));
      burstTimersRef.current = [];
      animatedPlayIds.clear();
      syncRef.current = null;
      sync.destroy();
    };
    // Le sync doit vivre pour toute la session. On le relance seulement quand
    // l'identite de session arrive/change, pas quand le solde ou le viewport bouge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode, roomId, roomSessionReady, sessionAuthKey]);

  /* ----- nextRound exposé au router ----- */
  useEffect(() => {
    onNextRoundRef.current = () => {
      if (delayedStateTimerRef.current) clearTimeout(delayedStateTimerRef.current);
      delayedStateTimerRef.current = null;
      if (roundIntroTimerRef.current) clearTimeout(roundIntroTimerRef.current);
      roundIntroTimerRef.current = null;
      if (dealSweepTimerRef.current) clearTimeout(dealSweepTimerRef.current);
      dealSweepTimerRef.current = null;
      if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
      reactionTimerRef.current = null;
      if (momentOverlayTimerRef.current) clearTimeout(momentOverlayTimerRef.current);
      momentOverlayTimerRef.current = null;
      burstTimersRef.current.forEach((timer) => clearTimeout(timer));
      burstTimersRef.current = [];
      momentOverlayQueueRef.current = [];
      momentOverlayActiveRef.current = false;
      pendingPowerStateRef.current = null;
      powerTransitionDepthRef.current = 0;
      animatedPlayIdsRef.current.clear();
      transientStore.clear();
      setRoundIntro(false);
      setMomentOverlay(null);
      setTableReaction(null);
      setGoldFlash(false);
      setBanner("");
      setPowerChoiceConfirm(null);
      setConfirmQuit(false);
      timerStore.set(cfg.turnSeconds);
      setUsedPowers(new Set());
      setTargetingCard(null);
      roundRestartPendingRef.current = true;
      syncRef.current?.nextRound();
    };
    return () => { onNextRoundRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----- Jouer une carte (clic humain) ----- */
  const handleCardClick = useCallback((cardIdx: number) => {
    if (!syncRef.current || animatingRef.current) return;
    syncRef.current.playCard(cardIdx);
  }, []);

  /* ----- Activer une carte pouvoir ----- */

  /**
   * Étape interactive d'un script : la table passe en « mode sélection » via
   * le handle de la zone (main, dépôt) — le clic désigne la carte au lieu de
   * la jouer. Mécanisme GÉNÉRIQUE : tout futur boost avec une étape `choice`
   * l'utilise sans modification ici.
   */
  const requestCardChoice = useCallback((
    choice: ChoiceRequest,
    targetIdx?: number,
  ): Promise<PowerCardChoice | PowerCardChoice[] | null> => {
    return new Promise((resolve) => {
      const registry = registryRef.current;
      // Défaut confortable : le joueur doit lire le bandeau PUIS choisir.
      const timeoutMs = choice.timeoutMs ?? Math.max(8000, TABLE_READABILITY_MS * 2);
      let cancelSelection: (() => void) | null = null;
      let done = false;
      const selected = new Map<number, PowerCardChoice>();
      const min = Math.max(1, choice.count?.min ?? 1);
      const max = Math.max(min, choice.count?.max ?? 1);
      const finish = (value: PowerCardChoice | PowerCardChoice[] | null) => {
        if (done) return;
        done = true;
        cancelSelection?.();
        registry?.hand(0)?.highlightCards({ cardIds: [], style: "boosted", durationMs: 1 });
        setBanner("");
        setPowerChoiceConfirm(null);
        resolve(value);
      };
      const updateConfirm = () => {
        setPowerChoiceConfirm({
          selected: selected.size,
          min,
          max,
          onConfirm: () => {
            const values = [...selected.values()];
            if (values.length < min) return;
            finish(max === 1 ? values[0] : values);
          },
          onCancel: () => finish(null),
        });
      };
      const toggle = (card: Card, cardIdx: number) => {
        if (selected.has(cardIdx)) selected.delete(cardIdx);
        else if (selected.size < max) selected.set(cardIdx, { cardId: card.id, cardIdx });
        if (max === 1 && selected.size === 1) {
          finish([...selected.values()][0]);
          return;
        }
        registry?.hand(0)?.highlightCards({
          cardIds: [...selected.values()].map((item) => item.cardId),
          style: "boosted",
          durationMs: timeoutMs,
        });
        updateConfirm();
      };

      if (choice.surface === "hand-self" && registry) {
        const state = gameStateRef.current;
        const hand = playersRef.current[0]?.hand ?? [];
        const allowed = choice.filter && state
          ? new Set(selectInHand(hand, choice.filter, { state, seat: 0 }))
          : null;
        setBanner(max > 1 ? `Choisis entre ${min} et ${max} cartes` : "Choisis une carte de ta main");
        cancelSelection = registry.hand(0)?.beginSelection(
          (_card, cardIdx) => (allowed ? allowed.has(cardIdx) : true),
          (cardIdx) => {
            const card = playersRef.current[0]?.hand[cardIdx];
            if (card) toggle(card, cardIdx);
          },
        ) ?? null;
      } else if (choice.surface === "deposit" && registry) {
        const depositUi = choice.player === "target" && targetIdx !== undefined ? targetIdx : 0;
        setBanner("Choisis une carte du dépôt");
        cancelSelection = registry.deposit(depositUi)?.beginSelection(
          () => true,
          (cardIdx) => {
            const card = playersRef.current[depositUi]?.deposit[cardIdx];
            if (card) toggle(card, cardIdx);
          },
        ) ?? null;
      }

      if (!cancelSelection) {
        finish(null);
        return;
      }
      if (max > 1) updateConfirm();
      const timer = setTimeout(() => finish(null), timeoutMs);
      burstTimersRef.current.push(timer);
    });
  }, []);

  const handleUsePower = useCallback(async (cardId: PowerCardId, targetIdx?: number) => {
    if (!syncRef.current || animatingRef.current) return;
    if (!isYourTurn) return;
    if (!DEV.unlimitedPowers && usedPowers.has(cardId)) return;
    setTargetingCard(null);

    // Étapes interactives du script (clic générique) AVANT l'envoi au sync.
    const script = powerScriptOf(cardId);
    let choices: PowerChoices | undefined;
    for (const step of script.steps) {
      if (!step.choice) continue;
      const picked = await requestCardChoice(step.choice, targetIdx);
      if (!picked) {
        if (step.choice.onTimeout === "cancel") return; // annulé, carte non consommée
        continue; // "auto" : le moteur retombe sur son sélecteur
      }
      choices = { ...(choices ?? {}), [step.choice.id]: picked };
    }
    syncRef.current?.usePowerCard(cardId, targetIdx, choices);
  }, [isYourTurn, usedPowers, requestCardChoice]);

  const handlePowerTap = (cardId: PowerCardId) => {
    if (!isYourTurn || animatingRef.current) return;
    if (!DEV.unlimitedPowers && usedPowers.has(cardId)) return;
    if (targetingCard === cardId) {
      setTargetingCard(null);
      return;
    }
    if (requiresTarget(cardId)) setTargetingCard(cardId);
    else handleUsePower(cardId);
  };

  /* ----- Réactions émoji (online/friends uniquement) ----- */
  const isOnline = gameMode !== "bot";
  const myUid = authUid;
  const reactionShownRef = useRef<Set<string>>(new Set());
  const reactionCleanupRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const pushReactionBubble = useCallback((uiIdx: number, emoji: string) => {
    const key = `${uiIdx}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setReactionBubbles((b) => [...b, { key, uiIdx, emoji }]);
    const timer = setTimeout(() => {
      setReactionBubbles((b) => b.filter((x) => x.key !== key));
    }, 2400);
    reactionCleanupRef.current.push(timer);
  }, [setReactionBubbles]);

  const handleSendReaction = useCallback((emoji: string) => {
    if (!isOnline || !roomId || !myUid) return;
    void sendReaction(roomId, myUid, emoji);
    pushReactionBubble(0, emoji); // ma propre bulle, sur mon siège (idx 0)
  }, [isOnline, roomId, myUid, pushReactionBubble]);

  useEffect(() => {
    if (!isOnline || !roomId || !myUid || !roomPlayers?.length) return;
    const uids = roomPlayers.map((p) => p.uid);
    const myIdx = uids.indexOf(myUid);
    const count = uids.length;
    const since = Date.now();
    const shown = reactionShownRef.current;
    const unsub = listenReactions(roomId, since, (items) => {
      items.forEach((r) => {
        if (shown.has(r.id)) return;
        shown.add(r.id);
        if (r.fromUid === myUid) return; // ma bulle est déjà affichée localement
        const serverIdx = uids.indexOf(r.fromUid);
        if (serverIdx < 0 || myIdx < 0) return;
        // même rotation que FirestoreGameSync.toUiIdx : mon siège = 0
        const uiIdx = (serverIdx - myIdx + count) % count;
        pushReactionBubble(uiIdx, r.emoji);
      });
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, roomId, myUid, roomPlayersKey, pushReactionBubble]);

  useEffect(() => {
    const timers = reactionCleanupRef.current;
    return () => { timers.forEach((t) => clearTimeout(t)); };
  }, []);

  /* ═══════════════ RENDU TABLE ═══════════════ */

  return (
    <ZoneRegistryProvider registry={zoneRegistry}>
    <div
      ref={tableRootRef}
      className={[
        activeTableFx ? "nj-table-active-fx" : "",
        paused ? "nj-table-paused" : "",
      ].filter(Boolean).join(" ") || undefined}
      aria-hidden={paused}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        fontFamily: "var(--font-sans), sans-serif",
        color: T.text,
        background: `
          linear-gradient(150deg, rgba(16, 20, 45, 0.12), rgba(5, 5, 12, 0.52)),
          var(--nj-bg-app),
          linear-gradient(150deg, ${T.night2}, ${T.night1} 58%, ${T.deep})`,
        animation: motionEnabled
          ? screenEffect === "lose"
            ? "screenShake 0.4s ease both"
            : screenEffect === "win"
              ? "winPulse 0.35s ease both"
              : "none"
          : "none",
      }}
    >
      {/* Feutre : grande ellipse teal */}
      <div
        className={`nj-table-image${motionEnabled && premiumFxAllowed && roundIntro ? " nj-table-image-ceremony" : ""}`}
        style={{
          position: "absolute",
          inset: tableInset,
          borderRadius: "50%",
          boxShadow: `0 26px 70px rgba(0,0,0,.62)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            opacity: 0.04,
            background: CEREMONIAL_STRIP,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: "6%",
            borderRadius: "50%",
            border: "1.5px solid rgba(255,255,255,.14)",
          }}
        />

        {/* Gold Flash sur le feutre quand un joueur domine */}
        {goldFlash && motionEnabled && !liteMotion && (
          <div
            className="gold-flash-overlay"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
            }}
          />
        )}
      </div>

      {/* Chips d'état */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 10,
          zIndex: 50,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <Chip strong>
          Tour {Math.min(trickNo, cfg.cardsPerPlayer)}/{cfg.cardsPerPlayer}
        </Chip>
        <Chip>Mise {NKAP(mise)}</Chip>
        {gameMode !== "bot" && syncStatus.state !== "live" && (
          <Chip
            strong
            tone={syncStatus.state === "error" || syncStatus.state === "offline" ? "pink" : "gold"}
            style={{ fontSize: 11, padding: "5px 9px" }}
          >
            {syncStatus.message
              ?? (syncStatus.state === "connecting"
                ? "Connexion…"
                : syncStatus.state === "slow"
                  ? "Connexion lente…"
                  : syncStatus.state === "offline"
                    ? "Hors ligne"
                    : "Synchronisation impossible")}
          </Chip>
        )}
      </div>
      <button data-nj-skin="icon"
        onClick={handleMenuTap}
        style={{
          position: "absolute",
          top: 8,
          right: 10,
          zIndex: 50,
          width: 38,
          height: 38,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,.2)",
          background: "rgba(10,6,26,.6)",
          color: T.text,
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
        }}
        aria-label="Retour au menu"
      >
        <NjamboIcon name="home" tone="light" size={22} />
      </button>

      {/* Centre : deck + pot + tendance (zone enregistrée : handles "deck" et "pot") */}
      <DeckZone
        deckW={deckW}
        pot={displayedPot}
        ledSuit={ledSuit}
        ledColor={ledInfo?.color}
        dealing={roundIntro || phase === "dealing"}
        motionEnabled={motionEnabled}
        premiumFxAllowed={premiumFxAllowed}
        liteMotion={liteMotion}
      />

      {/* Bannière discrète */}
      {banner && (
        <div
          style={{
            position: "absolute",
            top: "30%",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60,
            animation: motionEnabled ? "popIn .3s both" : "none",
          }}
        >
          <Chip strong style={{ fontSize: 13, padding: "8px 18px" }}>
            {banner}
          </Chip>
        </div>
      )}

      {/* Dépôts sur le feutre */}
      {players.map((p, i) => {
        const edge = seatEdge(i);
        const dp = depositPos(edge);
        const active = trickPlays.some((tp) => tp.playerIdx === i);
        const depositClass = motionEnabled
          ? dominantIdx === i
            ? "nj-deposit-seat nj-deposit-seat-dominant"
            : active
              ? "nj-deposit-seat nj-deposit-seat-active"
              : "nj-deposit-seat"
          : undefined;
        return (
          <div
            key={"dep" + p.name}
            className={depositClass}
            style={{
              position: "absolute",
              left: dp.left,
              top: dp.top,
              transform: "translate(-50%,-50%)",
              zIndex: 10,
            }}
          >
            <DepositZone
              seatIdx={i}
              deposit={p.deposit}
              w={depW}
              active={active}
              isDominant={dominantIdx === i}
              effects={motionEnabled && !liteMotion}
            />
          </div>
        );
      })}

      {/* Mains débordantes */}
      {players.map((p, i) => {
        const edge = seatEdge(i);
        const a = fanAnchor(edge);
        return (
          <div
            key={"fan" + p.name}
            className={`nj-hand-seat${motionEnabled && !liteMotion && roundIntro ? " nj-round-hand-reveal" : ""}`}
            style={{
              position: "absolute",
              left: a.left,
              top: a.top,
              transform: `translate(-50%,-50%) rotate(${a.angle}deg)`,
              zIndex: p.isYou ? 30 : 15,
              "--seat-delay": `${i * 90}ms`,
            } as CSSProperties}
          >
            <Fan
              cards={p.hand}
              w={p.isYou ? youW : botW}
              faceUp={p.isYou}
              seatIdx={i}
              playerCount={n}
              dealing={motionEnabled && phase === "dealing"}
              legal={p.isYou ? yourLegal : null}
              onCardClick={handleCardClick}
              motionOn={p.isYou ? motionEnabled && !activeTableFx : motionEnabled}
              getDropRect={p.isYou ? getYourDropRect : undefined}
            />
          </div>
        );
      })}

      {/* Avatars */}
      {players.map((p, i) => {
        const edge = seatEdge(i);
        const active = phase === "turns" && turnIdx === i;
        const avatarClassName = [
          "nj-avatar-seat",
          motionEnabled && active ? "nj-avatar-seat-active" : "",
          motionEnabled && !liteMotion && roundIntro ? "nj-round-seat-reveal" : "",
        ].filter(Boolean).join(" ");
        const avatarStyle = {
          position: "absolute",
          zIndex: 40,
          "--seat-delay": `${i * 110}ms`,
          ...avatarPos(edge),
        } as CSSProperties;
        return (
          <TimerAvatar
            key={"av" + p.name}
            store={timerStore}
            player={p}
            seatIdx={i}
            active={active}
            turnSeconds={cfg.turnSeconds}
            size={p.isYou ? 58 : 50}
            className={avatarClassName}
            style={avatarStyle}
            motionEnabled={motionEnabled}
          />
        );
      })}

      {/* Indication de tour */}
      {isYourTurn && (
        <div
          className={motionEnabled ? "nj-turn-prompt" : undefined}
          style={{
            position: "absolute",
            bottom: fanHy * 0.78,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 45,
            animation: motionEnabled ? "popIn .25s both" : "none",
          }}
        >
          <Chip strong style={{ fontSize: 13, padding: "7px 16px" }}>
            {ledSuit ? (
              <>
                À toi — suis{" "}
                <b style={{ color: ledInfo?.color === "#c1292e" ? T.bad : "#fff" }}>{ledSuit}</b>
              </>
            ) : (
              <>À toi — tu donnes la tendance</>
            )}
          </Chip>
        </div>
      )}

      {motionEnabled && momentOverlay && <GameMomentOverlay key={momentOverlay.key} moment={momentOverlay} motionLevel={motionLevel} />}

      {/* Effets d'activation des cartes pouvoir (flash, particules, overlay
          d'activation) — rendus et séquencés par l'orchestrateur générique. */}
      {orchestrator.element}

      {motionEnabled && !liteMotion && tableReaction && (
        <div
          key={tableReaction.key}
          className={`nj-table-reaction nj-table-reaction-${tableReaction.tone}`}
          aria-hidden="true"
        >
          <span>{tableReaction.label}</span>
          {tableReaction.detail && <small>{tableReaction.detail}</small>}
        </div>
      )}

      {powerChoiceConfirm && (
        <div className="nj-power-choice-confirm">
          <span>{powerChoiceConfirm.selected}/{powerChoiceConfirm.max} sélectionnée(s)</span>
          <button data-nj-skin="ghost" type="button" onClick={powerChoiceConfirm.onCancel}>Annuler</button>
          <button data-nj-skin="teal"
            type="button"
            disabled={powerChoiceConfirm.selected < powerChoiceConfirm.min}
            onClick={powerChoiceConfirm.onConfirm}
          >
            Valider
          </button>
        </div>
      )}

      {/* Confirmation de sortie — même facture que PowerTargetModal (thème nuit/or). */}
      {confirmQuit && (
        <div
          onClick={() => setConfirmQuit(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(5,5,12,.72)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: `linear-gradient(160deg, ${T.night3}, ${T.night1})`,
              border: `1.5px solid ${T.gold}55`,
              borderRadius: 18,
              padding: 20,
              maxWidth: 320,
              width: "100%",
              textAlign: "center",
            }}
          >
            <NjamboMark size={44} />
            <div style={{ fontWeight: 900, fontSize: 18, margin: "10px 0 4px", color: T.text }}>
              Quitter la partie ?
            </div>
            <div className="nj-subtle" style={{ fontSize: 13, marginBottom: 16 }}>
              {isLocalSync
                ? "La manche en cours sera perdue."
                : gameMode === "event"
                  ? "Abandonner compte comme une défaite de l'événement."
                  : players.length <= 2
                    ? "Abandonner compte comme une défaite et donne la victoire à l'adversaire."
                    : "Vous serez éliminé de cette partie. Les autres joueurs continueront."}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button data-nj-skin="ghost"
                type="button"
                onClick={() => setConfirmQuit(false)}
                style={{ padding: "10px 18px", borderRadius: 12, color: T.text, fontWeight: 800, cursor: "pointer" }}
              >
                Rester
              </button>
              <button data-nj-skin="gold"
                type="button"
                onClick={handleQuitConfirm}
                style={{ padding: "10px 18px", borderRadius: 12, color: T.text, fontWeight: 900, cursor: "pointer" }}
              >
                Quitter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cartes en vol */}
      <TransientAnimationLayer
        store={transientStore}
        motionEnabled={motionEnabled}
        liteMotion={liteMotion}
        reactionPosition={(uiIdx) => depositPos(seatEdge(uiIdx))}
      />

      {/* Réactions émoji entrantes — bulle flottante près du dépôt de l'auteur */}
      {/* Barre d'émojis — parties en ligne / entre amis */}
      {isOnline && (
        <div className="nj-reaction-bar" aria-label="Réactions">
          {REACTION_EMOJIS.map((em) => (
            <button data-nj-skin="icon" key={em} type="button" onClick={() => handleSendReaction(em)} aria-label={`Réaction ${em}`}>
              {em}
            </button>
          ))}
        </div>
      )}

      {/* ═══ Barre de cartes pouvoir ═══ */}
      {equippedPowers.length > 0 && players.length > 0 && !roundIntro && (
        <div
          style={{
            position: "absolute",
            left: 10,
            bottom: portrait ? 96 : 84,
            zIndex: 55,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            // Scroll vertical quand beaucoup de cartes (mode dev : jusqu'à 18).
            maxHeight: portrait ? "46vh" : "62vh",
            overflowY: "auto",
            overflowX: "visible",
            paddingRight: 4,
            scrollbarWidth: "thin",
          }}
          aria-label="Cartes pouvoir"
        >
          {equippedPowers.map((cardId) => {
            const def = POWER_CARDS_BY_ID[cardId];
            if (!def) return null;
            // Dev : usage illimité → jamais marqué « utilisé ».
            const used = !DEV.unlimitedPowers && usedPowers.has(cardId);
            const disabled = used || !isYourTurn;
            const active = targetingCard === cardId;
            const tint = def.tone === "gold" ? T.gold : def.tone === "teal" ? T.teal : def.tone === "pink" ? T.pink : T.cobalt;
            return (
              <button data-nj-skin={def.tone === "cobalt" ? "dark" : def.tone}
                key={cardId}
                type="button"
                onClick={() => handlePowerTap(cardId)}
                disabled={disabled}
                aria-label={def.name}
                aria-pressed={active}
                title={`${def.name} — ${def.description}`}
                style={{
                  width: 62,
                  minHeight: 82,
                  borderRadius: 12,
                  border: `2px solid ${active ? tint : `${tint}88`}`,
                  background: used
                    ? "rgba(10,6,26,.5)"
                    : `radial-gradient(circle at 40% 30%, ${tint}44, rgba(10,6,26,.85))`,
                  display: "grid",
                  placeItems: "center",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: used ? 0.4 : isYourTurn ? 1 : 0.6,
                  boxShadow: active ? `0 0 0 3px ${tint}55, 0 6px 18px rgba(0,0,0,.5)` : "0 6px 16px rgba(0,0,0,.4)",
                  position: "relative",
                  transition: "opacity .2s, box-shadow .2s",
                }}
              >
                <PowerCardView card={def} compact showMeta={false} selected={active} disabled={used} />
                {used && (
                  <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                    <NjamboIcon name="check" tone="light" size={22} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Sélection de cible pour une carte pouvoir (pilotée par TargetSpec) */}
      {targetingCard && (
        <PowerTargetModal
          cardId={targetingCard}
          players={players}
          turnSeconds={cfg.turnSeconds}
          allowSelf={powerScriptOf(targetingCard).target.allowSelf}
          onPick={(i) => void handleUsePower(targetingCard, i)}
          onCancel={() => setTargetingCard(null)}
        />
      )}

      {/* Zone de révélation de cartes (Œil du Sorcier & co) — pilotée par le
          handle "reveal" du registre de zones. */}
      <RevealOverlay />
    </div>
    </ZoneRegistryProvider>
  );
}
