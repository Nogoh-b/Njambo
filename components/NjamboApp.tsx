"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameProvider, useGame } from "@/contexts/GameContext";
import { LobbyProvider, useLobby } from "@/contexts/LobbyContext";
import { useAuth } from "@/hooks/useAuth";
import { recordMatchResult } from "@/lib/playerData";
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
import type { GameMode, Result, RoomDoc, RoomPlayer } from "@/types/game";

/* ═══════════════ SceneRouter ═══════════════
   Orchestrateur de scènes : gère la navigation
   et les états partagés entre scènes (table → result).
   TableScreen reste monté pendant la session pour préserver l'état.
   ResultScreen s'affiche en overlay plein écran quand un résultat est prêt. */

function SceneRouter() {
  const { scene, navigateTo, profile, setProfile, cfg } = useGame();
  const { currentRoom, resumeActiveRoom } = useLobby();
  const { user } = useAuth();

  /* État partagé entre TableScreen et ResultScreen */
  const [gameResult, setGameResult] = useState<Result | null>(null);
  const [gameMise, setGameMise] = useState(cfg.stakes[1]);
  const [gameBotCount, setGameBotCount] = useState(2);
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
  const handleBotStart = useCallback((botCount: number, mise: number) => {
    setGameMode("bot");
    roundTokenRef.current = Date.now();
    setGameBotCount(botCount);
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
    startOnlineGame(room);
  }, [currentRoom, resumeActiveRoom, startOnlineGame]);

  /* --- Résultat de partie --- */
  const handleResult = useCallback((result: Result) => {
    setGameResult(result);
    const totalGain = result.gain + (result.doubles ? gameMise * (result.playersCount - 1) : 0);
    const nextBalance = result.winner.isYou
      ? profile.balance - gameMise + totalGain
      : profile.balance - gameMise - (result.doubles ? gameMise : 0);

    setProfile((prev) => ({ ...prev, balance: nextBalance }));

    if (!user?.uid) return;

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

    void recordMatchResult({
      uid: user.uid,
      name: profile.name,
      emoji: profile.emoji,
      currentBalance: nextBalance,
      result,
      mode: gameMode,
      stake: gameMise,
      roomId: roomId ?? undefined,
      matchKey,
    }).catch((err) => {
      console.error("[NjamboApp] recordMatchResult error:", err);
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

  /* Transition CSS classes */
  const [transitionClass, setTransitionClass] = useState("");
  const prevScene = useRef(scene);

  useEffect(() => {
    if (prevScene.current !== scene) {
      setTransitionClass("scene-enter-fade");
      const t = setTimeout(() => setTransitionClass(""), 500);
      prevScene.current = scene;
      return () => clearTimeout(t);
    }
  }, [scene]);

  return (
    <div
      className={transitionClass}
      style={{ minHeight: "100vh", position: "relative" }}
    >
      {scene === "splashscreen" && <SplashScreen />}
      {scene === "menu" && (
        <MenuScreen
          canResumeGame={!!user}
          onResumeGame={handleResumeGame}
        />
      )}
      {scene === "profile" && <ProfileScreen />}
      {scene === "leaderboard" && <LeaderboardScreen />}
      {scene === "friends" && <FriendsScreen />}
      {scene === "players" && <PlayersScreen />}
      {scene === "friend_requests" && <FriendRequestsScreen />}
      {scene === "notifications" && <NotificationsScreen />}
      {scene === "messages" && <MessagesScreen />}
      {scene === "chat" && <ChatScreen />}
      {scene === "public_profile" && <PublicProfileScreen />}
      {scene === "options" && <OptionsScreen />}
      {scene === "history" && <HistoryScreen />}

      {/* Setups */}
      {scene === "bot_setup" && (
        <BotSetupScreen onStart={handleBotStart} />
      )}
      {scene === "online_setup" && (
        <OnlineSetupScreen />
      )}
      {scene === "friends_invite" && (
        <FriendsSetupScreen />
      )}

      {/* Lobby — affiché quand une salle est active (currentRoom existe) */}
      {scene === "lobby" && roomId && (
        <LobbyScreen
          onGameStart={handleGameStart}
          onBack={handleMenu}
        />
      )}

      {/* TableScreen — monté pendant toute la session de jeu */}
      {gameActive && (
        <TableScreen
          key={gameMode + "-" + gameBotCount + "-" + gameMise + "-" + (roomId ?? "")}
          gameMode={gameMode}
          initialBotCount={gameBotCount}
          initialMise={gameMise}
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
