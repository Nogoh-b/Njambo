"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAudioMute, useAudioVolume, useMusic } from "@gxe/react";
import { resolveMusicTrack, useAudioCatalogConfig } from "@/lib/audio/audioCatalogStore";
import {
  DEFAULT_AUDIO_SETTINGS,
  loadAudioSettings,
  saveAudioSettings,
  type StoredAudioSettings,
} from "@/lib/audio/audioSettings";
import { GAME_CONFIG } from "@/config/gameConfig";
import { navStart } from "@/lib/navPerf";
import { useGameplayConfig } from "@/hooks/useGameplayConfig";
import { STARTING_CAURIS } from "@/config/powerCards";
import { DEV, devEquippedPowers } from "@/config/devConfig";
import {
  closeTopModal,
  createNavKey,
  isCapacitorNative,
  isNjamboHistoryState,
  minimizeOrExitCapacitorApp,
  parentSceneOf,
  parseRouteHash,
  resolveInitialNavigation,
  sameNavEntry,
  saveNavStack,
  sceneLabelOf,
  subscribeHardwareBackButton,
  urlForNavEntry,
  type NavEntry,
  type NjamboHistoryState,
} from "@/lib/navigation";
import type { Profile, SceneName, SocialTarget } from "@/types/game";

/** Applique les triches de dev au profil : solde figé + pouvoirs équipés. */
function applyDevProfile(p: Profile): Profile {
  if (!DEV.enabled) return p;
  return {
    ...p,
    balance: DEV.richBalance > 0 ? DEV.richBalance : p.balance,
    equippedPowers: devEquippedPowers(p.equippedPowers ?? []),
  };
}

export interface NavigateOptions {
  replace?: boolean;
  /** Réinitialise la pile interne sur cette scène (ex. retour propre au salon après une partie). */
  resetStack?: boolean;
  eventDetailId?: string | null;
  socialTarget?: SocialTarget;
  collectionTab?: "powers" | "items";
  roomId?: string | null;
}

/**
 * Résultat d'interception du bouton Retour (navigateur / matériel Android / in-app) :
 * - `"stay"` : reste sur l'écran courant (ex. modale « Quitter ? » ouverte) et ré-arme l'historique ;
 * - `"handled"` : l'intercepteur a déjà navigué lui-même (ne rien ré-empiler) ;
 * - `false` : laisser la navigation retour standard s'exécuter.
 */
export type BackInterceptResult = "stay" | "handled" | false;
export type BackInterceptor = (nextScene: SceneName) => BackInterceptResult;

/* ═══════════════ Contexte global du jeu Njambo ═══════════════
   Partagé par toutes les scènes : profil, préférences audio,
   système de navigation complet (pile persistée + hash URL +
   History API + bouton Retour matériel Capacitor), config du jeu. */

interface GameContextValue {
  /* Navigation */
  scene: SceneName;
  transitioning: boolean;
  navigateTo: (target: SceneName, options?: NavigateOptions) => void;
  goBack: (fallback?: SceneName) => void;
  canGoBack: boolean;
  previousScene: SceneName | null;
  /** Libellé lisible du bouton retour (scène précédente réelle dans la pile ou fallback). */
  backLabelFor: (fallback?: SceneName) => string;
  /** Identifiant de salle éventuellement restauré après actualisation sur `#/lobby?room=...`. */
  restoredRoomId: string | null;
  clearRestoredRoomId: () => void;
  /** Message bref sur mobile Capacitor lors d'un premier Retour à la racine (Menu). */
  exitToast: string | null;
  registerBackInterceptor: (interceptor: BackInterceptor | null) => void;
  endTransition: () => void;
  socialTarget: SocialTarget;
  setSocialTarget: (target: SocialTarget | ((prev: SocialTarget) => SocialTarget)) => void;
  /** eventId porté pour la scène event_detail (null = liste des événements). */
  eventDetailId: string | null;
  setEventDetailId: (id: string | null) => void;
  /** Photo du parcours prise juste avant de lancer une partie d'événement.
   *  Au retour sur event_detail, comparée au run à jour pour animer les
   *  conséquences (vie perdue, table validée, élimination, grand prix). */
  eventReturn: EventReturnSnapshot | null;
  setEventReturn: (snapshot: EventReturnSnapshot | null) => void;

