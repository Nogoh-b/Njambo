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
import { useAudioMute, useMusic } from "@gxe/react";
import { AMBIENT_PENTA } from "@/lib/gxeSfx";
import { GAME_CONFIG } from "@/config/gameConfig";
import { STARTING_CAURIS } from "@/config/powerCards";
import { DEV, devEquippedPowers } from "@/config/devConfig";
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

/* ═══════════════ Navigation navigateur (History API + hash) ═══════════════ */

const RESTORABLE_SCENES: ReadonlySet<SceneName> = new Set<SceneName>([
  "menu",
  "play",
  "bot_setup",
  "online_setup",
  "friends_invite",
  "profile",
  "leaderboard",
  "friends",
  "options",
  "history",
  "players",
  "friend_requests",
  "notifications",
  "messages",
  "power_shop",
  "power_collection",
  "events",
  "shop",
  "wallet",
  "rules",
]);

interface NjamboHistoryState {
  __njambo: true;
  scene: SceneName;
  depth: number;
  eventDetailId?: string | null;
  socialTarget?: SocialTarget;
}

function isNjamboHistoryState(value: unknown): value is NjamboHistoryState {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { __njambo?: unknown }).__njambo === true &&
      typeof (value as { scene?: unknown }).scene === "string",
  );
}

function parseHashScene(): SceneName | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#\/?/, "").trim() as SceneName;
  return RESTORABLE_SCENES.has(raw) ? raw : null;
}

function urlForScene(target: SceneName): string {
  if (typeof window === "undefined") return "";
  const base = `${window.location.pathname}${window.location.search}`;
  return target === "menu" ? base : `${base}#${target}`;
}

export interface NavigateOptions {
  replace?: boolean;
}

/**
 * Résultat d'interception du bouton Retour navigateur :
 * - `"stay"` : reste sur l'écran courant (ex. modale « Quitter ? » ouverte) et ré-empile l'entrée d'historique ;
 * - `"handled"` : l'intercepteur a déjà navigué lui-même (ne rien ré-empiler) ;
 * - `false` : laisser la navigation `popstate` standard s'exécuter.
 */
export type BackInterceptResult = "stay" | "handled" | false;
export type BackInterceptor = (nextScene: SceneName) => BackInterceptResult;

/* ═══════════════ Contexte global du jeu Njambo ═══════════════
   Partagé par toutes les scènes : profil, préférences audio,
   navigation synchronisée avec l'historique du navigateur, config du jeu. */

interface GameContextValue {
  /* Navigation */
  scene: SceneName;
  transitioning: boolean;
  navigateTo: (target: SceneName, options?: NavigateOptions) => void;
  goBack: (fallback?: SceneName) => void;
  registerBackInterceptor: (interceptor: BackInterceptor | null) => void;
  endTransition: () => void;
  socialTarget: SocialTarget;
  setSocialTarget: (target: SocialTarget | ((prev: SocialTarget) => SocialTarget)) => void;
  /** eventId porté pour la scène event_detail (null = liste des événements). */
  eventDetailId: string | null;
  setEventDetailId: (id: string | null) => void;

  /* Profil joueur */
  profile: Profile;
  setProfile: (p: Profile | ((prev: Profile) => Profile)) => void;

  /* Audio — `sfxOn`/`musicOn` pilotent les bus `sfx`/`music` de GXE via
     `useAudioMute`. */
  musicOn: boolean;
  setMusicOn: (v: boolean) => void;
  sfxOn: boolean;
  setSfxOn: (v: boolean) => void;

  /* Config (shortcut) */
  cfg: typeof GAME_CONFIG;
}

const GameContext = createContext<GameContextValue | null>(null);

const STORAGE_KEY = "njambo-profile";

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

