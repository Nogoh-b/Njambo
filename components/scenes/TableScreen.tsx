"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { CEREMONIAL_STRIP, T } from "@/config/theme";
import { useGame } from "@/contexts/GameContext";
import { useAuth } from "@/hooks/useAuth";
import { useViewport } from "@/hooks/useViewport";
import { BOTS, FCFA } from "@/data/mock";
import { Chip } from "@/components/ui/Chip";
import { PlayCard } from "@/components/cards/PlayCard";
import { Fan } from "@/components/table/Fan";
import { DepositZone } from "@/components/table/DepositZone";
import { FlyingCard } from "@/components/table/FlyingCard";
import { Avatar } from "@/components/table/Avatar";
import { NjamboIcon, NjamboMark, type NjamboIconName } from "@/components/ui/Art";
import { displayFont } from "@/components/ui/Shell";
import type {
  BotDifficulty,
  Flight,
  GameState,
  GameSyncActions,
  Phase,
  PowerCardId,
  Result,
  RoomPlayer,
  Suit,
} from "@/types/game";
import { LocalGameSync } from "@/sync/LocalGameSync";
import { FirestoreGameSync } from "@/sync/FirestoreGameSync";
import { POWER_CARDS_BY_ID } from "@/config/powerCards";
import { requiresTarget } from "@/engine/powerEffects";
import { REACTION_EMOJIS, listenReactions, sendReaction } from "@/lib/reactions";

/* ═══════════════ TableScreen — la table de jeu ═══════════════
   Rendu pur de la table + animations.
   La logique de jeu est déléguée au GameSync (Local ou Firestore). */

interface TableScreenProps {
  gameMode: "bot" | "online" | "friends";
  onResult: (result: Result) => void;
  onRoundRestart: () => void;
  onMenu: () => void;
  initialBotCount?: number;
  initialMise?: number;
  initialDifficulty?: BotDifficulty;
  roomId?: string;
  roomPlayers?: RoomPlayer[];
  roomHostId?: string;
  onNextRoundRef: { current: (() => void) | null };
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
}

interface MomentOverlayRequest {
  moment: Omit<MomentOverlay, "key">;
  duration: number;
}

const ROUND_INTRO_MS = 1550;
const MOMENT_DEFAULT_MS = 1500;

