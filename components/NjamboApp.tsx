"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { sceneVariants, useMotionProfile } from "@/lib/motion";
import { GameProvider, useGame } from "@/contexts/GameContext";
import { EconomyProvider } from "@/contexts/EconomyContext";
import { LobbyProvider, useLobby } from "@/contexts/LobbyContext";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { SplashScreen } from "@/components/scenes/SplashScreen";
import { MenuScreen } from "@/components/scenes/MenuScreen";
import { BotSetupScreen } from "@/components/scenes/BotSetupScreen";
import { OnlineSetupScreen } from "@/components/scenes/OnlineSetupScreen";
import { FriendsSetupScreen } from "@/components/scenes/FriendsSetupScreen";
import { LobbyScreen } from "@/components/scenes/LobbyScreen";
import { TableScreen } from "@/components/scenes/TableScreen";
import { ResultScreen } from "@/components/scenes/ResultScreen";
import { ProfileScreen } from "@/components/scenes/ProfileScreen";
import { LeaderboardScreen } from "@/components/scenes/LeaderboardScreen";
import { FriendsScreen } from "@/components/scenes/FriendsScreen";
import { PlayersScreen } from "@/components/scenes/PlayersScreen";
import { FriendRequestsScreen } from "@/components/scenes/FriendRequestsScreen";
import { NotificationsScreen } from "@/components/scenes/NotificationsScreen";
import { MessagesScreen } from "@/components/scenes/MessagesScreen";
import { ChatScreen } from "@/components/scenes/ChatScreen";
import { PublicProfileScreen } from "@/components/scenes/PublicProfileScreen";
import { OptionsScreen } from "@/components/scenes/OptionsScreen";
import { HistoryScreen } from "@/components/scenes/HistoryScreen";
import { RulesScreen } from "@/components/scenes/RulesScreen";
import { PowerCollectionScreen } from "@/components/scenes/PowerCollectionScreen";
import { PlayHubScreen } from "@/components/scenes/PlayHubScreen";
import { ShopScreen } from "@/components/scenes/ShopScreen";
import { EventsScreen } from "@/components/scenes/EventsScreen";
import { WalletScreen } from "@/components/scenes/WalletScreen";
import type { BotDifficulty, GameMode, Result, RoomDoc, RoomPlayer } from "@/types/game";

/* ═══════════════ SceneRouter ═══════════════
   Orchestrateur de scènes : gère la navigation
   et les états partagés entre scènes (table → result).
   TableScreen reste monté pendant la session pour préserver l'état.
   ResultScreen s'affiche en overlay plein écran quand un résultat est prêt. */

function SceneRouter() {
  const { scene, navigateTo, endTransition, profile, setProfile, cfg, animationsOn } = useGame();
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

  /* Dérivés du lobby (partagés via LobbyContext) */
  const isRoomMode = gameMode === "online" || gameMode === "friends";
  const roomId = currentRoom?.id ?? null;
  const roomPlayers = currentRoom?.players ?? [];
  const roomHostId = currentRoom?.hostId ?? "";

  useEffect(() => {
    if (!user) return;
    setProfile((prev) => ({
      ...prev,
      name: user.name,
      emoji: user.emoji,
    }));
  }, [setProfile, user]);

  /* --- Bot setup --- */
  const handleBotStart = useCallback((botCount: number, mise: number, difficulty: BotDifficulty = "normal") => {
    setGameMode("bot");
    setGameBotCount(botCount);
    setGameDifficulty(difficulty);
    setGameMise(mise);
    setGameResult(null);
    setGameActive(true);
    navigateTo("table");
  }, [navigateTo]);

  /* --- Game starts from lobby --- */
  const startOnlineGame = useCallback((room: RoomDoc | null | undefined) => {
    if (!room) return;
    setGameMode(room.roomType === "friends" ? "friends" : "online");
    setGameMise(room.stake);
    setGameResult(null);
    setGameActive(true);
    navigateTo("table");
  }, [navigateTo]);

  const handleGameStart = useCallback(() => {
    startOnlineGame(currentRoom);
  }, [currentRoom, startOnlineGame]);

  const handleEventStart = useCallback((runId: string) => {
    setGameMode("event");
    setEventRunId(runId);
    setGameMise(0);
    setGameBotCount(3);
    setGameResult(null);
    setGameActive(true);
    navigateTo("table");
  }, [navigateTo]);

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
          <AnimatePresence mode="wait" onExitComplete={endTransition}>
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
      </div>
    </MotionConfig>
  );
}

/* ═══════════════ Composant racine ═══════════════ */
export default function NjamboApp() {
  return (
    <AuthProvider>
      <EconomyProvider>
        <GameProvider>
          <LobbyProvider>
            <SceneRouter />
          </LobbyProvider>
        </GameProvider>
      </EconomyProvider>
    </AuthProvider>
  );
}
