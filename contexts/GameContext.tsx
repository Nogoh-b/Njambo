"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createSound } from "@/lib/sound";
import { GAME_CONFIG } from "@/config/gameConfig";
import type { Profile, SceneName } from "@/types/game";

/* ═══════════════ Contexte global du jeu Njambo ═══════════════
   Partagé par toutes les scènes : profil, préférences audio,
   navigation entre scènes, config du jeu. */

interface GameContextValue {
  /* Navigation */
  scene: SceneName;
  transitioning: boolean;
  navigateTo: (target: SceneName) => void;

  /* Profil joueur */
  profile: Profile;
  setProfile: (p: Profile | ((prev: Profile) => Profile)) => void;

  /* Audio */
  musicOn: boolean;
  setMusicOn: (v: boolean) => void;
  sfxOn: boolean;
  setSfxOn: (v: boolean) => void;
  sfx: (fn: (s: ReturnType<typeof createSound>) => void) => void;

  /* Config (shortcut) */
  cfg: typeof GAME_CONFIG;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const cfg = GAME_CONFIG;
  const [scene, setScene] = useState<SceneName>("splashscreen");
  const [transitioning, setTransitioning] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    name: "Nogoh",
    emoji: "you-nogoh",
    balance: cfg.startingBalance,
  });
  const [musicOn, setMusicOn] = useState(false);
  const [sfxOn, setSfxOn] = useState(true);

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

  return (
    <GameContext.Provider
      value={{
        scene,
        transitioning,
        navigateTo,
        profile,
        setProfile,
        musicOn,
        setMusicOn,
        sfxOn,
        setSfxOn,
        sfx,
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