  /** Onglet actif à l'ouverture de l'écran Collection ("powers" ou "items"). */
  collectionTab: "powers" | "items";
  setCollectionTab: (tab: "powers" | "items") => void;

  /* Profil joueur */
  profile: Profile;
  setProfile: (p: Profile | ((prev: Profile) => Profile)) => void;

  /* Audio — `sfxOn`/`musicOn` et volumes pilotent les bus `sfx`/`music` de GXE
     (`useAudioMute` / `useAudioVolume`), persistés en localStorage. */
  musicOn: boolean;
  setMusicOn: (v: boolean) => void;
  sfxOn: boolean;
  setSfxOn: (v: boolean) => void;
  musicVolume: number;
  setMusicVolume: (v: number) => void;
  sfxVolume: number;
  setSfxVolume: (v: number) => void;

  /* Config (shortcut) */
  cfg: typeof GAME_CONFIG;
}

export interface EventReturnSnapshot {
  runId: string;
  eventId: string;
  stageIndex: number;
  losses: number;
  /** Score du parcours et rang au classement avant la partie (phase 2). */
  score?: number;
  rank?: number | null;
  takenAt: number;
}

const GameContext = createContext<GameContextValue | null>(null);

const STORAGE_KEY = "njambo-profile";
const MAX_STACK_LENGTH = 40;
const DOUBLE_BACK_EXIT_MS = 2200;

/** Lit le profil depuis localStorage (fallback = défaut) */
function loadStoredProfile(): Profile {
  if (typeof window === "undefined") {
    return {
      name: "Nogoh",
      emoji: "you-nogoh",
      balance: GAME_CONFIG.startingBalance,
      cauris: STARTING_CAURIS,
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Profile;
      return {
        name: typeof parsed.name === "string" && parsed.name ? parsed.name : "Nogoh",
        emoji: typeof parsed.emoji === "string" && parsed.emoji ? parsed.emoji : "you-nogoh",
        balance: typeof parsed.balance === "number" ? parsed.balance : GAME_CONFIG.startingBalance,
        cauris: typeof parsed.cauris === "number" ? parsed.cauris : STARTING_CAURIS,
        powerInventory: parsed.powerInventory ?? {},
        equippedPowers: parsed.equippedPowers ?? [],
      };
    }
  } catch {
    // Corrupted data — ignore
  }
  return {
    name: "Nogoh",
    emoji: "you-nogoh",
    balance: GAME_CONFIG.startingBalance,
    cauris: STARTING_CAURIS,
  };
}

/** Sauvegarde le profil dans localStorage */
function storeProfile(p: Profile) {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    }
  } catch {
    // localStorage full or unavailable — ignore
  }
}

function writeHistory(
  entry: NavEntry,
  mode: "push" | "replace",
  historyDepth: number,
  stackIndex: number,
) {
  if (typeof window === "undefined") return;
  const state: NjamboHistoryState = {
    __njambo: true,
    key: entry.key,
    historyDepth,
    stackIndex,
    entry,
  };
  const url = urlForNavEntry(entry);
  try {
    if (mode === "push") window.history.pushState(state, "", url);
    else window.history.replaceState(state, "", url);
  } catch {
    // Ignore restricted history APIs (e.g. sandboxed iframes)
  }
}

