"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { sceneVariants, useMotionProfile } from "@/lib/motion";
import { GameProvider, useGame } from "@/contexts/GameContext";
import { LobbyProvider, useLobby } from "@/contexts/LobbyContext";
import { useAuth } from "@/hooks/useAuth";
import { recordMatchResult } from "@/lib/playerData";
import { DEV } from "@/config/devConfig";
import { CAURIS_REWARDS } from "@/config/powerCards";
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
import { PowerShopScreen } from "@/components/scenes/PowerShopScreen";
import { PowerCollectionScreen } from "@/components/scenes/PowerCollectionScreen";
import type { BotDifficulty, GameMode, Result, RoomDoc, RoomPlayer } from "@/types/game";

/* ═══════════════ SceneRouter ═══════════════
   Orchestrateur de scènes : gère la navigation
   et les états partagés entre scènes (table → result).
   TableScreen reste monté pendant la session pour préserver l'état.
   ResultScreen s'affiche en overlay plein écran quand un résultat est prêt. */

function SceneRouter() {
  const { scene, navigateTo, endTransition, profile, setProfile, cfg, animationsOn } = useGame();
  const motionProfile = useMotionProfile();
  const { currentRoom, resumeActiveRoom, activeRoomHint, refreshActiveRoomHint } = useLobby();
  const { user } = useAuth();

  /* État partagé entre TableScreen et ResultScreen */
  const [gameResult, setGameResult] = useState<Result | null>(null);
  const [gameMise, setGameMise] = useState(cfg.stakes[1]);
  const [gameBotCount, setGameBotCount] = useState(2);
  const [gameDifficulty, setGameDifficulty] = useState<BotDifficulty>("normal");
  const [gameMode, setGameMode] = useState<GameMode>("bot");
  /* True quand une session de jeu est active (table montée) */
  const [gameActive, setGameActive] = useState(false);
  /* Ref vers nextRound de TableScreen pour le bouton "manche suivante" */
  const nextRoundRef = useRef<(() => void) | null>(null);
  const roundTokenRef = useRef(Date.now());
  const recordedResultKeysRef = useRef<Set<string>>(new Set());

  /* Dérivés du lobby (partagés via LobbyContext) */
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
    roundTokenRef.current = Date.now();
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
    roundTokenRef.current = Date.now();
    setGameMise(room.stake);
    setGameResult(null);
    setGameActive(true);
    navigateTo("table");
  }, [navigateTo]);

  const handleGameStart = useCallback(() => {
    startOnlineGame(currentRoom);
  }, [currentRoom, startOnlineGame]);

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
    const totalGain = result.gain + (result.doubles ? gameMise * (result.playersCount - 1) : 0);
    // Remboursement Cauris Chanceux : crédité seulement si TU perds la manche.
    const refund = result.winner.isYou ? 0 : (result.refund ?? 0);
    const nextBalance = result.winner.isYou
      ? profile.balance - gameMise + totalGain
      : profile.balance - gameMise - (result.doubles ? gameMise : 0) + refund;

    /* Récompense en cauris : +perWin si tu remportes la partie. */
    const caurisGain = result.winner.isYou ? CAURIS_REWARDS.perWin : 0;
    setProfile((prev) => ({
      ...prev,
      balance: nextBalance,
      cauris: (prev.cauris ?? 0) + caurisGain,
    }));

    if (!user?.uid) return;

    /* Triche dev « solde figé » : le solde local est factice, tout settlement
       serveur échouerait en Balance mismatch — on n'enregistre rien. */
    if (DEV.richBalance > 0) return;

    const matchKey = [
      roundTokenRef.current,
      gameMode,
      roomId ?? "local",
      result.type,
      result.winner.name,
      result.gain,
      result.playersCount,
      result.doubles ? "doubles" : "simple",
    ].map((part) => String(part).replace(/[^a-zA-Z0-9_-]/g, "_")).join("-");

    if (recordedResultKeysRef.current.has(matchKey)) return;
    recordedResultKeysRef.current.add(matchKey);

    const settlementParams = {
      uid: user.uid,
      name: profile.name,
      emoji: profile.emoji,
      result,
      mode: gameMode,
      stake: gameMise,
      roomId: roomId ?? undefined,
      matchKey,
    };

    recordMatchResult({ ...settlementParams, currentBalance: nextBalance })
      .then(({ success, error, serverBalance }) => {
        if (success) return;
        console.error("[NjamboApp] recordMatchResult failed:", error);
        if (serverBalance === undefined) return;
        /* Drift client/serveur : le serveur fait foi. On resynchronise le solde
           local puis on réessaie UNE fois — le gain étant identique, la
           vérification passe et le match est bien enregistré. */
        setProfile((prev) => ({ ...prev, balance: serverBalance }));
        recordMatchResult({ ...settlementParams, currentBalance: serverBalance })
          .then(({ success: retried, error: retryError }) => {
            if (!retried) {
              console.error("[NjamboApp] recordMatchResult retry failed:", retryError);
            }
          });
      });
  }, [gameMise, gameMode, profile.balance, profile.emoji, profile.name, roomId, setProfile, user]);

  const handleNextRound = useCallback(() => {
    roundTokenRef.current = Date.now();
    if (gameMode === "bot") {
      setGameResult(null);
    }
    nextRoundRef.current?.();
  }, [gameMode]);

  const handleMenu = useCallback(() => {
    setGameResult(null);
    setGameActive(false);
    nextRoundRef.current = null;
    navigateTo("menu");
  }, [navigateTo]);

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
      case "power_shop": return <PowerShopScreen />;
      case "power_collection": return <PowerCollectionScreen />;
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

      {/* TableScreen — monté pendant toute la session de jeu */}
      {gameActive && (
        <TableScreen
          key={gameMode + "-" + gameBotCount + "-" + gameMise + "-" + gameDifficulty + "-" + (roomId ?? "")}
          gameMode={gameMode}
          initialBotCount={gameBotCount}
          initialMise={gameMise}
          initialDifficulty={gameDifficulty}
          roomId={roomId ?? undefined}
          roomPlayers={roomPlayers.length > 0 ? roomPlayers as RoomPlayer[] : undefined}
          roomHostId={roomHostId || undefined}
          onResult={handleResult}
          onRoundRestart={() => {
            roundTokenRef.current = Date.now();
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
          nextRequiresConsensus={gameMode !== "bot"}
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
    <GameProvider>
      <LobbyProvider>
        <SceneRouter />
      </LobbyProvider>
    </GameProvider>
  );
}