export function GameProvider({ children }: { children: ReactNode }) {
  const cfg = GAME_CONFIG;
  const [scene, setScene] = useState<SceneName>("menu");
  const [transitioning, setTransitioning] = useState(false);
  const [profile, setProfileRaw] = useState<Profile>(() => applyDevProfile(loadStoredProfile()));
  const [socialTarget, setSocialTargetRaw] = useState<SocialTarget>({});
  const [eventDetailId, setEventDetailIdRaw] = useState<string | null>(null);
  const [musicOn, setMusicOn] = useState(false);
  const [sfxOn, setSfxOn] = useState(true);

  const sceneRef = useRef<SceneName>("menu");
  const depthRef = useRef(0);
  const socialTargetRef = useRef<SocialTarget>({});
  const eventDetailIdRef = useRef<string | null>(null);
  const backInterceptorRef = useRef<BackInterceptor | null>(null);

  sceneRef.current = scene;
  socialTargetRef.current = socialTarget;
  eventDetailIdRef.current = eventDetailId;

  /* Sauvegarder dans localStorage à chaque changement de profil */
  const setProfile = useCallback((p: Profile | ((prev: Profile) => Profile)) => {
    setProfileRaw((prev) => {
      const next = applyDevProfile(typeof p === "function" ? p(prev) : p);
      storeProfile(next);
      return next;
    });
  }, []);

  const gxeMusic = useMusic();
  useEffect(() => {
    if (musicOn) gxeMusic.start(AMBIENT_PENTA);
    else gxeMusic.stop();
    return () => gxeMusic.stop();
  }, [musicOn, gxeMusic]);

  useAudioMute("sfx", !sfxOn);
  useAudioMute("music", !musicOn);

  const registerBackInterceptor = useCallback((interceptor: BackInterceptor | null) => {
    backInterceptorRef.current = interceptor;
  }, []);

  const pushHistoryEntry = useCallback((
    target: SceneName,
    mode: "push" | "replace",
    extra?: { eventDetailId?: string | null; socialTarget?: SocialTarget },
  ) => {
    if (typeof window === "undefined") return;
    const nextDepth = mode === "push" ? depthRef.current + 1 : depthRef.current;
    depthRef.current = nextDepth;
    const state: NjamboHistoryState = {
      __njambo: true,
      scene: target,
      depth: nextDepth,
      eventDetailId: extra?.eventDetailId !== undefined ? extra.eventDetailId : eventDetailIdRef.current,
      socialTarget: extra?.socialTarget !== undefined ? extra.socialTarget : socialTargetRef.current,
    };
    try {
      if (mode === "push") {
        window.history.pushState(state, "", urlForScene(target));
      } else {
        window.history.replaceState(state, "", urlForScene(target));
      }
    } catch {
      // Ignore restricted history APIs (e.g. sandboxed iframes)
    }
  }, []);

  /* Synchronisation initiale & écoute du bouton Retour/Avancer du navigateur. */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const existing = window.history.state;
    const initialFromHash = parseHashScene();
    const initialScene: SceneName =
      isNjamboHistoryState(existing) && RESTORABLE_SCENES.has(existing.scene)
        ? existing.scene
        : initialFromHash ?? "menu";

    if (initialScene !== "menu") {
      sceneRef.current = initialScene;
      setScene(initialScene);
    }

    const baseDepth = isNjamboHistoryState(existing) ? existing.depth : 0;
    depthRef.current = baseDepth;
    try {
      window.history.replaceState(
        {
          __njambo: true,
          scene: initialScene,
          depth: baseDepth,
          eventDetailId: eventDetailIdRef.current,
          socialTarget: socialTargetRef.current,
        } satisfies NjamboHistoryState,
        "",
        urlForScene(initialScene),
      );
    } catch {
      // ignore
    }

    const onPopState = (event: PopStateEvent) => {
      const state = isNjamboHistoryState(event.state) ? event.state : null;
      const candidate: SceneName = state?.scene ?? parseHashScene() ?? "menu";

      // Permet à SceneRouter / TableScreen / ResultScreen / LobbyScreen
      // d'intercepter le bouton Retour (ex. confirmer l'abandon d'un match).
      const intercepted = backInterceptorRef.current?.(candidate) ?? false;
      if (intercepted === "stay") {
        // Ré-empiler l'écran protégé pour que le bouton Retour reste réactif.
        pushHistoryEntry(sceneRef.current, "push");
        return;
      }
      if (intercepted === "handled") {
        return;
      }

      // Ne jamais revenir sur un écran transitoire mort (table/lobby/result)
      // sans session active — retomber proprement sur le salon.
      let resolved: SceneName = candidate;
      if (resolved === "table" || resolved === "lobby" || resolved === "result") {
        resolved = "menu";
      } else if (resolved === "event_detail" && !state?.eventDetailId && !eventDetailIdRef.current) {
        resolved = "events";
      } else if (
        (resolved === "chat" || resolved === "public_profile") &&
        !(state?.socialTarget?.peerUid || state?.socialTarget?.playerUid || socialTargetRef.current.peerUid || socialTargetRef.current.playerUid)
      ) {
        resolved = "friends";
      }

      if (state?.eventDetailId !== undefined) {
        eventDetailIdRef.current = state.eventDetailId;
        setEventDetailIdRaw(state.eventDetailId);
      } else if (resolved === "events") {
        eventDetailIdRef.current = null;
        setEventDetailIdRaw(null);
      }

      if (state?.socialTarget) {
        socialTargetRef.current = state.socialTarget;
        setSocialTargetRaw(state.socialTarget);
      }

      depthRef.current = state?.depth ?? 0;

      if (resolved !== candidate) {
        pushHistoryEntry(resolved, "replace");
      }

      if (resolved !== sceneRef.current) {
        setTransitioning(true);
        sceneRef.current = resolved;
        setScene(resolved);
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [pushHistoryEntry]);

  const navigateTo = useCallback((target: SceneName, options?: NavigateOptions) => {
    const nextEventDetailId = target === "events" ? null : eventDetailIdRef.current;
    if (target === "events") {
      eventDetailIdRef.current = null;
      setEventDetailIdRaw(null);
    }

    if (target === sceneRef.current) {
      if (options?.replace) {
        pushHistoryEntry(target, "replace", { eventDetailId: nextEventDetailId });
      }
      return;
    }

    setTransitioning(true);
    sceneRef.current = target;
    setScene(target);
    pushHistoryEntry(target, options?.replace ? "replace" : "push", {
      eventDetailId: nextEventDetailId,
    });
  }, [pushHistoryEntry]);

  const goBack = useCallback((fallback: SceneName = "menu") => {
    if (typeof window !== "undefined" && depthRef.current > 0) {
      window.history.back();
      return;
    }
    navigateTo(fallback, { replace: true });
  }, [navigateTo]);

  const setEventDetailId = useCallback((id: string | null) => {
    eventDetailIdRef.current = id;
    setEventDetailIdRaw(id);
  }, []);

  /** Appelé par AnimatePresence quand l'ancienne scène a fini de sortir. */
  const endTransition = useCallback(() => setTransitioning(false), []);

  const setSocialTarget = useCallback((target: SocialTarget | ((prev: SocialTarget) => SocialTarget)) => {
    setSocialTargetRaw((prev) => {
      const next = typeof target === "function" ? target(prev) : target;
      socialTargetRef.current = next;
      return next;
    });
  }, []);

  const value = useMemo<GameContextValue>(() => ({
    scene, transitioning, navigateTo, goBack, registerBackInterceptor, endTransition,
    socialTarget, setSocialTarget,
    eventDetailId, setEventDetailId,
    profile, setProfile, musicOn, setMusicOn, sfxOn, setSfxOn, cfg,
  }), [
    scene, transitioning, navigateTo, goBack, registerBackInterceptor, endTransition,
    socialTarget, setSocialTarget, eventDetailId, setEventDetailId,
    profile, setProfile, musicOn, sfxOn, cfg,
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
