"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { MotionProfileProvider, sceneVariants, useMotionProfile } from "@/lib/motion";
import { GameProvider, useGame } from "@/contexts/GameContext";
import { SettingsProvider, useSettings } from "@/contexts/SettingsContext";
import { GAME_CONFIG } from "@/config/gameConfig";
import { PerformanceHud } from "@/components/perf/PerformanceHud";
import { markPerformance } from "@/lib/performanceMetrics";
import { EconomyProvider } from "@/contexts/EconomyContext";
import { LobbyProvider, useLobby } from "@/contexts/LobbyContext";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { SplashScreen } from "@/components/scenes/SplashScreen";
import { MenuScreen } from "@/components/scenes/MenuScreen";
import type { BotDifficulty, GameMode, Result, RoomDoc, RoomPlayer } from "@/types/game";

const loading = () => null;
const BotSetupScreen = dynamic(() => import("@/components/scenes/BotSetupScreen").then((module) => module.BotSetupScreen), { loading });
const OnlineSetupScreen = dynamic(() => import("@/components/scenes/OnlineSetupScreen").then((module) => module.OnlineSetupScreen), { loading });
const FriendsSetupScreen = dynamic(() => import("@/components/scenes/FriendsSetupScreen").then((module) => module.FriendsSetupScreen), { loading });
const LobbyScreen = dynamic(() => import("@/components/scenes/LobbyScreen").then((module) => module.LobbyScreen), { loading });
const TableScreen = dynamic(() => import("@/components/scenes/TableScreen").then((module) => module.TableScreen), { loading });
const ResultScreen = dynamic(() => import("@/components/scenes/ResultScreen").then((module) => module.ResultScreen), { loading });
const ProfileScreen = dynamic(() => import("@/components/scenes/ProfileScreen").then((module) => module.ProfileScreen), { loading });
const LeaderboardScreen = dynamic(() => import("@/components/scenes/LeaderboardScreen").then((module) => module.LeaderboardScreen), { loading });
const FriendsScreen = dynamic(() => import("@/components/scenes/FriendsScreen").then((module) => module.FriendsScreen), { loading });
const PlayersScreen = dynamic(() => import("@/components/scenes/PlayersScreen").then((module) => module.PlayersScreen), { loading });
const FriendRequestsScreen = dynamic(() => import("@/components/scenes/FriendRequestsScreen").then((module) => module.FriendRequestsScreen), { loading });
const NotificationsScreen = dynamic(() => import("@/components/scenes/NotificationsScreen").then((module) => module.NotificationsScreen), { loading });
const MessagesScreen = dynamic(() => import("@/components/scenes/MessagesScreen").then((module) => module.MessagesScreen), { loading });
const ChatScreen = dynamic(() => import("@/components/scenes/ChatScreen").then((module) => module.ChatScreen), { loading });
const PublicProfileScreen = dynamic(() => import("@/components/scenes/PublicProfileScreen").then((module) => module.PublicProfileScreen), { loading });
const OptionsScreen = dynamic(() => import("@/components/scenes/OptionsScreen").then((module) => module.OptionsScreen), { loading });
const HistoryScreen = dynamic(() => import("@/components/scenes/HistoryScreen").then((module) => module.HistoryScreen), { loading });
const RulesScreen = dynamic(() => import("@/components/scenes/RulesScreen").then((module) => module.RulesScreen), { loading });
const PowerCollectionScreen = dynamic(() => import("@/components/scenes/PowerCollectionScreen").then((module) => module.PowerCollectionScreen), { loading });
const PlayHubScreen = dynamic(() => import("@/components/scenes/PlayHubScreen").then((module) => module.PlayHubScreen), { loading });
const ShopScreen = dynamic(() => import("@/components/scenes/ShopScreen").then((module) => module.ShopScreen), { loading });
const EventsScreen = dynamic(() => import("@/components/scenes/EventsScreen").then((module) => module.EventsScreen), { loading });
const WalletScreen = dynamic(() => import("@/components/scenes/WalletScreen").then((module) => module.WalletScreen), { loading });

const SCENE_TRANSITION_MS = GAME_CONFIG.anim.navigation;

/* ═══════════════ SceneRouter ═══════════════
   Orchestrateur de scènes : gère la navigation
   et les états partagés entre scènes (table → result).
   TableScreen reste monté pendant la session pour préserver l'état.
   ResultScreen s'affiche en overlay plein écran quand un résultat est prêt. */

