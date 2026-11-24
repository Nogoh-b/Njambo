"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { MotionProfileProvider, reducedSceneVariants, sceneVariants, useMotionProfile } from "@/lib/motion";
import { GameProvider, useGame } from "@/contexts/GameContext";
import { consumeEventDeepLink, eventIdFromWorkerMessage } from "@/lib/eventDeepLink";
import { useMyCosmetics } from "@/hooks/useMyCosmetics";
import { usePowerCatalogLoader, usePowerCatalogRevision } from "@/hooks/usePowerCatalog";
import { useMomentPreviewFromUrl, useMotifCatalogLoader, useStylePreviewFromUrl } from "@/hooks/useMotifCatalog";
import { SettingsProvider, useSettings } from "@/contexts/SettingsContext";
import { PerformanceHud } from "@/components/perf/PerformanceHud";
import { markPerformance } from "@/lib/performanceMetrics";
import { schedulePostSplashPreload } from "@/lib/idlePreload";
import { EconomyProvider, useInventory } from "@/contexts/EconomyContext";
import { LoadingGate } from "@/components/ui/LoadingGate";
import { MatchLoadingScreen } from "@/components/ui/MatchLoadingScreen";
import { prefetchAssets } from "@/lib/assets/AssetLoader";
import { sceneManifest, tableManifest, TABLE_APPROACH_SCENES } from "@/lib/assets/manifests";
import {
  clearActiveGameSession,
  loadActiveGameSession,
  saveActiveGameSession,
  updateActiveGameMatchId,
} from "@/lib/navigation";
import { devEquippedPowers } from "@/config/devConfig";
import { LobbyProvider, useLobby } from "@/contexts/LobbyContext";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { MenuScreen } from "@/components/scenes/MenuScreen";
import type { BotDifficulty, GameMode, PowerCardId, Result, RoomDoc, RoomPlayer } from "@/types/game";

/** Écrans riches en images protégés par la porte de chargement (titre affiché).
 *  Si les assets sont déjà décodés (préchargement post-splash ou survol),
 *  LoadingGate rend immédiatement sans aucune latence. */
const SCENE_GATES: Record<string, string> = {
  play: "Ouverture du salon de jeu",
  shop: "Ouverture du marché",
  power_shop: "Ouverture du marché",
  power_collection: "Ta collection arrive",
  events: "Chargement des événements",
  minigames: "Préparation des mini-jeux",
  wallet: "Ouverture du coffre",
  profile: "Chargement de ton profil",
};

/** Écran courant → écran riche probablement visité ensuite (préchargement d'approche). */
const SCENE_APPROACH: Record<string, string> = {
  profile: "power_collection",
  menu: "shop",
  power_collection: "shop",
  shop: "power_collection",
};

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
const SeasonScreen = dynamic(() => import("@/components/scenes/SeasonScreen").then((module) => module.SeasonScreen), { loading });
const EventDetailScreen = dynamic(() => import("@/components/scenes/EventDetailScreen").then((module) => module.EventDetailScreen), { loading });
const EventMatchmakingOverlay = dynamic(() => import("@/components/scenes/EventMatchmakingOverlay").then((module) => module.EventMatchmakingOverlay), { loading });
const WalletScreen = dynamic(() => import("@/components/scenes/WalletScreen").then((module) => module.WalletScreen), { loading });
const MiniGamesScreen = dynamic(() => import("@/components/minigames/MiniGamesScreen").then((module) => module.MiniGamesScreen), { loading });

/* ═══════════════ SceneRouter ═══════════════
   Orchestrateur de scènes : gère la navigation réelle (pile + hash + Capacitor),
   l'écran de chargement au lancement d'une partie et les états partagés
   entre scènes (table → result). */

