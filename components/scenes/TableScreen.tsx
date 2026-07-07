"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { NjamboIcon } from "@/components/ui/Art";
import { displayFont } from "@/components/ui/Shell";
import type {
  Flight,
  GameState,
  GameSyncActions,
  Result,
  RoomPlayer,
  Suit,
} from "@/types/game";
import { LocalGameSync } from "@/sync/LocalGameSync";
import { FirestoreGameSync } from "@/sync/FirestoreGameSync";

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
  roomId?: string;
  roomPlayers?: RoomPlayer[];
  roomHostId?: string;
  onNextRoundRef: { current: (() => void) | null };
}

export function TableScreen({
  gameMode,
  onResult,
  onRoundRestart,
  onMenu,
  initialBotCount = 2,
  initialMise = 250,
  roomId,
  roomPlayers,
  roomHostId,
  onNextRoundRef,
}: TableScreenProps) {
  const { profile, setProfile, cfg, sfx } = useGame();
  const { user: authUser } = useAuth();
  const A = cfg.anim;
  const mise = initialMise;
  const roomPlayersKey = roomPlayers?.map((p) => p.uid).join("|") ?? "";

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
  const [flyingSrc, setFlyingSrc] = useState<{ playerIdx: number; cardIdx: number } | null>(null);
  const [goldFlash, setGoldFlash] = useState(false);
  const [screenEffect] = useState<"win" | "lose" | null>(null);
  const [banner, setBanner] = useState("");
  const [seconds, setSeconds] = useState(cfg.turnSeconds);
  const animatingRef = useRef(false);
  const handRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const depositRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const syncRef = useRef<GameSyncActions | null>(null);
  const playersRef = useRef<GameState["players"]>([]);
  const turnIdxRef = useRef(0);
  const delayedStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animatedPlayIdsRef = useRef<Set<string>>(new Set());

  /* ----- Dérivés de l'état ----- */
  const { players, phase, trickNo, trickPlays, turnIdx, pot, dominantIdx } = gameState;
  const n = players.length;
  const you = players[0];
  const ledSuit: string | null = trickPlays[0]?.card.suit ?? null;
  const ledInfo: Suit | undefined = ledSuit ? cfg.suits.find((s) => s.s === ledSuit) : undefined;
  const isYourTurn = phase === "turns" && turnIdx === 0;
  const yourLegal = you && isYourTurn ? legalCards(you.hand, ledSuit) : null;

  useEffect(() => {
    playersRef.current = players;
    turnIdxRef.current = turnIdx;
  }, [players, turnIdx]);

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
      case "top":
        return { left: "50%", top: 8, transform: `translateX(calc(-50% - ${botW * 3.2}px))` };
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
        delayedStateTimerRef.current = setTimeout(() => {
          setGameState(state);
          delayedStateTimerRef.current = null;
        }, A.dropFlight);
        return;
      }
      setGameState(state);
    });

    const unsubPlay = sync.onPlayCard(({ playerIdx, cardIdx, card, playId }) => {
      if (playId) {
        if (animatedPlayIds.has(playId)) return;
        animatedPlayIds.add(playId);
      }

      sfx((s) => s.card());
      const handEl = handRefs.current[playerIdx];
      const depEl = depositRefs.current[playerIdx];
      const srcEl = handEl?.children?.[cardIdx] ?? handEl;

      if (srcEl && depEl) {
        animatingRef.current = true;
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
        setTimeout(() => {
          animatingRef.current = false;
          setFlights((f) => f.slice(1));
          setFlyingSrc(null);
        }, A.dropFlight + 30);
      }
    });

    const unsubTrickEnd = sync.onTrickEnd((winnerIdx) => {
      setBanner(`${playersRef.current[winnerIdx]?.name ?? "Joueur"} domine le tour`);
      setGoldFlash(false);
      setTimeout(() => setGoldFlash(true), 600);
      setTimeout(() => {
        setBanner("");
        setGoldFlash(false);
      }, A.trickPause);
    });

    const unsubTimer = sync.onTimerTick((s) => {
      setSeconds(s);
      if (s <= 5 && playersRef.current[turnIdxRef.current]?.isYou) sfx((sn) => sn.tick());
    });

    // Démarrer la partie
    sync.start();

    return () => {
      unsubState();
      unsubPlay();
      unsubTrickEnd();
      unsubTimer();
      if (delayedStateTimerRef.current) clearTimeout(delayedStateTimerRef.current);
      animatedPlayIds.clear();
      // unsubRoundEnd n'a pas de retour — le sync appelle onResult directement
      syncRef.current = null;
      sync.destroy();
    };
    // Le sync doit vivre pour toute la session. On le relance seulement quand
    // l'identite de session arrive/change, pas quand le solde ou le viewport bouge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode, roomId, roomHostId, authUser?.uid, roomPlayersKey]);

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
        animation:
          screenEffect === "lose"
            ? "screenShake 0.4s ease both"
            : screenEffect === "win"
              ? "winPulse 0.35s ease both"
              : "none",
      }}
    >
      {/* Feutre : grande ellipse teal */}
      <div
        className="nj-table-image"
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
        {goldFlash && (
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
        <div style={{ position: "relative", animation: phase === "dealing" ? "deckDeal .26s infinite" : "none" }}>
          <div style={{ position: "absolute", top: -3, left: 3, zIndex: -1 }}>
            <PlayCard hidden w={deckW} />
          </div>
          <PlayCard hidden w={deckW} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
          <Chip strong style={{ fontSize: 13 }}>
            <NjamboIcon name="coin" tone="gold" size={16} />
            <span style={{ ...displayFont, fontWeight: 900, color: T.gold }}>{FCFA(pot)}</span>
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
            animation: "popIn .3s both",
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
        return (
          <div
            key={"dep" + p.name}
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
              active={trickPlays.some((tp) => tp.playerIdx === i)}
              isDominant={dominantIdx === i}
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
            style={{
              position: "absolute",
              left: a.left,
              top: a.top,
              transform: `translate(-50%,-50%) rotate(${a.angle}deg)`,
              zIndex: p.isYou ? 30 : 15,
            }}
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
                dealing={phase === "dealing"}
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
        return (
          <div key={"av" + p.name} style={{ position: "absolute", zIndex: 40, ...avatarPos(edge) }}>
            <Avatar
              p={p}
              active={phase === "turns" && turnIdx === i}
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
          style={{
            position: "absolute",
            bottom: fanHy * 0.78,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 45,
            animation: "popIn .25s both",
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

      {/* Cartes en vol */}
      {flights.map((f) => (
        <FlyingCard key={f.key} f={f} />
      ))}
    </div>
  );
}
