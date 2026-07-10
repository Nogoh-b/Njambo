"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createSound } from "@/lib/sound";
import { GAME_CONFIG } from "@/config/gameConfig";
import { STARTING_CAURIS } from "@/config/powerCards";
import type { Profile, SceneName, SocialTarget } from "@/types/game";

/* ═══════════════ Contexte global du jeu Njambo ═══════════════
   Partagé par toutes les scènes : profil, préférences audio,
   navigation entre scènes, config du jeu.
   Le profil est persisté dans localStorage + synchronisé avec Firebase. */

interface GameContextValue {
  /* Navigation */
  scene: SceneName;
  transitioning: boolean;
  navigateTo: (target: SceneName) => void;
  socialTarget: SocialTarget;
  setSocialTarget: (target: SocialTarget | ((prev: SocialTarget) => SocialTarget)) => void;

  /* Profil joueur */
  profile: Profile;
  setProfile: (p: Profile | ((prev: Profile) => Profile)) => void;

  /* Audio */
  musicOn: boolean;
  setMusicOn: (v: boolean) => void;
  sfxOn: boolean;
  setSfxOn: (v: boolean) => void;
  sfx: (fn: (s: ReturnType<typeof createSound>) => void) => void;
  animationsOn: boolean;
  setAnimationsOn: (v: boolean) => void;

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
  const [scene, setScene] = useState<SceneName>("splashscreen");
  const [transitioning, setTransitioning] = useState(false);
  const [profile, setProfileRaw] = useState<Profile>(() => loadStoredProfile());
  const [socialTarget, setSocialTargetRaw] = useState<SocialTarget>({});
  const [musicOn, setMusicOn] = useState(false);
  const [sfxOn, setSfxOn] = useState(true);
  const [animationsOn, setAnimationsOn] = useState(true);

  /* Sauvegarder dans localStorage à chaque changement de profil */
  const setProfile = useCallback((p: Profile | ((prev: Profile) => Profile)) => {
    setProfileRaw((prev) => {
      const next = typeof p === "function" ? p(prev) : p;
      storeProfile(next);
      return next;
    });
  }, []);

  /* Sound singleton + music effect */
  const soundRef = useRef<ReturnType<typeof createSound> | null>(null);
  const S = () => (soundRef.current ??= createSound());
  const sfx = useCallback(
    (fn: (s: ReturnType<typeof createSound>) => void) => {
      if (sfxOn) fn(S());
    },
    [sfxOn],
  );

  useEffect(() => {
    if (musicOn) S().startMusic();
    else soundRef.current?.stopMusic();
    return () => soundRef.current?.stopMusic();
  }, [musicOn]);

  /* Navigation avec transition */
  const navigateTo = useCallback((target: SceneName) => {
    setTransitioning(true);
    /* On attend la fin de l'animation de sortie (~300ms) */
    setTimeout(() => {
      setScene(target);
      /* On reset après le render de la nouvelle scène */
      setTimeout(() => {
        setTransitioning(false);
      }, 50);
    }, 300);
  }, []);

  const setSocialTarget = useCallback((target: SocialTarget | ((prev: SocialTarget) => SocialTarget)) => {
    setSocialTargetRaw((prev) => typeof target === "function" ? target(prev) : target);
  }, []);

  return (
    <GameContext.Provider
      value={{
        scene,
        transitioning,
        navigateTo,
        socialTarget,
        setSocialTarget,
        profile,
        setProfile,
        musicOn,
        setMusicOn,
        sfxOn,
        setSfxOn,
        sfx,
        animationsOn,
        setAnimationsOn,
        cfg,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside <GameProvider>");
  return ctx;
}