function SceneRouter() {
  const {
    scene,
    navigateTo,
    goBack,
    registerBackInterceptor,
    endTransition,
    profile,
    setProfile,
    cfg,
    eventDetailId,
    setEventDetailId,
    restoredRoomId,
    clearRestoredRoomId,
    exitToast,
  } = useGame();
  const { animationsOn } = useSettings();
  const motionProfile = useMotionProfile();
  const {
    currentRoom,
    resumeActiveRoom,
    restoreWaitingRoom,
    activeRoomHint,
    refreshActiveRoomHint,
    leaveRoom,
  } = useLobby();
  const { user, loading: authLoading } = useAuth();
  // Dos de carte équipé (phase 5) appliqué à toutes les cartes face cachée.
  const myCosmetics = useMyCosmetics(true);
  const inventory = useInventory();
  // Modèles d'animation puis cartes pouvoir publiés depuis l'admin : chargés puis re-rendu à chaque publication.
  useMotifCatalogLoader();
  useMomentPreviewFromUrl();
  useStylePreviewFromUrl();
  usePowerCatalogLoader();
  usePowerCatalogRevision();

  /* État partagé entre MatchLoadingScreen, TableScreen et ResultScreen */
  const [gameResult, setGameResult] = useState<Result | null>(null);
  const [gameMise, setGameMise] = useState(cfg.stakes[1]);
  const [gameBotCount, setGameBotCount] = useState(2);
  const [gameDifficulty, setGameDifficulty] = useState<BotDifficulty>("normal");
  const [gameMode, setGameMode] = useState<GameMode>("bot");
  const [eventRunId, setEventRunId] = useState<string | null>(null);
  /** eventId de l'événement en cours (pour le thème de l'overlay de file). */
  const [eventId, setEventId] = useState<string | null>(null);
  /** True tant qu'un événement PvP cherche des adversaires (overlay de file). */
  const [eventMatchmaking, setEventMatchmaking] = useState(false);
  /** Infos de l'étape courante pour l'overlay de file et l'écran de chargement. */
  const [eventStageLabel, setEventStageLabel] = useState<string>("");
  const [eventRequiredPlayers, setEventRequiredPlayers] = useState<number>(4);
  /** True quand une session de jeu est lancée. */
  const [gameActive, setGameActive] = useState(false);
  /** True tant que l'écran de chargement / ouverture de scène est affiché. */
  const [matchLoading, setMatchLoading] = useState(false);
  /** True dès le pré-montage silencieux de la table (~1 s avant l'ouverture, 60 fps garanti). */
  const [tableMounted, setTableMounted] = useState(false);
  /** True au feu vert de l'Acte III : la table lance la donne et le chrono. */
  const [tableUnlocked, setTableUnlocked] = useState(false);
  /** True si on reprend automatiquement une partie après actualisation. */
  const [resumingMatch, setResumingMatch] = useState(false);
  /** matchId serveur à reconnecter après actualisation sans relancer startMatch. */
  const [reconnectMatchId, setReconnectMatchId] = useState<string | null>(null);
  /** Identifiant monotone de lancement pour réinitialiser proprement la table. */
  const [launchNonce, setLaunchNonce] = useState(0);

  /* Refs d'interception du bouton Retour */
  const nextRoundRef = useRef<(() => void) | null>(null);
  const loadingBackRef = useRef<(() => "stay" | "handled") | null>(null);
  const tableBackRef = useRef<(() => "stay" | "handled") | null>(null);
  const resultBackRef = useRef<(() => boolean) | null>(null);
  const lobbyBackRef = useRef<(() => "stay" | "handled") | null>(null);
  const tableRestoreAttemptedRef = useRef(false);
  const lobbyRestoreAttemptedRef = useRef<string | null>(null);

  /* Dérivés du lobby (partagés via LobbyContext) */
  const isRoomMode = gameMode === "online" || gameMode === "friends";
  const roomId = currentRoom?.id ?? null;
  const roomPlayers = useMemo(() => currentRoom?.players ?? [], [currentRoom?.players]);
  const roomHostId = currentRoom?.hostId ?? "";
  const tableKey = `${launchNonce}-${gameMode}-${gameBotCount}-${gameMise}-${gameDifficulty}-${isRoomMode && roomId ? roomId : ""}-${eventRunId ?? ""}-${reconnectMatchId ?? ""}`;

  const displayPlayerCount = isRoomMode
    ? Math.max(2, roomPlayers.length || currentRoom?.maxPlayers || 2)
    : gameMode === "event"
      ? Math.max(2, eventRequiredPlayers || 4)
      : gameBotCount + 1;

  useEffect(() => {
    markPerformance(`navigation:${scene}`);
  }, [scene]);

  /* Garder l'identifiant de salle synchronisé dans l'URL hash (#/lobby?room=...)
     pour pouvoir restaurer la salle d'attente après actualisation. */
  useEffect(() => {
    if (scene === "lobby" && currentRoom?.id && restoredRoomId !== currentRoom.id) {
      navigateTo("lobby", { replace: true, roomId: currentRoom.id });
    }
  }, [scene, currentRoom?.id, restoredRoomId, navigateTo]);

  /* Chargeur d'assets — table : pouvoirs équipés (visuels + sons), dos de
     carte équipé, tapis ; cosmétiques connus des participants. */
  const myEquippedPowers = useMemo(
    () =>
      (user && !user.isAnonymous
        ? devEquippedPowers((inventory.equippedCards ?? []) as PowerCardId[])
        : (profile?.equippedPowers ?? [])) as PowerCardId[],
    [inventory.equippedCards, profile?.equippedPowers, user],
  );

  /* Préchargement d'approche : dès qu'on s'approche de la table (choix du
     mode, lobby, détail d'événement), on charge ses assets au repos. */
  const approachingTable = TABLE_APPROACH_SCENES.has(scene);
  const powersKey = myEquippedPowers.join(",");
  useEffect(() => {
    if (!approachingTable) return;
    const manifest = tableManifest({ myPowers: powersKey ? powersKey.split(",") : [], participants: [myCosmetics] });
    prefetchAssets([...manifest.critical, ...manifest.background]);
  }, [approachingTable, powersKey, myCosmetics]);

  /* Approche des autres écrans riches : profil → collection, menu → boutique. */
  useEffect(() => {
    const next = SCENE_APPROACH[scene];
    if (next) prefetchAssets(sceneManifest(next).critical);
  }, [scene]);

  /* Notifications d'événement : /?event=<id> au démarrage, ou clic sur une
     notification alors que l'app est déjà ouverte (message du service worker). */
  useEffect(() => {
    const open = (id: string | null) => {
      if (!id) return;
      setEventDetailId(id);
      navigateTo("event_detail", { eventDetailId: id });
    };
    open(consumeEventDeepLink());
    const onWorkerMessage = (message: MessageEvent) => open(eventIdFromWorkerMessage(message.data));
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
  }, [navigateTo, setEventDetailId]);

  useEffect(() => {
    schedulePostSplashPreload();
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
    if (["play", "bot_setup", "online_setup", "friends_invite", "lobby", "events", "event_detail"].includes(scene)) {
      void import("@/components/scenes/TableScreen");
      void import("@/components/scenes/ResultScreen");
    }
  }, [scene]);

  /* Protection contre actualisation / fermeture accidentelle de l'onglet en pleine partie. */
  useEffect(() => {
    if (!gameActive || gameResult) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [gameActive, gameResult]);

  const enterTable = useCallback((options?: { replace?: boolean; resuming?: boolean; reconnectId?: string | null }) => {
    tableRestoreAttemptedRef.current = true;
    setResumingMatch(Boolean(options?.resuming));
    setReconnectMatchId(options?.reconnectId ?? null);
    setLaunchNonce((n) => n + 1);
    setGameResult(null);
    setTableMounted(false);
    setTableUnlocked(false);
    setMatchLoading(true);
    setGameActive(true);
    navigateTo("table", { replace: options?.replace });
  }, [navigateTo]);

  /* --- Bot setup --- */
  const handleBotStart = useCallback((
    botCount: number,
    mise: number,
    difficulty: BotDifficulty = "normal",
    options?: { replace?: boolean; resuming?: boolean; reconnectId?: string | null },
  ) => {
    setGameMode("bot");
    setGameBotCount(botCount);
    setGameDifficulty(difficulty);
    setGameMise(mise);
    setEventRunId(null);
    setEventId(null);
    setEventMatchmaking(false);
    saveActiveGameSession({
      mode: "bot",
      mise,
      botCount,
      difficulty,
      matchId: options?.reconnectId ?? null,
    });
    enterTable(options);
  }, [enterTable]);

  /* --- Game starts from lobby --- */
  const startOnlineGame = useCallback((
    room: RoomDoc | null | undefined,
    options?: { replace?: boolean; resuming?: boolean; reconnectId?: string | null },
  ) => {
    if (!room) return;
    const mode: GameMode = room.roomType === "friends" ? "friends" : "online";
    setGameMode(mode);
    setGameMise(room.stake);
    setEventRunId(null);
    setEventId(null);
    setEventMatchmaking(false);
    saveActiveGameSession({
      mode,
      mise: room.stake,
      botCount: Math.max(1, (room.players?.length ?? room.maxPlayers) - 1),
      difficulty: "normal",
      roomId: room.id,
      matchId: options?.reconnectId ?? null,
    });
    enterTable(options);
  }, [enterTable]);

  const handleGameStart = useCallback(() => {
    startOnlineGame(currentRoom);
  }, [currentRoom, startOnlineGame]);

  const handleEventStart = useCallback((
    runId: string,
    mode: "pve" | "pvp" = "pve",
    evtId: string = "",
    stage0?: { title: string; playerCount: number },
    options?: { replace?: boolean; resuming?: boolean; reconnectId?: string | null },
  ) => {
    const stageTitle = stage0?.title ?? "";
    const requiredPlayers = stage0?.playerCount ?? 4;
    setGameMode("event");
    setEventRunId(runId);
    setEventId(evtId || null);
    setGameMise(0);
    setGameBotCount(3);
    setEventStageLabel(stageTitle);
    setEventRequiredPlayers(requiredPlayers);
    setEventMatchmaking(mode === "pvp");
    saveActiveGameSession({
      mode: "event",
      mise: 0,
      botCount: 3,
      difficulty: "normal",
      eventRunId: runId,
      eventId: evtId || null,
      eventMatchmaking: mode === "pvp",
      eventStageLabel: stageTitle,
      eventRequiredPlayers: requiredPlayers,
      matchId: options?.reconnectId ?? null,
    });
    enterTable(options);
  }, [enterTable]);

  const handleResumeGame = useCallback(async () => {
    const room = currentRoom?.status === "playing" ? currentRoom : await resumeActiveRoom();
    if (!room) {
      refreshActiveRoomHint();
      return;
    }
    startOnlineGame(room, { resuming: true });
  }, [currentRoom, resumeActiveRoom, refreshActiveRoomHint, startOnlineGame]);

  /* Restauration automatique de la salle d'attente après actualisation (#/lobby?room=...). */
  useEffect(() => {
    if (scene !== "lobby" || currentRoom) return;
    if (authLoading) return;
    if (!restoredRoomId) {
      navigateTo("online_setup", { replace: true });
      return;
    }
    if (lobbyRestoreAttemptedRef.current === restoredRoomId) return;
    lobbyRestoreAttemptedRef.current = restoredRoomId;

    if (!user) {
      clearRestoredRoomId();
      navigateTo("online_setup", { replace: true });
      return;
    }
    let cancelled = false;
    void restoreWaitingRoom(restoredRoomId).then((room) => {
      if (cancelled) return;
      if (!room) {
        clearRestoredRoomId();
        navigateTo("online_setup", { replace: true });
      } else if (room.status === "playing") {
        startOnlineGame(room, { replace: true, resuming: true });
      }
    });
    return () => { cancelled = true; };
  }, [
    authLoading,
    clearRestoredRoomId,
    currentRoom,
    navigateTo,
    restoreWaitingRoom,
    restoredRoomId,
    scene,
    startOnlineGame,
    user,
  ]);

  /* Restauration automatique d'une partie active après actualisation sur #/table. */
  useEffect(() => {
    if (scene !== "table" || gameActive) return;
    if (authLoading) return;
    if (tableRestoreAttemptedRef.current) return;
    tableRestoreAttemptedRef.current = true;

    const saved = loadActiveGameSession();
    if (!saved) {
      navigateTo("menu", { replace: true, resetStack: true });
      return;
    }

    if (saved.mode === "online" || saved.mode === "friends") {
      if (!user) {
        clearActiveGameSession();
        navigateTo("menu", { replace: true, resetStack: true });
        return;
      }
      let cancelled = false;
      void resumeActiveRoom().then((room) => {
        if (cancelled) return;
        if (room) {
          startOnlineGame(room, { replace: true, resuming: true, reconnectId: saved.matchId ?? null });
        } else {
          clearActiveGameSession();
          navigateTo("menu", { replace: true, resetStack: true });
        }
      });
      return () => { cancelled = true; };
    }

    if (saved.mode === "event" && saved.eventRunId) {
      if (!user) {
        clearActiveGameSession();
        navigateTo("events", { replace: true });
        return;
      }
      if (saved.eventId) setEventDetailId(saved.eventId);
      handleEventStart(
        saved.eventRunId,
        saved.eventMatchmaking ? "pvp" : "pve",
        saved.eventId ?? "",
        { title: saved.eventStageLabel ?? "", playerCount: saved.eventRequiredPlayers ?? 4 },
        { replace: true, resuming: true, reconnectId: saved.matchId ?? null },
      );
      return;
    }

    if (saved.mode === "bot") {
      const isGuest = !user || user.isAnonymous;
      if (isGuest) {
        handleBotStart(saved.botCount, saved.mise, saved.difficulty, { replace: true, resuming: true });
        return;
      }
      if (saved.matchId) {
        handleBotStart(saved.botCount, saved.mise, saved.difficulty, {
          replace: true,
          resuming: true,
          reconnectId: saved.matchId,
        });
        return;
      }
      // Partie bot serveur actualisée avant création du matchId : revenir au setup sans double-débit.
      clearActiveGameSession();
      navigateTo("bot_setup", { replace: true });
      return;
    }

    clearActiveGameSession();
    navigateTo("menu", { replace: true, resetStack: true });
  }, [
    authLoading,
    gameActive,
    handleBotStart,
    handleEventStart,
    navigateTo,
    resumeActiveRoom,
    scene,
    setEventDetailId,
    startOnlineGame,
    user,
  ]);

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
    if (gameMode === "bot") updateActiveGameMatchId(null);
  }, [gameMode]);

  const handleNextRound = useCallback(() => {
    nextRoundRef.current?.();
  }, []);

  const handleMenu = useCallback(() => {
    clearActiveGameSession();
    tableRestoreAttemptedRef.current = false;
    setGameResult(null);
    setTableMounted(false);
    setTableUnlocked(false);
    setMatchLoading(false);
    setGameActive(false);
    setResumingMatch(false);
    setReconnectMatchId(null);
    setEventMatchmaking(false);
    nextRoundRef.current = null;
    if (currentRoom) void leaveRoom().finally(() => refreshActiveRoomHint());
    if (gameMode === "event" && eventDetailId) {
      navigateTo("event_detail", { replace: true, eventDetailId });
      return;
    }
    navigateTo("menu", { replace: true, resetStack: true });
  }, [navigateTo, currentRoom, leaveRoom, refreshActiveRoomHint, gameMode, eventDetailId]);

  const handleLobbyBack = useCallback(() => {
    clearRestoredRoomId();
    lobbyRestoreAttemptedRef.current = null;
    const fallback = currentRoom?.roomType === "friends" ? "friends_invite" : "online_setup";
    goBack(fallback);
  }, [clearRestoredRoomId, currentRoom?.roomType, goBack]);

  const handleMatchIdChange = useCallback((id: string | null) => {
    updateActiveGameMatchId(id);
  }, []);

  const handleReconnectFailed = useCallback(() => {
    clearActiveGameSession();
    tableRestoreAttemptedRef.current = false;
    setTableMounted(false);
    setTableUnlocked(false);
    setMatchLoading(false);
    setGameActive(false);
    setResumingMatch(false);
    setReconnectMatchId(null);
    if (gameMode === "event" && eventDetailId) {
      navigateTo("event_detail", { replace: true, eventDetailId });
      return;
    }
    navigateTo(gameMode === "bot" ? "bot_setup" : "menu", { replace: true });
  }, [eventDetailId, gameMode, navigateTo]);

  /* Interception propre du bouton Retour (navigateur / matériel Android Capacitor / in-app) :
     - Sur ResultScreen / Revanche : revient au résultat puis quitte proprement.
     - Pendant MatchLoadingScreen : demande confirmation avant d'annuler le lancement.
     - Sur TableScreen en cours : ferme une modale ou ouvre « Quitter la partie ? ».
     - Sur LobbyScreen : demande confirmation si d'autres joueurs attendent, puis quitte la salle. */
  useEffect(() => {
    registerBackInterceptor(() => {
      if (gameResult) {
        const stayedOnResult = resultBackRef.current?.() ?? false;
        return stayedOnResult ? "stay" : "handled";
      }
      if (gameActive && matchLoading) {
        return loadingBackRef.current?.() ?? "stay";
      }
      if (gameActive || scene === "table") {
        if (eventMatchmaking) return "stay";
        return tableBackRef.current?.() ?? "stay";
      }
      if (scene === "lobby") {
        return lobbyBackRef.current?.() ?? false;
      }
      return false;
    });
    return () => registerBackInterceptor(null);
  }, [
    eventMatchmaking,
    gameActive,
    gameResult,
    matchLoading,
    registerBackInterceptor,
    scene,
  ]);

  /* Rendu de la scène courante (hors table/result, gérés séparément en overlay).
     Les écrans riches en images passent par la porte de chargement. */
  const renderScene = (): ReactNode => {
    const content = renderSceneContent();
    const gate = SCENE_GATES[scene];
    if (!gate) return content;
    return <LoadingGate key={scene} name={scene} title={gate} maxWaitMs={4000} manifest={() => sceneManifest(scene)}>{content}</LoadingGate>;
  };

  const renderSceneContent = (): ReactNode => {
    switch (scene) {
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
      case "play": return <PlayHubScreen onBotStart={handleBotStart} />;
      case "shop": return <ShopScreen />;
      case "events": return <EventsScreen />;
      case "event_detail": return <EventDetailScreen onStart={handleEventStart} />;
      case "season": return <SeasonScreen />;
      case "wallet": return <WalletScreen />;
      case "minigames": return <MiniGamesScreen />;
      case "bot_setup": return <BotSetupScreen onStart={handleBotStart} />;
      case "online_setup": return <OnlineSetupScreen onBotStart={handleBotStart} />;
      case "friends_invite": return <FriendsSetupScreen onBotStart={handleBotStart} />;
      case "lobby":
        return roomId ? (
          <LobbyScreen
            onGameStart={handleGameStart}
            onBack={handleLobbyBack}
            onBackRequestRef={lobbyBackRef}
          />
        ) : (
          <div className="nj-shell" aria-busy="true" aria-label="Reconnexion à la salle d'attente" />
        );
      default: return null; // "table" : géré par MatchLoadingScreen + TableScreen ci-dessous
    }
  };

  return (
    <MotionConfig reducedMotion={motionProfile.enabled ? "user" : "always"}>
      <div
        className={[
          motionProfile.enabled ? "nj-motion-on" : motionProfile.reduced ? "nj-motion-reduced" : "nj-motion-off",
          `nj-motion-level-${motionProfile.mode}`,
          animationsOn ? "nj-animations-enabled" : "nj-animations-disabled",
        ].join(" ")}
        style={{ minHeight: "100vh", position: "relative" }}
      >
        {motionProfile.allowNavigationMotion ? (
          <AnimatePresence mode="wait" initial={false} onExitComplete={endTransition}>
            <motion.div
              key={scene}
              variants={motionProfile.reduced ? reducedSceneVariants : sceneVariants}
              initial="out"
              animate="in"
              exit="exit"
              style={{ minHeight: "100dvh", willChange: "opacity" }}
            >
              {renderScene()}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div style={{ minHeight: "100dvh" }}>{renderScene()}</div>
        )}

        {/* Écran de chargement plein écran + cinématique d'ouverture en 3 actes
            (portes acajou/laiton à sceau fendu, faisceau d'or, envolée de cartes). */}
        {gameActive && matchLoading && (
          <MatchLoadingScreen
            key={`loader-${tableKey}`}
            gameMode={gameMode}
            mise={gameMise}
            playerCount={displayPlayerCount}
            difficulty={gameDifficulty}
            stageLabel={eventStageLabel}
            equippedPowers={myEquippedPowers}
            participants={[myCosmetics]}
            resuming={resumingMatch}
            minDisplayMs={5000}
            maxWaitMs={isRoomMode || eventMatchmaking ? 9000 : 10000}
            onPreMountTable={() => setTableMounted(true)}
            onUnlockGame={() => {
              setTableMounted(true);
              setTableUnlocked(true);
            }}
            onReady={() => {
              setTableMounted(true);
              setTableUnlocked(true);
              setMatchLoading(false);
            }}
            onCancel={gameMode === "bot" ? handleMenu : undefined}
            onBackRequestRef={loadingBackRef}
          />
        )}

        {/* TableScreen — pré-monté derrière les portes opaques (~1 s avant
            l'ouverture) pour garantir 60 fps pendant la cinématique, puis
            déverrouillé (donne + chrono) pile à l'Acte III (« À table ! »). */}
        {gameActive && tableMounted && (
          <TableScreen
            key={tableKey}
            gameMode={gameMode}
            initialBotCount={gameBotCount}
            initialMise={gameMise}
            initialDifficulty={gameDifficulty}
            roomId={isRoomMode ? roomId ?? undefined : undefined}
            roomPlayers={isRoomMode && roomPlayers.length > 0 ? roomPlayers as RoomPlayer[] : undefined}
            roomHostId={isRoomMode ? roomHostId || undefined : undefined}
            eventRunId={eventRunId ?? undefined}
            reconnectMatchId={reconnectMatchId ?? undefined}
            onMatchIdChange={handleMatchIdChange}
            onReconnectFailed={handleReconnectFailed}
            onResult={handleResult}
            onRoundRestart={() => {
              setGameResult(null);
            }}
            onMenu={handleMenu}
            onNextRoundRef={nextRoundRef}
            onBackRequestRef={tableBackRef}
            paused={Boolean(gameResult)}
            waitForReveal={!tableUnlocked}
          />
        )}

        {/* Écran de file d'attente — au-dessus de la table tant qu'un événement
            PvP n'a pas de groupe (currentMatchId absent du run). */}
        {gameActive && tableUnlocked && !matchLoading && eventMatchmaking && eventRunId && eventId && (
          <EventMatchmakingOverlay
            key={`mm-${eventRunId}`}
            runId={eventRunId}
            eventId={eventId}
            stageTitle={eventStageLabel}
            requiredPlayers={eventRequiredPlayers}
            onMatchStart={() => setEventMatchmaking(false)}
            onAbort={() => setEventMatchmaking(false)}
          />
        )}

        {/* ResultScreen — overlay plein écran par-dessus la table */}
        {gameResult && (
          <ResultScreen
            result={gameResult}
            gameMode={gameMode}
            mise={gameMise}
            onNext={handleNextRound}
            onMenu={handleMenu}
            canNext={gameMode !== "event" && !!profile && profile.balance >= gameMise}
            nextRequiresConsensus={gameMode === "online" || gameMode === "friends"}
            onBackRequestRef={resultBackRef}
          />
        )}

        {/* Toast discret mobile Capacitor (double-retour pour quitter à la racine) */}
        {exitToast && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: "fixed",
              left: "50%",
              bottom: "max(24px, env(safe-area-inset-bottom))",
              transform: "translateX(-50%)",
              zIndex: 500,
              padding: "10px 18px",
              borderRadius: 999,
              border: "1px solid rgba(255, 212, 92, 0.52)",
              background: "rgba(17, 13, 10, 0.94)",
              color: "#fff8ea",
              fontSize: "0.84rem",
              fontWeight: 700,
              boxShadow: "0 12px 30px rgba(0, 0, 0, 0.55)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {exitToast}
          </div>
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