export function GameProvider({ children }: { children: ReactNode }) {
  const { config: gameplay } = useGameplayConfig();
  // Le rythme de la donne réglé dans l'admin remplace celui du jeu (mode local et parties sans règles copiées).
  const cfg = useMemo(() => ({
    ...GAME_CONFIG,
    ...gameplay,
    anim: {
      ...GAME_CONFIG.anim,
      dealShuffle: gameplay.dealShuffleMs,
      dealShufflePackets: gameplay.dealShufflePacketsMs,
      dealRotate: gameplay.dealRotateMs,
      dealPerCard: gameplay.dealPerCardMs,
      dealFlight: gameplay.dealFlightMs,
    },
  }), [gameplay]);

  // Hydratation initiale synchrone (aucun flash du MenuScreen après F5 / reload WebView)
  const initialRef = useRef<ReturnType<typeof resolveInitialNavigation> | null>(null);
  if (!initialRef.current) initialRef.current = resolveInitialNavigation();
  const initial = initialRef.current;
  const initialEntry = initial.entries[initial.index];

  const [scene, setScene] = useState<SceneName>(initialEntry.scene);
  const [transitioning, setTransitioning] = useState(false);
  const [profile, setProfileRaw] = useState<Profile>(() => applyDevProfile(loadStoredProfile()));
  const [socialTarget, setSocialTargetRaw] = useState<SocialTarget>(() => initialEntry.socialTarget ?? {});
  const [eventDetailId, setEventDetailIdRaw] = useState<string | null>(() => initialEntry.eventDetailId ?? null);
  const [eventReturn, setEventReturn] = useState<EventReturnSnapshot | null>(null);
  const [collectionTab, setCollectionTabRaw] = useState<"powers" | "items">(() => initialEntry.collectionTab ?? "powers");
  const [restoredRoomId, setRestoredRoomId] = useState<string | null>(() => initialEntry.roomId ?? null);
  const [exitToast, setExitToast] = useState<string | null>(null);
  const [navMeta, setNavMeta] = useState<{ canGoBack: boolean; previousScene: SceneName | null }>(() => ({
    canGoBack: initial.index > 0,
    previousScene: initial.index > 0 ? initial.entries[initial.index - 1].scene : null,
  }));
  const [audioPrefs, setAudioPrefs] = useState<StoredAudioSettings>(DEFAULT_AUDIO_SETTINGS);
  useEffect(() => {
    setAudioPrefs(loadAudioSettings());
  }, []);

  const updateAudioPrefs = useCallback((patch: Partial<StoredAudioSettings>) => {
    setAudioPrefs((prev) => {
      const next: StoredAudioSettings = { ...prev, ...patch };
      saveAudioSettings(next);
      return next;
    });
  }, []);

  const { musicOn, sfxOn, musicVolume, sfxVolume } = audioPrefs;
  const setMusicOn = useCallback((v: boolean) => updateAudioPrefs({ musicOn: v }), [updateAudioPrefs]);
  const setSfxOn = useCallback((v: boolean) => updateAudioPrefs({ sfxOn: v }), [updateAudioPrefs]);
  const setMusicVolume = useCallback((v: number) => updateAudioPrefs({ musicVolume: Math.max(0, Math.min(1, v)) }), [updateAudioPrefs]);
  const setSfxVolume = useCallback((v: number) => updateAudioPrefs({ sfxVolume: Math.max(0, Math.min(1, v)) }), [updateAudioPrefs]);

  const stackRef = useRef<NavEntry[]>(initial.entries);
  const stackIndexRef = useRef<number>(initial.index);
  const historyDepthRef = useRef<number>(initial.historyDepth);
  const sceneRef = useRef<SceneName>(initialEntry.scene);
  const socialTargetRef = useRef<SocialTarget>(initialEntry.socialTarget ?? {});
  const eventDetailIdRef = useRef<string | null>(initialEntry.eventDetailId ?? null);
  const collectionTabRef = useRef<"powers" | "items">(initialEntry.collectionTab ?? "powers");
  const restoredRoomIdRef = useRef<string | null>(initialEntry.roomId ?? null);
  const backInterceptorRef = useRef<BackInterceptor | null>(null);
  const authorizedBackRef = useRef<boolean>(false);
  const lastRootBackAtRef = useRef<number>(0);
  const exitToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  sceneRef.current = scene;
  socialTargetRef.current = socialTarget;
  eventDetailIdRef.current = eventDetailId;
  collectionTabRef.current = collectionTab;

  const syncMeta = useCallback(() => {
    const idx = stackIndexRef.current;
    const prev = idx > 0 ? stackRef.current[idx - 1]?.scene ?? null : null;
    setNavMeta((current) =>
      current.canGoBack === (idx > 0) && current.previousScene === prev
        ? current
        : { canGoBack: idx > 0, previousScene: prev },
    );
  }, []);

  /** Applique une entrée de pile vers l'état React + les refs synchrones. */
  const applyEntryToState = useCallback((entry: NavEntry, animate: boolean) => {
    const nextEventId = entry.eventDetailId !== undefined ? entry.eventDetailId : (entry.scene === "events" ? null : eventDetailIdRef.current);
    eventDetailIdRef.current = nextEventId ?? null;
    setEventDetailIdRaw(nextEventId ?? null);

    if (entry.socialTarget !== undefined) {
      socialTargetRef.current = entry.socialTarget;
      setSocialTargetRaw(entry.socialTarget);
    }

    if (entry.collectionTab !== undefined) {
      collectionTabRef.current = entry.collectionTab;
      setCollectionTabRaw(entry.collectionTab);
    }

    const nextRoomId = entry.scene === "lobby" ? (entry.roomId ?? null) : null;
    restoredRoomIdRef.current = nextRoomId;
    setRestoredRoomId(nextRoomId);

    if (entry.scene !== sceneRef.current) {
      navStart(sceneRef.current, entry.scene);
      if (animate) setTransitioning(true);
      sceneRef.current = entry.scene;
      setScene(entry.scene);
    }
    syncMeta();
  }, [syncMeta]);

  /** Met à jour l'entrée courante dans la pile, sessionStorage et l'URL hash (replaceState). */
  const updateCurrentEntry = useCallback((patch: Partial<Omit<NavEntry, "key" | "scene">>) => {
    const idx = stackIndexRef.current;
    const current = stackRef.current[idx];
    if (!current) return;
    const updated: NavEntry = { ...current, ...patch };
    const nextStack = [...stackRef.current];
    nextStack[idx] = updated;
    stackRef.current = nextStack;
    saveNavStack(nextStack, idx);
    writeHistory(updated, "replace", historyDepthRef.current, idx);
  }, []);

  /* Sauvegarder dans localStorage à chaque changement de profil */
  const setProfile = useCallback((p: Profile | ((prev: Profile) => Profile)) => {
    setProfileRaw((prev) => {
      const next = applyDevProfile(typeof p === "function" ? p(prev) : p);
      storeProfile(next);
      return next;
    });
  }, []);

  const audioCatalog = useAudioCatalogConfig();
  const gxeMusic = useMusic();
  useEffect(() => {
    if (!musicOn) {
      gxeMusic.stop();
      return;
    }
    const trackId = scene === "table" || scene === "result" ? "music_table" : "music_salon";
    const resolved = resolveMusicTrack(trackId, audioCatalog);
    if (!resolved.enabled || !resolved.trackUrl) {
      gxeMusic.stop();
      return;
    }
    gxeMusic.start({
      trackUrl: resolved.trackUrl,
      volume: resolved.volume,
      crossfadeMs: resolved.crossfadeMs,
    });
  }, [musicOn, scene, audioCatalog, gxeMusic]);

  useEffect(() => () => gxeMusic.stop(), [gxeMusic]);

  useAudioMute("sfx", !sfxOn);
  useAudioMute("music", !musicOn);
  useAudioVolume("sfx", sfxVolume);
  useAudioVolume("music", musicVolume);

  const registerBackInterceptor = useCallback((interceptor: BackInterceptor | null) => {
    backInterceptorRef.current = interceptor;
  }, []);

  const clearRestoredRoomId = useCallback(() => {
    restoredRoomIdRef.current = null;
    setRestoredRoomId(null);
  }, []);

  const navigateTo = useCallback((target: SceneName, options?: NavigateOptions) => {
    const nextEventDetailId =
      options?.eventDetailId !== undefined
        ? options.eventDetailId
        : target === "events"
          ? null
          : eventDetailIdRef.current;
    const nextSocialTarget = options?.socialTarget !== undefined ? options.socialTarget : socialTargetRef.current;
    const nextCollectionTab = options?.collectionTab !== undefined ? options.collectionTab : collectionTabRef.current;
    const nextRoomId =
      options?.roomId !== undefined
        ? options.roomId
        : target === "lobby"
          ? restoredRoomIdRef.current
          : null;

    const newEntry: NavEntry = {
      key: createNavKey(),
      scene: target,
      eventDetailId: target === "event_detail" ? nextEventDetailId : null,
      socialTarget: target === "chat" || target === "public_profile" ? nextSocialTarget : undefined,
      collectionTab: target === "power_collection" ? nextCollectionTab : undefined,
      roomId: target === "lobby" ? nextRoomId : null,
    };

    const currentEntry = stackRef.current[stackIndexRef.current];

    // Même scène & mêmes paramètres : simple replace sans empiler de doublon.
    if (currentEntry && sameNavEntry(currentEntry, newEntry)) {
      if (options?.resetStack) {
        const clean: NavEntry = { ...newEntry, key: currentEntry.key };
        stackRef.current = [clean];
        stackIndexRef.current = 0;
        saveNavStack(stackRef.current, 0);
        writeHistory(clean, "replace", historyDepthRef.current, 0);
        syncMeta();
      } else if (options?.replace) {
        updateCurrentEntry({
          eventDetailId: newEntry.eventDetailId,
          socialTarget: newEntry.socialTarget,
          collectionTab: newEntry.collectionTab,
          roomId: newEntry.roomId,
        });
      }
      return;
    }

    if (options?.resetStack) {
      stackRef.current = [newEntry];
      stackIndexRef.current = 0;
      saveNavStack(stackRef.current, 0);
      writeHistory(newEntry, "replace", historyDepthRef.current, 0);
      applyEntryToState(newEntry, true);
      return;
    }

    if (options?.replace) {
      const nextStack = [...stackRef.current];
      const idx = stackIndexRef.current;
      nextStack[idx] = newEntry;
      stackRef.current = nextStack;
      saveNavStack(nextStack, idx);
      writeHistory(newEntry, "replace", historyDepthRef.current, idx);
      applyEntryToState(newEntry, true);
      return;
    }

    // Empilement standard (push)
    const truncated = stackRef.current.slice(0, stackIndexRef.current + 1);
    truncated.push(newEntry);
    const trimmed = truncated.length > MAX_STACK_LENGTH
      ? truncated.slice(truncated.length - MAX_STACK_LENGTH)
      : truncated;
    const nextIdx = trimmed.length - 1;
    stackRef.current = trimmed;
    stackIndexRef.current = nextIdx;
    historyDepthRef.current += 1;

    saveNavStack(trimmed, nextIdx);
    writeHistory(newEntry, "push", historyDepthRef.current, nextIdx);
    applyEntryToState(newEntry, true);
  }, [applyEntryToState, syncMeta, updateCurrentEntry]);

  const triggerBack = useCallback((fallback?: SceneName, fromHardware = false) => {
    // 1. Fermer d'abord toute modale ouverte (GameModal)
    if (closeTopModal()) return;

    const idx = stackIndexRef.current;
    const prevEntry = idx > 0 ? stackRef.current[idx - 1] : null;
    const candidateScene = prevEntry?.scene ?? fallback ?? parentSceneOf(sceneRef.current);

    // 2. Laisser l'écran actif intercepter (ex. TableScreen → « Quitter la partie ? »)
    const intercepted = backInterceptorRef.current?.(candidateScene) ?? false;
    if (intercepted === "stay" || intercepted === "handled") return;

    // 3. Reculer dans la pile si un écran précédent existe
    if (idx > 0 && prevEntry) {
      if (typeof window !== "undefined" && historyDepthRef.current > 0) {
        authorizedBackRef.current = true;
        window.history.back();
        return;
      }
      // Pile restaurée après F5 sans historique navigateur derrière : on dépile proprement
      // sans jamais appeler history.back() (qui quitterait le site / la WebView).
      const nextIdx = idx - 1;
      stackIndexRef.current = nextIdx;
      saveNavStack(stackRef.current, nextIdx);
      writeHistory(prevEntry, "replace", historyDepthRef.current, nextIdx);
      applyEntryToState(prevEntry, true);
      return;
    }

    // 4. Pile à la racine : si on n'est pas sur le menu, remonter au parent canonique
    if (sceneRef.current !== "menu") {
      const target = fallback ?? parentSceneOf(sceneRef.current);
      navigateTo(target, { replace: true });
      return;
    }

    // 5. Déjà sur le salon principal (menu) : double-retour mobile pour quitter sous Capacitor
    if (fromHardware && isCapacitorNative()) {
      const now = Date.now();
      if (now - lastRootBackAtRef.current <= DOUBLE_BACK_EXIT_MS) {
        lastRootBackAtRef.current = 0;
        setExitToast(null);
        minimizeOrExitCapacitorApp();
      } else {
        lastRootBackAtRef.current = now;
        setExitToast("Appuie encore une fois pour quitter Njambo");
        if (exitToastTimerRef.current) clearTimeout(exitToastTimerRef.current);
        exitToastTimerRef.current = setTimeout(() => {
          setExitToast(null);
          exitToastTimerRef.current = null;
        }, DOUBLE_BACK_EXIT_MS);
      }
    }
  }, [applyEntryToState, navigateTo]);

  const goBack = useCallback((fallback?: SceneName) => {
    triggerBack(fallback, false);
  }, [triggerBack]);

  const backLabelFor = useCallback((fallback?: SceneName): string => {
    const target = navMeta.previousScene ?? fallback ?? parentSceneOf(scene);
    return sceneLabelOf(target);
  }, [navMeta.previousScene, scene]);

  /* Synchronisation initiale History API + écoute popstate / hashchange / Capacitor backButton. */
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Ancrer l'entrée initiale dans History API + sessionStorage
    const current = stackRef.current[stackIndexRef.current];
    if (current) {
      saveNavStack(stackRef.current, stackIndexRef.current);
      writeHistory(current, "replace", historyDepthRef.current, stackIndexRef.current);
    }

    const onPopState = (event: PopStateEvent) => {
      const raw = event.state;
      const state = isNjamboHistoryState(raw) ? raw : null;
      const parsedHash = parseRouteHash(window.location.hash);
      const poppedDepth = state?.historyDepth ?? Math.max(0, historyDepthRef.current - 1);

      const candidateScene: SceneName =
        state?.entry.scene ??
        parsedHash?.scene ??
        (stackIndexRef.current > 0 ? stackRef.current[stackIndexRef.current - 1].scene : "menu");

      const alreadyAuthorized = authorizedBackRef.current;
      authorizedBackRef.current = false;

      if (!alreadyAuthorized) {
        // 1. Modale ouverte : fermer la modale et restaurer l'entrée d'historique sans dupliquer la pile
        if (closeTopModal()) {
          const staying = stackRef.current[stackIndexRef.current];
          if (staying) {
            historyDepthRef.current = poppedDepth + 1;
            writeHistory(staying, "push", historyDepthRef.current, stackIndexRef.current);
          }
          return;
        }

        // 2. Intercepteur de scène (ex. confirmation de sortie en pleine partie)
        const intercepted = backInterceptorRef.current?.(candidateScene) ?? false;
        if (intercepted === "stay") {
          const staying = stackRef.current[stackIndexRef.current];
          if (staying) {
            historyDepthRef.current = poppedDepth + 1;
            writeHistory(staying, "push", historyDepthRef.current, stackIndexRef.current);
          }
          return;
        }
        if (intercepted === "handled") {
          historyDepthRef.current = poppedDepth;
          return;
        }
      }

      // 3. Résoudre l'entrée cible et assainir tout écran transitoire mort
      let targetEntry: NavEntry = state?.entry
        ? { ...state.entry }
        : parsedHash
          ? {
              key: createNavKey(),
              scene: parsedHash.scene,
              eventDetailId: parsedHash.eventDetailId ?? null,
              socialTarget: parsedHash.socialTarget,
              collectionTab: parsedHash.collectionTab,
              roomId: parsedHash.roomId ?? null,
            }
          : { key: createNavKey(), scene: candidateScene };

      let sanitized = false;
      if (targetEntry.scene === "table" || targetEntry.scene === "result") {
        targetEntry = { key: targetEntry.key, scene: "menu" };
        sanitized = true;
      } else if (targetEntry.scene === "lobby" && !targetEntry.roomId) {
        targetEntry = { key: targetEntry.key, scene: "online_setup" };
        sanitized = true;
      } else if (targetEntry.scene === "event_detail" && !targetEntry.eventDetailId && !eventDetailIdRef.current) {
        targetEntry = { key: targetEntry.key, scene: "events" };
        sanitized = true;
      } else if (
        (targetEntry.scene === "chat" || targetEntry.scene === "public_profile") &&
        !(
          targetEntry.socialTarget?.peerUid ||
          targetEntry.socialTarget?.playerUid ||
          targetEntry.socialTarget?.conversationId ||
          socialTargetRef.current.peerUid ||
          socialTargetRef.current.playerUid
        )
      ) {
        targetEntry = { key: targetEntry.key, scene: "friends" };
        sanitized = true;
      }

      historyDepthRef.current = poppedDepth;

      // Aligner stackIndexRef sur la pile logique existante si l'entrée s'y trouve
      const byKey = stackRef.current.findIndex((item) => item.key === targetEntry.key);
      if (byKey !== -1) {
        if (sanitized) {
          const nextStack = [...stackRef.current];
          nextStack[byKey] = targetEntry;
          stackRef.current = nextStack;
        }
        stackIndexRef.current = byKey;
      } else if (
        state &&
        state.stackIndex >= 0 &&
        state.stackIndex < stackRef.current.length
      ) {
        const nextStack = [...stackRef.current];
        nextStack[state.stackIndex] = targetEntry;
        stackRef.current = nextStack;
        stackIndexRef.current = state.stackIndex;
      } else if (stackIndexRef.current > 0 && stackRef.current[stackIndexRef.current - 1]?.scene === targetEntry.scene) {
        stackIndexRef.current -= 1;
        if (sanitized) {
          const nextStack = [...stackRef.current];
          nextStack[stackIndexRef.current] = targetEntry;
          stackRef.current = nextStack;
        }
      } else {
        stackRef.current = targetEntry.scene === "menu"
          ? [targetEntry]
          : [{ key: createNavKey(), scene: "menu" }, targetEntry];
        stackIndexRef.current = stackRef.current.length - 1;
      }

      saveNavStack(stackRef.current, stackIndexRef.current);
      if (sanitized) {
        writeHistory(targetEntry, "replace", historyDepthRef.current, stackIndexRef.current);
      }
      applyEntryToState(targetEntry, true);
    };

    const onHashChange = () => {
      const parsed = parseRouteHash(window.location.hash);
      const targetScene: SceneName = parsed?.scene ?? "menu";
      const currentEntry = stackRef.current[stackIndexRef.current];
      const synthetic: NavEntry = {
        key: currentEntry?.key ?? createNavKey(),
        scene: targetScene,
        eventDetailId: parsed?.eventDetailId ?? null,
        socialTarget: parsed?.socialTarget,
        collectionTab: parsed?.collectionTab,
        roomId: parsed?.roomId ?? null,
      };
      if (currentEntry && sameNavEntry(currentEntry, synthetic)) return;

      // Protéger une partie en cours contre un changement de hash direct
      const intercepted = backInterceptorRef.current?.(targetScene) ?? false;
      if (intercepted === "stay") {
        if (currentEntry) writeHistory(currentEntry, "replace", historyDepthRef.current, stackIndexRef.current);
        return;
      }
      if (intercepted === "handled") return;

      if (targetScene === "table" || targetScene === "result") {
        navigateTo("menu", { replace: true });
        return;
      }
      navigateTo(targetScene, {
        replace: true,
        eventDetailId: parsed?.eventDetailId ?? undefined,
        socialTarget: parsed?.socialTarget,
        collectionTab: parsed?.collectionTab,
        roomId: parsed?.roomId ?? undefined,
      });
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onHashChange);
    const unsubHardware = subscribeHardwareBackButton(() => {
      triggerBack(undefined, true);
    });

    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("hashchange", onHashChange);
      unsubHardware();
      if (exitToastTimerRef.current) clearTimeout(exitToastTimerRef.current);
    };
  }, [applyEntryToState, navigateTo, triggerBack]);

  const setEventDetailId = useCallback((id: string | null) => {
    eventDetailIdRef.current = id;
    setEventDetailIdRaw(id);
    if (sceneRef.current === "event_detail") {
      updateCurrentEntry({ eventDetailId: id });
    }
  }, [updateCurrentEntry]);

  const setCollectionTab = useCallback((tab: "powers" | "items") => {
    collectionTabRef.current = tab;
    setCollectionTabRaw(tab);
    if (sceneRef.current === "power_collection") {
      updateCurrentEntry({ collectionTab: tab });
    }
  }, [updateCurrentEntry]);

  /** Appelé par AnimatePresence quand l'ancienne scène a fini de sortir. */
  const endTransition = useCallback(() => setTransitioning(false), []);

  const setSocialTarget = useCallback((target: SocialTarget | ((prev: SocialTarget) => SocialTarget)) => {
    const next = typeof target === "function" ? target(socialTargetRef.current) : target;
    socialTargetRef.current = next;
    setSocialTargetRaw(next);
    if (sceneRef.current === "chat" || sceneRef.current === "public_profile") {
      updateCurrentEntry({ socialTarget: next });
    }
  }, [updateCurrentEntry]);

  const value = useMemo<GameContextValue>(() => ({
    scene,
    transitioning,
    navigateTo,
    goBack,
    canGoBack: navMeta.canGoBack,
    previousScene: navMeta.previousScene,
    backLabelFor,
    restoredRoomId,
    clearRestoredRoomId,
    exitToast,
    registerBackInterceptor,
    endTransition,
    socialTarget,
    setSocialTarget,
    eventDetailId,
    setEventDetailId,
    eventReturn,
    setEventReturn,
    collectionTab,
    setCollectionTab,
    profile,
    setProfile,
    musicOn,
    setMusicOn,
    sfxOn,
    setSfxOn,
    musicVolume,
    setMusicVolume,
    sfxVolume,
    setSfxVolume,
    cfg,
  }), [
    scene,
    transitioning,
    navigateTo,
    goBack,
    navMeta.canGoBack,
    navMeta.previousScene,
    backLabelFor,
    restoredRoomId,
    clearRestoredRoomId,
    exitToast,
    registerBackInterceptor,
    endTransition,
    socialTarget,
    setSocialTarget,
    eventDetailId,
    setEventDetailId,
    eventReturn,
    collectionTab,
    setCollectionTab,
    profile,
    setProfile,
    musicOn,
    setMusicOn,
    sfxOn,
    setSfxOn,
    musicVolume,
    setMusicVolume,
    sfxVolume,
    setSfxVolume,
    cfg,
  ]);

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside <GameProvider>");
  return ctx;
}