function SceneRouter() {
  const { scene, navigateTo, endTransition, profile, setProfile, cfg } = useGame();
  const { animationsOn } = useSettings();
  const motionProfile = useMotionProfile();
  const { currentRoom, resumeActiveRoom, activeRoomHint, refreshActiveRoomHint, leaveRoom } = useLobby();
  const { user } = useAuth();

  /* État partagé entre TableScreen et ResultScreen */
  const [gameResult, setGameResult] = useState<Result | null>(null);
  const [gameMise, setGameMise] = useState(cfg.stakes[1]);
  const [gameBotCount, setGameBotCount] = useState(2);
  const [gameDifficulty, setGameDifficulty] = useState<BotDifficulty>("normal");
  const [gameMode, setGameMode] = useState<GameMode>("bot");
  const [eventRunId, setEventRunId] = useState<string | null>(null);
  /* True quand une session de jeu est active (table montée) */
  const [gameActive, setGameActive] = useState(false);
  /* Ref vers nextRound de TableScreen pour le bouton "manche suivante" */
  const nextRoundRef = useRef<(() => void) | null>(null);
  const tableEntryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Dérivés du lobby (partagés via LobbyContext) */
  const isRoomMode = gameMode === "online" || gameMode === "friends";
  const roomId = currentRoom?.id ?? null;
  const roomPlayers = currentRoom?.players ?? [];
  const roomHostId = currentRoom?.hostId ?? "";

  useEffect(() => {
    markPerformance(`navigation:${scene}`);
  }, [scene]);

  useEffect(() => {
    if (!user) return;
    setProfile((prev) => ({
      ...prev,
      name: user.name,
      emoji: user.emoji,
    }));
  }, [setProfile, user]);

  useEffect(() => {
    if (["play", "bot_setup", "online_setup", "friends_invite", "lobby", "events"].includes(scene)) {
      void import("@/components/scenes/TableScreen");
      void import("@/components/scenes/ResultScreen");
    }
  }, [scene]);

  useEffect(() => () => {
    if (tableEntryTimerRef.current) clearTimeout(tableEntryTimerRef.current);
  }, []);

  const enterTable = useCallback(() => {
    if (tableEntryTimerRef.current) clearTimeout(tableEntryTimerRef.current);
    navigateTo("table");
    tableEntryTimerRef.current = setTimeout(() => {
      tableEntryTimerRef.current = null;
      setGameActive(true);
    }, animationsOn ? SCENE_TRANSITION_MS : 0);
  }, [animationsOn, navigateTo]);

  /* --- Bot setup --- */
  const handleBotStart = useCallback((botCount: number, mise: number, difficulty: BotDifficulty = "normal") => {
    setGameMode("bot");
    setGameBotCount(botCount);
    setGameDifficulty(difficulty);
    setGameMise(mise);
    setGameResult(null);
    enterTable();
  }, [enterTable]);

  /* --- Game starts from lobby --- */
  const startOnlineGame = useCallback((room: RoomDoc | null | undefined) => {
    if (!room) return;
    setGameMode(room.roomType === "friends" ? "friends" : "online");
    setGameMise(room.stake);
    setGameResult(null);
    enterTable();
  }, [enterTable]);

  const handleGameStart = useCallback(() => {
    startOnlineGame(currentRoom);
  }, [currentRoom, startOnlineGame]);

  const handleEventStart = useCallback((runId: string) => {
    setGameMode("event");
    setEventRunId(runId);
    setGameMise(0);
    setGameBotCount(3);
    setGameResult(null);
    enterTable();
  }, [enterTable]);

  const handleResumeGame = useCallback(async () => {
    const room = currentRoom?.status === "playing" ? currentRoom : await resumeActiveRoom();
    if (!room) {
      // La salle a disparu entre-temps : on résorbe l'affordance Reprendre.
      refreshActiveRoomHint();
      return;
    }
    startOnlineGame(room);
  }, [currentRoom, resumeActiveRoom, refreshActiveRoomHint, startOnlineGame]);

  /* Type de la partie reprenable (pilote la chip Reprendre du menu). */
  const resumeRoomType = currentRoom?.status === "playing"
    ? (currentRoom.roomType === "friends" ? "friends" as const : "online" as const)
    : activeRoomHint?.roomType ?? null;

  /* À chaque retour au menu, revalider l'indice (la partie a pu se terminer). */
  useEffect(() => {
    if (scene === "menu") refreshActiveRoomHint();
  }, [scene, refreshActiveRoomHint]);

  /* --- Résultat de partie --- */
  const handleResult = useCallback((result: Result) => {
    markPerformance("result");
    setGameResult(result);
    // Aucun solde ni résultat n'est calculé ou persisté par le client.
    // La Function a déjà réglé un compte; l'invité reste en entraînement local.
  }, []);

  const handleNextRound = useCallback(() => {
    nextRoundRef.current?.();
  }, []);

  const handleMenu = useCallback(() => {
    setGameResult(null);
    setGameActive(false);
    nextRoundRef.current = null;
    // Quitter la table = quitter la salle. Sans ça, currentRoom résiduel
    // contaminait la partie suivante (roomId injecté dans une table bot) et
    // ré-armait l'affordance « Reprendre ».
    if (currentRoom) void leaveRoom().finally(() => refreshActiveRoomHint());
    navigateTo("menu");
  }, [navigateTo, currentRoom, leaveRoom, refreshActiveRoomHint]);

  /* Rendu de la scène courante (hors table/result, gérés séparément en overlay). */
  const renderScene = (): ReactNode => {
    switch (scene) {
      case "splashscreen": return <SplashScreen />;
      case "menu": return <MenuScreen resumeRoomType={resumeRoomType} onResumeGame={handleResumeGame} />;
      case "profile": return <ProfileScreen />;
      case "leaderboard": return <LeaderboardScreen />;
      case "friends": return <FriendsScreen />;
      case "players": return <PlayersScreen />;
      case "friend_requests": return <FriendRequestsScreen />;
      case "notifications": return <NotificationsScreen />;
      case "messages": return <MessagesScreen />;
      case "chat": return <ChatScreen />;
      case "public_profile": return <PublicProfileScreen />;
      case "options": return <OptionsScreen />;
      case "history": return <HistoryScreen />;
      case "rules": return <RulesScreen />;
      case "power_shop": return <ShopScreen />;
      case "power_collection": return <PowerCollectionScreen />;
      case "play": return <PlayHubScreen />;
      case "shop": return <ShopScreen />;
      case "events": return <EventsScreen onStart={handleEventStart} />;
      case "wallet": return <WalletScreen />;
      case "bot_setup": return <BotSetupScreen onStart={handleBotStart} />;
      case "online_setup": return <OnlineSetupScreen />;
      case "friends_invite": return <FriendsSetupScreen />;
      case "lobby": return roomId ? <LobbyScreen onGameStart={handleGameStart} onBack={handleMenu} /> : null;
      default: return null; // "table" : géré par le bloc gameActive ci-dessous
    }
  };

  return (
    <MotionConfig reducedMotion={motionProfile.enabled ? "user" : "always"}>
      <div
        className={[
          motionProfile.enabled ? "nj-motion-on" : "nj-motion-off",
          `nj-motion-level-${motionProfile.level}`,
          animationsOn ? "nj-animations-enabled" : "nj-animations-disabled",
        ].join(" ")}
        style={{ minHeight: "100vh", position: "relative" }}
      >
        {motionProfile.enabled ? (
          <AnimatePresence initial={false} onExitComplete={endTransition}>
            <motion.div
              key={scene}
              variants={sceneVariants}
              initial="out"
              animate="in"
              exit="exit"
              style={{ minHeight: "100vh" }}
            >
              {renderScene()}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div style={{ minHeight: "100vh" }}>{renderScene()}</div>
        )}

      {/* TableScreen — monté pendant toute la session de jeu. Les props de
          salle ne sont transmises QU'AUX modes salle : une table bot ne doit
          jamais hériter d'une salle résiduelle du lobby. */}
      {gameActive && (
        <TableScreen
          key={gameMode + "-" + gameBotCount + "-" + gameMise + "-" + gameDifficulty + "-" + (isRoomMode ? roomId ?? "" : "") + "-" + (eventRunId ?? "")}
          gameMode={gameMode}
          initialBotCount={gameBotCount}
          initialMise={gameMise}
          initialDifficulty={gameDifficulty}
          roomId={isRoomMode ? roomId ?? undefined : undefined}
          roomPlayers={isRoomMode && roomPlayers.length > 0 ? roomPlayers as RoomPlayer[] : undefined}
          roomHostId={isRoomMode ? roomHostId || undefined : undefined}
          eventRunId={eventRunId ?? undefined}
          onResult={handleResult}
          onRoundRestart={() => {
            setGameResult(null);
          }}
          onMenu={handleMenu}
          onNextRoundRef={nextRoundRef}
          paused={Boolean(gameResult)}
        />
      )}

      {/* ResultScreen — overlay plein écran par-dessus la table */}
      {gameResult && (
        <ResultScreen
          result={gameResult}
          mise={gameMise}
          onNext={handleNextRound}
          onMenu={handleMenu}
          canNext={!!profile && profile.balance >= gameMise}
          nextRequiresConsensus={gameMode === "online" || gameMode === "friends"}
          socialPlayers={gameMode === "bot" ? [] : roomPlayers as RoomPlayer[]}
        />
      )}
      <PerformanceHud />
      </div>
    </MotionConfig>
  );
}

/* ═══════════════ Composant racine ═══════════════ */
export default function NjamboApp() {
  return (
    <AuthProvider>
      <EconomyProvider>
        <SettingsProvider>
          <GameProvider>
            <MotionProfileProvider>
              <LobbyProvider>
                <SceneRouter />
              </LobbyProvider>
            </MotionProfileProvider>
          </GameProvider>
        </SettingsProvider>
      </EconomyProvider>
    </AuthProvider>
  );
}