function GameMomentOverlay({ moment }: { moment: MomentOverlay }) {
  return (
    <div className={`nj-moment-overlay nj-moment-${moment.tone} nj-moment-${moment.type}`} aria-hidden="true">
      <div className="nj-moment-halo" />
      <div className="nj-moment-card-sweep nj-moment-card-sweep-left">
        <PlayCard hidden w={52} />
      </div>
      <div className="nj-moment-card-sweep nj-moment-card-sweep-right">
        <PlayCard hidden w={46} />
      </div>
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
        {Array.from({ length: 8 }, (_, index) => (
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
  onNextRoundRef,
}: TableScreenProps) {
  const { profile, setProfile, cfg, sfx, animationsOn } = useGame();
  const { user: authUser } = useAuth();
  const A = cfg.anim;
  const mise = initialMise;
  const roomPlayersKey = roomPlayers?.map((p) => p.uid).join("|") ?? "";
  // Clé d'identité de session : en mode bot, l'auth n'a aucun rôle → on ne
  // veut PAS relancer (re-distribuer) la partie quand l'auth Firebase se
  // résout après le montage. Seuls online/friends dépendent de l'uid.
  const sessionAuthKey = gameMode === "bot" ? "" : authUser?.uid ?? "";

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
  const [flights, setFlights] = useState<Flight[]>([]);
  const [cardBursts, setCardBursts] = useState<CardBurst[]>([]);
  const [roundIntro, setRoundIntro] = useState(false);
  const [momentOverlay, setMomentOverlay] = useState<MomentOverlay | null>(null);
  const [tableReaction, setTableReaction] = useState<TableReaction | null>(null);
  const [flyingSrc, setFlyingSrc] = useState<{ playerIdx: number; cardIdx: number } | null>(null);
  const [goldFlash, setGoldFlash] = useState(false);
  const [screenEffect] = useState<"win" | "lose" | null>(null);
  const [banner, setBanner] = useState("");
  const [seconds, setSeconds] = useState(cfg.turnSeconds);

  /* ----- Cartes pouvoir (UI d'activation) ----- */
  const equippedPowers = profile.equippedPowers ?? [];
  const [usedPowers, setUsedPowers] = useState<Set<PowerCardId>>(new Set());
  const [targetingCard, setTargetingCard] = useState<PowerCardId | null>(null);
  const [powerReveal, setPowerReveal] = useState<{ targetIdx: number } | null>(null);
  const powerRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const animatingRef = useRef(false);
  const animationEndsAtRef = useRef(0);
  const handRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const depositRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const syncRef = useRef<GameSyncActions | null>(null);
  const playersRef = useRef<GameState["players"]>([]);
  const turnIdxRef = useRef(0);
  const delayedStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animatedPlayIdsRef = useRef<Set<string>>(new Set());
  const animationsOnRef = useRef(animationsOn);
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

  /* ----- Dérivés de l'état ----- */
  const { players, phase, trickNo, trickPlays, turnIdx, pot, dominantIdx } = gameState;
  const n = players.length;
  const expectedPlayerCount = n || (gameMode === "bot" ? initialBotCount + 1 : roomPlayers?.length ?? 0);
  const displayedPot = roundIntro ? mise * Math.max(expectedPlayerCount, 1) : pot;
  const you = players[0];
  const ledSuit: string | null = trickPlays[0]?.card.suit ?? null;
  const ledInfo: Suit | undefined = ledSuit ? cfg.suits.find((s) => s.s === ledSuit) : undefined;
  const isYourTurn = phase === "turns" && turnIdx === 0;
  const yourLegal = you && isYourTurn ? legalCards(you.hand, ledSuit) : null;

  useEffect(() => {
    playersRef.current = players;
    turnIdxRef.current = turnIdx;
  }, [players, turnIdx]);

  useEffect(() => {
    animationsOnRef.current = animationsOn;
  }, [animationsOn]);

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
  const handleUpdateBalance = useCallback((balance: number) => {
    setProfile((pr) => ({ ...pr, balance }));
  }, [setProfile]);

  const handleBanner = useCallback((text: string) => {
    setBanner(text);
  }, []);

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
    });

    if (momentOverlayTimerRef.current) clearTimeout(momentOverlayTimerRef.current);
    momentOverlayTimerRef.current = setTimeout(() => {
      momentOverlayTimerRef.current = null;
      playNextMomentOverlay();
    }, next.duration);
  }, []);

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
    }, 1400);
  }, []);

  useEffect(() => {
    return () => {
      if (roundIntroTimerRef.current) clearTimeout(roundIntroTimerRef.current);
      if (dealSweepTimerRef.current) clearTimeout(dealSweepTimerRef.current);
      if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
      if (momentOverlayTimerRef.current) clearTimeout(momentOverlayTimerRef.current);
      if (powerRevealTimerRef.current) clearTimeout(powerRevealTimerRef.current);
      momentOverlayQueueRef.current = [];
      momentOverlayActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (animationsOn) return;
    momentOverlayQueueRef.current = [];
    momentOverlayActiveRef.current = false;
    if (momentOverlayTimerRef.current) {
      clearTimeout(momentOverlayTimerRef.current);
      momentOverlayTimerRef.current = null;
    }
    setMomentOverlay(null);
  }, [animationsOn]);

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
  }, [animationsOn, phase, showTableReaction]);

  useEffect(() => {
    if (phase !== "turns") return;
    if (prevTurnIdxFxRef.current === turnIdx) return;
    prevTurnIdxFxRef.current = turnIdx;

    const activePlayer = players[turnIdx];
    if (turnIdx === 0) {
      sfxRef.current((sound) => sound.turnStart());
      showMomentOverlay({
        type: "yourTurn",
        title: "À TOI",
        subtitle: ledSuit ? `Suis ${ledSuit}` : "Donne la tendance",
        tone: "teal",
        asset: "cards",
      }, 1180);
      showTableReaction(
        ledSuit ? `Suis ${ledSuit}` : "A toi de jouer",
        "teal",
        ledSuit ? "Pose la bonne couleur" : "Donne la tendance",
      );
      return;
    }

    if (animationsOn && activePlayer) {
      showTableReaction("Tour en cours", "gold", activePlayer.name);
    }
  }, [animationsOn, ledSuit, phase, players, showMomentOverlay, showTableReaction, turnIdx]);

  /* ----- Initialiser le sync adapter ----- */
  useEffect(() => {
    let sync: GameSyncActions;

    if (gameMode === "bot") {
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
    } else {
      if (!roomId || !roomHostId || !authUser?.uid || !roomPlayers?.length) {
        setBanner("Connexion a la salle...");
        return;
      }

      // online ou friends
      sync = new FirestoreGameSync({
        roomId,
        roomPlayers,
        hostId: roomHostId,
        myUid: authUser.uid,
        profile,
        cfg,
        mise,
        onResult,
        onUpdateBalance: handleUpdateBalance,
        onRoundRestart,
        onRematchExpired: onMenu,
      });
    }

    syncRef.current = sync;
    const animatedPlayIds = animatedPlayIdsRef.current;

    // Écouter les événements du sync
    const unsubState = sync.onStateUpdate((state) => {
      setBanner("");
      if (animatingRef.current) {
        if (delayedStateTimerRef.current) clearTimeout(delayedStateTimerRef.current);
        // Révéler le dépôt réel juste avant l'atterrissage : assez tôt pour
        // qu'aucun trou n'apparaisse, assez tard pour éviter la carte en double.
        const revealBeforeLandingMs = 40;
        const delay = Math.max(0, animationEndsAtRef.current - Date.now() - revealBeforeLandingMs);
        delayedStateTimerRef.current = setTimeout(() => {
          setGameState(state);
          delayedStateTimerRef.current = null;
        }, delay);
        return;
      }
      setGameState(state);
    });

    const unsubPlay = sync.onPlayCard(({ playerIdx, cardIdx, card, playId }) => {
      if (playId) {
        if (animatedPlayIds.has(playId)) return;
        animatedPlayIds.add(playId);
      }

      sfxRef.current((s) => s.card());
      const handEl = handRefs.current[playerIdx];
      const depEl = depositRefs.current[playerIdx];
      const srcEl = handEl?.children?.[cardIdx] ?? handEl;

      if (srcEl && depEl) {
        animatingRef.current = true;
        animationEndsAtRef.current = Date.now() + A.dropFlight;
        const from = (srcEl as HTMLElement).getBoundingClientRect();
        const to = (depEl as HTMLElement).getBoundingClientRect();
        const dropRot = Math.random() * 18 - 9;
        setFlyingSrc({ playerIdx, cardIdx });
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
          setFlyingSrc(null);
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
      setBanner(`${winnerName} domine le tour`);
      sfxRef.current((sound) => sound.dominance());
      showMomentOverlay({
        type: "dominance",
        title: "NJAMBO !",
        subtitle: winnerIdx === 0 ? "Tu domines le tour" : winnerName,
        tone: winnerIdx === 0 ? "teal" : "gold",
        asset: "crown",
      }, 1450);
      showTableReaction(
        winnerIdx === 0 ? "Bien joué" : "Domine",
        winnerIdx === 0 ? "teal" : "gold",
        winnerIdx === 0 ? "Tu prends le tour" : winnerName,
      );
      if (animationsOnRef.current) {
        setGoldFlash(false);
        const goldTimer = setTimeout(() => setGoldFlash(true), 600);
        burstTimersRef.current.push(goldTimer);
      }
      const bannerTimer = setTimeout(() => {
        setBanner("");
        setGoldFlash(false);
      }, A.trickPause);
      burstTimersRef.current.push(bannerTimer);
    });

    const unsubRoundEnd = sync.onRoundEnd((result) => {
      showMomentOverlay({
        type: result.doubles ? "doubleWin" : "win",
        title: result.doubles ? "X2" : "NGATA GAGNÉ",
        subtitle: result.winner.isYou ? "Tu prends la caisse" : `${result.winner.name} prend la caisse`,
        tone: result.winner.isYou ? "gold" : "pink",
        asset: result.doubles ? "coin" : result.winner.isYou ? "trophy" : "crown",
      }, result.doubles ? 1700 : 1550);
    });

    const unsubTimer = sync.onTimerTick((s) => {
      setSeconds(s);
      if (s <= 5 && playersRef.current[turnIdxRef.current]?.isYou) sfxRef.current((sn) => sn.tick());
    });

    const unsubPower = sync.onPowerActivated((activation) => {
      const mine = activation.activatedByUid === "local" || activation.activatedByUid === authUser?.uid;
      if (mine) {
        setUsedPowers((prev) => {
          const next = new Set(prev);
          next.add(activation.cardId);
          return next;
        });
      }
      const def = POWER_CARDS_BY_ID[activation.cardId];
      if (def) sfxRef.current((sn) => sn.dominance());
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
        subtitle: `${expectedPlayerCount} joueurs · Pot ${FCFA(mise * Math.max(expectedPlayerCount, 1))}`,
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
      burstTimersRef.current.forEach((timer) => clearTimeout(timer));
      burstTimersRef.current = [];
      animatedPlayIds.clear();
      syncRef.current = null;
      sync.destroy();
    };
    // Le sync doit vivre pour toute la session. On le relance seulement quand
    // l'identite de session arrive/change, pas quand le solde ou le viewport bouge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode, roomId, roomHostId, sessionAuthKey, roomPlayersKey]);

  /* ----- nextRound exposé au router ----- */
  useEffect(() => {
    onNextRoundRef.current = () => {
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
  const handleUsePower = (cardId: PowerCardId, targetIdx?: number) => {
    if (!syncRef.current || animatingRef.current) return;
    if (!isYourTurn) return;
    if (usedPowers.has(cardId)) return;
    syncRef.current.usePowerCard(cardId, targetIdx);
    setUsedPowers((prev) => new Set(prev).add(cardId));
    setTargetingCard(null);
    // Œil du Sorcier : révélation locale de la main ciblée (5 s).
    if (cardId === "oeil_sorcier" && targetIdx !== undefined) {
      setPowerReveal({ targetIdx });
      if (powerRevealTimerRef.current) clearTimeout(powerRevealTimerRef.current);
      powerRevealTimerRef.current = setTimeout(() => {
        setPowerReveal(null);
        powerRevealTimerRef.current = null;
      }, 5000);
    }
  };

  const handlePowerTap = (cardId: PowerCardId) => {
    if (!isYourTurn || usedPowers.has(cardId) || animatingRef.current) return;
    if (targetingCard === cardId) {
      setTargetingCard(null);
      return;
    }
    if (requiresTarget(cardId)) setTargetingCard(cardId);
    else handleUsePower(cardId);
  };

  /* ----- Réactions émoji (online/friends uniquement) ----- */
  const isOnline = gameMode !== "bot";
  const myUid = authUser?.uid;
  const [reactionBubbles, setReactionBubbles] = useState<{ key: string; uiIdx: number; emoji: string }[]>([]);
  const reactionShownRef = useRef<Set<string>>(new Set());
  const reactionCleanupRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const pushReactionBubble = useCallback((uiIdx: number, emoji: string) => {
    const key = `${uiIdx}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setReactionBubbles((b) => [...b, { key, uiIdx, emoji }]);
    const timer = setTimeout(() => {
      setReactionBubbles((b) => b.filter((x) => x.key !== key));
    }, 2400);
    reactionCleanupRef.current.push(timer);
  }, []);

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
    <div
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
        animation: animationsOn
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
        className={`nj-table-image${animationsOn && roundIntro ? " nj-table-image-ceremony" : ""}`}
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
        {goldFlash && animationsOn && (
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
        <Chip>Mise {FCFA(mise)}</Chip>
      </div>
      <button
        onClick={onMenu}
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

      {/* Centre : deck + pot + tendance */}
      <div
        className={animationsOn && (roundIntro || phase === "dealing") ? "nj-pot-cluster nj-pot-cluster-ready" : "nj-pot-cluster"}
        style={{
          position: "absolute",
          top: "45%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          zIndex: 5,
        }}
      >
        <div style={{ position: "relative", animation: animationsOn && (roundIntro || phase === "dealing") ? "deckDeal .26s infinite" : "none" }}>
          <div style={{ position: "absolute", top: -3, left: 3, zIndex: -1 }}>
            <PlayCard hidden w={deckW} />
          </div>
          <PlayCard hidden w={deckW} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
          <Chip strong style={{ fontSize: 13 }}>
            <NjamboIcon name="coin" tone="gold" size={16} />
            <span style={{ ...displayFont, fontWeight: 900, color: T.gold }}>{FCFA(displayedPot)}</span>
          </Chip>
          <Chip style={{ fontSize: 15 }}>
            <span style={{ opacity: 0.6, fontSize: 10, letterSpacing: ".1em" }}>TENDANCE&nbsp;</span>
            <span style={{ color: ledInfo?.color === "#c1292e" ? T.bad : "#fff", fontWeight: 900 }}>
              {ledSuit ?? "—"}
            </span>
          </Chip>
        </div>
      </div>

      {/* Bannière discrète */}
      {banner && (
        <div
          style={{
            position: "absolute",
            top: "30%",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60,
            animation: animationsOn ? "popIn .3s both" : "none",
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
        const depositClass = animationsOn
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
              ref={(el: HTMLDivElement | null) => {
                depositRefs.current[i] = el;
              }}
              deposit={p.deposit}
              w={depW}
              active={active}
              isDominant={dominantIdx === i}
              effects={animationsOn}
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
            className={animationsOn && roundIntro ? "nj-round-hand-reveal" : undefined}
            style={{
              position: "absolute",
              left: a.left,
              top: a.top,
              transform: `translate(-50%,-50%) rotate(${a.angle}deg)`,
              zIndex: p.isYou ? 30 : 15,
              "--seat-delay": `${i * 90}ms`,
            } as CSSProperties}
          >
            <div
              ref={(el: HTMLDivElement | null) => {
                handRefs.current[i] = el;
              }}
              style={{ display: "flex" }}
            >
              <Fan
                cards={p.hand}
                w={p.isYou ? youW : botW}
                faceUp={p.isYou}
                seatIdx={i}
                playerCount={n}
                dealing={animationsOn && phase === "dealing"}
                legal={p.isYou ? yourLegal : null}
                onCardClick={(ci) => handleCardClick(ci)}
                hiddenIdx={flyingSrc?.playerIdx === i ? flyingSrc.cardIdx : null}
              />
            </div>
          </div>
        );
      })}

      {/* Avatars */}
      {players.map((p, i) => {
        const edge = seatEdge(i);
        const active = phase === "turns" && turnIdx === i;
        return (
          <div
            key={"av" + p.name}
            className={[
              "nj-avatar-seat",
              animationsOn && active ? "nj-avatar-seat-active" : "",
              animationsOn && active && seconds <= 5 ? "nj-avatar-seat-urgent" : "",
              animationsOn && roundIntro ? "nj-round-seat-reveal" : "",
            ].filter(Boolean).join(" ")}
            style={{
              position: "absolute",
              zIndex: 40,
              "--seat-delay": `${i * 110}ms`,
              ...avatarPos(edge),
            } as CSSProperties}
          >
            <Avatar
              p={p}
              active={active}
              seconds={seconds}
              turnSeconds={cfg.turnSeconds}
              size={p.isYou ? 58 : 50}
            />
          </div>
        );
      })}

      {/* Indication de tour */}
      {isYourTurn && (
        <div
          className={animationsOn ? "nj-turn-prompt" : undefined}
          style={{
            position: "absolute",
            bottom: fanHy * 0.78,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 45,
            animation: animationsOn ? "popIn .25s both" : "none",
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

      {animationsOn && momentOverlay && <GameMomentOverlay key={momentOverlay.key} moment={momentOverlay} />}

      {animationsOn && tableReaction && (
        <div
          key={tableReaction.key}
          className={`nj-table-reaction nj-table-reaction-${tableReaction.tone}`}
          aria-hidden="true"
        >
          <span>{tableReaction.label}</span>
          {tableReaction.detail && <small>{tableReaction.detail}</small>}
        </div>
      )}

      {/* Cartes en vol */}
      {flights.map((f) => (
        <FlyingCard key={f.key} f={f} effects={animationsOn} />
      ))}

      {animationsOn && cardBursts.map((burst) => (
        <div
          key={burst.key}
          className="nj-card-burst"
          style={{
            left: burst.left,
            top: burst.top,
            "--burst-tone": burst.tone,
          } as CSSProperties}
          aria-hidden="true"
        >
          <span />
          <span />
          <span />
          <span />
        </div>
      ))}

      {/* Réactions émoji entrantes — bulle flottante près du dépôt de l'auteur */}
      {reactionBubbles.map((b) => {
        const dp = depositPos(seatEdge(b.uiIdx));
        return (
          <div
            key={b.key}
            style={{
              position: "absolute",
              left: dp.left,
              top: dp.top,
              transform: "translate(-50%,-140%)",
              zIndex: 55,
              pointerEvents: "none",
            }}
            aria-hidden="true"
          >
            <span className="nj-reaction-bubble" style={{ animation: "reactionFloat 2.4s ease-out both" }}>
              {b.emoji}
            </span>
          </div>
        );
      })}

      {/* Barre d'émojis — parties en ligne / entre amis */}
      {isOnline && (
        <div className="nj-reaction-bar" aria-label="Réactions">
          {REACTION_EMOJIS.map((em) => (
            <button key={em} type="button" onClick={() => handleSendReaction(em)} aria-label={`Réaction ${em}`}>
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
          }}
          aria-label="Cartes pouvoir"
        >
          {equippedPowers.map((cardId) => {
            const def = POWER_CARDS_BY_ID[cardId];
            if (!def) return null;
            const used = usedPowers.has(cardId);
            const disabled = used || !isYourTurn;
            const active = targetingCard === cardId;
            const tint = def.tone === "gold" ? T.gold : def.tone === "teal" ? T.teal : def.tone === "pink" ? T.pink : T.cobalt;
            return (
              <button
                key={cardId}
                type="button"
                onClick={() => handlePowerTap(cardId)}
                disabled={disabled}
                aria-label={def.name}
                title={`${def.name} — ${def.description}`}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
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
                <NjamboIcon name={def.icon as NjamboIconName} tone={def.tone} size={26} />
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

      {/* Sélection de cible pour une carte pouvoir */}
      {targetingCard && (
        <div
          onClick={() => setTargetingCard(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
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
              padding: 18,
              maxWidth: 320,
              width: "100%",
              textAlign: "center",
            }}
          >
            <div style={{ ...displayFont, fontWeight: 900, fontSize: 18, marginBottom: 2 }}>
              {POWER_CARDS_BY_ID[targetingCard]?.name}
            </div>
            <div className="nj-subtle" style={{ fontSize: 13, marginBottom: 14 }}>Choisis une cible</div>
            <div style={{ display: "grid", gap: 8 }}>
              {players.map((p, i) => {
                if (i === 0) return null;
                return (
                  <button
                    key={"tgt" + p.name}
                    type="button"
                    onClick={() => handleUsePower(targetingCard, i)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: `1.5px solid ${T.pink}66`,
                      background: "rgba(216,60,104,.14)",
                      color: T.text,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    <Avatar p={p} active={false} seconds={0} turnSeconds={cfg.turnSeconds} size={34} />
                    <span>{p.name}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setTargetingCard(null)}
              style={{
                marginTop: 14,
                padding: "8px 16px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,.2)",
                background: "transparent",
                color: T.muted,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Overlay Œil du Sorcier : révélation de la main adverse */}
      {powerReveal && players[powerReveal.targetIdx] && (
        <div
          onClick={() => setPowerReveal(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 72,
            background: "rgba(5,5,12,.8)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ ...displayFont, fontWeight: 900, fontSize: 20, color: T.pink, marginBottom: 2 }}>
              Œil du Sorcier
            </div>
            <div className="nj-subtle" style={{ fontSize: 13, marginBottom: 16 }}>
              Main de {players[powerReveal.targetIdx].name}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", maxWidth: 340 }}>
              {(() => {
                const revealHand = players[powerReveal.targetIdx].hand.filter((c) => c.rank !== "?");
                if (revealHand.length === 0) {
                  return <span className="nj-subtle">Main non visible dans cette partie.</span>;
                }
                return revealHand.map((c) => <PlayCard key={c.id} card={c} w={46} />);
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
