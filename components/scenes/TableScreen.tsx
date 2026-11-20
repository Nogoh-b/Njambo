"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useSfx } from "@gxe/react";


import { PlayCard } from "@/components/cards/PlayCard";
import { PowerCardView } from "@/components/power/PowerCardView";
import { usePowerFxOrchestrator } from "@/components/power/PowerFxOrchestrator";
import { PowerTargetModal } from "@/components/power/PowerTargetModal";
import { Avatar, type OpponentPowerSlot } from "@/components/table/Avatar";
import { DepositZone } from "@/components/table/DepositZone";
import { Fan } from "@/components/table/Fan";
import { FlyingCard } from "@/components/table/FlyingCard";
import { DeckZone } from "@/components/table/zones/DeckZone";
import { RevealOverlay } from "@/components/table/zones/RevealOverlay";
import { ZoneRegistry, ZoneRegistryProvider } from "@/components/table/zones/ZoneRegistry";
import { NjamboIcon, NjamboMark } from "@/components/ui/Art";
import { Btn } from "@/components/ui/Btn";
import { Chip } from "@/components/ui/Chip";
import {
  TableLayout,
  TableMenuButton,
  TableLiveRegion,
  TablePowerTray,
  TableStatusBar,
  TableStatusMessage,
  TableSurface,
  TableTurnStatus,
} from "@/components/ui/TableLayout";
import { DEV, devEquippedPowers } from "@/config/devConfig";
import { GAME_CONFIG } from "@/config/gameConfig";
import { MAX_EQUIPPED_POWERS, POWER_CARDS_BY_ID } from "@/config/powerCards";
import { powerRequiresTarget as requiresTarget, powerScriptOf } from "@/config/powers";
import { T } from "@/config/theme";
import styles from "./TableScreen.module.css";
import { useInventory } from "@/contexts/EconomyContext";
import { useGame } from "@/contexts/GameContext";
import { BOTS, NKAP } from "@/data/mock";
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
import { formatGameAnnouncement, getSyncStatusPresentation } from "@/lib/gamePresentation";
import {
  CARD_SOUND,
  DEAL_SWEEP_SOUND,
  DOMINANCE_SOUND,
  ROUND_START_SOUND,
  TICK_SOUND,
  TURN_START_SOUND,
} from "@/lib/gxeSfx";
import { loadGsap, useGsapTimeline, useMotionProfile, type MotionLevel } from "@/lib/motion";
import { markPerformance } from "@/lib/performanceMetrics";
import { REACTION_EMOJIS, listenReactions, sendReaction } from "@/lib/reactions";
import { AuthoritativeGameSync } from "@/sync/AuthoritativeGameSync";
import { LocalGameSync } from "@/sync/LocalGameSync";
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
  PowerCategory,
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
  onBackRequestRef?: { current: (() => "stay" | "handled") | null };
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

const TEST_FILTER_CATEGORIES: Array<{ id: "all" | PowerCategory; label: string }> = [
  { id: "all", label: "Toutes" },
  { id: "offensive", label: "Attaque" },
  { id: "defense", label: "Défense" },
  { id: "tactical", label: "Tactique" },
  { id: "perturbation", label: "Bluff" },
  { id: "score", label: "Score" },
  { id: "economy", label: "Nkap" },
];

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
  compactHorizontal?: boolean;
  unlimitedTime?: boolean;
  opponentPowers?: OpponentPowerSlot[];
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
  compactHorizontal = false,
  unlimitedTime = false,
  opponentPowers,
}: TimerAvatarProps) {
  const seconds = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return (
    <div
      className={`${className}${motionEnabled && active && !unlimitedTime && seconds <= 5 ? " nj-avatar-seat-urgent" : ""}`}
      style={style}
    >
      <Avatar
        p={player}
        seatIdx={seatIdx}
        active={active}
        seconds={active ? seconds : turnSeconds}
        turnSeconds={turnSeconds}
        size={size}
        compactHorizontal={compactHorizontal}
        unlimitedTime={unlimitedTime}
        opponentPowers={opponentPowers}
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
  balancedMotion,
  reactionPosition,
}: {
  store: TransientAnimationStore;
  motionEnabled: boolean;
  liteMotion: boolean;
  balancedMotion: boolean;
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
        <FlyingCard key={flight.key} f={flight} effects={motionEnabled} balanced={balancedMotion || liteMotion} />
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
  useGsapTimeline(!lite, rootRef, (gsap) => {
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
    <div ref={rootRef} className={`nj-moment-overlay nj-moment-${moment.tone} nj-moment-${moment.type} nj-moment-motion-${motionLevel}`} aria-hidden="true">
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
  onBackRequestRef,
  paused = false,
}: TableScreenProps) {
  useEffect(() => {
    markPerformance("table:mount");
    return () => markPerformance("table:unmount");
  }, []);
  const { profile, cfg } = useGame();
  /* Tous les sons de cet écran sont migrés vers GXE (lib/gxeSfx.ts). D'autres
     écrans (ResultScreen, SettlementArena) utilisent encore `sfx` de
     `useGame()` (lib/sound.ts) tant que leur propre migration n'est pas
     faite — jamais les deux systèmes sur le même événement. */
  const gxeSfx = useSfx();
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
  const youW = Math.round(Math.max(50, Math.min(78, vmin * 0.168)));
  const botW = Math.round(youW * (portrait ? 0.58 : 0.64));
  const depW = Math.round(Math.max(38, youW * 0.76));
  const deckW = Math.round(youW * 0.66);
  const fanHy = youW * 1.45;
  const fanHb = botW * 1.45;
  const cockpitBottom = Math.round(fanHy * 1.06) + 8;
  const tableInset = portrait
    ? "7.5% 4% 13.5% 4%"
    : vp.h <= 620
      ? "11% 8% 13% 8%"
      : "9% 5.5% 13% 5.5%";

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
  const [tableAnnouncement, setTableAnnouncement] = useState("");
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
  /* Aide rapide en cours de manche & aperçu tactile des cartes pouvoir */
  const [showQuickHelp, setShowQuickHelp] = useState(false);
  const [hasSeenQuickHelp, setHasSeenQuickHelp] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem("njambo:onboarding-seen:v1") === "1";
    } catch {
      return true;
    }
  });
  const [previewPowerCard, setPreviewPowerCard] = useState<PowerCardId | null>(null);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [testDrawerOpen, setTestDrawerOpen] = useState(false);
  const [testCategoryFilter, setTestCategoryFilter] = useState<"all" | PowerCategory>("all");
  const [opponentPowerUses, setOpponentPowerUses] = useState<Record<number, PowerCardId[]>>({});
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const openQuickHelp = useCallback(() => {
    setShowQuickHelp(true);
    setHasSeenQuickHelp(true);
    try {
      window.localStorage.setItem("njambo:onboarding-seen:v1", "1");
    } catch {
      /* ignore storage errors */
    }
  }, []);
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
  /* `gxeSfx.play`/`playChime` sont stables (identité fixe tant que le runtime
     vit), mais indirectés quand même via une ref pour ne jamais ajouter
     `gxeSfx` aux deps du gros effet de synchronisation plus bas — même motif
     que les autres refs de ce fichier (animationsOnRef, etc.). */
  const gxeSfxRef = useRef(gxeSfx);
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
  const { players, phase, trickNo, trickPlays, leaderIdx, turnIdx, pot, dominantIdx } = gameState;
  const isGameEnded = paused || phase === "result";
  const pausedRef = useRef(isGameEnded);
  pausedRef.current = isGameEnded;

  /** Leader courant du pli en direct (tous modes : Solo IA local, serveur, en ligne, amis, événement). */
  const liveDominantIdx = useMemo<number | null>(() => {
    if (phase === "dealing" || phase === "idle") return null;
    if (trickPlays.length > 0) {
      const led = trickPlays[0].card.suit;
      let best = trickPlays[0];
      for (const tp of trickPlays) {
        const suit = tp.card.effectiveSuit ?? tp.card.suit;
        const val = tp.card.effectiveValue ?? tp.card.value;
        const bestSuit = best.card.effectiveSuit ?? best.card.suit;
        const bestVal = best.card.effectiveValue ?? best.card.value;
        if (suit === led && (bestSuit !== led || val > bestVal)) best = tp;
      }
      return best.playerIdx;
    }
    if (dominantIdx !== null) return dominantIdx;
    // Entre deux plis (dès le 2e tour), le vainqueur du pli précédent conserve la couronne sur son dépôt.
    if (trickNo > 1 && players[leaderIdx]?.deposit?.length) return leaderIdx;
    return null;
  }, [dominantIdx, leaderIdx, phase, players, trickNo, trickPlays]);

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
  const isYourTurn = !isGameEnded && phase === "turns" && turnIdx === 0;
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
  const baseTableFx = roundIntro || phase === "dealing" || !!momentOverlay;
  const connectionStatus = getSyncStatusPresentation(syncStatus);
  const getYourDropRect = useCallback(() => registryRef.current?.deposit(0)?.getRect() ?? null, []);
  const getDeckRect = useCallback(() => registryRef.current?.deck()?.getRect() ?? null, []);

  useEffect(() => {
    if (!isYourTurn || isGameEnded) setIsDraggingCard(false);
  }, [isYourTurn, isGameEnded]);

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
    gxeSfxRef.current = gxeSfx;
  }, [gxeSfx]);

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
    const bleedY = fanHy * 0.56;
    const bleedB = fanHb * 0.24;
    switch (edge) {
      case "bottom":
        return {
          left: "50%",
          top: `calc(100% - ${Math.round(bleedY)}px - env(safe-area-inset-bottom))`,
          angle: 0,
        };
      case "top":
        return {
          left: "50%",
          top: `calc(${portrait ? 54 : 50}px + env(safe-area-inset-top))`,
          angle: 180,
        };
      case "left":
        return { left: `${Math.round(bleedB)}px`, top: portrait ? "50%" : "46%", angle: 90 };
      case "right":
        return { left: `calc(100% - ${Math.round(bleedB)}px)`, top: portrait ? "50%" : "46%", angle: 270 };
      default:
        return { left: "50%", top: "50%", angle: 0 };
    }
  };
  const depositPos = (edge: "bottom" | "left" | "top" | "right") => {
    switch (edge) {
      case "bottom":
        return { left: "50%", top: portrait ? "58.5%" : "61%" };
      case "top":
        return { left: "50%", top: portrait ? "32%" : "27%" };
      case "left":
        return { left: portrait ? "29%" : "33%", top: portrait ? "47%" : "45%" };
      case "right":
        return { left: portrait ? "71%" : "67%", top: portrait ? "47%" : "45%" };
      default:
        return { left: "50%", top: "50%" };
    }
  };
  const avatarPos = (edge: "bottom" | "left" | "top" | "right"): React.CSSProperties => {
    switch (edge) {
      case "bottom":
        return portrait
          ? {
              left: "max(10px, env(safe-area-inset-left))",
              bottom: `calc(${cockpitBottom}px + env(safe-area-inset-bottom))`,
            }
          : {
              left: "max(18px, env(safe-area-inset-left))",
              bottom: "max(16px, env(safe-area-inset-bottom))",
            };
      case "top":
        return {
          left: "50%",
          top: `calc(${portrait ? 60 : 54}px + env(safe-area-inset-top))`,
          transform: "translateX(-50%)",
        };
      case "left":
        return {
          left: "max(6px, env(safe-area-inset-left))",
          top: portrait ? "33%" : "19%",
        };
      case "right":
        return {
          right: "max(6px, env(safe-area-inset-right))",
          top: portrait ? "33%" : "19%",
        };
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

  /* Secousse d'impact GSAP sur toute la table (fin de pli, victoire).
     PERF: repeat reduit a 5/6 pour limiter la concurrence avec la
     timeline GSAP de l'overlay (duree ~330/385ms au lieu de 770ms). */
  const impactShake = useCallback((intensity = 8, repeat = 5) => {
    if (pausedRef.current) return;
    const g = gsapRef.current;
    const el = tableRootRef.current;
    if (!g || !el || !animationsOnRef.current) return;
    // Promotion temporaire sur une couche GPU : le shake tourne 100% sur le
    // compositeur sans rasterisation par frame. Retire will-change apres (~385ms max).
    el.style.willChange = "transform";
    g.fromTo(
      el,
      { x: 0, y: 0 },
      {
        x: `random(${-intensity}, ${intensity})`,
        y: `random(${-intensity * 0.6}, ${intensity * 0.6})`,
        duration: 0.055,
        repeat,
        yoyo: true,
        ease: "power1.inOut",
        onComplete: () => {
          g.set(el, { x: 0, y: 0 });
          el.style.willChange = "";
        },
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
    if (pausedRef.current || !animationsOnRef.current) {
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

    /* Secousse d'impact sur les moments forts (pli dominé, ngata gagné).
       Differee de 120ms pour eviter la concurrence GSAP avec l'overlay. */
    if (next.moment.type === "dominance") {
      setTimeout(() => impactShake(7, 5), 120);
    } else if (next.moment.type === "win" || next.moment.type === "doubleWin") {
      setTimeout(() => impactShake(12, 6), 120);
    }

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
    if (pausedRef.current) return;
    setTableAnnouncement(formatGameAnnouncement(moment.title, moment.subtitle));
    if (!animationsOnRef.current) return;
    momentOverlayQueueRef.current.push({ moment, duration });
    if (!momentOverlayActiveRef.current) playNextMomentOverlay();
  }, [playNextMomentOverlay]);

  const showTableReaction = useCallback((label: string, tone: ReactionTone = "gold", detail?: string) => {
    if (pausedRef.current) return;
    setTableAnnouncement(formatGameAnnouncement(label, detail));
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
    playSfx: () => gxeSfxRef.current.playChime(DOMINANCE_SOUND), // migré vers GXE
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
        gxeSfxRef.current.playChime(DEAL_SWEEP_SOUND); // migré vers GXE
        dealSweepTimerRef.current = null;
      }, 120);
    }

    prevPhaseRef.current = phase;
  }, [motionEnabled, phase]);

  /* Fin de manche / écran de résultat ouvert : figer et stopper intégralement
     la table (timers, overlays, vols, réactions, sons différés et modales). */
  useEffect(() => {
    if (!isGameEnded) return;
    if (delayedStateTimerRef.current) {
      clearTimeout(delayedStateTimerRef.current);
      delayedStateTimerRef.current = null;
    }
    if (roundIntroTimerRef.current) {
      clearTimeout(roundIntroTimerRef.current);
      roundIntroTimerRef.current = null;
    }
    if (dealSweepTimerRef.current) {
      clearTimeout(dealSweepTimerRef.current);
      dealSweepTimerRef.current = null;
    }
    if (reactionTimerRef.current) {
      clearTimeout(reactionTimerRef.current);
      reactionTimerRef.current = null;
    }
    if (momentOverlayTimerRef.current) {
      clearTimeout(momentOverlayTimerRef.current);
      momentOverlayTimerRef.current = null;
    }
    burstTimersRef.current.forEach((timer) => clearTimeout(timer));
    burstTimersRef.current = [];
    momentOverlayQueueRef.current = [];
    momentOverlayActiveRef.current = false;
    animatingRef.current = false;
    powerTransitionDepthRef.current = 0;
    pendingPowerStateRef.current = null;
    transientStore.clear();
    clearAurasRef.current();
    setRoundIntro(false);
    setMomentOverlay(null);
    setTableReaction(null);
    setBanner("");
    setGoldFlash(false);
    setConfirmQuit(false);
    setPreviewPowerCard(null);
    setTargetingCard(null);
    setTestDrawerOpen(false);
    setShowQuickHelp(false);
    setReactionsOpen(false);
    setPowerChoiceConfirm(null);
  }, [isGameEnded, transientStore]);

  useEffect(() => {
    if (isGameEnded || phase !== "turns") return;
    if (prevTurnIdxFxRef.current === turnIdx) return;
    prevTurnIdxFxRef.current = turnIdx;

    const activePlayer = players[turnIdx];

    // Annonce du tour (À TOI / réaction) DIFFÉRÉE jusqu'à ce que la carte du
    // joueur précédent soit posée : sinon l'overlay démarre pendant le vol.
    // On privilégie une pilule de réaction fluide et non-bloquante plutôt qu'un
    // overlay plein écran à chaque tour qui cassait le rythme de jeu.
    const announceTurn = () => {
      if (pausedRef.current || gameStateRef.current?.phase !== "turns") return;
      if (turnIdx === 0) {
        gxeSfxRef.current.playChime(TURN_START_SOUND); // migré vers GXE
        const isLastTrick = trickNo >= cfg.cardsPerPlayer;
        if (isLastTrick) {
          showTableReaction(
            "DERNIER TOUR 🔥",
            "gold",
            ledSuit ? `Suis ${ledSuit} — Le gagnant rafle le pot !` : "Pose ta carte maîtresse pour le pot !",
          );
        } else {
          showTableReaction(
            "À TOI DE JOUER",
            "teal",
            ledSuit ? `Suis la tendance ${ledSuit}` : "Donne la tendance",
          );
        }
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
  }, [A.landSettle, cfg.cardsPerPlayer, isGameEnded, motionEnabled, ledSuit, phase, players, showTableReaction, trickNo, turnIdx]);

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
        pausedRef.current = false;
        onRoundRestart();
      }
    };

    const unsubState = sync.onStateUpdate((state) => {
      setBanner("");
      if (state.phase === "result") {
        if (delayedStateTimerRef.current) {
          clearTimeout(delayedStateTimerRef.current);
          delayedStateTimerRef.current = null;
        }
        pendingPowerStateRef.current = null;
        powerTransitionDepthRef.current = 0;
        animatingRef.current = false;
        applyIncomingState(state);
        return;
      }
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
      if (pausedRef.current) return;
      markPerformance("card:play");
      if (playId) {
        if (animatedPlayIds.has(playId)) return;
        animatedPlayIds.add(playId);
      }

      gxeSfxRef.current.play(CARD_SOUND); // migré vers GXE (lib/gxeSfx.ts)
      const handZone = zoneRegistry.hand(playerIdx);
      const from = handZone?.getCardRect(cardIdx) ?? handZone?.getRect() ?? null;
      const to = zoneRegistry.deposit(playerIdx)?.getRect() ?? null;

      if (from && to) {
        animatingRef.current = true;
        timerStore.set(cfg.turnSeconds);
        animationEndsAtRef.current = Date.now() + A.dropFlight;
        const dropRot = Math.random() * 14 - 7;
        const flightKey = `${card.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        handZone?.setHiddenCard(cardIdx);
        setFlights((f) => [
          ...f,
          {
            key: flightKey,
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
          setFlights((f) => f.filter((item) => item.key !== flightKey));
          handZone?.setHiddenCard(null);
          if (pausedRef.current) return;
          if (animationsOnRef.current && premiumFxAllowed) {
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
            }, 460);
            burstTimersRef.current.push(cleanupTimer);
          }
        }, A.dropFlight);
        burstTimersRef.current.push(landingTimer);
      }
    });

    const unsubTrickEnd = sync.onTrickEnd((winnerIdx) => {
      if (pausedRef.current) return;
      const winnerName = playersRef.current[winnerIdx]?.name ?? "Joueur";
      const landDelay = Math.max(0, animationEndsAtRef.current - Date.now()) + A.landSettle;

      const announce = () => {
        if (pausedRef.current || gameStateRef.current?.phase === "result") return;
        // Annonce légère non-bloquante : garde la table fluide (0 lag) et laisse
        // la couronne dorée sur la carte dominante 100% visible !
        setBanner(winnerIdx === 0 ? "Tu domines le tour !" : `${winnerName} domine le tour`);
        gxeSfxRef.current.playChime(DOMINANCE_SOUND);
        if (animationsOnRef.current) {
          setGoldFlash(true);
        }
        const bannerTimer = setTimeout(() => {
          setBanner("");
          setGoldFlash(false);
        }, Math.max(620, A.trickPause - landDelay));
        burstTimersRef.current.push(bannerTimer);
      };

      if (landDelay <= 0) announce();
      else {
        const announceTimer = setTimeout(announce, landDelay);
        burstTimersRef.current.push(announceTimer);
      }
    });

    const unsubRoundEnd = sync.onRoundEnd(() => {
      // L'écran de fin de match (ResultScreen) prend immédiatement le relais :
      // on fige la table et on coupe tout overlay/son résiduel de la table.
      pausedRef.current = true;
      momentOverlayQueueRef.current = [];
      momentOverlayActiveRef.current = false;
      if (momentOverlayTimerRef.current) {
        clearTimeout(momentOverlayTimerRef.current);
        momentOverlayTimerRef.current = null;
      }
      if (reactionTimerRef.current) {
        clearTimeout(reactionTimerRef.current);
        reactionTimerRef.current = null;
      }
      burstTimersRef.current.forEach((timer) => clearTimeout(timer));
      burstTimersRef.current = [];
      setMomentOverlay(null);
      setTableReaction(null);
      setBanner("");
      setGoldFlash(false);
    });

    const unsubTimer = sync.onTimerTick((s) => {
      if (pausedRef.current || gameStateRef.current?.phase !== "turns") return;
      if (animatingRef.current || powerTransitionDepthRef.current > 0) {
        timerStore.set(cfg.turnSeconds);
        return;
      }
      timerStore.set(s);
      if (s > 0 && s <= 5 && playersRef.current[turnIdxRef.current]?.isYou) gxeSfxRef.current.play(TICK_SOUND); // migré vers GXE
    });

    const unsubSyncStatus = sync.onSyncStatus(setSyncStatus);

    const unsubPower = sync.onPowerActivated((activation) => {
      if (pausedRef.current) return;
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
      } else if (!mine && activation.used) {
        const actorIdx = uiIndexFromPowerUid(activation.activatedByUid);
        if (actorIdx !== null && actorIdx > 0) {
          setOpponentPowerUses((prev) => {
            const list = prev[actorIdx] ?? [];
            if (list.includes(activation.cardId)) return prev;
            return { ...prev, [actorIdx]: [...list, activation.cardId] };
          });
        }
      }
      // Toute l'animation est GÉNÉRIQUE : l'orchestrateur rejoue le script de
      // la carte (config/powers) depuis activation.resolved — zéro branche
      // par carte ou par tag ici. Ajouter une carte = écrire son script.
      orchestratorRunRef.current(activation);
    });

    // Démarrer la partie : en multijoueur / serveur, la connexion part immédiatement
    // en parallèle de la courte intro pour éliminer toute attente inutile.
    let gameStarted = false;
    const startSync = () => {
      if (gameStarted) return;
      gameStarted = true;
      setRoundIntro(false);
      sync.start();
    };

    if (animationsOnRef.current && isLocalSync) {
      setRoundIntro(true);
      gxeSfxRef.current.playChime(ROUND_START_SOUND);
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
      if (animationsOnRef.current) gxeSfxRef.current.playChime(ROUND_START_SOUND);
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

  /* ----- Bouton Retour navigateur exposé au router ----- */
  useEffect(() => {
    if (!onBackRequestRef) return;
    onBackRequestRef.current = () => {
      if (confirmQuit) { setConfirmQuit(false); return "stay"; }
      if (showQuickHelp) { setShowQuickHelp(false); return "stay"; }
      if (previewPowerCard) { setPreviewPowerCard(null); return "stay"; }
      if (testDrawerOpen) { setTestDrawerOpen(false); return "stay"; }
      if (targetingCard) { setTargetingCard(null); return "stay"; }
      if (reactionsOpen) { setReactionsOpen(false); return "stay"; }
      if (matchInProgress) { setConfirmQuit(true); return "stay"; }
      onMenu();
      return "handled";
    };
    return () => { onBackRequestRef.current = null; };
  }, [
    confirmQuit,
    matchInProgress,
    onBackRequestRef,
    onMenu,
    previewPowerCard,
    reactionsOpen,
    showQuickHelp,
    targetingCard,
    testDrawerOpen,
  ]);

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
      setOpponentPowerUses({});
      setTargetingCard(null);
      setPreviewPowerCard(null);
      setTestDrawerOpen(false);
      setShowQuickHelp(false);
      roundRestartPendingRef.current = true;
      syncRef.current?.nextRound();
    };
    return () => { onNextRoundRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----- Jouer une carte (clic humain) ----- */
  const handleCardClick = useCallback((cardIdx: number) => {
    if (pausedRef.current || !syncRef.current || animatingRef.current) return;
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
        setTableAnnouncement(formatGameAnnouncement(`${roomPlayers[serverIdx]?.name ?? "Un joueur"} réagit`, r.emoji));
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

  /* ═══════════════ RENDU TABLE — SALON ROYAL ÉPURÉ ═══════════════ */
  const isFinalTrick = trickNo >= cfg.cardsPerPlayer;
  const activeTurnEdge = phase === "turns" && players[turnIdx] ? seatEdge(turnIdx) : null;
  const suitIsRed = ledInfo?.color === "#c1292e";
  const hasPowersOnTable = equippedPowers.length > 0 && players.length > 0 && !roundIntro;
  const isTestPowerMode = equippedPowers.length > MAX_EQUIPPED_POWERS;
  const turnStatusBottom = portrait
    ? cockpitBottom + (hasPowersOnTable && !isTestPowerMode ? 64 : 54)
    : Math.round(fanHy * 1.24);
  const filteredTestPowers = useMemo(() => {
    if (testCategoryFilter === "all") return equippedPowers;
    return equippedPowers.filter((id) => POWER_CARDS_BY_ID[id]?.category === testCategoryFilter);
  }, [equippedPowers, testCategoryFilter]);

  return (
    <ZoneRegistryProvider registry={zoneRegistry}>
    <TableLayout
      ref={tableRootRef}
      activeFx={activeTableFx}
      paused={paused}
      motionMode={motion.mode}
      screenEffect={motionEnabled ? screenEffect : null}
      turnEdge={activeTurnEdge}
      finalTrick={isFinalTrick}
    >
      {/* Table Ovale 3D sculptée en acajou, laiton & feutre émeraude */}
      <TableSurface
        inset={tableInset}
        ceremony={motionEnabled && premiumFxAllowed && roundIntro}
        finalTrick={isFinalTrick}
      >
        {/* Gold Flash sur le feutre quand un joueur domine */}
        {goldFlash && motionEnabled && !liteMotion && (
          <div
            className="gold-flash-overlay"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "inherit",
            }}
          />
        )}
      </TableSurface>

      {/* ═══ TOP HUD ULTRA-ÉPURÉ : ? · CAPSULE UNIFIÉE (5 TOURS · POT · TENDANCE) · MENU ═══ */}
      <TableStatusBar>
        <button
          data-nj-skin="none"
          type="button"
          onClick={openQuickHelp}
          aria-label="Aide et mémo des règles"
          className={`${styles.helpBtn}${hasSeenQuickHelp ? "" : ` ${styles.helpBtnNew}`}`}
        >
          ?
        </button>

        <div
          className={`${styles.royalCapsule}${isFinalTrick ? ` ${styles.royalCapsuleFinal}` : ""}`}
          aria-label={`Tour ${Math.min(trickNo, cfg.cardsPerPlayer)} sur ${cfg.cardsPerPlayer}, pot ${NKAP(displayedPot)}, tendance ${ledSuit ?? "libre"}`}
        >
          {/* Progression visuelle des 5 plis (la 5e = couronne Ngata) */}
          <span className={styles.trickDots} title={`Tour ${Math.min(trickNo, cfg.cardsPerPlayer)}/${cfg.cardsPerPlayer}${isFinalTrick ? " · Décisif (Ngata)" : ""}`}>
            {Array.from({ length: cfg.cardsPerPlayer }, (_, idx) => {
              const step = idx + 1;
              const isLast = step === cfg.cardsPerPlayer;
              const done = step < trickNo;
              const now = step === Math.min(trickNo, cfg.cardsPerPlayer);
              if (isLast) {
                return (
                  <span
                    key={step}
                    className={`${styles.trickCrown}${now ? ` ${styles.trickCrownLive}` : ""}`}
                    aria-hidden="true"
                  >
                    <NjamboIcon name="crown" tone="gold" size={14} />
                  </span>
                );
              }
              return (
                <span
                  key={step}
                  className={`${styles.trickDot}${done ? ` ${styles.trickDotDone}` : now ? ` ${styles.trickDotNow}` : ""}`}
                  aria-hidden="true"
                />
              );
            })}
          </span>

          <span className={styles.capsuleSep} aria-hidden="true" />

          {/* Pot en direct */}
          <span className={styles.capsulePot}>
            <NjamboIcon name="coin" tone="gold" size={15} />
            <span>{NKAP(displayedPot)}</span>
          </span>

          <span className={styles.capsuleSep} aria-hidden="true" />

          {/* Tendance ultra-lisible */}
          <span
            className={`${styles.capsuleSuit}${!ledSuit ? ` ${styles.capsuleSuitEmpty}` : suitIsRed ? ` ${styles.capsuleSuitRed}` : ""}`}
            title={ledSuit ? `Tendance : ${ledSuit}` : "Tendance libre"}
          >
            {ledSuit ?? "—"}
          </span>
        </div>

        <TableMenuButton onClick={handleMenuTap} label="Retour au menu">
          <NjamboIcon name="home" tone="light" size={20} />
        </TableMenuButton>

        {gameMode !== "bot" && connectionStatus && (
          <TableStatusMessage urgent={connectionStatus.urgent}>
            <Chip
              strong
              tone={connectionStatus.urgent ? "pink" : "gold"}
              style={{ fontSize: 10.5, padding: "4px 9px" }}
            >
              {connectionStatus.label}
            </Chip>
          </TableStatusMessage>
        )}
      </TableStatusBar>
      <TableLiveRegion message={tableAnnouncement} />

      {/* Centre : pioche 3D discrète + médaillon Pot (handles "deck" et "pot") */}
      <DeckZone
        deckW={deckW}
        pot={displayedPot}
        ledSuit={ledSuit}
        ledColor={ledInfo?.color}
        dealing={roundIntro || phase === "dealing"}
        motionEnabled={motionEnabled}
        premiumFxAllowed={premiumFxAllowed}
        liteMotion={liteMotion}
        portrait={portrait}
      />

      {/* Bannière discrète */}
      {!isGameEnded && banner && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: "absolute",
            top: portrait ? "21%" : "20%",
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
        const isLeaderDeposit = liveDominantIdx === i;
        const depositClass = motionEnabled
          ? isLeaderDeposit
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
              zIndex: isLeaderDeposit ? 18 : 10,
            }}
          >
            <DepositZone
              seatIdx={i}
              deposit={p.deposit}
              w={depW}
              active={active}
              isDominant={isLeaderDeposit}
              dropReady={p.isYou && isYourTurn && isDraggingCard}
              effects={motionEnabled}
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
            data-seat-edge={edge}
            data-player-hand={p.isYou || undefined}
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
              seatAngle={a.angle}
              playerCount={n}
              dealing={motionEnabled && phase === "dealing"}
              legal={p.isYou ? yourLegal : null}
              onCardClick={handleCardClick}
              motionOn={motionEnabled}
              getDropRect={p.isYou ? getYourDropRect : undefined}
              getDeckRect={getDeckRect}
              onDragActive={p.isYou ? setIsDraggingCard : undefined}
            />
          </div>
        );
      })}

      {/* Avatars */}
      {players.map((p, i) => {
        const edge = seatEdge(i);
        const active = !isGameEnded && phase === "turns" && turnIdx === i;
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
        const opponentPowers: OpponentPowerSlot[] | undefined = p.isYou
          ? undefined
          : (() => {
              const played = opponentPowerUses[i] ?? [];
              const total =
                p.equippedPowers !== undefined
                  ? Math.max(p.equippedPowers.length, played.length)
                  : Math.max(MAX_EQUIPPED_POWERS, played.length);
              if (total <= 0) return undefined;
              return Array.from({ length: total }, (_, idx) =>
                played[idx] ? { revealedCardId: played[idx], used: true } : { used: false },
              );
            })();

        return (
          <TimerAvatar
            key={"av" + p.name}
            store={timerStore}
            player={p}
            seatIdx={i}
            active={active}
            turnSeconds={cfg.turnSeconds}
            size={p.isYou ? 44 : portrait ? 44 : 50}
            compactHorizontal={p.isYou}
            unlimitedTime={isLocalSync && DEV.unlimitedTime}
            opponentPowers={opponentPowers}
            className={avatarClassName}
            style={avatarStyle}
            motionEnabled={motionEnabled}
          />
        );
      })}

      {/* Ligne tactique ultra-fine 1 ligne (Salon Royal Épuré) */}
      {isYourTurn && (() => {
        const dominantPlay =
          liveDominantIdx !== null
            ? trickPlays.find((tp) => tp.playerIdx === liveDominantIdx) ?? trickPlays[0]
            : trickPlays[0];
        const hasLedSuit = Boolean(ledSuit && yourHand?.some((c) => c.suit === ledSuit));
        const canBeatDominant = Boolean(
          ledSuit &&
            hasLedSuit &&
            dominantPlay &&
            yourHand?.some((c) => c.suit === ledSuit && c.value > (dominantPlay.card.effectiveValue ?? dominantPlay.card.value)),
        );
        const suitClass = suitIsRed ? styles.suitRed : styles.suitLight;

        return (
          <TableTurnStatus bottomOffset={turnStatusBottom} motionEnabled={motionEnabled}>
            <div className={`${styles.turnPill}${isFinalTrick ? ` ${styles.turnPillFinal}` : ""}`}>
              <span className={styles.turnDot} aria-hidden="true" />
              {!ledSuit ? (
                isFinalTrick ? (
                  <span>🔥 Ngata (5e tour) · Donne la tendance !</span>
                ) : (
                  <span>À toi · Donne la tendance</span>
                )
              ) : hasLedSuit ? (
                <span>
                  À toi · Suis <b className={suitClass}>{ledSuit}</b>
                  {dominantPlay ? (
                    canBeatDominant ? (
                      <>
                        {" "}· Bats{" "}
                        <b className={styles.beatTag}>
                          {dominantPlay.card.rank}
                          <span className={suitClass}>{dominantPlay.card.suit}</span>
                        </b>
                      </>
                    ) : (
                      <> · Joue petit</>
                    )
                  ) : null}
                </span>
              ) : (
                <span>
                  Hors <b className={suitClass}>{ledSuit}</b> · Défausse libre
                </span>
              )}
            </div>
          </TableTurnStatus>
        );
      })()}

      {!isGameEnded && motionEnabled && momentOverlay && <GameMomentOverlay key={momentOverlay.key} moment={momentOverlay} motionLevel={motionLevel} />}

      {/* Effets d'activation des cartes pouvoir (flash, particules, overlay
          d'activation) — rendus et séquencés par l'orchestrateur générique. */}
      {!isGameEnded && orchestrator.element}

      {!isGameEnded && motionEnabled && !liteMotion && tableReaction && (
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

      {/* Confirmation de sortie — Salon Royal */}
      {confirmQuit && (
        <div className={styles.modalBackdrop} onClick={() => setConfirmQuit(false)}>
          <div className={styles.modalCard} style={{ maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
            <NjamboMark size={44} />
            <h2 className={styles.modalTitle}>Quitter la partie ?</h2>
            <p className={styles.modalSub}>
              {isLocalSync
                ? "La manche en cours sera perdue."
                : gameMode === "event"
                  ? "Abandonner compte comme une défaite de l'événement."
                  : players.length <= 2
                    ? "Abandonner compte comme une défaite et donne la victoire à l'adversaire."
                    : "Vous serez éliminé de cette partie. Les autres joueurs continueront."}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", width: "100%", marginTop: 4 }}>
              <Btn tone="teal" fill="soft" size="md" onClick={() => setConfirmQuit(false)} style={{ flex: 1 }}>
                Rester
              </Btn>
              <Btn tone="red" fill="solid" size="md" onClick={handleQuitConfirm} style={{ flex: 1 }}>
                Quitter
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Cartes en vol */}
      <TransientAnimationLayer
        store={transientStore}
        motionEnabled={motionEnabled}
        liteMotion={liteMotion}
        balancedMotion={balancedMotion}
        reactionPosition={(uiIdx) => depositPos(seatEdge(uiIdx))}
      />

      {/* Bulle d'émojis rétractable — parties en ligne / entre amis */}
      {isOnline && (
        <div className={styles.reactionDock} aria-label="Réactions">
          <button
            data-nj-skin="none"
            type="button"
            className={styles.reactionToggle}
            onClick={() => setReactionsOpen((v) => !v)}
            aria-expanded={reactionsOpen}
            aria-label={reactionsOpen ? "Fermer les réactions" : "Envoyer une réaction"}
          >
            {reactionsOpen ? "×" : "😊"}
          </button>
          {reactionsOpen && (
            <div className={styles.reactionPopover}>
              {REACTION_EMOJIS.map((em) => (
                <button
                  data-nj-skin="none"
                  key={em}
                  type="button"
                  className={styles.reactionEmojiBtn}
                  onClick={() => {
                    handleSendReaction(em);
                    setReactionsOpen(false);
                  }}
                  aria-label={`Réaction ${em}`}
                >
                  {em}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ Cartes Pouvoir : discret à droite en prod (≤3), tiroir complet en mode test (>3) ═══ */}
      {hasPowersOnTable && (
        <TablePowerTray bottomOffset={portrait ? cockpitBottom : undefined}>
          {isTestPowerMode ? (
            <button
              data-nj-skin="none"
              type="button"
              className={styles.testTriggerBtn}
              onClick={() => setTestDrawerOpen((open) => !open)}
              aria-expanded={testDrawerOpen}
              aria-label={`Ouvrir le tiroir de test des ${equippedPowers.length} cartes pouvoir`}
            >
              <span className={styles.testTriggerFan} aria-hidden="true">
                <span className={styles.testTriggerMini} />
                <span className={styles.testTriggerMini} />
                <span className={styles.testTriggerMini} />
              </span>
              <span className={styles.testTriggerCopy}>
                <small>Mode test</small>
                <strong>{equippedPowers.length} pouvoirs</strong>
              </span>
            </button>
          ) : (
            equippedPowers.map((cardId, idx) => {
              const def = POWER_CARDS_BY_ID[cardId];
              if (!def) return null;
              const used = Boolean(def.disabled) || (!DEV.unlimitedPowers && usedPowers.has(cardId));
              const active = targetingCard === cardId || previewPowerCard === cardId;
              const mid = (equippedPowers.length - 1) / 2;
              const rot = (idx - mid) * 7;
              const yShift = Math.abs(idx - mid) * 3;
              return (
                <button
                  data-nj-skin="none"
                  key={cardId}
                  type="button"
                  className={`${styles.prodPowerBtn}${active ? ` ${styles.prodPowerBtnActive}` : ""}`}
                  onClick={() => {
                    if (targetingCard === cardId) {
                      setTargetingCard(null);
                      return;
                    }
                    setPreviewPowerCard(cardId);
                  }}
                  aria-label={`${def.name} — voir l'effet`}
                  aria-pressed={active}
                  title={`${def.name} — ${def.description}`}
                  style={
                    {
                      "--fan-rot": `${rot}deg`,
                      "--fan-y": `${yShift}px`,
                      "--fan-ml": idx === 0 ? "0px" : "-7px",
                      opacity: used ? 0.44 : isYourTurn ? 1 : 0.84,
                    } as CSSProperties
                  }
                >
                  <PowerCardView card={def} compact showMeta={false} selected={active} disabled={used} />
                  {used && (
                    <span className={styles.powerUsedOverlay}>
                      <NjamboIcon name="check" tone="light" size={16} />
                    </span>
                  )}
                </button>
              );
            })
          )}
        </TablePowerTray>
      )}

      {/* Tiroir flottant de test (quand > 3 cartes en mode test/dev) */}
      {isTestPowerMode && testDrawerOpen && (
        <div className={styles.testDrawerBackdrop} onClick={() => setTestDrawerOpen(false)}>
          <div
            className={styles.testPowerDrawer}
            role="dialog"
            aria-label="Grimoire de test des cartes pouvoir"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.testDrawerHead}>
              <div className={styles.testDrawerTitle}>
                <span className={styles.testBadge}>Mode test</span>
                <span>{filteredTestPowers.length} / {equippedPowers.length} cartes</span>
              </div>
              <button
                data-nj-skin="none"
                type="button"
                className={styles.testDrawerClose}
                onClick={() => setTestDrawerOpen(false)}
                aria-label="Fermer le tiroir des pouvoirs"
              >
                ×
              </button>
            </div>

            <div className={styles.testFilterRow} role="tablist" aria-label="Filtrer par catégorie">
              {TEST_FILTER_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  data-nj-skin="none"
                  type="button"
                  role="tab"
                  aria-selected={testCategoryFilter === cat.id}
                  className={`${styles.testFilterPill}${testCategoryFilter === cat.id ? ` ${styles.testFilterActive}` : ""}`}
                  onClick={() => setTestCategoryFilter(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className={styles.testCardGrid}>
              {filteredTestPowers.map((cardId) => {
                const def = POWER_CARDS_BY_ID[cardId];
                if (!def) return null;
                const used = Boolean(def.disabled) || (!DEV.unlimitedPowers && usedPowers.has(cardId));
                const active = targetingCard === cardId || previewPowerCard === cardId;
                return (
                  <button
                    key={cardId}
                    data-nj-skin="none"
                    type="button"
                    className={styles.testCardCell}
                    onClick={() => {
                      setTestDrawerOpen(false);
                      if (targetingCard === cardId) {
                        setTargetingCard(null);
                        return;
                      }
                      setPreviewPowerCard(cardId);
                    }}
                    aria-label={`${def.name} — voir et activer`}
                    style={{ opacity: used ? 0.48 : 1 }}
                  >
                    <PowerCardView card={def} compact showMeta={false} selected={active} disabled={used} />
                    {used && (
                      <span className={styles.powerUsedOverlay}>
                        <NjamboIcon name="check" tone="light" size={18} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Aperçu tactile d'une carte pouvoir (explication claire + activation) */}
      {previewPowerCard && (() => {
        const def = POWER_CARDS_BY_ID[previewPowerCard];
        if (!def) return null;
        const used = Boolean(def.disabled) || (!DEV.unlimitedPowers && usedPowers.has(previewPowerCard));
        const canActivateNow = isYourTurn && !used && !animatingRef.current;
        return (
          <div className={styles.modalBackdrop} onClick={() => setPreviewPowerCard(null)}>
            <div className={styles.modalCard} style={{ maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
              <PowerCardView card={def} showMeta />
              <p className={styles.modalSub}>{def.description}</p>
              <Chip
                strong
                tone={canActivateNow ? "teal" : used ? "pink" : "gold"}
                style={{ fontSize: 11.5, padding: "5px 12px" }}
              >
                {used
                  ? "Déjà utilisée durant cette manche"
                  : isYourTurn
                    ? "Prête — activable gratuitement pendant ton tour"
                    : "Activable uniquement quand c'est ton tour"}
              </Chip>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", width: "100%", marginTop: 4 }}>
                <Btn
                  tone="teal"
                  fill="soft"
                  size="md"
                  onClick={() => setPreviewPowerCard(null)}
                  style={{ flex: 1 }}
                >
                  Fermer
                </Btn>
                {canActivateNow && (
                  <Btn
                    tone="gold"
                    fill="solid"
                    size="md"
                    onClick={() => {
                      const id = previewPowerCard;
                      setPreviewPowerCard(null);
                      handlePowerTap(id);
                    }}
                    style={{ flex: 1 }}
                  >
                    Activer
                  </Btn>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Mémo rapide des règles en pleine partie (sans quitter la table) */}
      {showQuickHelp && (
        <div className={styles.modalBackdrop} onClick={() => setShowQuickHelp(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%" }}>
              <h2 className={styles.modalTitle}>Comment gagner au Njambo ?</h2>
              <Chip strong tone="gold" style={{ fontSize: 10.5 }}>
                Mémo
              </Chip>
            </div>

            <div className={styles.ruleCard}>
              <strong className={styles.ruleHeadingGold}>1. Suivre la tendance (couleur)</strong>
              <div style={{ marginTop: 3, opacity: 0.85 }}>
                Le 1er joueur pose une couleur (♠ ♥ ♦ ♣). Si tu en as, tu <b>dois</b> la jouer. La plus forte carte dans la tendance gagne le pli et lance le tour suivant.
              </div>
            </div>

            <div className={styles.ruleCard}>
              <strong className={styles.ruleHeadingTeal}>2. Défausser intelligemment</strong>
              <div style={{ marginTop: 3, opacity: 0.85 }}>
                Si tu n&apos;as pas la couleur demandée, tu peux poser n&apos;importe quelle carte, mais <b>elle ne peut jamais gagner le pli</b>. Garde tes grosses cartes pour plus tard !
              </div>
            </div>

            <div className={`${styles.ruleCard} ${styles.ruleCardGold}`}>
              <strong className={styles.ruleHeadingGold}>3. Seul le 5e tour (Ngata) donne le pot !</strong>
              <div style={{ marginTop: 3, opacity: 0.88 }}>
                Les 4 premiers plis servent à prendre ou garder la main. Le joueur qui remporte le <b>5e et dernier pli</b> rafle tout le pot ! Gagner ce 5e pli avec un <b>3 double les gains (×2)</b>.
              </div>
            </div>

            <div className={styles.ruleCard}>
              <strong className={styles.ruleHeadingPink}>4. Victoires instantanées & Pouvoirs</strong>
              <div style={{ marginTop: 3, opacity: 0.85 }}>
                Dès la donne, une main dont la somme est <b>&lt; 21</b>, <b>= 21 (×2)</b> ou <b>5 cartes de même couleur (×2)</b> gagne immédiatement. Touche tes cartes pouvoir en bas à droite pour voir leur effet.
              </div>
            </div>

            <Btn
              tone="gold"
              fill="solid"
              size="md"
              onClick={() => setShowQuickHelp(false)}
              style={{ width: "100%", marginTop: 4 }}
            >
              J&apos;ai compris, reprendre la manche
            </Btn>
          </div>
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
    </TableLayout>
    </ZoneRegistryProvider>
  );
}
